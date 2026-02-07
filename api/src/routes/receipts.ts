import { Router, Request, Response } from 'express';
import { redis } from '../services/redis.js';
import { verifySignature } from '../middleware/auth.js';

const router = Router();

type ReceiptType = 'delivered' | 'read';

interface ReceiptRequest {
    messageId: string;
    type: ReceiptType;
    senderPubkey: string;  // Who is sending the receipt (the reader)
    signature: string;
    timestamp: number;
}

const RECEIPT_TTL = 60 * 60 * 24 * 7; // 7 days

/**
 * POST /api/receipt
 * Send a delivery or read receipt for a message
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { messageId, type, senderPubkey, signature, timestamp } = req.body as ReceiptRequest;

        // Validation
        if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
        if (!type || !['delivered', 'read'].includes(type)) {
            return res.status(400).json({ error: 'Invalid type. Must be "delivered" or "read"' });
        }
        if (!senderPubkey) return res.status(400).json({ error: 'Missing senderPubkey' });

        // Auth Verification
        if (!signature || !timestamp) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Request must be signed'
            });
        }

        // Verify signature: receipt:{messageId}:{type}:{timestamp}
        const expectedMessage = `receipt:${messageId}:${type}:${timestamp}`;
        const isValid = verifySignature(signature, timestamp, expectedMessage, senderPubkey);

        if (!isValid) {
            return res.status(403).json({
                error: 'Invalid signature',
                message: 'Signature verification failed'
            });
        }

        // Store receipt in Redis
        const key = `receipt:${messageId}:${type}`;
        await redis.set(key, JSON.stringify({
            by: senderPubkey,
            at: timestamp
        }), { ex: RECEIPT_TTL });

        console.log(`📬 Receipt: ${type} for ${messageId.slice(0, 8)}... by ${senderPubkey.slice(0, 8)}...`);

        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Receipt error:', error);
        return res.status(500).json({
            error: 'Receipt failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/receipt/:messageId
 * Get receipts for a message
 */
router.get('/:messageId', async (req: Request, res: Response) => {
    try {
        const { messageId } = req.params;

        const [delivered, read] = await Promise.all([
            redis.get<string>(`receipt:${messageId}:delivered`),
            redis.get<string>(`receipt:${messageId}:read`)
        ]);

        return res.json({
            messageId,
            delivered: delivered ? JSON.parse(delivered) : null,
            read: read ? JSON.parse(read) : null
        });

    } catch (error) {
        console.error('❌ Receipt fetch error:', error);
        return res.status(500).json({
            error: 'Fetch failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
