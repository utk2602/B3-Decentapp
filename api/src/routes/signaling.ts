import { Router, Request, Response } from 'express';
import { redis } from '../services/redis.js';
import { verifySignature } from '../middleware/auth.js';

const router = Router();

const SIGNAL_PREFIX = 'signal:';
const SIGNAL_TTL = 60; // 60 seconds expiry for signals

interface SignalRequest {
    type: string;
    senderPubkey: string;
    peerId: string;
    signature: string;
    timestamp: number;
    sdp?: string;
    candidate?: any;
}

/**
 * POST /api/signaling/send
 * Send a signaling message to a peer
 */
router.post('/send', async (req: Request, res: Response) => {
    try {
        const { type, senderPubkey, peerId, signature, timestamp, sdp, candidate } = req.body as SignalRequest;

        if (!type || !senderPubkey || !peerId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify signature
        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Request must be signed' });
        }

        const expectedMessage = `signal:${type}:${timestamp}`;
        const isValid = verifySignature(signature, timestamp, expectedMessage, senderPubkey);

        if (!isValid) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Store signal for the peer to poll
        const key = `${SIGNAL_PREFIX}${peerId}:${Date.now()}`;
        const signalData = JSON.stringify({
            type,
            from: senderPubkey,
            sdp,
            candidate,
            timestamp,
        });

        await redis.set(key, signalData, { ex: SIGNAL_TTL });

        console.log(`📡 Signal: ${type} from ${senderPubkey.slice(0, 8)}... to ${peerId.slice(0, 8)}...`);

        return res.json({ success: true });
    } catch (error) {
        console.error('Signal send error:', error);
        return res.status(500).json({ error: 'Failed to send signal' });
    }
});

/**
 * GET /api/signaling/poll/:pubkey
 * Poll for incoming signals
 */
router.get('/poll/:pubkey', async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.params;

        // Get all signals for this pubkey
        const pattern = `${SIGNAL_PREFIX}${pubkey}:*`;
        const keys = await redis.keys(pattern);

        const signals: any[] = [];

        for (const key of keys) {
            const data = await redis.get<string>(key);
            if (data) {
                signals.push(JSON.parse(data));
                // Delete after reading
                await redis.del(key);
            }
        }

        return res.json({ signals });
    } catch (error) {
        console.error('Signal poll error:', error);
        return res.status(500).json({ error: 'Failed to poll signals' });
    }
});

export default router;
