import { Router, Request, Response } from 'express';
import { redis, deleteAvatar } from '../services/redis.js';

const router = Router();

// Admin secret key - must be set in environment
// Admin secret key - must be set in environment
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET || ADMIN_SECRET === 'dev_admin_secret') {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('❌ FATAL: ADMIN_SECRET is not set or is using default in production');
    }
    console.warn('⚠️  Warning: Using default/unsafe ADMIN_SECRET');
}

/**
 * Middleware to check admin secret
 */
const adminAuth = (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;
    const activeSecret = ADMIN_SECRET || 'dev_admin_secret';

    if (!authHeader || authHeader !== `Bearer ${activeSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

/**
 * DELETE /api/admin/clear-redis
 * Clear all encryption keys and user data from Redis
 * Requires admin authorization
 */
router.delete('/clear-redis', adminAuth, async (_req: Request, res: Response) => {
    try {
        console.log('🧹 Admin: Clearing all Redis encryption keys and avatars...');

        // Get all encryption keys and delete them
        const encryptionKeys = await redis.keys('encryption:*');
        const avatarKeys = await redis.keys('avatar:*');
        const blockedKeys = await redis.keys('blocked:*');
        const msgBlobKeys = await redis.keys('msg:blob:*');

        let deletedCount = 0;

        for (const key of [...encryptionKeys, ...avatarKeys, ...blockedKeys, ...msgBlobKeys]) {
            await redis.del(key);
            deletedCount++;
        }

        console.log(`🧹 Deleted ${deletedCount} Redis keys`);

        return res.json({
            success: true,
            deletedKeys: deletedCount,
            message: 'All Redis user data cleared (encryption keys, avatars, blocks, message blobs)',
        });
    } catch (error) {
        console.error('❌ Clear Redis error:', error);
        return res.status(500).json({
            error: 'Clear failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/admin/redis-stats
 * Get Redis key statistics
 */
router.get('/redis-stats', adminAuth, async (_req: Request, res: Response) => {
    try {
        const encryptionKeys = await redis.keys('encryption:*');
        const avatarKeys = await redis.keys('avatar:*');
        const blockedKeys = await redis.keys('blocked:*');
        const msgBlobKeys = await redis.keys('msg:blob:*');

        return res.json({
            encryptionKeys: encryptionKeys.length,
            avatarKeys: avatarKeys.length,
            blockedKeys: blockedKeys.length,
            msgBlobKeys: msgBlobKeys.length,
            total: encryptionKeys.length + avatarKeys.length + blockedKeys.length + msgBlobKeys.length,
        });
    } catch (error) {
        console.error('❌ Redis stats error:', error);
        return res.status(500).json({
            error: 'Stats failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
