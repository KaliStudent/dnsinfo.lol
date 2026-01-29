import { Request, Response, NextFunction } from 'express';
interface RateLimitEntry {
    count: number;
    resetAt: number;
    firstRequest: number;
}
declare const rateLimitStore: Map<string, RateLimitEntry>;
declare function generateFingerprint(req: Request): string;
export declare function rateLimiter(req: Request, res: Response, next: NextFunction): void;
export declare function getRateLimitStatus(req: Request): {
    remaining: number;
    limit: number;
    resetAt: Date;
    isPremium: boolean;
};
export { rateLimitStore, generateFingerprint };
//# sourceMappingURL=rateLimiter.d.ts.map