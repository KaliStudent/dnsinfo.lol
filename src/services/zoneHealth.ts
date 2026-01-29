import { DNSRecord, getAllDNSRecords } from './dnsResolver';

export interface ZoneHealthIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'SOA' | 'NS' | 'A' | 'MX' | 'CNAME' | 'TXT' | 'General';
  message: string;
  recommendation?: string;
}

export interface ZoneHealthReport {
  domain: string;
  timestamp: string;
  overallScore: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: ZoneHealthIssue[];
  records: Record<string, DNSRecord[]>;
  summary: {
    hasSOA: boolean;
    hasNS: boolean;
    hasA: boolean;
    hasMX: boolean;
    hasSPF: boolean;
    hasDKIM: boolean;
    hasDMARC: boolean;
    nsCount: number;
    mxCount: number;
    ttlConsistent: boolean;
  };
}

// Validate SOA record
function validateSOA(records: DNSRecord[]): ZoneHealthIssue[] {
  const issues: ZoneHealthIssue[] = [];
  
  if (!records || records.length === 0) {
    issues.push({
      severity: 'critical',
      category: 'SOA',
      message: 'No SOA record found',
      recommendation: 'Add a Start of Authority record. This is required for proper DNS operation.'
    });
    return issues;
  }
  
  const soa = records[0];
  const soaData = soa.data;
  
  // Parse SOA data (format: "ns1.example.com. admin.example.com. serial refresh retry expire minimum")
  const parts = soaData.split(/\s+/);
  
  if (parts.length >= 7) {
    const [mname, rname, serial, refresh, retry, expire, minimum] = parts;
    
    // Check refresh interval (should be 1200-43200 seconds, 20 min to 12 hours)
    const refreshInt = parseInt(refresh);
    if (refreshInt < 1200) {
      issues.push({
        severity: 'warning',
        category: 'SOA',
        message: `SOA refresh interval (${refreshInt}s) is too low`,
        recommendation: 'Increase refresh interval to at least 1200 seconds (20 minutes) to reduce DNS traffic.'
      });
    } else if (refreshInt > 43200) {
      issues.push({
        severity: 'info',
        category: 'SOA',
        message: `SOA refresh interval (${refreshInt}s) is quite high`,
        recommendation: 'Consider reducing refresh interval for faster propagation of changes.'
      });
    }
    
    // Check TTL (should be 300-86400)
    if (soa.TTL < 300) {
      issues.push({
        severity: 'warning',
        category: 'SOA',
        message: `SOA TTL (${soa.TTL}s) is very low`,
        recommendation: 'Low TTL increases DNS query load. Consider 300-3600 seconds for production.'
      });
    }
    
    // Check admin email format
    if (!rname || !rname.includes('.')) {
      issues.push({
        severity: 'warning',
        category: 'SOA',
        message: 'SOA administrator email appears malformed',
        recommendation: 'Ensure admin email is in DNS format: admin.example.com (replace @ with .)'
      });
    }
  }
  
  return issues;
}

// Validate NS records
function validateNS(records: DNSRecord[], domain: string): ZoneHealthIssue[] {
  const issues: ZoneHealthIssue[] = [];
  
  if (!records || records.length === 0) {
    issues.push({
      severity: 'critical',
      category: 'NS',
      message: 'No NS records found',
      recommendation: 'Add at least two nameserver records for redundancy.'
    });
    return issues;
  }
  
  // Should have at least 2 NS records
  if (records.length < 2) {
    issues.push({
      severity: 'warning',
      category: 'NS',
      message: `Only ${records.length} NS record(s) found`,
      recommendation: 'Add at least 2 nameserver records for redundancy. RFC 1034 recommends at least 2.'
    });
  }
  
  // Check if NS records point to same network
  const nsHosts = records.map(r => r.data.toLowerCase());
  const networks = new Set(nsHosts.map(ns => {
    const parts = ns.split('.');
    return parts.slice(-3).join('.');
  }));
  
  if (networks.size === 1 && records.length > 1) {
    issues.push({
      severity: 'warning',
      category: 'NS',
      message: 'All nameservers appear to be on the same network',
      recommendation: 'Consider using nameservers from different networks/providers for better resilience.'
    });
  }
  
  // Check for lame delegation (NS pointing to non-existent servers)
  // This would require additional lookups, marked as info for now
  
  return issues;
}

