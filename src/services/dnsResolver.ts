import fetch from 'node-fetch';

// DNS Record Types
export const DNS_RECORD_TYPES: Record<string, number> = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  MX: 15,
  NS: 2,
  TXT: 16,
  SOA: 6,
  PTR: 12,
  SRV: 33,
  CAA: 257,
  DNSKEY: 48,
  DS: 43,
};

// Global DNS Resolvers with region info
export const GLOBAL_RESOLVERS = {
  // North America
  google_us: {
    name: 'Google Public DNS',
    region: 'North America',
    endpoint: 'https://dns.google/resolve',
    location: 'United States'
  },
  cloudflare_us: {
    name: 'Cloudflare DNS',
    region: 'North America', 
    endpoint: 'https://cloudflare-dns.com/dns-query',
    location: 'United States (Anycast)'
  },
  // Europe
  quad9_eu: {
    name: 'Quad9 DNS',
    region: 'Europe',
    endpoint: 'https://dns.quad9.net:5053/dns-query',
    location: 'Europe'
  },
  // Asia Pacific
  dns_sb_asia: {
    name: 'DNS.SB',
    region: 'Asia Pacific',
    endpoint: 'https://doh.dns.sb/dns-query',
    location: 'Asia'
  },
  // Additional resolvers for comprehensive coverage
  adguard: {
    name: 'AdGuard DNS',
    region: 'Global (Anycast)',
    endpoint: 'https://dns.adguard-dns.com/dns-query',
    location: 'Anycast'
  },
  nextdns: {
    name: 'NextDNS',
    region: 'Global (Anycast)',
    endpoint: 'https://dns.nextdns.io/dns-query',
    location: 'Anycast'
  },
  control_d: {
    name: 'Control D',
    region: 'Global (Anycast)',
    endpoint: 'https://freedns.controld.com/p0',
    location: 'Anycast'
  }
};

export interface DNSRecord {
  name: string;
  type: number;
  typeName: string;
  TTL: number;
  data: string;
}

export interface DNSResponse {
  status: number;
  statusText: string;
  question: { name: string; type: number }[];
  answer: DNSRecord[];
  authority?: DNSRecord[];
  additional?: DNSRecord[];
  AD: boolean; // DNSSEC Authenticated Data
  CD: boolean; // Checking Disabled
  TC: boolean; // Truncated
  RD: boolean; // Recursion Desired
  RA: boolean; // Recursion Available
}

export interface PropagationResult {
  resolver: string;
  region: string;
  location: string;
  status: 'success' | 'error' | 'timeout';
  response?: DNSResponse;
  latencyMs: number;
  error?: string;
  timestamp: string;
}

// Get record type name from number
function getRecordTypeName(typeNum: number): string {
  for (const [name, num] of Object.entries(DNS_RECORD_TYPES)) {
    if (num === typeNum) return name;
  }
  return `TYPE${typeNum}`;
}

