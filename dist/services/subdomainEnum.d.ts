export interface SubdomainResult {
    subdomain: string;
    fullDomain: string;
    source: string;
    hasSSL: boolean;
    sslDetails?: {
        issuer?: string;
        validFrom?: string;
        validTo?: string;
        expired?: boolean;
    };
    resolves: boolean;
    ipAddresses?: string[];
}
export interface SubdomainEnumerationResult {
    domain: string;
    timestamp: string;
    totalFound: number;
    subdomains: SubdomainResult[];
    sources: {
        certificateTransparency: number;
        commonSubdomains: number;
    };
}
export declare function enumerateSubdomains(domain: string, options?: {
    checkSSL?: boolean;
    checkResolution?: boolean;
    includeCommon?: boolean;
    maxResults?: number;
}): Promise<SubdomainEnumerationResult>;
//# sourceMappingURL=subdomainEnum.d.ts.map