// Validate A records
function validateA(records: DNSRecord[]): ZoneHealthIssue[] {
  const issues: ZoneHealthIssue[] = [];
  
  if (!records || records.length === 0) {
    issues.push({
      severity: 'info',
      category: 'A',
      message: 'No A records found for root domain',
      recommendation: 'If this domain should resolve to a web server, add an A record.'
    });
    return issues;
  }
  
  // Check for private IP addresses in A records
  const privateIPs = records.filter(r => {
    const ip = r.data;
    return ip.startsWith('10.') || 
           ip.startsWith('172.16.') || 
           ip.startsWith('172.17.') ||
           ip.startsWith('172.18.') ||
           ip.startsWith('172.19.') ||
           ip.startsWith('172.2') ||
           ip.startsWith('172.30.') ||
           ip.startsWith('172.31.') ||
           ip.startsWith('192.168.') ||
           ip.startsWith('127.');
  });
  
  if (privateIPs.length > 0) {
    issues.push({
      severity: 'critical',
      category: 'A',
      message: `A record(s) point to private IP address(es): ${privateIPs.map(r => r.data).join(', ')}`,
      recommendation: 'Replace with public IP addresses. Private IPs are not reachable from the internet.'
    });
  }
  
  // Check TTL
  const lowTTL = records.filter(r => r.TTL < 60);
  if (lowTTL.length > 0) {
    issues.push({
      severity: 'info',
      category: 'A',
      message: `Very low TTL (${lowTTL[0].TTL}s) on A records`,
      recommendation: 'Low TTL increases DNS load. Use 300+ seconds unless frequent changes expected.'
    });
  }
  
  return issues;
}

// Validate MX records
function validateMX(records: DNSRecord[], domain: string): ZoneHealthIssue[] {
  const issues: ZoneHealthIssue[] = [];
  
  if (!records || records.length === 0) {
    issues.push({
      severity: 'info',
      category: 'MX',
      message: 'No MX records found',
      recommendation: 'Add MX records if this domain should receive email.'
    });
    return issues;
  }
  
  // Parse MX records (format: "priority hostname")
  const mxEntries = records.map(r => {
    const parts = r.data.split(/\s+/);
    return {
      priority: parseInt(parts[0]) || 0,
      host: parts[1] || r.data,
      record: r
    };
  });
  
  // Check for backup MX
  const priorities = [...new Set(mxEntries.map(m => m.priority))];
  if (priorities.length === 1 && mxEntries.length > 1) {
    issues.push({
      severity: 'warning',
      category: 'MX',
      message: 'All MX records have the same priority',
      recommendation: 'Consider varying priorities to designate primary/backup mail servers.'
    });
  }
  
  // Check if MX points to IP (should be hostname)
  const ipMX = mxEntries.filter(m => /^\d+\.\d+\.\d+\.\d+$/.test(m.host));
  if (ipMX.length > 0) {
    issues.push({
      severity: 'critical',
      category: 'MX',
      message: 'MX record(s) point directly to IP addresses',
      recommendation: 'MX records must point to hostnames, not IP addresses. This violates RFC 2181.'
    });
  }
  
  // Check if MX points to CNAME (RFC violation)
  // Would need additional lookup to verify
  
  return issues;
}