// Query a single DoH resolver
async function queryDoHResolver(
  endpoint: string,
  domain: string,
  recordType: string | number = 'A',
  timeout: number = 5000
): Promise<DNSResponse> {
  const type = typeof recordType === 'string' ? recordType : getRecordTypeName(recordType);
  
  const url = new URL(endpoint);
  url.searchParams.set('name', domain);
  url.searchParams.set('type', type);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/dns-json',
      },
      signal: controller.signal as any,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: any = await response.json();
    
    // Parse the response into our standard format
    const statusTexts: Record<number, string> = {
      0: 'NOERROR',
      1: 'FORMERR',
      2: 'SERVFAIL', 
      3: 'NXDOMAIN',
      4: 'NOTIMP',
      5: 'REFUSED',
    };
    
    return {
      status: data.Status ?? 0,
      statusText: statusTexts[data.Status] ?? `UNKNOWN(${data.Status})`,
      question: data.Question?.map((q: any) => ({
        name: q.name,
        type: q.type
      })) ?? [],
      answer: data.Answer?.map((a: any) => ({
        name: a.name,
        type: a.type,
        typeName: getRecordTypeName(a.type),
        TTL: a.TTL,
        data: a.data
      })) ?? [],
      authority: data.Authority?.map((a: any) => ({
        name: a.name,
        type: a.type,
        typeName: getRecordTypeName(a.type),
        TTL: a.TTL,
        data: a.data
      })),
      additional: data.Additional?.map((a: any) => ({
        name: a.name,
        type: a.type,
        typeName: getRecordTypeName(a.type),
        TTL: a.TTL,
        data: a.data
      })),
      AD: data.AD ?? false,
      CD: data.CD ?? false,
      TC: data.TC ?? false,
      RD: data.RD ?? true,
      RA: data.RA ?? true,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

// Get all DNS records for a domain
export async function getAllDNSRecords(domain: string): Promise<{
  records: Record<string, DNSRecord[]>;
  errors: string[];
}> {
  const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];
  const records: Record<string, DNSRecord[]> = {};
  const errors: string[] = [];
  
  // Use Cloudflare as primary resolver for speed
  const endpoint = GLOBAL_RESOLVERS.cloudflare_us.endpoint;
  
  await Promise.all(
    recordTypes.map(async (type) => {
      try {
        const response = await queryDoHResolver(endpoint, domain, type);
        if (response.answer && response.answer.length > 0) {
          records[type] = response.answer;
        }
      } catch (error: any) {
        errors.push(`Failed to fetch ${type} records: ${error.message}`);
      }
    })
  );
  
  return { records, errors };
}

// Check DNS propagation across global resolvers
export async function checkPropagation(
  domain: string,
  recordType: string = 'A'
): Promise<PropagationResult[]> {
  const results: PropagationResult[] = [];
  
  await Promise.all(
    Object.entries(GLOBAL_RESOLVERS).map(async ([key, resolver]) => {
      const startTime = Date.now();
      try {
        const response = await queryDoHResolver(
          resolver.endpoint,
          domain,
          recordType,
          8000 // 8 second timeout
        );
        
        results.push({
          resolver: resolver.name,
          region: resolver.region,
          location: resolver.location,
          status: 'success',
          response,
          latencyMs: Date.now() - startTime,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        results.push({
          resolver: resolver.name,
          region: resolver.region,
          location: resolver.location,
          status: error.message.includes('timeout') ? 'timeout' : 'error',
          latencyMs: Date.now() - startTime,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    })
  );
  
  return results;
}

// Analyze propagation results
export function analyzePropagation(results: PropagationResult[]): {
  propagated: boolean;
  percentage: number;
  consistentRecords: boolean;
  summary: string;
  ipAddresses: string[];
  discrepancies: string[];
} {
  const successful = results.filter(r => r.status === 'success');
  const percentage = Math.round((successful.length / results.length) * 100);
  
  // Collect all unique IP addresses from A records
  const ipSets: string[][] = successful
    .filter(r => r.response?.answer)
    .map(r => r.response!.answer
      .filter(a => a.typeName === 'A' || a.typeName === 'AAAA')
      .map(a => a.data)
      .sort()
    );
  
  const allIPs = [...new Set(ipSets.flat())];
  
  // Check consistency
  let consistentRecords = true;
  const discrepancies: string[] = [];
  
  if (ipSets.length > 1) {
    const firstSet = JSON.stringify(ipSets[0]);
    for (let i = 1; i < ipSets.length; i++) {
      if (JSON.stringify(ipSets[i]) !== firstSet) {
        consistentRecords = false;
        discrepancies.push(
          `${successful[i].resolver} returned different IPs: ${ipSets[i].join(', ')}`
        );
      }
    }
  }
  
  const propagated = percentage >= 70 && consistentRecords;
  
  let summary = '';
  if (propagated) {
    summary = `DNS records have propagated to ${percentage}% of global resolvers with consistent results.`;
  } else if (percentage < 70) {
    summary = `DNS records have only propagated to ${percentage}% of global resolvers. Propagation may still be in progress.`;
  } else {
    summary = `DNS records show inconsistencies across global resolvers. This may indicate ongoing propagation or configuration issues.`;
  }
  
  return {
    propagated,
    percentage,
    consistentRecords,
    summary,
    ipAddresses: allIPs,
    discrepancies
  };
}

export { queryDoHResolver, getRecordTypeName };
