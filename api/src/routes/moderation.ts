import { Router, Request, Response } from 'express';
import { redis } from '../services/redis.js';
import { verifySignature } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();

// ── Admin auth (same pattern as admin.ts) ──
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const adminAuth = (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;
    const activeSecret = ADMIN_SECRET || 'dev_admin_secret';
    if (!authHeader || authHeader !== `Bearer ${activeSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

function computeStatus(strikes: number, bannedStr: string | null): string {
    if (bannedStr) return 'banned';
    const t = config.moderation;
    if (strikes >= t.banThreshold) return 'banned';
    if (strikes >= t.cooldownThreshold) return 'cooldown';
    if (strikes >= t.warningThreshold) return 'warned';
    return 'clean';
}

// ────────────────────────────────────────────────────────────────────
//  POST /flag – Auto-flag a content violation (client-side reporter)
// ────────────────────────────────────────────────────────────────────

router.post('/flag', async (req: Request, res: Response) => {
    try {
        const { senderPubkey, category, contentHash, signature, timestamp } =
            req.body;

        if (!senderPubkey || !category || !contentHash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const message = `mod:flag:${contentHash}:${timestamp}`;
        if (!verifySignature(signature, timestamp, message, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Increment strikes counter
        const strikes = await redis.incr(`strikes:${senderPubkey}`);

        // Store flag details with 30-day TTL
        const flagKey = `flag:${senderPubkey}:${Date.now()}`;
        await redis.set(
            flagKey,
            JSON.stringify({ category, contentHash, timestamp: Date.now() }),
        );
        await redis.expire(flagKey, 30 * 24 * 60 * 60);

        const status = computeStatus(strikes, null);

        // Auto-ban when threshold reached
        if (status === 'banned' || strikes >= config.moderation.banThreshold) {
            await redis.set(
                `banned:${senderPubkey}`,
                JSON.stringify({
                    reason: 'Automatic ban: content policy violations',
                    bannedAt: Date.now(),
                    strikes,
                }),
            );
            console.log(
                `🚫 Auto-banned ${senderPubkey.slice(0, 8)} after ${strikes} strikes`,
            );
        }

        console.log(
            `⚠️ Content flag: ${senderPubkey.slice(0, 8)} – ${category} (strikes: ${strikes}, status: ${status})`,
        );

        return res.json({ success: true, strikes, status });
    } catch (error) {
        console.error('❌ Flag error:', error);
        return res.status(500).json({ error: 'Flag failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  GET /status/:pubkey – Check moderation status
// ────────────────────────────────────────────────────────────────────

router.get('/status/:pubkey', async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.params;

        const strikesStr = await redis.get(`strikes:${pubkey}`);
        const strikes = strikesStr ? parseInt(String(strikesStr), 10) : 0;
        const bannedStr = await redis.get(`banned:${pubkey}`);

        const status = computeStatus(strikes, bannedStr ? String(bannedStr) : null);

        return res.json({
            pubkey,
            strikes,
            status,
            banned: !!bannedStr,
            banDetails: bannedStr ? JSON.parse(String(bannedStr)) : null,
        });
    } catch (error) {
        console.error('❌ Status check error:', error);
        return res.status(500).json({ error: 'Status check failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  POST /ban – Admin: ban a user
// ────────────────────────────────────────────────────────────────────

router.post('/ban', adminAuth, async (req: Request, res: Response) => {
    try {
        const { pubkey, reason } = req.body;
        if (!pubkey) return res.status(400).json({ error: 'Missing pubkey' });

        await redis.set(
            `banned:${pubkey}`,
            JSON.stringify({
                reason: reason || 'Manual admin ban',
                bannedAt: Date.now(),
                admin: true,
            }),
        );

        console.log(
            `🚫 Admin banned ${pubkey.slice(0, 8)}: ${reason || 'No reason'}`,
        );
        return res.json({ success: true, pubkey });
    } catch (error) {
        console.error('❌ Ban error:', error);
        return res.status(500).json({ error: 'Ban failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  POST /unban – Admin: unban a user
// ────────────────────────────────────────────────────────────────────

router.post('/unban', adminAuth, async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.body;
        if (!pubkey) return res.status(400).json({ error: 'Missing pubkey' });

        await redis.del(`banned:${pubkey}`);
        await redis.del(`strikes:${pubkey}`);

        console.log(`✅ Admin unbanned ${pubkey.slice(0, 8)}`);
        return res.json({ success: true, pubkey });
    } catch (error) {
        console.error('❌ Unban error:', error);
        return res.status(500).json({ error: 'Unban failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  POST /appeal – User appeals strikes / ban
// ────────────────────────────────────────────────────────────────────

router.post('/appeal', async (req: Request, res: Response) => {
    try {
        const { pubkey, reason, signature, timestamp } = req.body;
        if (!pubkey || !reason) {
            return res.status(400).json({ error: 'Missing pubkey or reason' });
        }

        const message = `mod:appeal:${timestamp}`;
        if (!verifySignature(signature, timestamp, message, pubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        await redis.set(
            `appeal:${pubkey}:${Date.now()}`,
            JSON.stringify({ reason, timestamp: Date.now() }),
        );

        console.log(`📋 Appeal from ${pubkey.slice(0, 8)}: ${reason.slice(0, 50)}`);
        return res.json({ success: true, message: 'Appeal submitted for review' });
    } catch (error) {
        console.error('❌ Appeal error:', error);
        return res.status(500).json({ error: 'Appeal failed' });
    }
});

export default router;
