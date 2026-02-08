import {
    Transaction,
    PublicKey,
    TransactionInstruction,
    SystemProgram,
} from '@solana/web3.js';
import { getFeePayer, connection } from './solana.js';
import { redis } from './redis.js';
import { uploadToArweave } from './arweaveService.js';

// SPL Memo Program ID
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// Maximum memo size before offloading to Arweave
const MAX_MEMO_SIZE = 750;

// How often the scheduler checks for expired switches (ms)
const SCHEDULER_INTERVAL_MS = 5000; // 5 seconds – low for 10-s test mode

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

interface DMSMessage {
    recipientPubkey: string;
    encryptedMessage: string;
}

/**
 * Deliver a single pre-encrypted DMS message to its recipient.
 * Mirrors the exact flow from POST /api/message/send:
 *   1-lamport transfer + SPL memo  →  fee payer signs  →  send & confirm
 */
async function deliverMessage(
    senderPubkey: string,
    msg: DMSMessage,
): Promise<string | null> {
    try {
        const feePayer = getFeePayer();
        const recipient = new PublicKey(msg.recipientPubkey);

        let memoContent = msg.encryptedMessage;

        // Offload to Arweave if too large
        if (memoContent.length > MAX_MEMO_SIZE) {
            console.log(`📦 DMS message too large (${memoContent.length}b), uploading to Arweave…`);
            const arweaveTxId = await uploadToArweave(memoContent);
            memoContent = `ar:${arweaveTxId}`;
        }

        // Format identical to normal message send: senderPubkey|content
        const messageData = `${senderPubkey}|${memoContent}`;

        // 1. Transfer 1 lamport → triggers recipient WebSocket listener
        const transferIx = SystemProgram.transfer({
            fromPubkey: feePayer.publicKey,
            toPubkey: recipient,
            lamports: 1,
        });

        // 2. SPL Memo instruction with the encrypted payload
        const memoIx = new TransactionInstruction({
            keys: [],
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(messageData, 'utf-8'),
        });

        const tx = new Transaction().add(transferIx, memoIx);
        tx.feePayer = feePayer.publicKey;

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.sign(feePayer);

        const sig = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });

        await connection.confirmTransaction(
            { signature: sig, blockhash, lastValidBlockHeight },
            'confirmed',
        );

        console.log(`✅ DMS message delivered → ${msg.recipientPubkey.slice(0, 8)}… tx=${sig}`);
        return sig;
    } catch (err) {
        console.error(`❌ DMS delivery failed for ${msg.recipientPubkey.slice(0, 8)}…:`, err);
        return null;
    }
}

/**
 * Main tick – runs every SCHEDULER_INTERVAL_MS.
 * 1. Scan all dms:config:* keys.
 * 2. For each, check if dms:lastseen:<pk> has expired.
 * 3. If expired & not yet triggered → deliver messages & flag.
 */
async function tick() {
    try {
        // Get all configured DMS pubkeys
        const configKeys = await redis.keys('dms:config:*');
        if (!configKeys || configKeys.length === 0) return;

        for (const key of configKeys) {
            const pubkey = key.replace('dms:config:', '');

            // Skip already-triggered switches
            const triggered = await redis.get(`dms:triggered:${pubkey}`);
            if (triggered !== null) continue;

            // Check config is still enabled
            const cfg = await redis.hgetall(`dms:config:${pubkey}`);
            if (!cfg || cfg.enabled !== 'true') continue;

            // Check if the "last seen" key still exists (TTL not expired)
            const lastSeen = await redis.get(`dms:lastseen:${pubkey}`);
            if (lastSeen !== null) continue; // User is still alive → skip

            // ──── TTL expired – Dead Man's Switch TRIGGERED ────
            console.log(`💀 DMS TRIGGERED for ${pubkey.slice(0, 8)}…`);

            // Load pre-encrypted messages
            const msgsRaw = await redis.get(`dms:messages:${pubkey}`);
            if (!msgsRaw) {
                console.warn(`⚠️  No messages stored for DMS ${pubkey.slice(0, 8)}… – skipping`);
                await redis.set(`dms:triggered:${pubkey}`, String(Date.now()));
                continue;
            }

            let messages: DMSMessage[];
            try {
                messages = JSON.parse(msgsRaw as string);
            } catch {
                console.error(`❌ Failed to parse DMS messages for ${pubkey.slice(0, 8)}…`);
                await redis.set(`dms:triggered:${pubkey}`, String(Date.now()));
                continue;
            }

            // Deliver each message sequentially (avoid fee-payer nonce collisions)
            let deliveredCount = 0;
            for (const msg of messages) {
                const sig = await deliverMessage(pubkey, msg);
                if (sig) deliveredCount++;
            }

            // Mark as triggered so we don't fire again
            await redis.set(`dms:triggered:${pubkey}`, String(Date.now()));

            console.log(`📬 DMS for ${pubkey.slice(0, 8)}… done: ${deliveredCount}/${messages.length} delivered`);
        }
    } catch (err) {
        console.error('❌ DMS scheduler tick error:', err);
    }
}

/**
 * Start the background scheduler.
 */
export function startDMSScheduler() {
    if (schedulerTimer) {
        console.warn('⚠️  DMS scheduler already running');
        return;
    }
    schedulerTimer = setInterval(tick, SCHEDULER_INTERVAL_MS);
    console.log(`🕐 DMS scheduler started (interval=${SCHEDULER_INTERVAL_MS}ms)`);
}

/**
 * Stop the background scheduler (for graceful shutdown / tests).
 */
export function stopDMSScheduler() {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
        console.log('🕐 DMS scheduler stopped');
    }
}
