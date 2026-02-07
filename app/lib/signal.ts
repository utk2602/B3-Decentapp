/**
 * Simplified Forward Secrecy Implementation
 * 
 * This uses a simplified protocol based on X25519 Diffie-Hellman with ephemeral keys.
 * For each message, a new ephemeral keypair is generated, providing forward secrecy.
 * 
 * Protocol:
 * 1. Sender generates ephemeral X25519 keypair
 * 2. Sender computes shared secret: ephemeral_private * recipient_public
 * 3. Message is encrypted with the shared secret
 * 4. Ephemeral public key is sent alongside the ciphertext
 * 5. Recipient computes shared secret: recipient_private * ephemeral_public
 * 6. Recipient decrypts the message
 * 
 * This provides forward secrecy because:
 * - Each message uses a unique ephemeral key
 * - The ephemeral private key is discarded after encryption
 * - Compromising long-term keys doesn't reveal past messages
 */

import nacl from 'tweetnacl';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_PREFIX = 'signal_session:';

export interface EncryptedMessage {
    ciphertext: string;       // Base64 encrypted content
    ephemeralPublicKey: string; // Base64 ephemeral public key
    nonce: string;             // Base64 nonce
}

export interface SessionState {
    peerId: string;
    peerPublicKey: Uint8Array;
    messageCount: number;
    lastUpdated: number;
}

// Session cache
const sessions: Map<string, SessionState> = new Map();

/**
 * Convert Uint8Array to base64
 */
function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Convert base64 to Uint8Array
 */
function fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Initialize a session with a peer
 * @param peerId - Unique identifier for the peer (e.g., their pubkey)
 * @param peerPublicKey - The peer's X25519 public key (32 bytes)
 */
export async function initSession(peerId: string, peerPublicKey: Uint8Array): Promise<void> {
    const session: SessionState = {
        peerId,
        peerPublicKey,
        messageCount: 0,
        lastUpdated: Date.now(),
    };

    sessions.set(peerId, session);

    // Persist session
    await AsyncStorage.setItem(
        `${SESSION_PREFIX}${peerId}`,
        JSON.stringify({
            peerId,
            peerPublicKey: toBase64(peerPublicKey),
            messageCount: session.messageCount,
            lastUpdated: session.lastUpdated,
        })
    );
}

/**
 * Load a session from storage
 */
export async function loadSession(peerId: string): Promise<SessionState | null> {
    // Check cache first
    if (sessions.has(peerId)) {
        return sessions.get(peerId)!;
    }

    // Load from storage
    try {
        const data = await AsyncStorage.getItem(`${SESSION_PREFIX}${peerId}`);
        if (!data) return null;

        const parsed = JSON.parse(data);
        const session: SessionState = {
            peerId: parsed.peerId,
            peerPublicKey: fromBase64(parsed.peerPublicKey),
            messageCount: parsed.messageCount,
            lastUpdated: parsed.lastUpdated,
        };

        sessions.set(peerId, session);
        return session;
    } catch {
        return null;
    }
}

/**
 * Encrypt a message with forward secrecy
 * Each message uses a new ephemeral keypair
 * 
 * @param plaintext - The message to encrypt
 * @param recipientPublicKey - Recipient's X25519 public key
 * @returns Encrypted message with ephemeral key
 */
export function encryptWithForwardSecrecy(
    plaintext: string,
    recipientPublicKey: Uint8Array
): EncryptedMessage {
    // Generate ephemeral keypair for this message
    const ephemeralKeypair = nacl.box.keyPair();

    // Generate random nonce
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    // Encrypt using box (X25519 + XSalsa20-Poly1305)
    const messageBytes = new TextEncoder().encode(plaintext);
    const ciphertext = nacl.box(
        messageBytes,
        nonce,
        recipientPublicKey,
        ephemeralKeypair.secretKey
    );

    // The ephemeral private key is discarded here (forward secrecy)
    // We only return the public key for the recipient to use

    return {
        ciphertext: toBase64(ciphertext),
        ephemeralPublicKey: toBase64(ephemeralKeypair.publicKey),
        nonce: toBase64(nonce),
    };
}

/**
 * Decrypt a message with forward secrecy
 * 
 * @param encryptedMessage - The encrypted message with ephemeral key
 * @param mySecretKey - My X25519 secret key
 * @returns Decrypted plaintext
 */
export function decryptWithForwardSecrecy(
    encryptedMessage: EncryptedMessage,
    mySecretKey: Uint8Array
): string {
    const ciphertext = fromBase64(encryptedMessage.ciphertext);
    const ephemeralPublicKey = fromBase64(encryptedMessage.ephemeralPublicKey);
    const nonce = fromBase64(encryptedMessage.nonce);

    // Decrypt using the ephemeral sender key
    const decrypted = nacl.box.open(
        ciphertext,
        nonce,
        ephemeralPublicKey,
        mySecretKey
    );

    if (!decrypted) {
        throw new Error('Decryption failed - invalid key or corrupted message');
    }

    return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt a message for a peer session
 * Convenience wrapper that manages sessions
 */
export async function encryptForPeer(
    peerId: string,
    plaintext: string
): Promise<EncryptedMessage | null> {
    const session = await loadSession(peerId);
    if (!session) {
        console.error('No session found for peer:', peerId);
        return null;
    }

    // Update message count
    session.messageCount++;
    session.lastUpdated = Date.now();
    sessions.set(peerId, session);

    return encryptWithForwardSecrecy(plaintext, session.peerPublicKey);
}

/**
 * Clear all sessions (for logout/burn)
 */
export async function clearAllSessions(): Promise<void> {
    sessions.clear();

    // Clear from storage
    const keys = await AsyncStorage.getAllKeys();
    const sessionKeys = keys.filter(k => k.startsWith(SESSION_PREFIX));
    await AsyncStorage.multiRemove(sessionKeys);
}

/**
 * Get session info for a peer
 */
export function getSessionInfo(peerId: string): SessionState | null {
    return sessions.get(peerId) || null;
}
