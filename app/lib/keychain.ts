import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { generateKeypair, uint8ToBase64, base64ToUint8, type KeyPair } from './crypto';

const SERVICE_NAME = 'com.keyapp.identity';
const USERNAME_SERVICE = 'com.keyapp.username';

// Database name for IndexedDB
const DB_NAME = 'keyapp_secure';
const STORE_NAME = 'encrypted_keys';
const DB_VERSION = 1;

// Cached encryption key derived from user password (or device fingerprint)
let webEncryptionKey: CryptoKey | null = null;

/**
 * Initialize the web encryption key from a password
 * Should be called with a user-provided password or device fingerprint
 */
export async function initWebEncryption(password: string): Promise<void> {
    if (typeof window === 'undefined' || !window.crypto?.subtle) return;

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    webEncryptionKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('keyapp-salt-v1'),
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Open IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

/**
 * Encrypt data using AES-GCM
 */
async function encryptData(data: string): Promise<ArrayBuffer> {
    if (!webEncryptionKey) {
        throw new Error('Web encryption not initialized');
    }

    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        webEncryptionKey,
        encoder.encode(data)
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return combined.buffer;
}

/**
 * Decrypt data using AES-GCM
 */
async function decryptData(data: ArrayBuffer): Promise<string> {
    if (!webEncryptionKey) {
        throw new Error('Web encryption not initialized');
    }

    const combined = new Uint8Array(data);
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        webEncryptionKey,
        encrypted
    );

    return new TextDecoder().decode(decrypted);
}

// Simple localStorage wrapper for web (more reliable than IndexedDB)
// Security warning is shown in UI to use mobile app for sensitive data
const webStorage = {
    async getItemAsync(key: string): Promise<string | null> {
        if (typeof window === 'undefined') return null;
        try {
            return window.localStorage?.getItem(key) || null;
        } catch (e) {
            console.warn('localStorage.getItem failed:', e);
            return null;
        }
    },

    async setItemAsync(key: string, value: string): Promise<void> {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage?.setItem(key, value);
        } catch (e) {
            console.warn('localStorage.setItem failed:', e);
        }
    },

    async deleteItemAsync(key: string): Promise<void> {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage?.removeItem(key);
        } catch (e) {
            console.warn('localStorage.removeItem failed:', e);
        }
    },
};

/**
 * Store a keypair securely in the device keychain with iCloud sync
 * @param keypair - The keypair to store
 * @param ephemeral - When true, store locally only (no iCloud sync). Default: false
 */
export async function storeKeypair(keypair: KeyPair, ephemeral: boolean = false): Promise<void> {
    if (Platform.OS === 'web') {
        // Web: keep localStorage for now (security warning shown in UI)
        await webStorage.setItemAsync('key_private_key', uint8ToBase64(keypair.secretKey));
        await webStorage.setItemAsync('key_public_key', uint8ToBase64(keypair.publicKey));
    } else {
        // iOS/Android: use react-native-keychain with iCloud sync (unless ephemeral)
        const synchronizable = !ephemeral;
        try {
            await Keychain.setGenericPassword(
                'keypair',
                JSON.stringify({
                    secretKey: uint8ToBase64(keypair.secretKey),
                    publicKey: uint8ToBase64(keypair.publicKey),
                }),
                {
                    service: SERVICE_NAME,
                    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
                    // Enable iCloud Keychain sync on iOS (unless ephemeral mode)
                    synchronizable,
                }
            );
        } catch (error) {
            console.warn('Keychain sync failed, falling back to local keychain:', error);
            // Fallback to local keychain (no cloud sync)
            await Keychain.setGenericPassword(
                'keypair',
                JSON.stringify({
                    secretKey: uint8ToBase64(keypair.secretKey),
                    publicKey: uint8ToBase64(keypair.publicKey),
                }),
                {
                    service: SERVICE_NAME,
                    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
                    synchronizable: false,
                }
            );
        }
    }
}

/**
 * Retrieve the stored keypair from device keychain (synced via iCloud)
 */
