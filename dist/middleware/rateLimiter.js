"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitStore = void 0;
exports.rateLimiter = rateLimiter;
exports.getRateLimitStatus = getRateLimitStatus;
exports.generateFingerprint = generateFingerprint;
const crypto_1 = __importDefault(require("crypto"));
const rateLimitStore = new Map();
exports.rateLimitStore = rateLimitStore;
// Clean up expired entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (entry.resetAt < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean every minute
// Configuration
const FREE_TIER_LIMIT = 3;
const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
// Generate a fingerprint from the request
function generateFingerprint(req) {
    const components = [
        req.ip,
        req.headers['user-agent'] || '',
        req.headers['accept-language'] || '',
        // Add more fingerprint components as needed
    ];
    const hash = crypto_1.default
        .createHash('sha256')
        .update(components.join('|'))
        .digest('hex')
        .substring(0, 32);
    return `fp_${hash}`;
}
// Rate limit middleware
function rateLimiter(req, res, next) {
    // Check for subscription token first
    const authHeader = req.headers.authorization;
    const apiKey = req.query.apiKey;
    // If user has a valid subscription, skip rate limiting
    if (authHeader || apiKey) {
        // In production, validate the token/key against your subscription database
        // For now, any non-empty auth header bypasses rate limiting
        if (authHeader?.startsWith('Bearer ') && authHeader.length > 10) {
            // Mark as premium user
            req.isPremium = true;
            return next();
        }
    }
    // Free tier rate limiting
    const fingerprint = generateFingerprint(req);
    const now = Date.now();
    let entry = rateLimitStore.get(fingerprint);
    if (!entry || entry.resetAt < now) {
        // Create new entry
        entry = {
            count: 1,
            resetAt: now + LIMIT_WINDOW_MS,
            firstRequest: now
        };
        rateLimitStore.set(fingerprint, entry);
        // Set headers
        res.setHeader('X-RateLimit-Limit', FREE_TIER_LIMIT);
        res.setHeader('X-RateLimit-Remaining', FREE_TIER_LIMIT - 1);
        res.setHeader('X-RateLimit-Reset', Math.floor(entry.resetAt / 1000));
        req.isPremium = false;
        return next();
    }
    // Check if limit exceeded
    if (entry.count >= FREE_TIER_LIMIT) {
        const resetInSeconds = Math.ceil((entry.resetAt - now) / 1000);
        const resetInHours = Math.ceil(resetInSeconds / 3600);
        res.setHeader('X-RateLimit-Limit', FREE_TIER_LIMIT);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', Math.floor(entry.resetAt / 1000));
        res.setHeader('Retry-After', resetInSeconds);
        res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Free tier allows ${FREE_TIER_LIMIT} lookups per 24 hours. Resets in ${resetInHours} hour(s).`,
            resetAt: new Date(entry.resetAt).toISOString(),
            upgrade: {
                message: 'Subscribe for unlimited access',
                url: '/subscribe'
            }
        });
        return;
    }
    // Increment count
    entry.count++;
    rateLimitStore.set(fingerprint, entry);
    res.setHeader('X-RateLimit-Limit', FREE_TIER_LIMIT);
    res.setHeader('X-RateLimit-Remaining', FREE_TIER_LIMIT - entry.count);
    res.setHeader('X-RateLimit-Reset', Math.floor(entry.resetAt / 1000));
    req.isPremium = false;
    next();
}
// Get rate limit status for an IP
function getRateLimitStatus(req) {
    const fingerprint = generateFingerprint(req);
    const entry = rateLimitStore.get(fingerprint);
    const now = Date.now();
    if (!entry || entry.resetAt < now) {
        return {
            remaining: FREE_TIER_LIMIT,
            limit: FREE_TIER_LIMIT,
            resetAt: new Date(now + LIMIT_WINDOW_MS),
            isPremium: false
        };
    }
    return {
        remaining: Math.max(0, FREE_TIER_LIMIT - entry.count),
        limit: FREE_TIER_LIMIT,
        resetAt: new Date(entry.resetAt),
        isPremium: false
    };
}
//# sourceMappingURL=rateLimiter.js.map