import { Router, Request, Response } from 'express';
import { verifySignature } from '../middleware/auth.js';
import { redis } from '../services/redis.js';

const router = Router();

// ─── Redis key helpers ───
const DMS_CONFIG  = (pk: string) => `dms:config:${pk}`;
const DMS_SEEN    = (pk: string) => `dms:lastseen:${pk}`;
const DMS_MSGS    = (pk: string) => `dms:messages:${pk}`;
const DMS_TRIGGER = (pk: string) => `dms:triggered:${pk}`;

// Allowed check-in intervals (in hours)
const ALLOWED_INTERVALS = [0, 12, 24, 48, 72, 168]; // 0 = 10-second test mode

/**
 * Interval → Redis TTL in seconds.
 * 0 h  ➜ 10 s (testing mode)
 * Otherwise hours × 3 600
 */
function intervalToTTL(hours: number): number {
    if (hours === 0) return 10;
    return hours * 3600;
}

// ────────────────────────────────────────────────────────────
// PUT  /api/dms/configure
// Save (or update) the Dead Man's Switch configuration.
// Body: { pubkey, signature, timestamp, intervalHours, messages[] }
//   messages[]: { recipientPubkey, encryptedMessage }
// ────────────────────────────────────────────────────────────
router.put('/configure', async (req: Request, res: Response) => {
    try {
        const { pubkey, signature, timestamp, intervalHours, messages } = req.body;

        // ── Validate payload ──
        if (!pubkey || !signature || !timestamp) {
            return res.status(401).json({ error: 'Unauthorized – missing auth fields' });
        }
        if (intervalHours === undefined || !ALLOWED_INTERVALS.includes(intervalHours)) {
            return res.status(400).json({
                error: `Invalid intervalHours. Allowed: ${ALLOWED_INTERVALS.join(', ')}`,
            });
        }
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'messages must be a non-empty array' });
        }
        for (const m of messages) {
            if (!m.recipientPubkey || !m.encryptedMessage) {
                return res.status(400).json({ error: 'Each message needs recipientPubkey & encryptedMessage' });
            }
        }

        // ── Verify signature ──
        const expectedMessage = `dms:configure:${intervalHours}:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, pubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // ── Persist to Redis ──
        await redis.hset(DMS_CONFIG(pubkey), {
            enabled: 'true',
            intervalHours: String(intervalHours),
            createdAt: String(Date.now()),
            recipientCount: String(messages.length),
        });

        // Store pre-encrypted message payloads
        await redis.set(DMS_MSGS(pubkey), JSON.stringify(messages));

        // Set the "last seen" key with TTL = chosen interval
        const ttl = intervalToTTL(intervalHours);
        await redis.set(DMS_SEEN(pubkey), String(Date.now()), { ex: ttl });

        // Clear any previous trigger flag (re-arming the switch)
        await redis.del(DMS_TRIGGER(pubkey));

        console.log(`🕐 DMS configured for ${pubkey.slice(0, 8)}… interval=${intervalHours}h (${ttl}s) recipients=${messages.length}`);

        return res.json({
            success: true,
            intervalHours,
            ttlSeconds: ttl,
            recipientCount: messages.length,
        });
    } catch (error) {
        console.error('❌ DMS configure error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ────────────────────────────────────────────────────────────
// POST /api/dms/checkin
// Heartbeat – resets the TTL so the switch doesn't fire.
// Body: { pubkey, signature, timestamp }
// ────────────────────────────────────────────────────────────
router.post('/checkin', async (req: Request, res: Response) => {
    try {
        const { pubkey, signature, timestamp } = req.body;

        if (!pubkey || !signature || !timestamp) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const expectedMessage = `dms:checkin:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, pubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Read config
        const cfg = await redis.hgetall(DMS_CONFIG(pubkey));
        if (!cfg || cfg.enabled !== 'true') {
            return res.status(404).json({ error: 'No active Dead Man\'s Switch' });
        }

        const intervalHours = parseInt(String(cfg.intervalHours), 10);
        const ttl = intervalToTTL(intervalHours);

        // Reset the TTL
        await redis.set(DMS_SEEN(pubkey), String(Date.now()), { ex: ttl });

        // Clear trigger flag in case it fired while user was away
        await redis.del(DMS_TRIGGER(pubkey));

        console.log(`💓 DMS check-in from ${pubkey.slice(0, 8)}… ttl reset to ${ttl}s`);

        return res.json({ success: true, nextDeadline: Date.now() + ttl * 1000 });
    } catch (error) {
        console.error('❌ DMS check-in error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ────────────────────────────────────────────────────────────
// GET  /api/dms/status/:pubkey
// Returns current switch state (no auth – public key only).
// ────────────────────────────────────────────────────────────
router.get('/status/:pubkey', async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.params;

        const cfg = await redis.hgetall(DMS_CONFIG(pubkey));
        if (!cfg || cfg.enabled !== 'true') {
            return res.json({ enabled: false });
        }

        const lastSeen = await redis.get(DMS_SEEN(pubkey));
        const triggered = await redis.get(DMS_TRIGGER(pubkey));

        return res.json({
            enabled: true,
            intervalHours: parseInt(String(cfg.intervalHours), 10),
            recipientCount: parseInt(String(cfg.recipientCount || '0'), 10),
            lastSeenAlive: lastSeen !== null,
            triggered: triggered !== null,
            configuredAt: parseInt(String(cfg.createdAt), 10),
        });
    } catch (error) {
        console.error('❌ DMS status error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ────────────────────────────────────────────────────────────
// DELETE /api/dms/disable
// Disarm the switch – deletes all DMS data for this user.
// Body: { pubkey, signature, timestamp }
// ────────────────────────────────────────────────────────────
router.delete('/disable', async (req: Request, res: Response) => {
    try {
        const { pubkey, signature, timestamp } = req.body;

        if (!pubkey || !signature || !timestamp) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const expectedMessage = `dms:disable:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, pubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Wipe everything
        await redis.del(
            DMS_CONFIG(pubkey),
            DMS_SEEN(pubkey),
            DMS_MSGS(pubkey),
            DMS_TRIGGER(pubkey),
        );

        console.log(`🔕 DMS disabled for ${pubkey.slice(0, 8)}…`);
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ DMS disable error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
