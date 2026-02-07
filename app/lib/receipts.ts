import { getStoredKeypair } from './keychain';
import { signMessage, uint8ToBase58, uint8ToBase64 } from './crypto';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app';

export type ReceiptType = 'delivered' | 'read';

export interface Receipt {
    by: string;
    at: number;
}

export interface MessageReceipts {
    messageId: string;
    delivered: Receipt | null;
    read: Receipt | null;
}

/**
 * Send a delivery or read receipt for a message
 */
export async function sendReceipt(messageId: string, type: ReceiptType): Promise<boolean> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) {
            console.warn('No keypair found, cannot send receipt');
            return false;
        }

        const timestamp = Date.now();
        const senderPubkey = uint8ToBase58(keypair.publicKey);

        // Sign the receipt
        const messageToSign = `receipt:${messageId}:${type}:${timestamp}`;
        const signatureBytes = signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey);
        const signature = uint8ToBase64(signatureBytes);

        const response = await fetch(`${API_BASE_URL}/api/receipt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messageId,
                type,
                senderPubkey,
                signature,
                timestamp
            })
        });

        if (!response.ok) {
            console.warn('Receipt send failed:', await response.text());
            return false;
        }

        return true;
    } catch (error) {
        console.error('Failed to send receipt:', error);
        return false;
    }
}

/**
 * Get receipts for a message
 */
export async function getReceipts(messageId: string): Promise<MessageReceipts | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/receipt/${messageId}`);

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Failed to get receipts:', error);
        return null;
    }
}

/**
 * Send delivery receipt for a message (called when message is received)
 */
export async function markDelivered(messageId: string): Promise<boolean> {
    return sendReceipt(messageId, 'delivered');
}

/**
 * Send read receipt for a message (called when message is viewed)
 */
export async function markRead(messageId: string): Promise<boolean> {
    return sendReceipt(messageId, 'read');
}
