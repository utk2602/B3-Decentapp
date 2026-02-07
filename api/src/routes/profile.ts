import { Router } from 'express';
import { storeAvatar, getAvatar, deleteAvatar } from '../services/redis.js';

const router = Router();

/**
 * POST /api/profile/avatar
 * Upload/update user avatar
 * Body: { username: string, avatarBase64: string }
 */
// ... imports
import { verifySignature } from '../middleware/auth.js';
import { getUserAccount } from '../services/solana.js';

// ... existing code

/**
 * POST /api/profile/avatar
 * Upload/update user avatar
 * Body: { username: string, avatarBase64: string, signature, timestamp }
 */
router.post('/avatar', async (req, res) => {
    try {
        const { username, avatarBase64, signature, timestamp } = req.body;

        if (!username || !avatarBase64) {
            return res.status(400).json({
                success: false,
                error: 'Missing username or avatarBase64',
            });
        }

        // Limit avatar size (e.g., 500KB base64 ~ 375KB actual)
        if (avatarBase64.length > 500 * 1024) {
            return res.status(400).json({
                success: false,
                error: 'Avatar too large. Max 500KB.',
            });
        }

        // Auth Verification
        if (!signature || !timestamp) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Request must be signed' });
        }

        // Get owner pubkey
        const userAccount = await getUserAccount(username.toLowerCase());
        if (!userAccount) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Verify: avatar-upload:{username}:{timestamp}
        const expectedMessage = `avatar-upload:${username}:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, userAccount.owner)) {
            return res.status(403).json({ success: false, error: 'Invalid signature' });
        }

        await storeAvatar(username.toLowerCase(), avatarBase64);

        res.json({
            success: true,
            message: 'Avatar updated',
        });
    } catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload avatar',
        });
    }
});

// ... GET route unchanged ...

/**
 * DELETE /api/profile/:username/avatar
 * Delete a user's avatar
 * Body (JSON): { signature, timestamp } // DELETE usually no body, but express allows it or use query?
 * Better usage: use POST with action DELETE or allow body in DELETE
 */
router.delete('/:username/avatar', async (req, res) => {
    try {
        const { username } = req.params;
        const { signature, timestamp } = req.body;

        if (!signature || !timestamp) {
            return res.status(401).json({ success: false, error: 'Unauthorized: Request must be signed' });
        }

        // Get owner pubkey
        const userAccount = await getUserAccount(username.toLowerCase());
        if (!userAccount) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Verify: avatar-delete:{username}:{timestamp}
        const expectedMessage = `avatar-delete:${username}:${timestamp}`;
        if (!verifySignature(signature, timestamp, expectedMessage, userAccount.owner)) {
            return res.status(403).json({ success: false, error: 'Invalid signature' });
        }

        await deleteAvatar(username.toLowerCase());

        res.json({
            success: true,
            message: 'Avatar deleted',
        });
    } catch (error) {
        console.error('Avatar delete error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete avatar',
        });
    }
});

export default router;
