"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enumerateSubdomains = enumerateSubdomains;
const node_fetch_1 = __importDefault(require("node-fetch"));
const dnsResolver_1 = require("./dnsResolver");
// Common subdomains to check
const COMMON_SUBDOMAINS = [
    'www', 'mail', 'webmail', 'ftp', 'smtp', 'pop', 'imap',
    'admin', 'portal', 'api', 'dev', 'staging', 'test', 'demo',
    'blog', 'shop', 'store', 'cdn', 'static', 'assets', 'images',
    'app', 'mobile', 'm', 'vpn', 'remote', 'secure', 'login',
    'auth', 'sso', 'id', 'accounts', 'support', 'help', 'docs',
    'ns1', 'ns2', 'dns', 'dns1', 'dns2', 'mx', 'mx1', 'mx2',
    'cpanel', 'whm', 'plesk', 'server', 'host', 'cloud',
    'status', 'monitor', 'metrics', 'analytics', 'tracking',
    'git', 'gitlab', 'github', 'bitbucket', 'jenkins', 'ci',
    'db', 'database', 'mysql', 'postgres', 'redis', 'mongo',
    'backup', 'bak', 'old', 'new', 'beta', 'alpha', 'stage',
    'internal', 'intranet', 'extranet', 'private', 'public'
];
// Query Certificate Transparency logs via crt.sh
async function queryCertificateTransparency(domain) {
    const subdomains = new Set();
    try {
        // crt.sh API - search for certificates with wildcard
        const response = await (0, node_fetch_1.default)(`https://crt.sh/?q=%.${domain}&output=json`, {
            headers: {
                'User-Agent': 'DNS-Intel-API/1.0',
                'Accept': 'application/json'
            }
        });
        if (!response.ok) {
            console.error(`crt.sh returned ${response.status}`);
            return [];
        }
        const data = await response.json();
        // Extract unique subdomains from certificate names
        for (const cert of data) {
            const names = cert.name_value?.split('\n') || [];
            for (const name of names) {
                const cleanName = name.trim().toLowerCase();
                // Filter out wildcards and validate it's actually a subdomain
                if (cleanName &&
                    !cleanName.startsWith('*') &&
                    cleanName.endsWith(`.${domain}`) &&
                    cleanName !== domain) {
                    subdomains.add(cleanName);
                }
                // Also handle exact match (some certs are for root domain)
                if (cleanName === domain) {
                    subdomains.add(domain);
                }
            }
        }
    }
    catch (error) {
        console.error('Certificate Transparency query failed:', error);
    }
    return [...subdomains];
}
// Check if a subdomain resolves and get its IP addresses
async function checkSubdomainResolution(fullDomain) {
    try {
        const response = await (0, dnsResolver_1.queryDoHResolver)(dnsResolver_1.GLOBAL_RESOLVERS.cloudflare_us.endpoint, fullDomain, 'A', 3000);
        const ips = response.answer
            ?.filter(r => r.typeName === 'A')
            ?.map(r => r.data) || [];
        return {
            resolves: ips.length > 0,
            ipAddresses: ips
        };
    }
    catch {
        return { resolves: false, ipAddresses: [] };
    }
}
// Check SSL certificate for a subdomain
async function checkSSLCertificate(fullDomain) {
    try {
        // Use a simple HTTPS check with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await (0, node_fetch_1.default)(`https://${fullDomain}`, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'manual',
            // We don't validate the cert, just check if HTTPS works
        });
        clearTimeout(timeoutId);
        // If we got a response (even a redirect), SSL is working
        return {
            hasSSL: true,
            details: {
            // In a real implementation, we'd parse the cert details
            // For now, we just confirm SSL is present
            }
        };
    }
    catch (error) {
        // Connection refused, timeout, or cert error
        if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
            error.code === 'CERT_HAS_EXPIRED' ||
            error.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
            return {
                hasSSL: true,
                details: {
                    expired: error.code === 'CERT_HAS_EXPIRED'
                }
            };
        }
        return { hasSSL: false };
    }
}
// Main subdomain enumeration function
async function enumerateSubdomains(domain, options = {}) {
    const { checkSSL = true, checkResolution = true, includeCommon = true, maxResults = 100 } = options;
    const subdomains = [];
    const seenDomains = new Set();
    let ctCount = 0;
    let commonCount = 0;
    // 1. Query Certificate Transparency logs
    const ctSubdomains = await queryCertificateTransparency(domain);
    for (const sub of ctSubdomains) {
        if (seenDomains.has(sub) || subdomains.length >= maxResults)
            continue;
        seenDomains.add(sub);
        const subdomain = sub === domain ? '@' : sub.replace(`.${domain}`, '');
        const result = {
            subdomain,
            fullDomain: sub,
            source: 'Certificate Transparency',
            hasSSL: false,
            resolves: false
        };
        // Check resolution
        if (checkResolution) {
            const resolution = await checkSubdomainResolution(sub);
            result.resolves = resolution.resolves;
            result.ipAddresses = resolution.ipAddresses;
        }
        // Check SSL (only if domain resolves)
        if (checkSSL && result.resolves) {
            const ssl = await checkSSLCertificate(sub);
            result.hasSSL = ssl.hasSSL;
            result.sslDetails = ssl.details;
        }
        subdomains.push(result);
        ctCount++;
    }
    // 2. Check common subdomains
    if (includeCommon && subdomains.length < maxResults) {
        await Promise.all(COMMON_SUBDOMAINS.slice(0, maxResults - subdomains.length).map(async (sub) => {
            const fullDomain = `${sub}.${domain}`;
            if (seenDomains.has(fullDomain))
                return;
            seenDomains.add(fullDomain);
            const resolution = await checkSubdomainResolution(fullDomain);
            // Only add if it resolves
            if (resolution.resolves) {
                const result = {
                    subdomain: sub,
                    fullDomain,
                    source: 'Common Subdomain List',
                    hasSSL: false,
                    resolves: true,
                    ipAddresses: resolution.ipAddresses
                };
                if (checkSSL) {
                    const ssl = await checkSSLCertificate(fullDomain);
                    result.hasSSL = ssl.hasSSL;
                    result.sslDetails = ssl.details;
                }
                subdomains.push(result);
                commonCount++;
            }
        }));
    }
    // Sort by subdomain name
    subdomains.sort((a, b) => a.subdomain.localeCompare(b.subdomain));
    return {
        domain,
        timestamp: new Date().toISOString(),
        totalFound: subdomains.length,
        subdomains,
        sources: {
            certificateTransparency: ctCount,
            commonSubdomains: commonCount
        }
    };
}
//# sourceMappingURL=subdomainEnum.js.map