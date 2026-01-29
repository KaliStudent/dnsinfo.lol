export interface WhoisContact {
    name?: string;
    organization?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    email?: string;
}
export interface WhoisResult {
    domain: string;
    timestamp: string;
    privacyEnabled: boolean;
    registrar?: {
        name?: string;
        url?: string;
        ianaId?: string;
        abuseEmail?: string;
        abusePhone?: string;
    };
    dates?: {
        created?: string;
        updated?: string;
        expires?: string;
    };
    nameservers?: string[];
    status?: string[];
    dnssec?: string;
    registrant?: WhoisContact;
    admin?: WhoisContact;
    tech?: WhoisContact;
    rawText?: string;
    summary?: string;
}
export declare function lookupWhois(domain: string): Promise<WhoisResult>;
export declare function batchWhoisLookup(domains: string[]): Promise<WhoisResult[]>;
//# sourceMappingURL=whoisLookup.d.ts.map