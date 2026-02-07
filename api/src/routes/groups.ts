import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import { redis } from '../services/redis.js';
import { verifySignature } from '../middleware/auth.js';
import { relaySignedTransaction } from '../services/solana.js';
import {
    buildCreateGroupTransaction,
    buildSetGroupCodeTransaction,
    buildJoinGroupTransaction,
    buildLeaveGroupTransaction,
    buildInviteMemberTransaction,
    getGroupAccount,
    lookupGroupByCode,
    getAllGroupMembers,
    searchPublicGroups,
} from '../services/solana-groups.js';
import nacl from 'tweetnacl';

const router = Router();

const GROUPS_PREFIX = 'group:';
const GROUP_MEMBERS_PREFIX = 'group:members:';
const USER_GROUPS_PREFIX = 'user:groups:';

interface CreateGroupRequest {
    name: string;
    ownerPubkey: string;
    signature: string;
    timestamp: number;
}

interface GroupMemberRequest {
    groupId: string;
    memberPubkey: string;
    ownerPubkey: string;
    signature: string;
    timestamp: number;
}

/**
 * Generate a unique group ID
 */
function generateGroupId(): string {
    const bytes = nacl.randomBytes(16);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /api/groups/build-create-transaction
 * Build an unsigned transaction to create a group
 */
router.post('/build-create-transaction', async (req: Request, res: Response) => {
    try {
        const {
            name,
            description = '',
            isPublic = false,
            isSearchable = false,
            inviteOnly = true,
            maxMembers = 100,
            allowMemberInvites = true,
            groupEncryptionKey, // Base64
            ownerPubkey,
        } = req.body;

        if (!name || !groupEncryptionKey || !ownerPubkey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Generate random group ID (32 bytes)
        const groupId = Buffer.from(nacl.randomBytes(32));

        // Build unsigned transaction
        const { transaction, blockhash, lastValidBlockHeight } = await buildCreateGroupTransaction({
            groupId,
            name,
            description,
            isPublic,
            isSearchable,
            inviteOnly,
            maxMembers,
            allowMemberInvites,
            groupEncryptionKey: Buffer.from(groupEncryptionKey, 'base64'),
            ownerPubkey: new PublicKey(ownerPubkey),
        });

        // Serialize transaction for client
        const serializedTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return res.json({
            success: true,
            transaction: serializedTx,
            blockhash,
            lastValidBlockHeight,
            groupId: groupId.toString('hex'),
        });
    } catch (error) {
        console.error('Build create group transaction error:', error);
        return res.status(500).json({ error: 'Failed to build transaction' });
    }
});

/**
 * POST /api/groups/create
 * Relay a signed group creation transaction and dual-write to Redis
 */
router.post('/create', async (req: Request, res: Response) => {
    try {
        const { signedTransaction, groupId, name, ownerPubkey, signature, timestamp } = req.body;

        if (!signedTransaction || !groupId || !name || !ownerPubkey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify signature
        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Request must be signed' });
        }

        const expectedMessage = `group:create:${name}:${timestamp}`;
        const isValid = verifySignature(signature, timestamp, expectedMessage, ownerPubkey);

        if (!isValid) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Relay transaction to Solana (source of truth)
        const txSignature = await relaySignedTransaction(signedTransaction);

        // Dual-write to Redis (cache/fallback) - non-blocking
        try {
            await redis.hset(`${GROUPS_PREFIX}${groupId}`, {
                name,
                owner: ownerPubkey,
                createdAt: Date.now().toString(),
            });
            await redis.sadd(`${GROUP_MEMBERS_PREFIX}${groupId}`, ownerPubkey);
            await redis.sadd(`${USER_GROUPS_PREFIX}${ownerPubkey}`, groupId);
        } catch (redisError) {
            console.error('Redis write failed (non-blocking):', redisError);
        }

        console.log(`👥 Group created on-chain: ${groupId} "${name}" by ${ownerPubkey.slice(0, 8)}...`);

        return res.json({
            success: true,
            groupId,
            name,
            signature: txSignature,
        });
    } catch (error) {
        console.error('Create group error:', error);
        return res.status(500).json({ error: 'Failed to create group' });
    }
});

/**
 * POST /api/groups/:groupId/build-invite-transaction
 * Build unsigned transaction to invite a member to a group
 */
router.post('/:groupId/build-invite-transaction', async (req: Request, res: Response) => {
    try {
        const { groupId } = req.params;
        const { invitedUserPubkey, inviterPubkey, encryptedGroupKey } = req.body;

        if (!invitedUserPubkey || !inviterPubkey || !encryptedGroupKey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const groupIdBuffer = Buffer.from(groupId, 'hex');

        // Build unsigned transaction
        const { transaction, blockhash, lastValidBlockHeight } = await buildInviteMemberTransaction({
            groupId: groupIdBuffer,
            invitedUserPubkey: new PublicKey(invitedUserPubkey),
            inviterPubkey: new PublicKey(inviterPubkey),
            encryptedGroupKey: Buffer.from(encryptedGroupKey, 'base64'),
        });

        const serializedTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return res.json({
            success: true,
            transaction: serializedTx,
            blockhash,
            lastValidBlockHeight,
        });
    } catch (error) {
        console.error('Build invite transaction error:', error);
        return res.status(500).json({ error: 'Failed to build invite transaction' });
    }
});

/**
 * POST /api/groups/:groupId/build-leave-transaction
 * Build unsigned transaction to leave a group
 */
router.post('/:groupId/build-leave-transaction', async (req: Request, res: Response) => {
    try {
        const { groupId } = req.params;
        const { memberPubkey } = req.body;

        if (!memberPubkey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const groupIdBuffer = Buffer.from(groupId, 'hex');

        // Build unsigned transaction
        const { transaction, blockhash, lastValidBlockHeight } = await buildLeaveGroupTransaction({
            groupId: groupIdBuffer,
            memberPubkey: new PublicKey(memberPubkey),
        });

        const serializedTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return res.json({
            success: true,
            transaction: serializedTx,
            blockhash,
            lastValidBlockHeight,
        });
    } catch (error) {
        console.error('Build leave transaction error:', error);
        return res.status(500).json({ error: 'Failed to build leave transaction' });
    }
});

/**
 * POST /api/groups/invite
 * Invite a member to a group (supports both Solana and Redis-only flows)
 */
router.post('/invite', async (req: Request, res: Response) => {
    try {
        const { signedTransaction, groupId, memberPubkey, ownerPubkey, signature, timestamp } = req.body;

        if (!groupId || !memberPubkey || !ownerPubkey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify signature
        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Request must be signed' });
        }

        const expectedMessage = `group:invite:${groupId}:${memberPubkey}:${timestamp}`;
        const isValid = verifySignature(signature, timestamp, expectedMessage, ownerPubkey);

        if (!isValid) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        let txSignature: string | undefined;

        // If signedTransaction is provided, relay to Solana
        if (signedTransaction) {
            txSignature = await relaySignedTransaction(signedTransaction);
            console.log(`👥 Member invited on-chain to ${groupId}: ${memberPubkey.slice(0, 8)}... (tx: ${txSignature})`);
        }

        // Dual-write to Redis (cache/fallback) - non-blocking
        try {
            await redis.sadd(`${GROUP_MEMBERS_PREFIX}${groupId}`, memberPubkey);
            await redis.sadd(`${USER_GROUPS_PREFIX}${memberPubkey}`, groupId);
        } catch (redisError) {
            console.error('Redis write failed (non-blocking):', redisError);
        }

        return res.json({
            success: true,
            signature: txSignature
        });
    } catch (error) {
        console.error('Invite error:', error);
        return res.status(500).json({ error: 'Failed to invite member' });
    }
});

/**
 * POST /api/groups/leave
 * Leave a group (supports both Solana and Redis-only flows)
 */
router.post('/leave', async (req: Request, res: Response) => {
    try {
        const { signedTransaction, groupId, ownerPubkey: userPubkey, signature, timestamp } = req.body;

        if (!groupId || !userPubkey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify signature
        if (!signature || !timestamp) {
            return res.status(401).json({ error: 'Request must be signed' });
        }

        const expectedMessage = `group:leave:${groupId}:${timestamp}`;
        const isValid = verifySignature(signature, timestamp, expectedMessage, userPubkey);

        if (!isValid) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        let txSignature: string | undefined;

        // If signedTransaction is provided, relay to Solana
        if (signedTransaction) {
            txSignature = await relaySignedTransaction(signedTransaction);
            console.log(`👥 Member left on-chain from ${groupId}: ${userPubkey.slice(0, 8)}... (tx: ${txSignature})`);
        }

        // Dual-write to Redis (cache/fallback) - non-blocking
        try {
            await redis.srem(`${GROUP_MEMBERS_PREFIX}${groupId}`, userPubkey);
            await redis.srem(`${USER_GROUPS_PREFIX}${userPubkey}`, groupId);
        } catch (redisError) {
            console.error('Redis write failed (non-blocking):', redisError);
        }

        return res.json({
            success: true,
            signature: txSignature
        });
    } catch (error) {
        console.error('Leave error:', error);
        return res.status(500).json({ error: 'Failed to leave group' });
    }
});

/**
 * GET /api/groups/:groupId
 * Get group info and members (dual-read: Solana first, Redis fallback)
 */
router.get('/:groupId', async (req: Request, res: Response) => {
    try {
        const { groupId } = req.params;
        const groupIdBuffer = Buffer.from(groupId, 'hex');

        // Try Solana first
        const solanaGroup = await getGroupAccount(groupIdBuffer);
        if (solanaGroup) {
            // Fetch members from Solana
            const members = await getAllGroupMembers(groupIdBuffer);

            return res.json({
                groupId,
                name: solanaGroup.name,
                description: solanaGroup.description,
                owner: solanaGroup.owner,
                isPublic: solanaGroup.isPublic,
                memberCount: solanaGroup.memberCount,
                createdAt: solanaGroup.createdAt,
                members,
                source: 'solana',
            });
        }

        // Fallback to Redis
        const group = await redis.hgetall(`${GROUPS_PREFIX}${groupId}`) as Record<string, string>;
        if (!group || !group.name) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const members = await redis.smembers(`${GROUP_MEMBERS_PREFIX}${groupId}`) as string[];

        return res.json({
            groupId,
            name: group.name,
            owner: group.owner,
            createdAt: parseInt(group.createdAt),
            members,
            source: 'redis',
        });
    } catch (error) {
        console.error('Get group error:', error);
        return res.status(500).json({ error: 'Failed to get group' });
    }
});

/**
 * GET /api/groups/user/:pubkey
 * Get all groups for a user
 */
router.get('/user/:pubkey', async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.params;

        const groupIds = await redis.smembers(`${USER_GROUPS_PREFIX}${pubkey}`) as string[];

        const groups = await Promise.all(
            groupIds.map(async (groupId) => {
                const group = await redis.hgetall(`${GROUPS_PREFIX}${groupId}`) as Record<string, string>;
                const members = await redis.smembers(`${GROUP_MEMBERS_PREFIX}${groupId}`) as string[];
                return {
                    groupId,
                    name: group?.name || 'Unknown',
                    owner: group?.owner,
                    createdAt: parseInt(group?.createdAt || '0'),
                    members,
                };
            })
        );

        return res.json({ groups });
    } catch (error) {
        console.error('Get user groups error:', error);
        return res.status(500).json({ error: 'Failed to get groups' });
    }
});

/**
 * GET /api/groups/public/search
 * Search for public groups
 */
router.get('/public/search', async (req: Request, res: Response) => {
    try {
        const { q } = req.query;
        const query = q ? String(q) : undefined;

        const groups = await searchPublicGroups(query);

        return res.json({ groups });
    } catch (error) {
        console.error('Search groups error:', error);
        return res.status(500).json({ error: 'Failed to search groups' });
    }
});

/**
 * GET /api/groups/code/:code
 * Lookup a group by its public code
 */
router.get('/code/:code', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;

        const groupIdHex = await lookupGroupByCode(code);
        if (!groupIdHex) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const groupIdBuffer = Buffer.from(groupIdHex, 'hex');
        const group = await getGroupAccount(groupIdBuffer);

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        return res.json({
            groupId: groupIdHex,
            name: group.name,
            description: group.description,
            owner: group.owner,
            isPublic: group.isPublic,
            memberCount: group.memberCount,
            publicCode: group.publicCode,
        });
    } catch (error) {
        console.error('Lookup group by code error:', error);
        return res.status(500).json({ error: 'Failed to lookup group' });
    }
});

/**
 * POST /api/groups/join/:code
 * Build transaction to join a group via public code
 */
router.post('/join/:code', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;
        const { memberPubkey, encryptedGroupKey } = req.body;

        if (!memberPubkey || !encryptedGroupKey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Lookup group by code
        const groupIdHex = await lookupGroupByCode(code);
        if (!groupIdHex) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const groupId = Buffer.from(groupIdHex, 'hex');

        // Build join transaction
        const { transaction, blockhash, lastValidBlockHeight } = await buildJoinGroupTransaction({
            groupId,
            encryptedGroupKey: Buffer.from(encryptedGroupKey, 'base64'),
            memberPubkey: new PublicKey(memberPubkey),
        });

        const serializedTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return res.json({
            success: true,
            transaction: serializedTx,
            blockhash,
            lastValidBlockHeight,
            groupId: groupIdHex,
        });
    } catch (error) {
        console.error('Join group error:', error);
        return res.status(500).json({ error: 'Failed to join group' });
    }
});

