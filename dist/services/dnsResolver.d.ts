export declare const DNS_RECORD_TYPES: Record<string, number>;
export declare const GLOBAL_RESOLVERS: {
    google_us: {
        name: string;
        region: string;
        endpoint: string;
        location: string;
    };
    cloudflare_us: {
        name: string;
        region: string;
        endpoint: string;
        location: string;
    };
    quad9_eu: {
        name: string;
        region: string;
        endpoint: string;
        location: string;
    };
    dns_sb_asia: {
        name: string;
        region: string;
        endpoint: string;
        location: string;
    };
    adguard: {
        name: string;
        region: string;
        endpoint: string;
        location: string;
    };
    nextdns: {
        name: string;
        region: string;
        endpoint: string;
        location: string;
    };
    control_d: {
        name: string;
        region: string;
        endpoint: string;
        location: string;
    };
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
    question: {
        name: string;
        type: number;
    }[];
    answer: DNSRecord[];
    authority?: DNSRecord[];
    additional?: DNSRecord[];
    AD: boolean;
    CD: boolean;
    TC: boolean;
    RD: boolean;
    RA: boolean;
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
declare function getRecordTypeName(typeNum: number): string;
declare function queryDoHResolver(endpoint: string, domain: string, recordType?: string | number, timeout?: number): Promise<DNSResponse>;
export declare function getAllDNSRecords(domain: string): Promise<{
    records: Record<string, DNSRecord[]>;
    errors: string[];
}>;
export declare function checkPropagation(domain: string, recordType?: string): Promise<PropagationResult[]>;
export declare function analyzePropagation(results: PropagationResult[]): {
    propagated: boolean;
    percentage: number;
    consistentRecords: boolean;
    summary: string;
    ipAddresses: string[];
    discrepancies: string[];
};
export { queryDoHResolver, getRecordTypeName };
//# sourceMappingURL=dnsResolver.d.ts.map