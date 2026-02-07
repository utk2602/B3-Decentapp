import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';

export type MessageType = 'text' | 'image';

export interface Message {
    id: string;
    chatId: string;
    type: MessageType;
    content: string; // Text content or base64 image data
    timestamp: number;
    isMine: boolean;
    txSignature?: string;
    arweaveTxId?: string; // For group messages stored on Arweave
    status: 'sending' | 'sent' | 'confirmed' | 'failed';
    // Image-specific fields
    mimeType?: string;
    width?: number;
    height?: number;
}

export interface Chat {
    username?: string;        // For 1-on-1 chats
    publicKey?: string;       // For 1-on-1 chats
    groupId?: string;         // For group chats
    groupName?: string;       // Group display name
    isGroup: boolean;         // Discriminator
    participants?: string[];  // Group member pubkeys
    lastMessage?: string;
    lastMessageTime?: number;
    unreadCount: number;
}

export interface GroupMessage extends Message {
    groupId: string;
    senderPublicKey: string;  // Who sent it
    senderUsername: string;
}

// Keys
const CHATS_KEY = 'key_chats';
const MESSAGES_PREFIX = 'key_messages_';
const GROUP_MESSAGES_PREFIX = 'key_group_messages_';
const GROUPS_KEY = 'key_groups';
const ENCRYPTION_KEY_CACHE_KEY = 'key_storage_encryption';

// Cached encryption key (derived from signing keypair)
let encryptionKey: Uint8Array | null = null;

/**
 * Initialize storage encryption with the user's signing keypair
 * Must be called after authentication
 */
export function initStorageEncryption(signingSecretKey: Uint8Array): void {
    // Derive a 32-byte symmetric key from the signing key
    // Using first 32 bytes of the secret key as the seed for secretbox
    encryptionKey = signingSecretKey.slice(0, 32);
}

/**
 * Clear encryption key (for logout/burn)
 */
export function clearStorageEncryption(): void {
    encryptionKey = null;
}

/**
 * Encrypt data for storage
 */
function encryptForStorage(data: string): string {
    if (!encryptionKey) {
        // Fallback to unencrypted if not initialized (for backwards compatibility)
        return data;
    }

    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageBytes = new TextEncoder().encode(data);
    const encrypted = nacl.secretbox(messageBytes, nonce, encryptionKey);

    // Combine nonce + encrypted
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);

    // Prefix with 'enc:' to identify encrypted data
    return 'enc:' + uint8ToBase64(combined);
}

/**
 * Decrypt data from storage
 */
function decryptFromStorage(data: string): string {
    if (!data.startsWith('enc:')) {
        // Not encrypted, return as-is (backwards compatibility)
        return data;
    }

    if (!encryptionKey) {
        // CRITICAL: If encryption key not initialized, log warning and return empty data
        // This prevents crashes during app initialization when encrypted data exists
        // but user hasn't authenticated yet
        console.warn('Storage encryption not initialized - cannot decrypt data. Returning empty result.');
        return '[]'; // Return empty array JSON to prevent crashes
    }

    try {
        const combined = base64ToUint8(data.slice(4)); // Remove 'enc:' prefix
        const nonce = combined.slice(0, nacl.secretbox.nonceLength);
        const encrypted = combined.slice(nacl.secretbox.nonceLength);

        const decrypted = nacl.secretbox.open(encrypted, nonce, encryptionKey);
        if (!decrypted) {
            console.error('Failed to decrypt storage data - data may be corrupted');
            return '[]'; // Return empty array to prevent crashes
        }

        return new TextDecoder().decode(decrypted);
    } catch (error) {
        // Catch any decryption errors (corrupted data, wrong key, etc.)
        console.error('Storage decryption error:', error);
        return '[]'; // Return empty array to prevent crashes
    }
}

// Base64 helpers (inline to avoid circular dependency)
function uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Get all chats
 * Applies data migrations and fixes for backward compatibility
 */
export async function getChats(): Promise<Chat[]> {
    try {
        const data = await AsyncStorage.getItem(CHATS_KEY);
        if (!data) return [];
        const decrypted = decryptFromStorage(data);
        const chats = JSON.parse(decrypted) as Chat[];

        // Migrate old chats that don't have isGroup field (backward compatibility)
        let needsSave = false;
        const migratedChats = chats.map(chat => {
            if (chat.isGroup === undefined) {
                needsSave = true;
                return { ...chat, isGroup: false }; // Default to 1-on-1 chat
            }
            return chat;
        });

        // Save migrated data back if needed
        if (needsSave) {
            console.log('🔄 Migrating chats: adding isGroup field to old chats');
            await AsyncStorage.setItem(CHATS_KEY, encryptForStorage(JSON.stringify(migratedChats)));
        }

        return migratedChats;
    } catch (error) {
        console.error('Failed to get chats:', error);
        return [];
    }
}

