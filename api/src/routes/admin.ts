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

/**
 * GET /api/admin/flagged-users
 * List users with moderation strikes
 */
router.get('/flagged-users', adminAuth, async (_req: Request, res: Response) => {
    try {
        const strikeKeys = await redis.keys('strikes:*');
        const bannedKeys = await redis.keys('banned:*');

        const users: any[] = [];
        for (const key of strikeKeys) {
            const pubkey = key.replace('strikes:', '');
            const strikes = parseInt(String((await redis.get(key)) || '0'), 10);
            const bannedStr = await redis.get(`banned:${pubkey}`);
            users.push({
                pubkey,
                strikes,
                banned: !!bannedStr,
                banDetails: bannedStr ? JSON.parse(String(bannedStr)) : null,
            });
        }

        // Also include banned users without strike keys
        for (const key of bannedKeys) {
            const pubkey = key.replace('banned:', '');
            if (!users.find((u) => u.pubkey === pubkey)) {
                const bannedStr = await redis.get(key);
                users.push({
                    pubkey,
                    strikes: 0,
                    banned: true,
                    banDetails: bannedStr ? JSON.parse(String(bannedStr)) : null,
                });
            }
        }

        return res.json({ users, total: users.length });
    } catch (error) {
        console.error('❌ Flagged users error:', error);
        return res.status(500).json({ error: 'Failed to fetch flagged users' });
    }
});

/**
 * POST /api/admin/reset-strikes
 * Reset strikes for a specific user
 */
router.post('/reset-strikes', adminAuth, async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.body;
        if (!pubkey) return res.status(400).json({ error: 'Missing pubkey' });

        await redis.del(`strikes:${pubkey}`);

        // Clean up flag history
        const flagKeys = await redis.keys(`flag:${pubkey}:*`);
        for (const k of flagKeys) await redis.del(k);

        console.log(`🧹 Admin reset strikes for ${pubkey.slice(0, 8)}`);
        return res.json({ success: true, pubkey });
    } catch (error) {
        console.error('❌ Reset strikes error:', error);
        return res.status(500).json({ error: 'Reset failed' });
    }
});

/**
 * GET /api/admin/flags/:pubkey
 * View flag details for a specific user
 */
router.get('/flags/:pubkey', adminAuth, async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.params;
        const flagKeys = await redis.keys(`flag:${pubkey}:*`);
        const strikesStr = await redis.get(`strikes:${pubkey}`);
        const bannedStr = await redis.get(`banned:${pubkey}`);

        const flags: any[] = [];
        for (const key of flagKeys) {
            const data = await redis.get(key);
            if (data) flags.push(JSON.parse(String(data)));
        }

        return res.json({
            pubkey,
            strikes: strikesStr ? parseInt(String(strikesStr), 10) : 0,
            banned: !!bannedStr,
            banDetails: bannedStr ? JSON.parse(String(bannedStr)) : null,
            flags,
        });
    } catch (error) {
        console.error('❌ Flags fetch error:', error);
        return res.status(500).json({ error: 'Fetch failed' });
    }
});

export default router;
