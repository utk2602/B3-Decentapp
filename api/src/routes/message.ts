import { Router, Request, Response } from 'express';
import {
    Transaction,
    PublicKey,
    TransactionInstruction,
    SystemProgram,
} from '@solana/web3.js';
import {
    getFeePayer,
    connection,
    getFeePayerBalance,
} from '../services/solana.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { isBlocked, redis as redisClient } from '../services/redis.js';
import { uploadToArweave } from '../services/arweaveService.js';
import { spendingLimitMiddleware } from '../middleware/spendingLimits.js';

const router = Router();

// SPL Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Minimum balance required for fee payer
const MIN_FEE_PAYER_SOL = 0.05;

// Maximum memo size (Solana limit is ~800 bytes for memo)
const MAX_MEMO_SIZE = 750;

// ... imports
import { verifySignature } from '../middleware/auth.js';

interface SendMessageRequest {
    encryptedMessage: string;  // Base64 encoded encrypted message
    recipientPubkey: string;   // Recipient's Solana public key
    senderPubkey: string;      // Sender's public key (for rate limiting)
    signature: string;         // Ed25519 signature
    timestamp: number;         // Unix timestamp
}

/**
 * POST /api/message/send
 * Send an encrypted message via Solana memo transaction
 * The fee payer pays for the transaction
 */