/**
 * Save a new chat or update existing
 * Chats are always sorted with newest message first
 */
export async function saveChat(chat: Chat): Promise<void> {
    const chats = await getChats();

    // Find existing chat (1-on-1 by username or group by groupId)
    const existingIndex = chats.findIndex((c) =>
        chat.isGroup
            ? (c.isGroup && c.groupId === chat.groupId)
            : (!c.isGroup && c.username === chat.username)
    );

    if (existingIndex >= 0) {
        // Merge with existing chat, properly incrementing unread count
        const existing = chats[existingIndex];
        const updatedChat = {
            ...existing,
            ...chat,
            // Increment unread count when receiving new messages (unreadCount > 0)
            unreadCount: chat.unreadCount > 0 ? existing.unreadCount + chat.unreadCount : chat.unreadCount,
        };

        // Remove from old position and add to top (newest first)
        chats.splice(existingIndex, 1);
        chats.unshift(updatedChat);
    } else {
        // New chat - add to top
        chats.unshift(chat);
    }

    await AsyncStorage.setItem(CHATS_KEY, encryptForStorage(JSON.stringify(chats)));
}

/**
 * Get messages for a specific chat
 */
export async function getMessages(chatId: string): Promise<Message[]> {
    try {
        const data = await AsyncStorage.getItem(`${MESSAGES_PREFIX}${chatId}`);
        if (!data) return [];
        const decrypted = decryptFromStorage(data);
        return JSON.parse(decrypted);
    } catch {
        return [];
    }
}

/**
 * Save a message
 */
export async function saveMessage(message: Message): Promise<void> {
    const messages = await getMessages(message.chatId);
    messages.push(message);
    await AsyncStorage.setItem(
        `${MESSAGES_PREFIX}${message.chatId}`,
        encryptForStorage(JSON.stringify(messages))
    );

    // Update chat's last message
    const chats = await getChats();
    const chatIndex = chats.findIndex((c) => c.username === message.chatId);
    if (chatIndex >= 0) {
        // For images, show a placeholder in last message preview
        chats[chatIndex].lastMessage = message.type === 'image' ? '📷 Photo' : message.content;
        chats[chatIndex].lastMessageTime = message.timestamp;
        await AsyncStorage.setItem(CHATS_KEY, encryptForStorage(JSON.stringify(chats)));
    }
}

/**
 * Update a message's status
 */
export async function updateMessageStatus(
    chatId: string,
    messageId: string,
    status: Message['status'],
    txSignature?: string
): Promise<void> {
    const messages = await getMessages(chatId);
    const msgIndex = messages.findIndex((m) => m.id === messageId);

    if (msgIndex >= 0) {
        messages[msgIndex].status = status;
        if (txSignature) {
            messages[msgIndex].txSignature = txSignature;
        }
        await AsyncStorage.setItem(
            `${MESSAGES_PREFIX}${chatId}`,
            encryptForStorage(JSON.stringify(messages))
        );
    }
}

/**
 * Delete a message
 */
export async function deleteMessage(chatId: string, messageId: string): Promise<void> {
    const messages = await getMessages(chatId);
    const filtered = messages.filter((m) => m.id !== messageId);
    await AsyncStorage.setItem(`${MESSAGES_PREFIX}${chatId}`, encryptForStorage(JSON.stringify(filtered)));

    // Update chat's last message if the deleted message was the latest
    if (messages.length > 0 && filtered.length > 0) {
        const lastMsg = filtered[filtered.length - 1];
        const chats = await getChats();
        const chatIndex = chats.findIndex((c) => c.username === chatId);
        if (chatIndex >= 0) {
            chats[chatIndex].lastMessage = lastMsg.type === 'image' ? '📷 Photo' : lastMsg.content;
            chats[chatIndex].lastMessageTime = lastMsg.timestamp;
            await AsyncStorage.setItem(CHATS_KEY, encryptForStorage(JSON.stringify(chats)));
        }
    }
}

/**
 * Clear all data (for "burn" functionality)
 */
export async function clearAllData(): Promise<void> {
    await AsyncStorage.clear();
}

/**
 * Delete an entire chat and its messages
 */
export async function deleteChat(username: string): Promise<void> {
    const chats = await getChats();
    const updatedChats = chats.filter((c) => c.username !== username);
    await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(updatedChats));
    await AsyncStorage.removeItem(`${MESSAGES_PREFIX}${username}`);
}

/**
 * Clear unread count for a specific chat
 */
