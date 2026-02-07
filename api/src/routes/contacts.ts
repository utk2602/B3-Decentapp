import { Router, Request, Response } from 'express';
import { redis } from '../services/redis.js';
import { verifySignature } from '../middleware/auth.js';

const router = Router();

const CONTACTS_PREFIX = 'contacts:';

interface ContactRequest {
    ownerPubkey: string;
    contactUsername: string;
    signature: string;
    timestamp: number;
}

/**
 * POST /api/contacts/add
 * Add a contact to user's contact list
 */
router.post('/add', async (req: Request, res: Response) => {
    try {
        const { ownerPubkey, contactUsername, signature, timestamp } = req.body as ContactRequest;

        if (!ownerPubkey || !contactUsername) {
            return res.status(400).json({ error: 'Missing ownerPubkey or contactUsername' });
        }

        // Verify signature
        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Request must be signed' });
        }

        const expectedMessage = `contact:add:${contactUsername}:${timestamp}`;
        const isValid = verifySignature(signature, timestamp, expectedMessage, ownerPubkey);

        if (!isValid) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const key = `${CONTACTS_PREFIX}${ownerPubkey}`;
        await redis.sadd(key, contactUsername.toLowerCase());

        console.log(`📇 Contact added: ${ownerPubkey.slice(0, 8)}... → @${contactUsername}`);

        return res.json({ success: true });
    } catch (error) {
        console.error('Add contact error:', error);
        return res.status(500).json({ error: 'Failed to add contact' });
    }
});

/**
 * POST /api/contacts/remove
 * Remove a contact from user's contact list
 */
router.post('/remove', async (req: Request, res: Response) => {
    try {
        const { ownerPubkey, contactUsername, signature, timestamp } = req.body as ContactRequest;

        if (!ownerPubkey || !contactUsername) {
            return res.status(400).json({ error: 'Missing ownerPubkey or contactUsername' });
        }

        // Verify signature
        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Request must be signed' });
        }

        const expectedMessage = `contact:remove:${contactUsername}:${timestamp}`;
        const isValid = verifySignature(signature, timestamp, expectedMessage, ownerPubkey);

        if (!isValid) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const key = `${CONTACTS_PREFIX}${ownerPubkey}`;
        await redis.srem(key, contactUsername.toLowerCase());

        console.log(`📇 Contact removed: ${ownerPubkey.slice(0, 8)}... ✕ @${contactUsername}`);

        return res.json({ success: true });
    } catch (error) {
        console.error('Remove contact error:', error);
        return res.status(500).json({ error: 'Failed to remove contact' });
    }
});

/**
 * GET /api/contacts/:pubkey
 * Get user's contact list
 */
router.get('/:pubkey', async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.params;

        const key = `${CONTACTS_PREFIX}${pubkey}`;
        const contacts = await redis.smembers(key) as string[];

        return res.json({ contacts });
    } catch (error) {
        console.error('Get contacts error:', error);
        return res.status(500).json({ error: 'Failed to get contacts' });
    }
});

/**
 * GET /api/contacts/search/:prefix
 * Search users by username prefix
 */
router.get('/search/:prefix', async (req: Request, res: Response) => {
    try {
        const { prefix } = req.params;

        if (!prefix || prefix.length < 2) {
            return res.status(400).json({ error: 'Prefix must be at least 2 characters' });
        }

        // Note: This requires scanning usernames. In production, use a proper search index.
        // For now, we'll return a placeholder - the client should query on-chain registry.
        return res.json({
            results: [],
            note: 'Search via on-chain registry recommended'
        });
    } catch (error) {
        console.error('Search contacts error:', error);
        return res.status(500).json({ error: 'Search failed' });
    }
});

export default router;
