import { Router, Request, Response } from 'express';
import { redis } from '../services/redis.js';
import { verifySignature } from '../middleware/auth.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import crypto from 'crypto';

const router = Router();

// ────────────────────────────────────────────────────────────────────
//  PUT /configure – Owner stores encrypted shards for guardians
// ────────────────────────────────────────────────────────────────────

router.put('/configure', async (req: Request, res: Response) => {
    try {
        const {
            guardians,
            threshold,
            senderPubkey,
            ownerEncryptionPubkey,
            signature,
            timestamp,
        } = req.body;

        if (!guardians || !Array.isArray(guardians) || guardians.length === 0) {
            return res.status(400).json({ error: 'Missing or empty guardians array' });
        }
        if (!threshold || threshold < 2) {
            return res.status(400).json({ error: 'Threshold must be at least 2' });
        }
        if (threshold > guardians.length) {
            return res.status(400).json({ error: 'Threshold cannot exceed number of guardians' });
        }

        const message = `recovery:configure:${threshold}:${timestamp}`;
        if (!verifySignature(signature, timestamp, message, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Store config
        await redis.set(
            `recovery:config:${senderPubkey}`,
            JSON.stringify({
                guardians: guardians.map((g: any) => g.pubkey),
                threshold,
                ownerPubkey: senderPubkey,
                ownerEncryptionPubkey: ownerEncryptionPubkey || '',
                configuredAt: Date.now(),
            }),
        );

        // Store each encrypted shard
        for (const g of guardians) {
            await redis.set(
                `recovery:shard:${senderPubkey}:${g.pubkey}`,
                g.encryptedShard,
            );
        }

        console.log(
            `🔐 Recovery configured for ${senderPubkey.slice(0, 8)} – ` +
            `${guardians.length} guardians, threshold ${threshold}`,
        );

        return res.json({
            success: true,
            guardianCount: guardians.length,
            threshold,
        });
    } catch (error) {
        console.error('❌ Recovery configure error:', error);
        return res.status(500).json({
            error: 'Configuration failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ────────────────────────────────────────────────────────────────────
//  POST /initiate – Start a recovery session (no auth – user lost keys)
// ────────────────────────────────────────────────────────────────────

router.post('/initiate', rateLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const { ownerPubkey, tempPubkey } = req.body;

        if (!ownerPubkey || !tempPubkey) {
            return res.status(400).json({ error: 'Missing ownerPubkey or tempPubkey' });
        }

        const configStr = await redis.get(`recovery:config:${ownerPubkey}`);
        if (!configStr) {
            return res
                .status(404)
                .json({ error: 'No recovery configuration found for this identity' });
        }

        const config = JSON.parse(String(configStr));

        // Re-use an existing pending session for the same owner if present
        const sessionKeys = await redis.keys('recovery:session:*');
        for (const key of sessionKeys) {
            const sess = JSON.parse((await redis.get(key)) || '{}');
            if (sess.ownerPubkey === ownerPubkey && sess.status === 'pending') {
                return res.json({
                    success: true,
                    recoveryId: key.replace('recovery:session:', ''),
                    threshold: config.threshold,
                    guardians: config.guardians,
                    status: 'pending',
                    existing: true,
                });
            }
        }

        const recoveryId = crypto.randomUUID();
        const session = {
            ownerPubkey,
            tempPubkey,
            threshold: config.threshold,
            guardians: config.guardians,
            ownerEncryptionPubkey: config.ownerEncryptionPubkey,
            submittedShards: {} as Record<string, any>,
            status: 'pending',
            createdAt: Date.now(),
        };

        await redis.set(`recovery:session:${recoveryId}`, JSON.stringify(session));
        await redis.expire(`recovery:session:${recoveryId}`, 3600); // 1-hour TTL

        console.log(
            `🔓 Recovery session initiated for ${ownerPubkey.slice(0, 8)}: ${recoveryId.slice(0, 8)}`,
        );

        return res.json({
            success: true,
            recoveryId,
            threshold: config.threshold,
            guardians: config.guardians,
            status: 'pending',
        });
    } catch (error) {
        console.error('❌ Recovery initiate error:', error);
        return res.status(500).json({
            error: 'Initiation failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ────────────────────────────────────────────────────────────────────
//  GET /session/:recoveryId – Check session status
// ────────────────────────────────────────────────────────────────────

router.get('/session/:recoveryId', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.params;
        const sessionStr = await redis.get(`recovery:session:${recoveryId}`);
        if (!sessionStr) {
            return res
                .status(404)
                .json({ error: 'Recovery session not found or expired' });
        }

        const session = JSON.parse(String(sessionStr));
        const submittedCount = Object.keys(session.submittedShards).length;

        return res.json({
            recoveryId,
            ownerPubkey: session.ownerPubkey,
            tempPubkey: session.tempPubkey,
            threshold: session.threshold,
            guardians: session.guardians,
            submittedCount,
            status: session.status,
            ready: submittedCount >= session.threshold,
        });
    } catch (error) {
        console.error('❌ Recovery session check error:', error);
        return res.status(500).json({ error: 'Session check failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  GET /pending/:guardianPubkey – Guardian checks pending requests
// ────────────────────────────────────────────────────────────────────

router.get('/pending/:guardianPubkey', async (req: Request, res: Response) => {
    try {
        const { guardianPubkey } = req.params;
        const { signature, timestamp } = req.query;

        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Missing signature' });
        }

        const message = `recovery:pending:${timestamp}`;
        if (
            !verifySignature(
                signature as string,
                Number(timestamp),
                message,
                guardianPubkey,
            )
        ) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const sessionKeys = await redis.keys('recovery:session:*');
        const pendingRequests: any[] = [];

        for (const key of sessionKeys) {
            const session = JSON.parse((await redis.get(key)) || '{}');
            if (
                session.status === 'pending' &&
                session.guardians?.includes(guardianPubkey) &&
                !session.submittedShards?.[guardianPubkey]
            ) {
                const recoveryId = key.replace('recovery:session:', '');
                const encryptedShard = await redis.get(
                    `recovery:shard:${session.ownerPubkey}:${guardianPubkey}`,
                );

                pendingRequests.push({
                    recoveryId,
                    ownerPubkey: session.ownerPubkey,
                    tempPubkey: session.tempPubkey,
                    ownerEncryptionPubkey: session.ownerEncryptionPubkey,
                    threshold: session.threshold,
                    submittedCount: Object.keys(session.submittedShards).length,
                    encryptedShard,
                    createdAt: session.createdAt,
                });
            }
        }

        return res.json({ pendingRequests });
    } catch (error) {
        console.error('❌ Pending recovery check error:', error);
        return res.status(500).json({ error: 'Check failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  POST /submit-shard – Guardian submits their re-encrypted shard
// ────────────────────────────────────────────────────────────────────

router.post('/submit-shard', async (req: Request, res: Response) => {
    try {
        const {
            recoveryId,
            encryptedShard,
            guardianPubkey,
            guardianEncryptionPubkey,
            signature,
            timestamp,
        } = req.body;

        if (!recoveryId || !encryptedShard || !guardianPubkey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const message = `recovery:submit:${recoveryId}:${timestamp}`;
        if (!verifySignature(signature, timestamp, message, guardianPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const sessionStr = await redis.get(`recovery:session:${recoveryId}`);
        if (!sessionStr) {
            return res
                .status(404)
                .json({ error: 'Recovery session not found or expired' });
        }

        const session = JSON.parse(String(sessionStr));
        if (session.status !== 'pending') {
            return res.status(400).json({ error: 'Recovery session is not pending' });
        }
        if (!session.guardians.includes(guardianPubkey)) {
            return res.status(403).json({ error: 'Not a guardian for this recovery' });
        }

        session.submittedShards[guardianPubkey] = {
            encryptedShard,
            guardianEncryptionPubkey: guardianEncryptionPubkey || '',
        };

        const submittedCount = Object.keys(session.submittedShards).length;
        if (submittedCount >= session.threshold) {
            session.status = 'ready';
        }

        await redis.set(`recovery:session:${recoveryId}`, JSON.stringify(session));

        console.log(
            `🔑 Guardian ${guardianPubkey.slice(0, 8)} submitted shard ` +
            `for recovery ${recoveryId.slice(0, 8)} (${submittedCount}/${session.threshold})`,
        );

        return res.json({
            success: true,
            submittedCount,
            threshold: session.threshold,
            ready: submittedCount >= session.threshold,
        });
    } catch (error) {
        console.error('❌ Shard submit error:', error);
        return res.status(500).json({ error: 'Shard submission failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  GET /shards/:recoveryId – Fetch submitted shards when ready
// ────────────────────────────────────────────────────────────────────

router.get('/shards/:recoveryId', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.params;
        const sessionStr = await redis.get(`recovery:session:${recoveryId}`);
        if (!sessionStr) {
            return res
                .status(404)
                .json({ error: 'Recovery session not found or expired' });
        }

        const session = JSON.parse(String(sessionStr));
        if (session.status !== 'ready') {
            return res.status(400).json({
                error: 'Recovery not ready',
                submittedCount: Object.keys(session.submittedShards).length,
                threshold: session.threshold,
            });
        }

        return res.json({
            shards: session.submittedShards,
            threshold: session.threshold,
        });
    } catch (error) {
        console.error('❌ Fetch shards error:', error);
        return res.status(500).json({ error: 'Fetch failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  POST /complete – Mark recovery as complete
// ────────────────────────────────────────────────────────────────────

router.post('/complete', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.body;
        const sessionStr = await redis.get(`recovery:session:${recoveryId}`);
        if (!sessionStr) {
            return res.status(404).json({ error: 'Recovery session not found' });
        }

        const session = JSON.parse(String(sessionStr));
        session.status = 'completed';
        await redis.set(`recovery:session:${recoveryId}`, JSON.stringify(session));
        await redis.expire(`recovery:session:${recoveryId}`, 300); // 5 min then cleanup

        console.log(`✅ Recovery completed for ${session.ownerPubkey.slice(0, 8)}`);
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Recovery complete error:', error);
        return res.status(500).json({ error: 'Completion failed' });
    }
});

// ────────────────────────────────────────────────────────────────────
//  DELETE /disable – Owner disables their recovery configuration
// ────────────────────────────────────────────────────────────────────

router.delete('/disable', async (req: Request, res: Response) => {
    try {
        const { senderPubkey, signature, timestamp } = req.body;

        const message = `recovery:disable:${timestamp}`;
        if (!verifySignature(signature, timestamp, message, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const configStr = await redis.get(`recovery:config:${senderPubkey}`);
        if (configStr) {
            const config = JSON.parse(String(configStr));
            for (const gp of config.guardians) {
                await redis.del(`recovery:shard:${senderPubkey}:${gp}`);
            }
        }
        await redis.del(`recovery:config:${senderPubkey}`);

        console.log(`🗑️ Recovery disabled for ${senderPubkey.slice(0, 8)}`);
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Recovery disable error:', error);
        return res.status(500).json({ error: 'Disable failed' });
    }
});

export default router;
