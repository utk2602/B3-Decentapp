import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { base64ToUint8, decryptMessage, getEncryptionKeypair } from './crypto';
import { getStoredKeypair, getStoredUsername } from './keychain';
import { saveChat, saveMessage, generateMessageId, isSignatureProcessed, addProcessedSignature, type Message } from './storage';
import { markDelivered } from './receipts';
import * as Notifications from 'expo-notifications';

const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
let connection: Connection | null = null;

function getConnection(): Connection {
    if (!connection) {
        try {
            connection = new Connection(RPC_URL, 'confirmed');
        } catch (error) {
            console.error('Failed to initialize Solana connection:', error);
            throw error;
        }
    }
    return connection;
}

type MessageCallback = (message: Message) => void;

let subscriptionId: number | null = null;
let messageCallbacks: MessageCallback[] = [];

/**
 * Start listening for incoming messages via WebSocket
 */
export async function startMessageListener(): Promise<void> {
    // Prevent duplicate listeners
    if (subscriptionId !== null) {
        console.log('🔌 WebSocket listener already active, skipping');
        return;
    }

    const keypair = await getStoredKeypair();
    if (!keypair) {
        console.warn('No keypair found, cannot start listener');
        return;
    }

    const publicKey = new PublicKey(keypair.publicKey);

    console.log('🔌 Starting WebSocket listener for:', publicKey.toBase58().slice(0, 8) + '...');

    // Subscribe to account changes (transactions to our address)
    try {
        subscriptionId = getConnection().onLogs(
            publicKey,
            async (logs, ctx) => {
                const { signature } = logs;

                try {
                    // Fetch full transaction details
                    const tx = await getConnection().getParsedTransaction(signature, {
                        maxSupportedTransactionVersion: 0,
                    });

                    if (!tx) return;

                    // Check if already processed to prevent duplicates
                    const txSignature = tx.transaction.signatures[0];
                    if (await isSignatureProcessed(txSignature)) {
                        console.log('↩️ Message already processed, skipping:', txSignature.slice(0, 8));
                        return;
                    }

                    // Look for memo instruction
                    const memoData = extractMemoFromTransaction(tx);
                    if (!memoData) return;

                    // Try to decrypt the message
                    const decryptedMessage = await tryDecryptMessage(memoData, tx);
                    if (decryptedMessage) {
                        console.log('📩 New message received!');

                        // Mark as processed immediately to prevent duplicates
                        await addProcessedSignature(txSignature);

                        // Notify callbacks
                        messageCallbacks.forEach((cb) => cb(decryptedMessage));

                        // Show push notification
                        await showMessageNotification(decryptedMessage);
                    }
                } catch (error) {
                    console.error('Error processing transaction:', error);
                }
            },
            'confirmed'
        );
    } catch (error) {
        console.error('Failed to setup log listener:', error);
    }

    console.log('✅ WebSocket listener started, subscription ID:', subscriptionId);
}

/**
 * Stop the WebSocket listener
 */
export async function stopMessageListener(): Promise<void> {
    if (subscriptionId !== null) {
        await getConnection().removeOnLogsListener(subscriptionId);
        subscriptionId = null;
        console.log('🔌 WebSocket listener stopped');
    }
}

/**
 * Subscribe to new messages
 */
export function onNewMessage(callback: MessageCallback): () => void {
    messageCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
        messageCallbacks = messageCallbacks.filter((cb) => cb !== callback);
    };
}

/**
 * Extract memo data from a parsed transaction
 */
function extractMemoFromTransaction(tx: ParsedTransactionWithMeta): string | null {
    const memoInstruction = tx.transaction.message.instructions.find(
        (ix: any) => ix.program === 'spl-memo' || ix.programId?.toBase58() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
    );

    if (memoInstruction && 'parsed' in memoInstruction) {
        return memoInstruction.parsed as string;
    }

    return null;
}

/**
 * Try to decrypt a memo as an incoming message
 * Memo format: senderPubkey|encryptedMessage
 */
async function tryDecryptMessage(
    memoData: string,
    tx: ParsedTransactionWithMeta
): Promise<Message | null> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) return null;

        // Parse memo format: senderPubkey|encryptedMessage
        const pipeIndex = memoData.indexOf('|');
        if (pipeIndex === -1) {
            console.log('Invalid memo format - missing pipe separator');
            return null;
        }

        const senderPubkey = memoData.slice(0, pipeIndex);
        const encryptedMessage = memoData.slice(pipeIndex + 1);

        // Validate sender pubkey looks like a Solana address (44 chars base58)
        if (senderPubkey.length < 32 || senderPubkey.length > 44) {
            console.log('Invalid sender pubkey in memo');
            return null;
        }

        // Get our encryption keypair
        const encryptionKeypair = getEncryptionKeypair(keypair);

        // Lookup sender's encryption key from the API
        const { getUsernameByOwner } = await import('./api');
        const senderData = await getUsernameByOwner(senderPubkey);

        if (!senderData?.encryptionKey) {
            console.log('Sender encryption key not found, cannot decrypt');
            return null;
        }

        const senderEncryptionKey = base64ToUint8(senderData.encryptionKey);

        // Try to decrypt
        let decryptedContent = decryptMessage(
            encryptedMessage,
            senderEncryptionKey,
            encryptionKeypair.secretKey
        );

        // Parse message type and image metadata
        let type: 'text' | 'image' = 'text';
        let mimeType: string | undefined;
        let width: number | undefined;
        let height: number | undefined;

        if (decryptedContent.startsWith('IMG:')) {
            type = 'image';
            // New format: IMG:{mimeType}:{width}:{height}:{base64}
            const parts = decryptedContent.substring(4).split(':');

            if (parts.length === 4) {
                // New format with metadata
                mimeType = parts[0];
                width = parseInt(parts[1], 10);
                height = parseInt(parts[2], 10);
                decryptedContent = parts[3];
            } else {
                // Old format (backward compatibility): IMG:{base64}
                decryptedContent = decryptedContent.substring(4);
                mimeType = 'image/jpeg'; // Default
            }
        }

        // Create message object
        const chatId = senderData.username || senderPubkey.slice(0, 8);
        const message: Message = {
            id: generateMessageId(),
            chatId,
            type,
            content: decryptedContent,
            mimeType,
            width,
            height,
            timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
            isMine: false,
            status: 'confirmed',
            txSignature: tx.transaction.signatures[0],
        };

        // Save to local storage
        await saveMessage(message);

        // Mark as delivered
        if (message.txSignature) {
            markDelivered(message.txSignature).catch(err =>
                console.log('Failed to send delivery receipt:', err)
            );
        }

        // Also save/update chat (1-on-1 chat, not a group)
        await saveChat({
            username: chatId,
            publicKey: senderPubkey,
            isGroup: false,
            lastMessage: type === 'image' ? '📷 Photo' : decryptedContent,
            lastMessageTime: message.timestamp,
            unreadCount: 1,
        });

        console.log(`📩 Decrypted ${type} from @${chatId}:`, type === 'text' ? `"${decryptedContent.slice(0, 20)}..."` : '(Image Data)');
        return message;
    } catch (error) {
        // Decryption failed - message not for us or invalid format
        console.log('Decryption failed:', error);
        return null;
    }
}

/**
 * Show a push notification for a new message
 */
async function showMessageNotification(message: Message): Promise<void> {
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `@${message.chatId}`,
            body: message.content.slice(0, 100),
            data: { chatId: message.chatId },
            sound: 'default',
        },
        trigger: null, // Immediately
    });
}
