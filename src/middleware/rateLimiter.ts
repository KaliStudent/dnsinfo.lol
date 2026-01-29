import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ApiKeyModel } from '../models/ApiKey';
import { SubscriptionModel } from '../models/Subscription';

// In-memory rate limit store (for free tier users)
interface RateLimitEntry {
  count: number;
  resetAt: number;
  firstRequest: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

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
function generateFingerprint(req: Request): string {
  const components = [
    req.ip,
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
  ];

  const hash = crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
    .substring(0, 32);

  return `fp_${hash}`;
}

// Extract API key from request
function extractApiKey(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token.startsWith('di_')) {
      return token;
    }
  }

  // Check query parameter
  const queryKey = req.query.apiKey as string;
  if (queryKey?.startsWith('di_')) {
    return queryKey;
  }

  // Check X-API-Key header
  const headerKey = req.headers['x-api-key'] as string;
  if (headerKey?.startsWith('di_')) {
    return headerKey;
  }

  return null;
}

// Rate limit middleware
export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const apiKey = extractApiKey(req);

  // If API key is provided, validate against database
  if (apiKey) {
    const keyInfo = ApiKeyModel.validateWithUser(apiKey);

    if (keyInfo) {
      // Check if user has valid subscription
      const hasValidSub = SubscriptionModel.hasValidSubscription(keyInfo.userId);

      if (hasValidSub) {
        // Mark as premium user with subscription
        (req as any).isPremium = true;
        (req as any).userId = keyInfo.userId;
        (req as any).apiKeyId = keyInfo.apiKey.id;

        // Set unlimited headers
        res.setHeader('X-RateLimit-Limit', 'unlimited');
        res.setHeader('X-RateLimit-Remaining', 'unlimited');

        return next();
      } else {
        // API key valid but subscription expired/missing
        res.status(403).json({
          error: 'Subscription required',
          message: 'Your subscription has expired or is inactive.',
          upgrade: {
            message: 'Subscribe to continue with unlimited access',
            url: '/pricing'
          }
        });
        return;
      }
    } else {
      // Invalid API key
      res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is invalid or has been revoked.',
        help: 'Get your API key from your dashboard at /dashboard'
      });
      return;
    }
  }

  // Check if user is logged in with a session (for web UI usage)
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const user = req.user as any;
    const hasValidSub = SubscriptionModel.hasValidSubscription(user.id);

    if (hasValidSub) {
      (req as any).isPremium = true;
      (req as any).userId = user.id;

      res.setHeader('X-RateLimit-Limit', 'unlimited');
      res.setHeader('X-RateLimit-Remaining', 'unlimited');

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

    (req as any).isPremium = false;
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
        message: 'Subscribe for unlimited access starting at $2.50/month',
        url: '/pricing',
        trial: 'Start with a 30-day free trial'
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

  (req as any).isPremium = false;
  next();
}

// Get rate limit status for a request
export function getRateLimitStatus(req: Request): {
  remaining: number;
  limit: number;
  resetAt: Date;
  isPremium: boolean;
  isAuthenticated: boolean;
} {
  // Check API key first
  const apiKey = extractApiKey(req);
  if (apiKey) {
    const keyInfo = ApiKeyModel.validateWithUser(apiKey);
    if (keyInfo && SubscriptionModel.hasValidSubscription(keyInfo.userId)) {
      return {
        remaining: Infinity,
        limit: Infinity,
        resetAt: new Date(),
        isPremium: true,
        isAuthenticated: true
      };
    }
  }

  // Check session auth
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    const user = req.user as any;
    if (SubscriptionModel.hasValidSubscription(user.id)) {
      return {
        remaining: Infinity,
        limit: Infinity,
        resetAt: new Date(),
        isPremium: true,
        isAuthenticated: true
      };
    }
  }

  // Free tier
  const fingerprint = generateFingerprint(req);
  const entry = rateLimitStore.get(fingerprint);
  const now = Date.now();

  if (!entry || entry.resetAt < now) {
    return {
      remaining: FREE_TIER_LIMIT,
      limit: FREE_TIER_LIMIT,
      resetAt: new Date(now + LIMIT_WINDOW_MS),
      isPremium: false,
      isAuthenticated: false
    };
  }

  return {
    remaining: Math.max(0, FREE_TIER_LIMIT - entry.count),
    limit: FREE_TIER_LIMIT,
    resetAt: new Date(entry.resetAt),
    isPremium: false,
    isAuthenticated: false
  };
}

// Export for testing
export { rateLimitStore, generateFingerprint, extractApiKey };