export async function clearChatUnreadCount(username: string): Promise<void> {
    const chats = await getChats();
    const chatIndex = chats.findIndex((c) => c.username === username);
    if (chatIndex >= 0) {
        chats[chatIndex].unreadCount = 0;
        await AsyncStorage.setItem(CHATS_KEY, encryptForStorage(JSON.stringify(chats)));
    }
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Key for processed message signatures
const PROCESSED_SIGS_KEY = 'key_processed_signatures';

// Store signatures with timestamps for time-based expiration
interface ProcessedSignature {
    sig: string;
    ts: number; // timestamp when processed
}

// Keep signatures for 7 days (prevents cache from growing infinitely)
const SIGNATURE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Get all processed message signatures (with cleanup)
 */
export async function getProcessedSignatures(): Promise<Set<string>> {
    try {
        const data = await AsyncStorage.getItem(PROCESSED_SIGS_KEY);
        if (!data) return new Set();

        const parsed = JSON.parse(data);
        const now = Date.now();

        // Handle backward compatibility with old format (array of strings)
        let signatures: ProcessedSignature[];
        let needsMigration = false;

        if (Array.isArray(parsed) && parsed.length > 0) {
            if (typeof parsed[0] === 'string') {
                // Old format: array of signature strings - convert to new format
                console.log('🔄 Migrating signature cache to new format with timestamps');
                signatures = parsed.map(sig => ({ sig, ts: now }));
                needsMigration = true;
            } else {
                // New format: array of {sig, ts} objects
                signatures = parsed as ProcessedSignature[];
            }
        } else {
            signatures = [];
        }

        // Filter out expired signatures (older than 7 days)
        const valid = signatures.filter(item => (now - item.ts) < SIGNATURE_RETENTION_MS);

        // If we cleaned up any old entries or migrated format, save the updated list
        if (valid.length !== signatures.length || needsMigration) {
            await AsyncStorage.setItem(PROCESSED_SIGS_KEY, JSON.stringify(valid));
            if (valid.length !== signatures.length) {
                console.log(`🧹 Cleaned up ${signatures.length - valid.length} expired signatures`);
            }
        }

        return new Set(valid.map(item => item.sig));
    } catch (error) {
        console.error('Failed to get processed signatures:', error);
        return new Set();
    }
}

/**
 * Add a signature to processed list with timestamp
 */
export async function addProcessedSignature(signature: string): Promise<void> {
    try {
        const data = await AsyncStorage.getItem(PROCESSED_SIGS_KEY);
        const existing: ProcessedSignature[] = data ? JSON.parse(data) : [];
        const now = Date.now();

        // Don't add duplicates
        if (existing.some(item => item.sig === signature)) {
            return;
        }

        // Add new signature with current timestamp
        existing.push({ sig: signature, ts: now });

        // Filter out expired entries (older than 7 days)
        const valid = existing.filter(item => (now - item.ts) < SIGNATURE_RETENTION_MS);

        // Sort by timestamp (newest first) and keep reasonable number
        // Even with time-based expiry, cap at 5000 to prevent unlimited growth
        const sorted = valid.sort((a, b) => b.ts - a.ts).slice(0, 5000);

        await AsyncStorage.setItem(PROCESSED_SIGS_KEY, JSON.stringify(sorted));

        if (sorted.length < valid.length) {
            console.log(`🧹 Trimmed signature cache from ${valid.length} to ${sorted.length}`);
        }
    } catch (error) {
        console.error('Failed to add processed signature:', error);
    }
}

/**
 * Check if signature was already processed
 */
export async function isSignatureProcessed(signature: string): Promise<boolean> {
    const sigs = await getProcessedSignatures();
    return sigs.has(signature);
}

/**
 * Get group messages
 */
export async function getGroupMessages(groupId: string): Promise<GroupMessage[]> {
    try {
        const data = await AsyncStorage.getItem(`${GROUP_MESSAGES_PREFIX}${groupId}`);
        if (!data) return [];
        const decrypted = decryptFromStorage(data);
        return JSON.parse(decrypted);
    } catch {
        return [];
    }
}

/**
 * Save a group message
 */
export async function saveGroupMessage(message: GroupMessage): Promise<void> {
    const messages = await getGroupMessages(message.groupId);
    messages.push(message);
    await AsyncStorage.setItem(
        `${GROUP_MESSAGES_PREFIX}${message.groupId}`,
        encryptForStorage(JSON.stringify(messages))
    );

    // Update group chat's last message
    const chats = await getChats();
    const chatIndex = chats.findIndex((c) => c.isGroup && c.groupId === message.groupId);
    if (chatIndex >= 0) {
        chats[chatIndex].lastMessage = message.type === 'image' ? '📷 Photo' : message.content;
        chats[chatIndex].lastMessageTime = message.timestamp;
        await AsyncStorage.setItem(CHATS_KEY, encryptForStorage(JSON.stringify(chats)));
    }
}

/**
 * Clear unread count for a group chat
 */
export async function clearGroupUnreadCount(groupId: string): Promise<void> {
    const chats = await getChats();
    const chatIndex = chats.findIndex((c) => c.isGroup && c.groupId === groupId);
    if (chatIndex >= 0) {
        chats[chatIndex].unreadCount = 0;
        await AsyncStorage.setItem(CHATS_KEY, encryptForStorage(JSON.stringify(chats)));
    }
}