router.post('/send', rateLimitMiddleware, spendingLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const {
            encryptedMessage,
            recipientPubkey,
            senderPubkey,
            signature,
            timestamp
        } = req.body as SendMessageRequest;

        // Validation
        if (!encryptedMessage) return res.status(400).json({ error: 'Missing encryptedMessage' });
        if (!recipientPubkey) return res.status(400).json({ error: 'Missing recipientPubkey' });
        if (!senderPubkey) return res.status(400).json({ error: 'Missing senderPubkey' });

        // Auth Verification
        if (!signature || !timestamp) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Request must be signed'
            });
        }

        // Verify signature: msg:{encryptedMessage}:{timestamp}
        const expectedMessage = `msg:${encryptedMessage}:${timestamp}`;
        const isValid = verifySignature(signature, timestamp, expectedMessage, senderPubkey);

        if (!isValid) {
            return res.status(403).json({
                error: 'Invalid signature',
                message: 'Signature verification failed'
            });
        }

        // Validate pubkeys
        let recipient: PublicKey;
        let sender: PublicKey;
        try {
            recipient = new PublicKey(recipientPubkey);
            sender = new PublicKey(senderPubkey);
        } catch {
            return res.status(400).json({
                error: 'Invalid public key',
                message: 'One or more public keys are invalid',
            });
        }

        // Check if sender is banned (content moderation)
        try {
            const bannedStr = await redisClient.get(`banned:${senderPubkey}`);
            if (bannedStr) {
                return res.status(403).json({
                    error: 'Account suspended',
                    message: 'Your account has been suspended due to content policy violations.',
                });
            }
        } catch (err) {
            console.warn('Ban check failed:', err);
        }

        // Check if recipient has blocked the sender
        try {
            const blocked = await isBlocked(recipientPubkey, senderPubkey);
            if (blocked) {
                return res.status(403).json({
                    error: 'User blocked',
                    message: 'This user has blocked you',
                });
            }
        } catch (blockError) {
            console.error('Block check failed - rejecting for security:', blockError);
            // Fail closed - reject message if block check fails
            return res.status(503).json({
                error: 'Service unavailable',
                message: 'Unable to verify block status. Please try again.',
            });
        }

        // Check memo size
        let memoContent = encryptedMessage;

        // Handling for large messages (images):
        // If message > MAX_MEMO_SIZE, upload to Arweave and send reference
        if (encryptedMessage.length > MAX_MEMO_SIZE) {
            console.log(`📦 Message too large (${encryptedMessage.length} bytes), uploading to Arweave...`);

            // Upload to Arweave via Irys
            const arweaveTxId = await uploadToArweave(encryptedMessage);

            // Create reference pointer
            memoContent = `ar:${arweaveTxId}`;

            console.log(`🌐 Stored on Arweave: ${memoContent}`);
        }

        // Check fee payer balance
        const feePayerBalance = await getFeePayerBalance();
        if (feePayerBalance < MIN_FEE_PAYER_SOL) {
            return res.status(503).json({
                error: 'Fee payer low balance',
                message: `Fee payer requires at least ${MIN_FEE_PAYER_SOL} SOL`,
            });
        }

        const feePayer = getFeePayer();

        console.log(`📨 Sending message from ${senderPubkey.slice(0, 8)}... to ${recipientPubkey.slice(0, 8)}...`);

        // Strategy: Use a tiny SOL transfer to the recipient to trigger their onLogs listener
        // The memo instruction stores the encrypted message
        // The memo data encodes: sender|message format so recipient knows who sent it
        const messageData = `${senderPubkey}|${memoContent}`;

        // 1. Transfer 1 lamport to recipient (triggers their WebSocket listener)
        const transferInstruction = SystemProgram.transfer({
            fromPubkey: feePayer.publicKey,
            toPubkey: recipient,
            lamports: 1, // Minimum amount just to trigger logs
        });

        // 2. Memo instruction (no account keys needed when used with other instructions)
        const memoInstruction = new TransactionInstruction({
            keys: [], // No accounts - memo data only
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(messageData, 'utf-8'),
        });

        // Build transaction with transfer + memo
        const transaction = new Transaction().add(transferInstruction, memoInstruction);
        transaction.feePayer = feePayer.publicKey;

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;

        // Sign with fee payer (no user signature needed for memo)
        transaction.sign(feePayer);

        // Send transaction
        const signatureStr = await connection.sendRawTransaction(
            transaction.serialize(),
            {
                skipPreflight: false,
                preflightCommitment: 'confirmed',
            }
        );

        // Wait for confirmation
        await connection.confirmTransaction(
            { signature: signatureStr, blockhash, lastValidBlockHeight },
            'confirmed'
        );

        console.log(`✅ Message sent: ${signatureStr}`);

        return res.json({
            success: true,
            signature: signatureStr,
            explorer: `https://explorer.solana.com/tx/${signatureStr}?cluster=devnet`,
        });

    } catch (error) {
        console.error('❌ Message send error:', error);
        return res.status(500).json({
            error: 'Send failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Note: /content/:id endpoint removed - Arweave content is fetched directly
// from https://arweave.net/<txId> by the client

/**
 * GET /api/message/inbox/:pubkey
 * Fetch recent messages for a user by checking their recent transactions
 * This is a polling alternative to WebSocket which may not work reliably
 */
router.get('/inbox/:pubkey', async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.params;
        const { since } = req.query; // Optional: unix timestamp to filter messages after

        let recipientPubkey: PublicKey;
        try {
            recipientPubkey = new PublicKey(pubkey);
        } catch {
            return res.status(400).json({
                error: 'Invalid public key',
                message: 'The provided public key is not valid',
            });
        }

        console.log(`📥 Fetching inbox for ${pubkey.slice(0, 8)}...`);

        // Get recent transaction signatures
        const signatures = await connection.getSignaturesForAddress(
            recipientPubkey,
            { limit: 20 } // Last 20 transactions
        );

        if (signatures.length === 0) {
            return res.json({ messages: [] });
        }

        const messages: Array<{
            signature: string;
            senderPubkey: string;
            encryptedMessage: string;
            timestamp: number;
        }> = [];

        // Filter by timestamp if provided
        const sinceTimestamp = since ? parseInt(since as string) : 0;

        for (const sig of signatures) {
            // Skip if before the 'since' timestamp
            if (sig.blockTime && sig.blockTime < sinceTimestamp) {
                continue;
            }

            try {
                const tx = await connection.getParsedTransaction(sig.signature, {
                    maxSupportedTransactionVersion: 0,
                });

                if (!tx) continue;

                // Look for memo instruction
                const memoInstruction = tx.transaction.message.instructions.find(
                    (ix: any) => ix.program === 'spl-memo'
                );

                if (!memoInstruction || !('parsed' in memoInstruction)) continue;

                const memoData = memoInstruction.parsed as string;

                // Parse memo format: senderPubkey|encryptedMessage
                const pipeIndex = memoData.indexOf('|');
                if (pipeIndex === -1) continue;

                const senderPubkey = memoData.slice(0, pipeIndex);
                const encryptedMessage = memoData.slice(pipeIndex + 1);

                // Validate sender pubkey format
                if (senderPubkey.length < 32 || senderPubkey.length > 44) continue;

                messages.push({
                    signature: sig.signature,
                    senderPubkey,
                    encryptedMessage,
                    timestamp: sig.blockTime || Math.floor(Date.now() / 1000),
                });
            } catch (err) {
                // Skip transactions that fail to parse
                continue;
            }
        }

        console.log(`📥 Found ${messages.length} messages for ${pubkey.slice(0, 8)}`);

        return res.json({ messages });

    } catch (error) {
        console.error('❌ Inbox fetch error:', error);
        return res.status(500).json({
            error: 'Fetch failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/message/group/:groupId/send
 * Send an encrypted message to a group
 */
router.post('/group/:groupId/send', rateLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const { groupId } = req.params;
        const {
            encryptedMessage,
            encryptedKeys,
            senderPubkey,
            signature,
            timestamp,
        } = req.body;

        // Verify signature - must match frontend format
        const messageToSign = `group-msg:${groupId}:${encryptedMessage}:${timestamp}`;
        if (!verifySignature(signature, timestamp, messageToSign, senderPubkey)) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        // Get group members from Redis
        const redis = await import('../services/redis.js');
        const members = await redis.getGroupMembers(groupId);

        if (!members || members.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Verify sender is a member
        if (!members.includes(senderPubkey)) {
            return res.status(403).json({ error: 'Not a group member' });
        }

        // Check if sender is banned (content moderation)
        try {
            const bannedStr = await redisClient.get(`banned:${senderPubkey}`);
            if (bannedStr) {
                return res.status(403).json({
                    error: 'Account suspended',
                    message: 'Your account has been suspended due to content policy violations.',
                });
            }
        } catch (err) {
            console.warn('Ban check failed:', err);
        }

        // Store message on Arweave
        const messageData = {
            groupId,
            senderPubkey,
            encryptedMessage,
            encryptedKeys,
            timestamp,
        };

        const arweaveTxId = await uploadToArweave(JSON.stringify(messageData));

        // Send notification transaction to each member
        const feePayerKeypair = getFeePayer();

        for (const memberPubkey of members) {
            if (memberPubkey === senderPubkey) continue; // Skip sender

            try {
                const transaction = new Transaction();

                // Add transfer to trigger listener
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: feePayerKeypair.publicKey,
                        toPubkey: new PublicKey(memberPubkey),
                        lamports: 1,
                    })
                );

                // Add memo with group message reference
                transaction.add(
                    new TransactionInstruction({
                        keys: [],
                        programId: MEMO_PROGRAM_ID,
                        data: Buffer.from(`group:${groupId}:${arweaveTxId}`),
                    })
                );

                // Get recent blockhash
                const { blockhash } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = feePayerKeypair.publicKey;

                // Sign and send
                transaction.sign(feePayerKeypair);
                const txSignature = await connection.sendRawTransaction(transaction.serialize());

                console.log(`📨 Group message notification sent to ${memberPubkey.slice(0, 8)}: ${txSignature}`);
            } catch (err) {
                console.error(`Failed to notify member ${memberPubkey}:`, err);
                // Continue to next member even if one fails
            }
        }

        return res.json({
            success: true,
            arweaveTxId,
            notifiedMembers: members.length - 1, // Exclude sender
        });

    } catch (error) {
        console.error('❌ Group message send error:', error);
        return res.status(500).json({
            error: 'Send failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
