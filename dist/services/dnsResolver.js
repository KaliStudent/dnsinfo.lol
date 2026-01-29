"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GLOBAL_RESOLVERS = exports.DNS_RECORD_TYPES = void 0;
exports.getAllDNSRecords = getAllDNSRecords;
exports.checkPropagation = checkPropagation;
exports.analyzePropagation = analyzePropagation;
exports.queryDoHResolver = queryDoHResolver;
exports.getRecordTypeName = getRecordTypeName;
const node_fetch_1 = __importDefault(require("node-fetch"));
// DNS Record Types
exports.DNS_RECORD_TYPES = {
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
exports.GLOBAL_RESOLVERS = {
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
// Get record type name from number
function getRecordTypeName(typeNum) {
    for (const [name, num] of Object.entries(exports.DNS_RECORD_TYPES)) {
        if (num === typeNum)
            return name;
    }
    return `TYPE${typeNum}`;
}
// Query a single DoH resolver
async function queryDoHResolver(endpoint, domain, recordType = 'A', timeout = 5000) {
    const type = typeof recordType === 'string' ? recordType : getRecordTypeName(recordType);
    const url = new URL(endpoint);
    url.searchParams.set('name', domain);
    url.searchParams.set('type', type);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await (0, node_fetch_1.default)(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/dns-json',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        // Parse the response into our standard format
        const statusTexts = {
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
            question: data.Question?.map((q) => ({
                name: q.name,
                type: q.type
            })) ?? [],
            answer: data.Answer?.map((a) => ({
                name: a.name,
                type: a.type,
                typeName: getRecordTypeName(a.type),
                TTL: a.TTL,
                data: a.data
            })) ?? [],
            authority: data.Authority?.map((a) => ({
                name: a.name,
                type: a.type,
                typeName: getRecordTypeName(a.type),
                TTL: a.TTL,
                data: a.data
            })),
            additional: data.Additional?.map((a) => ({
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
    }
    catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    }
}
// Get all DNS records for a domain
async function getAllDNSRecords(domain) {
    const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];
    const records = {};
    const errors = [];
    // Use Cloudflare as primary resolver for speed
    const endpoint = exports.GLOBAL_RESOLVERS.cloudflare_us.endpoint;
    await Promise.all(recordTypes.map(async (type) => {
        try {
            const response = await queryDoHResolver(endpoint, domain, type);
            if (response.answer && response.answer.length > 0) {
                records[type] = response.answer;
            }
        }
        catch (error) {
            errors.push(`Failed to fetch ${type} records: ${error.message}`);
        }
    }));
    return { records, errors };
}
// Check DNS propagation across global resolvers
async function checkPropagation(domain, recordType = 'A') {
    const results = [];
    await Promise.all(Object.entries(exports.GLOBAL_RESOLVERS).map(async ([key, resolver]) => {
        const startTime = Date.now();
        try {
            const response = await queryDoHResolver(resolver.endpoint, domain, recordType, 8000 // 8 second timeout
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
        }
        catch (error) {
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
    }));
    return results;
}
// Analyze propagation results
function analyzePropagation(results) {
    const successful = results.filter(r => r.status === 'success');
    const percentage = Math.round((successful.length / results.length) * 100);
    // Collect all unique IP addresses from A records
    const ipSets = successful
        .filter(r => r.response?.answer)
        .map(r => r.response.answer
        .filter(a => a.typeName === 'A' || a.typeName === 'AAAA')
        .map(a => a.data)
        .sort());
    const allIPs = [...new Set(ipSets.flat())];
    // Check consistency
    let consistentRecords = true;
    const discrepancies = [];
    if (ipSets.length > 1) {
        const firstSet = JSON.stringify(ipSets[0]);
        for (let i = 1; i < ipSets.length; i++) {
            if (JSON.stringify(ipSets[i]) !== firstSet) {
                consistentRecords = false;
                discrepancies.push(`${successful[i].resolver} returned different IPs: ${ipSets[i].join(', ')}`);
            }
        }
    }
    const propagated = percentage >= 70 && consistentRecords;
    let summary = '';
    if (propagated) {
        summary = `DNS records have propagated to ${percentage}% of global resolvers with consistent results.`;
    }
    else if (percentage < 70) {
        summary = `DNS records have only propagated to ${percentage}% of global resolvers. Propagation may still be in progress.`;
    }
    else {
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
//# sourceMappingURL=dnsResolver.js.map