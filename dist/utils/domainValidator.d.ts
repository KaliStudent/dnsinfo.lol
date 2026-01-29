export interface DomainValidationResult {
    isValid: boolean;
    domain: string;
    tld: string;
    sld: string;
    subdomain?: string;
    errors: string[];
}
export declare function validateDomain(input: string | string[] | undefined): DomainValidationResult;
export declare function normalizeToRootDomain(input: string): string;
export declare function extractFullDomain(input: string): string;
export declare function isIPAddress(input: string): boolean;
export declare function parseCIDR(cidr: string): {
    ip: string;
    mask: number;
} | null;
//# sourceMappingURL=domainValidator.d.ts.map