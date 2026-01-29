"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const domainValidator_1 = require("../utils/domainValidator");
const dnsResolver_1 = require("../services/dnsResolver");
const zoneHealth_1 = require("../services/zoneHealth");
const subdomainEnum_1 = require("../services/subdomainEnum");
const whoisLookup_1 = require("../services/whoisLookup");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
// Health check endpoint (no rate limit)
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});
// Rate limit status endpoint (no rate limit)
router.get('/rate-limit', (req, res) => {
    const status = (0, rateLimiter_1.getRateLimitStatus)(req);
    res.json({
        remaining: status.remaining,
        limit: status.limit,
        resetAt: status.resetAt.toISOString(),
        isPremium: status.isPremium
    });
});
// Full DNS intelligence scan (rate limited)
router.get('/scan/:domain', rateLimiter_1.rateLimiter, async (req, res) => {
    try {
        const { domain } = req.params;
        const validation = (0, domainValidator_1.validateDomain)(domain);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid domain',
                details: validation.errors
            });
        }
        const rootDomain = validation.domain;
        // Get query options
        const subdomainsParam = req.query.subdomains;
        const whoisParam = req.query.whois;
        const propagationParam = req.query.propagation;
        const includeSubdomains = subdomainsParam !== 'false';
        const includeWhois = whoisParam !== 'false';
        const includePropagation = propagationParam !== 'false';
        // Run all checks in parallel
        const [healthReport, propagationResults, subdomains, whoisData] = await Promise.all([
            (0, zoneHealth_1.analyzeZoneHealth)(rootDomain),
            includePropagation ? (0, dnsResolver_1.checkPropagation)(rootDomain, 'A') : Promise.resolve([]),
            includeSubdomains ? (0, subdomainEnum_1.enumerateSubdomains)(rootDomain, {
                checkSSL: true,
                maxResults: 50
            }) : Promise.resolve(null),
            includeWhois ? (0, whoisLookup_1.lookupWhois)(rootDomain) : Promise.resolve(null)
        ]);
        // Analyze propagation
        const propagationAnalysis = includePropagation
            ? (0, dnsResolver_1.analyzePropagation)(propagationResults)
            : null;
        res.json({
            success: true,
            domain: rootDomain,
            timestamp: new Date().toISOString(),
            isPremium: req.isPremium || false,
            // Zone Health
            health: healthReport,
            // Propagation Check
            propagation: includePropagation ? {
                results: propagationResults,
                analysis: propagationAnalysis
            } : undefined,
            // Subdomain Enumeration
            subdomains: subdomains || undefined,
            // WHOIS Data
            whois: whoisData || undefined
        });
    }
    catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({
            error: 'Scan failed',
            message: error.message
        });
    }
});
// DNS Records only (rate limited)
router.get('/dns/:domain', rateLimiter_1.rateLimiter, async (req, res) => {
    try {
        const { domain } = req.params;
        const validation = (0, domainValidator_1.validateDomain)(domain);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid domain',
                details: validation.errors
            });
        }
        const rootDomain = validation.domain;
        // Get optional record type filter
        const typeFilterParam = req.query.type;
        const typeFilter = typeof typeFilterParam === 'string' ? typeFilterParam : undefined;
        const { records, errors } = await (0, dnsResolver_1.getAllDNSRecords)(rootDomain);
        // Filter by type if requested
        let filteredRecords = records;
        if (typeFilter) {
            const types = typeFilter.toUpperCase().split(',');
            filteredRecords = {};
            for (const t of types) {
                if (records[t]) {
                    filteredRecords[t] = records[t];
                }
            }
        }
        res.json({
            success: true,
            domain: rootDomain,
            timestamp: new Date().toISOString(),
            records: filteredRecords,
            supportedTypes: Object.keys(dnsResolver_1.DNS_RECORD_TYPES),
            errors: errors.length > 0 ? errors : undefined
        });
    }
    catch (error) {
        console.error('DNS lookup error:', error);
        res.status(500).json({
            error: 'DNS lookup failed',
            message: error.message
        });
    }
});
// Propagation check only (rate limited)
router.get('/propagation/:domain', rateLimiter_1.rateLimiter, async (req, res) => {
    try {
        const { domain } = req.params;
        const validation = (0, domainValidator_1.validateDomain)(domain);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid domain',
                details: validation.errors
            });
        }
        const rootDomain = validation.domain;
        const typeParam = req.query.type;
        const recordType = (typeof typeParam === 'string' ? typeParam : 'A').toUpperCase();
        const results = await (0, dnsResolver_1.checkPropagation)(rootDomain, recordType);
        const analysis = (0, dnsResolver_1.analyzePropagation)(results);
        res.json({
            success: true,
            domain: rootDomain,
            recordType,
            timestamp: new Date().toISOString(),
            results,
            analysis
        });
    }
    catch (error) {
        console.error('Propagation check error:', error);
        res.status(500).json({
            error: 'Propagation check failed',
            message: error.message
        });
    }
});
// Zone health check only (rate limited)
router.get('/health/:domain', rateLimiter_1.rateLimiter, async (req, res) => {
    try {
        const { domain } = req.params;
        const validation = (0, domainValidator_1.validateDomain)(domain);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid domain',
                details: validation.errors
            });
        }
        const healthReport = await (0, zoneHealth_1.analyzeZoneHealth)(validation.domain);
        res.json({
            success: true,
            ...healthReport
        });
    }
    catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            error: 'Health check failed',
            message: error.message
        });
    }
});
// Subdomain enumeration only (rate limited)
router.get('/subdomains/:domain', rateLimiter_1.rateLimiter, async (req, res) => {
    try {
        const { domain } = req.params;
        const validation = (0, domainValidator_1.validateDomain)(domain);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid domain',
                details: validation.errors
            });
        }
        const sslParam = req.query.ssl;
        const limitParam = req.query.limit;
        const checkSSL = sslParam !== 'false';
        const maxResults = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '100') || 100, 200);
        const result = await (0, subdomainEnum_1.enumerateSubdomains)(validation.domain, {
            checkSSL,
            maxResults,
            checkResolution: true,
            includeCommon: true
        });
        res.json({
            success: true,
            ...result
        });
    }
    catch (error) {
        console.error('Subdomain enumeration error:', error);
        res.status(500).json({
            error: 'Subdomain enumeration failed',
            message: error.message
        });
    }
});
// WHOIS lookup only (rate limited)
router.get('/whois/:domain', rateLimiter_1.rateLimiter, async (req, res) => {
    try {
        const { domain } = req.params;
        const validation = (0, domainValidator_1.validateDomain)(domain);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid domain',
                details: validation.errors
            });
        }
        const whoisData = await (0, whoisLookup_1.lookupWhois)(validation.domain);
        res.json({
            success: true,
            ...whoisData
        });
    }
    catch (error) {
        console.error('WHOIS lookup error:', error);
        res.status(500).json({
            error: 'WHOIS lookup failed',
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=api.js.map