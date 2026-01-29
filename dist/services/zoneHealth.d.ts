import { DNSRecord } from './dnsResolver';
export interface ZoneHealthIssue {
    severity: 'critical' | 'warning' | 'info';
    category: 'SOA' | 'NS' | 'A' | 'MX' | 'CNAME' | 'TXT' | 'General';
    message: string;
    recommendation?: string;
}
export interface ZoneHealthReport {
    domain: string;
    timestamp: string;
    overallScore: number;
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
export declare function analyzeZoneHealth(domain: string): Promise<ZoneHealthReport>;
//# sourceMappingURL=zoneHealth.d.ts.map