// Validate TXT records (SPF, DKIM, DMARC)
function validateTXT(records: DNSRecord[], domain: string): {
  issues: ZoneHealthIssue[];
  hasSPF: boolean;
  hasDKIM: boolean;
  hasDMARC: boolean;
} {
  const issues: ZoneHealthIssue[] = [];
  let hasSPF = false;
  let hasDKIM = false;
  let hasDMARC = false;
  
  if (!records || records.length === 0) {
    issues.push({
      severity: 'info',
      category: 'TXT',
      message: 'No TXT records found',
      recommendation: 'Consider adding SPF, DKIM, and DMARC records for email security.'
    });
    return { issues, hasSPF, hasDKIM, hasDMARC };
  }
  
  // Check for SPF
  const spfRecords = records.filter(r => 
    r.data.toLowerCase().includes('v=spf1')
  );
  
  if (spfRecords.length === 0) {
    issues.push({
      severity: 'warning',
      category: 'TXT',
      message: 'No SPF record found',
      recommendation: 'Add an SPF record to prevent email spoofing. Example: "v=spf1 include:_spf.google.com ~all"'
    });
  } else if (spfRecords.length > 1) {
    issues.push({
      severity: 'critical',
      category: 'TXT',
      message: `Multiple SPF records found (${spfRecords.length})`,
      recommendation: 'Merge into a single SPF record. Multiple SPF records cause validation failures.'
    });
    hasSPF = true;
  } else {
    hasSPF = true;
    const spf = spfRecords[0].data;
    
    // Check SPF syntax issues
    if (!spf.includes('~all') && !spf.includes('-all') && !spf.includes('?all')) {
      issues.push({
        severity: 'warning',
        category: 'TXT',
        message: 'SPF record missing "all" mechanism',
        recommendation: 'Add "-all" (hard fail) or "~all" (soft fail) at the end of your SPF record.'
      });
    }
  }
  
  // Check for DMARC (would be at _dmarc.domain.com, but check if present in any TXT)
  const dmarcRecords = records.filter(r => 
    r.data.toLowerCase().includes('v=dmarc1')
  );
  
  if (dmarcRecords.length > 0) {
    hasDMARC = true;
  }
  // Note: DMARC is often at _dmarc subdomain, so absence here isn't definitive
  
  // Check for DKIM selector records (usually at selector._domainkey.domain)
  // Would need additional lookups for common selectors
  
  return { issues, hasSPF, hasDKIM, hasDMARC };
}

// Generate overall health score
function calculateScore(issues: ZoneHealthIssue[], summary: ZoneHealthReport['summary']): number {
  let score = 100;
  
  // Deduct for issues
  for (const issue of issues) {
    switch (issue.severity) {
      case 'critical':
        score -= 20;
        break;
      case 'warning':
        score -= 10;
        break;
      case 'info':
        score -= 2;
        break;
    }
  }
  
  // Bonus points for good practices
  if (summary.nsCount >= 2) score += 5;
  if (summary.hasSPF) score += 5;
  if (summary.hasDMARC) score += 5;
  if (summary.mxCount >= 2) score += 3;
  
  return Math.max(0, Math.min(100, score));
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// Main health check function
export async function analyzeZoneHealth(domain: string): Promise<ZoneHealthReport> {
  const { records, errors } = await getAllDNSRecords(domain);
  
  const issues: ZoneHealthIssue[] = [];
  
  // Add any fetch errors as issues
  for (const error of errors) {
    issues.push({
      severity: 'warning',
      category: 'General',
      message: error
    });
  }
  
  // Validate each record type
  issues.push(...validateSOA(records['SOA'] || []));
  issues.push(...validateNS(records['NS'] || [], domain));
  issues.push(...validateA(records['A'] || []));
  issues.push(...validateMX(records['MX'] || [], domain));
  
  const txtResult = validateTXT(records['TXT'] || [], domain);
  issues.push(...txtResult.issues);
  
  // Build summary
  const summary = {
    hasSOA: (records['SOA']?.length || 0) > 0,
    hasNS: (records['NS']?.length || 0) > 0,
    hasA: (records['A']?.length || 0) > 0,
    hasMX: (records['MX']?.length || 0) > 0,
    hasSPF: txtResult.hasSPF,
    hasDKIM: txtResult.hasDKIM,
    hasDMARC: txtResult.hasDMARC,
    nsCount: records['NS']?.length || 0,
    mxCount: records['MX']?.length || 0,
    ttlConsistent: true // Would need more analysis
  };
  
  const score = calculateScore(issues, summary);
  
  return {
    domain,
    timestamp: new Date().toISOString(),
    overallScore: score,
    grade: scoreToGrade(score),
    issues,
    records,
    summary
  };
}
