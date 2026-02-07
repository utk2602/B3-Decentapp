import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredKeypair } from './keychain';
import { signMessage, uint8ToBase58, uint8ToBase64 } from './crypto';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';
const CONTACTS_STORAGE_KEY = 'key_contacts';

export interface Contact {
    username: string;
    addedAt: number;
}

/**
 * Get locally stored contacts
 */
export async function getLocalContacts(): Promise<Contact[]> {
    try {
        const data = await AsyncStorage.getItem(CONTACTS_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

/**
 * Save contacts locally
 */
async function saveLocalContacts(contacts: Contact[]): Promise<void> {
    await AsyncStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
}

/**
 * Add a contact (locally + sync to server)
 */
export async function addContact(username: string): Promise<boolean> {
    try {
        // Add locally first
        const contacts = await getLocalContacts();
        if (contacts.some(c => c.username.toLowerCase() === username.toLowerCase())) {
            return true; // Already exists
        }

        contacts.push({ username: username.toLowerCase(), addedAt: Date.now() });
        await saveLocalContacts(contacts);

        // Sync to server
        const keypair = await getStoredKeypair();
        if (keypair) {
            const timestamp = Date.now();
            const ownerPubkey = uint8ToBase58(keypair.publicKey);
            const messageToSign = `contact:add:${username}:${timestamp}`;
            const signatureBytes = signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey);
            const signature = uint8ToBase64(signatureBytes);

            await fetch(`${API_URL}/contacts/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerPubkey,
                    contactUsername: username,
                    signature,
                    timestamp
                })
            });
        }

        return true;
    } catch (error) {
        console.error('Failed to add contact:', error);
        return false;
    }
}

/**
 * Remove a contact (locally + sync to server)
 */
export async function removeContact(username: string): Promise<boolean> {
    try {
        // Remove locally
        const contacts = await getLocalContacts();
        const filtered = contacts.filter(c => c.username.toLowerCase() !== username.toLowerCase());
        await saveLocalContacts(filtered);

        // Sync to server
        const keypair = await getStoredKeypair();
        if (keypair) {
            const timestamp = Date.now();
            const ownerPubkey = uint8ToBase58(keypair.publicKey);
            const messageToSign = `contact:remove:${username}:${timestamp}`;
            const signatureBytes = signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey);
            const signature = uint8ToBase64(signatureBytes);

            await fetch(`${API_URL}/contacts/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ownerPubkey,
                    contactUsername: username,
                    signature,
                    timestamp
                })
            });
        }

        return true;
    } catch (error) {
        console.error('Failed to remove contact:', error);
        return false;
    }
}

/**
 * Check if a username is in contacts
 */
export async function isContact(username: string): Promise<boolean> {
    const contacts = await getLocalContacts();
    return contacts.some(c => c.username.toLowerCase() === username.toLowerCase());
}

/**
 * Sync contacts from server
 */
export async function syncContactsFromServer(): Promise<void> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) return;

        const ownerPubkey = uint8ToBase58(keypair.publicKey);
        const response = await fetch(`${API_URL}/contacts/${ownerPubkey}`);

        if (response.ok) {
            const { contacts: serverContacts } = await response.json();
            const localContacts = await getLocalContacts();

            // Merge: keep local timestamps, add any missing from server
            const merged = [...localContacts];
            for (const username of serverContacts) {
                if (!merged.some(c => c.username === username)) {
                    merged.push({ username, addedAt: Date.now() });
                }
            }

            await saveLocalContacts(merged);
        }
    } catch (error) {
        console.error('Failed to sync contacts:', error);
    }
}