/**
 * POST /api/groups/:groupId/set-code
 * Build transaction to set a public code for a group
 */
router.post('/:groupId/set-code', async (req: Request, res: Response) => {
    try {
        const { groupId } = req.params;
        const { publicCode, ownerPubkey } = req.body;

        if (!publicCode || !ownerPubkey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const groupIdBuffer = Buffer.from(groupId, 'hex');

        // Build set code transaction
        const { transaction, blockhash, lastValidBlockHeight } = await buildSetGroupCodeTransaction({
            groupId: groupIdBuffer,
            publicCode,
            ownerPubkey: new PublicKey(ownerPubkey),
        });

        const serializedTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return res.json({
            success: true,
            transaction: serializedTx,
            blockhash,
            lastValidBlockHeight,
        });
    } catch (error) {
        console.error('Set group code error:', error);
        return res.status(500).json({ error: 'Failed to set group code' });
    }
});

/**
 * GET /api/groups/:groupId/members
 * Get all members with their roles from on-chain
 */
router.get('/:groupId/members', async (req: Request, res: Response) => {
    try {
        const { groupId } = req.params;
        const groupIdBuffer = Buffer.from(groupId, 'hex');

        // Fetch all member public keys
        const memberPubkeys = await getAllGroupMembers(groupIdBuffer);

        return res.json({
            groupId,
            members: memberPubkeys,
            count: memberPubkeys.length,
        });
    } catch (error) {
        console.error('Get group members error:', error);
        return res.status(500).json({ error: 'Failed to get members' });
    }
});

export default router;
