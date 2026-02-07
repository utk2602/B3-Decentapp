import { Request, Response, NextFunction } from 'express';
import { redis } from '../services/redis.js';
import { config } from '../config.js';

const SPENDING_KEY_PREFIX = 'spending:day:';
const SECONDS_IN_DAY = 86400;

/**
 * Middleware to enforce daily spending limits per user
 * This prevents a single user from draining the fee payer wallet
 */
export async function spendingLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    // Require public key or username - no IP fallback for security
    const userIdentifier = req.body?.senderPublicKey || req.body?.ownerPublicKey || req.body?.publicKey || req.body?.senderPubkey || req.body?.username;

    if (!userIdentifier) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Valid public key or username required for spending limits',
        });
        return;
    }

    // Standard transaction is ~5000 lamports (0.000005 SOL)
    const ESTIMATED_TX_COST_SOL = 0.000005;

    try {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const key = `${SPENDING_KEY_PREFIX}${today}:${userIdentifier}`;

        // Use atomic INCRBYFLOAT for thread safety
        const newUsageStr = await redis.incrbyfloat(key, ESTIMATED_TX_COST_SOL);
        const newUsage = parseFloat(newUsageStr as unknown as string);

        // Set expiry on first increment
        await redis.expire(key, SECONDS_IN_DAY);

        // Check if limit exceeded (after increment for accuracy)
        if (newUsage > config.spendingLimits.maxDailySolPerUser) {
            console.warn(`🛑 User ${userIdentifier} exceeded daily spending limit: ${newUsage.toFixed(6)} SOL`);
            res.status(429).json({
                error: 'Daily limit exceeded',
                message: 'You have reached your daily transaction limit. Please try again tomorrow.',
                limit: `${config.spendingLimits.maxDailySolPerUser} SOL`,
                usage: `${newUsage.toFixed(6)} SOL`
            });
            return;
        }

        next();
    } catch (error) {
        console.error('Spending limit check failed:', error);
        // Fail closed - reject request if Redis is unavailable
        res.status(503).json({
            error: 'Service unavailable',
            message: 'Spending limit service temporarily unavailable',
        });
    }
}
