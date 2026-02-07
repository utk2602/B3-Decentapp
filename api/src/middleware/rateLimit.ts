import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

// Rate limiter: 1 message per 2 seconds per user
const rateLimiter = new RateLimiterMemory({
    points: config.rateLimit.points,
    duration: config.rateLimit.duration,
});

export async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    // Require public key - no IP fallback for security
    const identifier = req.body?.senderPubkey || req.body?.senderPublicKey;

    if (!identifier) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Valid public key required for rate limiting',
        });
        return;
    }

    try {
        await rateLimiter.consume(identifier);
        next();
    } catch (rejRes) {
        // Rate limit exceeded OR rate limiter error - fail closed
        if (rejRes instanceof Error) {
            console.error('Rate limiter error:', rejRes);
            res.status(503).json({
                error: 'Service unavailable',
                message: 'Rate limiting service temporarily unavailable',
            });
            return;
        }
        res.status(429).json({
            error: 'Too many requests',
            message: 'You can send 1 message every 2 seconds',
            retryAfter: config.rateLimit.duration,
        });
    }
}