export async function getStoredKeypair(): Promise<KeyPair | null> {
    try {
        if (Platform.OS === 'web') {
            const secretKeyBase64 = await webStorage.getItemAsync('key_private_key');
            const publicKeyBase64 = await webStorage.getItemAsync('key_public_key');

            if (!secretKeyBase64 || !publicKeyBase64) {
                return null;
            }

            return {
                secretKey: base64ToUint8(secretKeyBase64),
                publicKey: base64ToUint8(publicKeyBase64),
            };
        }

        // Native: use react-native-keychain
        const credentials = await Keychain.getGenericPassword({ service: SERVICE_NAME });

        if (!credentials) {
            return null;
        }

        const parsed = JSON.parse(credentials.password);
        return {
            secretKey: base64ToUint8(parsed.secretKey),
            publicKey: base64ToUint8(parsed.publicKey),
        };
    } catch (error) {
        console.warn('Keychain access failed:', error);
        return null;
    }
}

/**
 * Check if user has an identity (keypair) stored
 */
export async function hasStoredIdentity(): Promise<boolean> {
    const keypair = await getStoredKeypair();
    return keypair !== null;
}

/**
 * Create a new identity (generates and stores a keypair)
 */
export async function createIdentity(): Promise<KeyPair> {
    const keypair = generateKeypair();
    await storeKeypair(keypair);
    return keypair;
}

/**
 * Delete the stored identity (for "burn" functionality)
 * This also removes from iCloud Keychain on iOS
 */
export async function deleteIdentity(): Promise<void> {
    if (Platform.OS === 'web') {
        await webStorage.deleteItemAsync('key_private_key');
        await webStorage.deleteItemAsync('key_public_key');
        await webStorage.deleteItemAsync('key_username');
    } else {
        // This removes from iCloud Keychain too (synchronizable: true)
        await Keychain.resetGenericPassword({ service: SERVICE_NAME });
        await Keychain.resetGenericPassword({ service: USERNAME_SERVICE });
    }
}

/**
 * Store the registered username with iCloud sync
 * @param username - The username to store
 * @param ephemeral - When true, store locally only (no iCloud sync). Default: false
 */
export async function storeUsername(username: string, ephemeral: boolean = false): Promise<void> {
    if (Platform.OS === 'web') {
        await webStorage.setItemAsync('key_username', username);
    } else {
        const synchronizable = !ephemeral;
        try {
            await Keychain.setGenericPassword(
                'username',
                username,
                {
                    service: USERNAME_SERVICE,
                    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
                    synchronizable,
                }
            );
        } catch (error) {
            console.warn('Keychain username sync failed, falling back to local:', error);
            await Keychain.setGenericPassword(
                'username',
                username,
                {
                    service: USERNAME_SERVICE,
                    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
                    synchronizable: false,
                }
            );
        }
    }
}

/**
 * Get the stored username (synced via iCloud)
 */
export async function getStoredUsername(): Promise<string | null> {
    try {
        if (Platform.OS === 'web') {
            return await webStorage.getItemAsync('key_username');
        }

        const credentials = await Keychain.getGenericPassword({ service: USERNAME_SERVICE });
        return credentials ? credentials.password : null;
    } catch (error) {
        console.warn('Username fetch failed:', error);
        return null;
    }
}

/**
 * Toggle identity sync mode between iCloud and local-only.
 * Re-stores the existing keypair and username with the new synchronizable setting.
 * 
 * @param ephemeral - When true, identity is local-only (deleted with app).
 *                    When false, identity syncs to iCloud Keychain.
 * @returns true if successful, false if failed
 */
export async function setIdentitySyncMode(ephemeral: boolean): Promise<boolean> {
    if (Platform.OS === 'web') {
        // Web doesn't have iCloud sync, always local
        console.log('🔒 Web platform: identity is always local');
        return true;
    }

    try {
        // 1. Get existing keypair and username
        const keypair = await getStoredKeypair();
        const username = await getStoredUsername();

        if (!keypair) {
            console.error('Cannot change sync mode: no keypair found');
            return false;
        }

        console.log(`🔄 Changing identity sync mode to: ${ephemeral ? 'LOCAL ONLY' : 'iCloud'}`);

        // 2. Re-store keypair with new sync setting
        // This effectively updates the synchronizable flag
        await storeKeypair(keypair, ephemeral);

        // 3. Re-store username if exists
        if (username) {
            await storeUsername(username, ephemeral);
        }

        console.log(`✅ Identity sync mode changed to: ${ephemeral ? 'LOCAL ONLY (ephemeral)' : 'iCloud sync'}`);
        return true;
    } catch (error) {
        console.error('Failed to change identity sync mode:', error);
        return false;
    }
}
