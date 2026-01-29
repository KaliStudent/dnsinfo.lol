import { Router, Request, Response } from 'express';
import { validateDomain, normalizeToRootDomain } from '../utils/domainValidator';
import { getAllDNSRecords, checkPropagation, analyzePropagation, DNS_RECORD_TYPES } from '../services/dnsResolver';
import { analyzeZoneHealth } from '../services/zoneHealth';
import { enumerateSubdomains } from '../services/subdomainEnum';
import { lookupWhois } from '../services/whoisLookup';
import { rateLimiter, getRateLimitStatus } from '../middleware/rateLimiter';

const router = Router();

// Health check endpoint (no rate limit)
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Rate limit status endpoint (no rate limit)
router.get('/rate-limit', (req: Request, res: Response) => {
  const status = getRateLimitStatus(req);
  res.json({
    remaining: status.remaining,
    limit: status.limit,
    resetAt: status.resetAt.toISOString(),
    isPremium: status.isPremium
  });
});

// Full DNS intelligence scan (rate limited)
router.get('/scan/:domain', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const validation = validateDomain(domain);
    
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
    const [
      healthReport,
      propagationResults,
      subdomains,
      whoisData
    ] = await Promise.all([
      analyzeZoneHealth(rootDomain),
      includePropagation ? checkPropagation(rootDomain, 'A') : Promise.resolve([]),
      includeSubdomains ? enumerateSubdomains(rootDomain, { 
        checkSSL: true, 
        maxResults: 50 
      }) : Promise.resolve(null),
      includeWhois ? lookupWhois(rootDomain) : Promise.resolve(null)
    ]);
    
    // Analyze propagation
    const propagationAnalysis = includePropagation 
      ? analyzePropagation(propagationResults)
      : null;
    
    res.json({
      success: true,
      domain: rootDomain,
      timestamp: new Date().toISOString(),
      isPremium: (req as any).isPremium || false,
      
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
  } catch (error: any) {
    console.error('Scan error:', error);
    res.status(500).json({
      error: 'Scan failed',
      message: error.message
    });
  }
});

// DNS Records only (rate limited)
router.get('/dns/:domain', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const validation = validateDomain(domain);
    
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
    
    const { records, errors } = await getAllDNSRecords(rootDomain);
    
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
      supportedTypes: Object.keys(DNS_RECORD_TYPES),
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('DNS lookup error:', error);
    res.status(500).json({
      error: 'DNS lookup failed',
      message: error.message
    });
  }
});

// Propagation check only (rate limited)
router.get('/propagation/:domain', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const validation = validateDomain(domain);
    
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid domain',
        details: validation.errors
      });
    }
    
    const rootDomain = validation.domain;
    const typeParam = req.query.type;
    const recordType = (typeof typeParam === 'string' ? typeParam : 'A').toUpperCase();
    
    const results = await checkPropagation(rootDomain, recordType);
    const analysis = analyzePropagation(results);
    
    res.json({
      success: true,
      domain: rootDomain,
      recordType,
      timestamp: new Date().toISOString(),
      results,
      analysis
    });
  } catch (error: any) {
    console.error('Propagation check error:', error);
    res.status(500).json({
      error: 'Propagation check failed',
      message: error.message
    });
  }
});

// Zone health check only (rate limited)
router.get('/health/:domain', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const validation = validateDomain(domain);
    
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid domain',
        details: validation.errors
      });
    }
    
    const healthReport = await analyzeZoneHealth(validation.domain);
    
    res.json({
      success: true,
      ...healthReport
    });
  } catch (error: any) {
    console.error('Health check error:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error.message
    });
  }
});

// Subdomain enumeration only (rate limited)
router.get('/subdomains/:domain', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const validation = validateDomain(domain);
    
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
    
    const result = await enumerateSubdomains(validation.domain, {
      checkSSL,
      maxResults,
      checkResolution: true,
      includeCommon: true
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    console.error('Subdomain enumeration error:', error);
    res.status(500).json({
      error: 'Subdomain enumeration failed',
      message: error.message
    });
  }
});

// WHOIS lookup only (rate limited)
router.get('/whois/:domain', rateLimiter, async (req: Request, res: Response) => {
  try {
    const { domain } = req.params;
    const validation = validateDomain(domain);
    
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid domain',
        details: validation.errors
      });
    }
    
    const whoisData = await lookupWhois(validation.domain);
    
    res.json({
      success: true,
      ...whoisData
    });
  } catch (error: any) {
    console.error('WHOIS lookup error:', error);
    res.status(500).json({
      error: 'WHOIS lookup failed',
      message: error.message
    });
  }
});

export default router;
