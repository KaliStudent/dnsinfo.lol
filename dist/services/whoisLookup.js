"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupWhois = lookupWhois;
exports.batchWhoisLookup = batchWhoisLookup;
const node_fetch_1 = __importDefault(require("node-fetch"));
// Check for privacy protection indicators
function hasPrivacyProtection(data) {
    const privacyIndicators = [
        'privacy', 'protect', 'proxy', 'whoisguard', 'domains by proxy',
        'private', 'contact privacy', 'withheld', 'redacted', 'gdpr',
        'data protected', 'identity protection', 'domain privacy',
        'perfect privacy', 'privacydotlink', 'whois privacy'
    ];
    const jsonStr = JSON.stringify(data).toLowerCase();
    return privacyIndicators.some(indicator => jsonStr.includes(indicator));
}
// Generate summary for privacy-protected domains
function generatePrivacySummary(data) {
    const parts = [];
    if (data.registrar?.name) {
        parts.push(`Registered through ${data.registrar.name}`);
    }
    if (data.dates?.created) {
        const created = new Date(data.dates.created);
        const years = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24 * 365));
        parts.push(`Domain is approximately ${years} year(s) old`);
    }
    if (data.dates?.expires) {
        const expires = new Date(data.dates.expires);
        const daysUntilExpiry = Math.floor((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry > 0) {
            parts.push(`Expires in ${daysUntilExpiry} days`);
        }
        else {
            parts.push('Domain has expired or is about to expire');
        }
    }
    if (data.nameservers?.length) {
        parts.push(`Using ${data.nameservers.length} nameserver(s)`);
        // Detect hosting provider from nameservers
        const nsStr = data.nameservers.join(' ').toLowerCase();
        if (nsStr.includes('cloudflare'))
            parts.push('Hosted on Cloudflare');
        else if (nsStr.includes('awsdns'))
            parts.push('Hosted on AWS Route53');
        else if (nsStr.includes('google'))
            parts.push('Hosted on Google Cloud DNS');
        else if (nsStr.includes('azure'))
            parts.push('Hosted on Azure DNS');
        else if (nsStr.includes('godaddy'))
            parts.push('Hosted on GoDaddy');
        else if (nsStr.includes('namecheap'))
            parts.push('Hosted on Namecheap');
    }
    if (data.status?.length) {
        const hasLock = data.status.some((s) => s.toLowerCase().includes('lock'));
        if (hasLock) {
            parts.push('Domain has transfer lock enabled');
        }
    }
    return parts.length > 0
        ? parts.join('. ') + '.'
        : 'Limited WHOIS information available due to privacy protection.';
}
// Query who-dat.as93.net (free, no-CORS WHOIS API)
async function queryWhoDat(domain) {
    try {
        const response = await (0, node_fetch_1.default)(`https://who-dat.as93.net/${domain}`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'DNS-Intel-API/1.0'
            }
        });
        if (!response.ok) {
            throw new Error(`who-dat returned ${response.status}`);
        }
        return await response.json();
    }
    catch (error) {
        console.error('who-dat query failed:', error);
        return null;
    }
}
// Parse raw WHOIS response
function parseWhoisResponse(data) {
    const result = {
        domain: data.domain || data.domain_name || '',
        timestamp: new Date().toISOString(),
        privacyEnabled: false
    };
    // Parse registrar info
    if (data.registrar || data.registrar_name) {
        result.registrar = {
            name: data.registrar || data.registrar_name,
            url: data.registrar_url,
            ianaId: data.registrar_iana_id,
            abuseEmail: data.registrar_abuse_contact_email || data.abuse_email,
            abusePhone: data.registrar_abuse_contact_phone || data.abuse_phone
        };
    }
    // Parse dates
    const created = data.creation_date || data.created || data.created_date;
    const updated = data.updated_date || data.updated || data.last_updated;
    const expires = data.expiration_date || data.expires || data.registry_expiry_date;
    if (created || updated || expires) {
        result.dates = {
            created: created ? new Date(created).toISOString() : undefined,
            updated: updated ? new Date(updated).toISOString() : undefined,
            expires: expires ? new Date(expires).toISOString() : undefined
        };
    }
    // Parse nameservers
    if (data.name_servers || data.nameservers || data.nserver) {
        const ns = data.name_servers || data.nameservers || data.nserver;
        result.nameservers = Array.isArray(ns) ? ns : [ns];
        result.nameservers = result.nameservers.map((n) => n.toLowerCase());
    }
    // Parse status
    if (data.status || data.domain_status) {
        const status = data.status || data.domain_status;
        result.status = Array.isArray(status) ? status : [status];
    }
    // Parse DNSSEC
    result.dnssec = data.dnssec || data.DNSSEC;
    // Parse registrant
    if (data.registrant || data.registrant_name || data.registrant_organization) {
        result.registrant = {
            name: data.registrant_name || data.registrant?.name,
            organization: data.registrant_organization || data.registrant?.organization,
            street: data.registrant_street || data.registrant?.street,
            city: data.registrant_city || data.registrant?.city,
            state: data.registrant_state || data.registrant?.state,
            postalCode: data.registrant_postal_code || data.registrant?.postal_code,
            country: data.registrant_country || data.registrant?.country,
            email: data.registrant_email || data.registrant?.email,
            phone: data.registrant_phone || data.registrant?.phone
        };
    }
    // Check for privacy protection
    result.privacyEnabled = hasPrivacyProtection(data);
    // Generate summary if privacy enabled
    if (result.privacyEnabled) {
        result.summary = generatePrivacySummary(result);
        // Clear contact details that are privacy-protected
        result.registrant = undefined;
        result.admin = undefined;
        result.tech = undefined;
    }
    return result;
}
// Main WHOIS lookup function
async function lookupWhois(domain) {
    // Clean the domain
    const cleanDomain = domain.toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]
        .trim();
    // Try who-dat.as93.net first (free API)
    const whoDatData = await queryWhoDat(cleanDomain);
    if (whoDatData) {
        const result = parseWhoisResponse(whoDatData);
        result.domain = cleanDomain;
        return result;
    }
    // Fallback to basic response if API fails
    return {
        domain: cleanDomain,
        timestamp: new Date().toISOString(),
        privacyEnabled: true,
        summary: 'Unable to retrieve WHOIS data. The domain may use privacy protection or the WHOIS service is unavailable.'
    };
}
// Batch WHOIS lookup
async function batchWhoisLookup(domains) {
    const results = [];
    // Process in batches of 5 to avoid rate limiting
    for (let i = 0; i < domains.length; i += 5) {
        const batch = domains.slice(i, i + 5);
        const batchResults = await Promise.all(batch.map(domain => lookupWhois(domain)));
        results.push(...batchResults);
        // Small delay between batches
        if (i + 5 < domains.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return results;
}
//# sourceMappingURL=whoisLookup.js.map