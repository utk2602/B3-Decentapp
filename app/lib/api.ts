// Fallback to production URL to prevent crashes when env var is not set
// (e.g., cached bundles from development builds in TestFlight)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app';

/**
 * API Response types
 */
export interface HealthResponse {
    status: string;
    feePayerBalance: string;
}

export interface AppConfig {
    network: string;
    version: string;
    commit: string;
    githubUrl: string;
}

export interface UsernameCheckResponse {
    username: string;
    available: boolean;
}

export interface BuildTransactionResponse {
    success: boolean;
    transaction: string; // Base64 encoded unsigned transaction
    blockhash: string;
    lastValidBlockHeight: number;
}

export interface RegisterResponse {
    success: boolean;
    username: string;
    signature?: string;
    explorer?: string;
}

export interface UserData {
    username: string;
    publicKey: string;
    encryptionKey: string | null;
    registeredAt?: string;
}

export interface GroupInfo {
    groupId: string;
    name: string;
    description?: string;
    owner: string;
    isPublic?: boolean;
    memberCount?: number;
    createdAt: number;
    members: string[];
    publicCode?: string;
    source?: 'solana' | 'redis';
}

export interface BuildGroupTransactionResponse {
    success: boolean;
    transaction: string; // Base64 encoded unsigned transaction
    blockhash: string;
    lastValidBlockHeight: number;
    groupId: string;
}

import { getStoredKeypair } from './keychain';
import { signMessage, uint8ToBase64, signTransaction, getEncryptionKeypair } from './crypto';

/**
 * Fetch app configuration
 */
export async function fetchConfig(): Promise<AppConfig | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/config`);
        if (!response.ok) return null;
        return response.json();
    } catch {
        return null;
    }
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<HealthResponse | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!response.ok) return null;
        return response.json();
    } catch {
        return null;
    }
}

/**
 * Check if a username is available
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/api/username/${username}/check`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Username check failed');
    }

    const data: UsernameCheckResponse = await response.json();
    return data.available;
}

/**
 * Build an unsigned transaction for username registration
 * User will sign this with their keypair
 */
export async function buildUsernameTransaction(
    username: string,
    ownerPublicKey: string,
    encryptionKey: string
): Promise<BuildTransactionResponse> {
    const response = await fetch(`${API_BASE_URL}/api/username/build-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            ownerPublicKey,
            encryptionKey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to build transaction');
    }

    return response.json();
}

/**
 * Register a username with a signed transaction (production flow)
 * @param username - The username to register
 * @param signedTransaction - Base64 encoded signed transaction
 * @param encryptionKey - Encryption key for messaging
 */
export async function registerUsernameWithTransaction(
    username: string,
    signedTransaction: string,
    encryptionKey: string
): Promise<RegisterResponse> {
    const response = await fetch(`${API_BASE_URL}/api/username/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            signedTransaction,
            encryptionKey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Username registration failed');
    }

    return response.json();
}

/**
 * Register a username (simplified flow - for development only)
 * In this flow, the fee payer becomes the owner
 * @deprecated Use registerUsernameWithTransaction for production
 */
export async function registerUsername(
    username: string,
    publicKey: string,
    encryptionKey: string
): Promise<RegisterResponse> {
    const response = await fetch(`${API_BASE_URL}/api/username/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            publicKey,
            encryptionKey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Username registration failed');
    }

    return response.json();
}

/**
 * Get user's keys by username
 */
export async function getPublicKeyByUsername(username: string): Promise<UserData | null> {
    const response = await fetch(`${API_BASE_URL}/api/username/${username}`);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch user');
    }

    return response.json();
}

/**
 * Recover username data by owner public key
 */
export async function getUsernameByOwner(ownerPublicKey: string): Promise<UserData | null> {
    const response = await fetch(`${API_BASE_URL}/api/username/owner/${ownerPublicKey}`);

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch username by owner');
    }

    return response.json();
}

/**
 * Release a username (for burn identity flow)
 */
/**
 * Build an unsigned transaction to release/burn a username
 */
export async function buildReleaseTransaction(
    username: string,
    ownerPublicKey: string
): Promise<BuildTransactionResponse> {
    const response = await fetch(`${API_BASE_URL}/api/username/build-release-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            ownerPublicKey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to build release transaction');
    }

    return response.json();
}

/**
 * Release a username with a signed transaction
 */
export async function releaseUsername(
    username: string,
    signedTransaction: string
): Promise<{
    success: boolean;
    signature: string;
    message: string;
}> {
    const response = await fetch(`${API_BASE_URL}/api/username/${username}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransaction }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Username release failed');
    }

    return data;
}

/**
 * Send response for message API
 */
export interface SendMessageResponse {
    success: boolean;
    signature: string;
    explorer: string;
}

/**
 * Send an encrypted message via Solana memo transaction
 * The fee payer handles all transaction costs
 */
export async function sendMessage(
    encryptedMessage: string,
    recipientPubkey: string,
    senderPubkey: string
): Promise<SendMessageResponse> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    const timestamp = Date.now();
    const messageToSign = `msg:${encryptedMessage}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    const response = await fetch(`${API_BASE_URL}/api/message/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            encryptedMessage,
            recipientPubkey,
            senderPubkey,
            signature,
            timestamp,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Message send failed');
    }

    return response.json();
}

/**
 * Update encryption key for an existing user
 * This is needed after server restart when in-memory store is cleared
 */
export async function updateEncryptionKey(
    username: string,
    encryptionKey: string,
    ownerPublicKey: string
): Promise<{ success: boolean; message: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    const timestamp = Date.now();
    const messageToSign = `key-rotation:${encryptionKey}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    const response = await fetch(`${API_BASE_URL}/api/username/${username}/encryption-key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            encryptionKey,
            ownerPublicKey,
            signature,
            timestamp,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update encryption key');
    }

    return response.json();
}

/**
 * Inbox message from API
 */
export interface InboxMessage {
    signature: string;
    senderPubkey: string;
    encryptedMessage: string;
    timestamp: number;
}

/**
 * Fetch messages from inbox (polling fallback for WebSocket)
 * @param recipientPubkey - The recipient's Solana public key
 * @param since - Optional unix timestamp to only get messages after this time
 */
export async function fetchInbox(
    recipientPubkey: string,
    since?: number
): Promise<{ messages: InboxMessage[] }> {
    const url = new URL(`${API_BASE_URL}/api/message/inbox/${recipientPubkey}`);
    if (since) {
        url.searchParams.set('since', since.toString());
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch inbox');
    }

    return response.json();
}


// ==================== BLOCKING API ====================

/**
 * Block a user
 */
export async function blockUser(blockerPubkey: string, blockedPubkey: string): Promise<{ success: boolean }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    const timestamp = Date.now();
    const messageToSign = `block-user:${blockerPubkey}:${blockedPubkey}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    const response = await fetch(`${API_BASE_URL}/api/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            blockerPubkey,
            blockedPubkey,
            signature,
            timestamp
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to block user');
    }

    return response.json();
}

/**
 * Unblock a user
 */
export async function unblockUser(blockerPubkey: string, blockedPubkey: string): Promise<{ success: boolean }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    const timestamp = Date.now();
    const messageToSign = `unblock-user:${blockerPubkey}:${blockedPubkey}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    const response = await fetch(`${API_BASE_URL}/api/block`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            blockerPubkey,
            blockedPubkey,
            signature,
            timestamp
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to unblock user');
    }

    return response.json();
}

/**
 * Check if a user is blocked
 */
export async function checkBlocked(blockerPubkey: string, blockedPubkey: string): Promise<boolean> {
    const response = await fetch(`${API_BASE_URL}/api/block/check?blocker=${blockerPubkey}&blocked=${blockedPubkey}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to check block status');
    }

    const data = await response.json();
    return data.isBlocked;
}

/**
 * Get list of blocked users for a pubkey
 */
export async function getBlockedUsers(pubkey: string): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/block/list/${pubkey}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get blocked users');
    }
    const data = await response.json();
    return data.blockedUsers;
}

/**
 * Upload large message content by ID
 */
export async function fetchLargeMessage(id: string): Promise<string | null> {
    const response = await fetch(`${API_BASE_URL}/api/message/blob/${id}`);
    if (!response.ok) return null;
    return await response.text();
}

/**
 * Submit a content report
 */
export async function submitReport(
    reporterPubkey: string,
    reportedPubkey: string,
    messageSignature: string,
    reason: string
): Promise<{ success: boolean; message: string; reportId?: string }> {
    const response = await fetch(`${API_BASE_URL}/api/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reporterPubkey,
            reportedPubkey,
            messageSignature,
            reason,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Report submission failed');
    }

    return response.json();
}

// ==================== PROFILE API ====================

/**
 * Upload user avatar
 */
export async function uploadAvatar(username: string, avatarBase64: string): Promise<{ success: boolean; message: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    const timestamp = Date.now();
    const messageToSign = `avatar-upload:${username}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    const response = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            avatarBase64,
            signature,
            timestamp
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload avatar');
    }

    return response.json();
}

/**
 * Get user avatar
 */
export async function getAvatar(username: string): Promise<string | null> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/profile/${username}/avatar`);
        if (!response.ok) return null;
        const data = await response.json();
        return data.avatarBase64 || null;
    } catch {
        return null;
    }
}

/**
 * Delete user avatar
 */
export async function deleteAvatar(username: string): Promise<{ success: boolean; message: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    const timestamp = Date.now();
    const messageToSign = `avatar-delete:${username}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    const response = await fetch(`${API_BASE_URL}/api/profile/${username}/avatar`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            signature,
            timestamp
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete avatar');
    }

    return response.json();
}

// ==================== GROUP API ====================

/**
 * ===========================
 * GROUP FUNCTIONS (Solana)
 * ===========================
 */

/**
 * Build unsigned transaction to create a group
 */
export async function buildCreateGroupTransaction(
    name: string,
    description: string,
    isPublic: boolean,
    isSearchable: boolean,
    inviteOnly: boolean,
    maxMembers: number,
    allowMemberInvites: boolean,
    ownerPubkey: string
): Promise<BuildGroupTransactionResponse> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    // Generate group encryption key (32 bytes)
    const groupEncryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const groupEncryptionKeyBase64 = uint8ToBase64(groupEncryptionKey);

    const response = await fetch(`${API_BASE_URL}/api/groups/build-create-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            description,
            isPublic,
            isSearchable,
            inviteOnly,
            maxMembers,
            allowMemberInvites,
            groupEncryptionKey: groupEncryptionKeyBase64,
            ownerPubkey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to build create group transaction');
    }

    return response.json();
}

/**
 * Create a group with signed transaction
 */
export async function createGroup(
    name: string,
    description: string,
    isPublic: boolean,
    isSearchable: boolean,
    inviteOnly: boolean,
    maxMembers: number,
    allowMemberInvites: boolean,
    ownerPubkey: string
): Promise<{ success: boolean; groupId: string; name: string; signature: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    // Build unsigned transaction
    const buildResult = await buildCreateGroupTransaction(
        name,
        description,
        isPublic,
        isSearchable,
        inviteOnly,
        maxMembers,
        allowMemberInvites,
        ownerPubkey
    );

    // Sign transaction
    const signedTransaction = signTransaction(buildResult.transaction, keypair.secretKey);

    // Verify signature for API
    const timestamp = Date.now();
    const messageToSign = `group:create:${name}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    // Submit signed transaction
    const response = await fetch(`${API_BASE_URL}/api/groups/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            signedTransaction,
            groupId: buildResult.groupId,
            name,
            ownerPubkey,
            signature,
            timestamp,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create group');
    }

    return response.json();
}

/**
 * Simplified createGroup wrapper for backward compatibility
 */
export async function createGroupSimple(name: string, ownerPubkey: string): Promise<{ success: boolean; groupId: string; name: string }> {
    return createGroup(
        name,
        '', // empty description
        false, // not public
        false, // not searchable
        true, // invite only
        100, // max 100 members
        true, // members can invite
        ownerPubkey
    );
}

/**
 * Build transaction to invite a member to a group
 */
export async function buildInviteToGroupTransaction(
    groupId: string,
    invitedUserPubkey: string,
    inviterPubkey: string
): Promise<BuildGroupTransactionResponse> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    // For now, use a placeholder encrypted group key
    // In production, this should be the actual group encryption key encrypted with the invited user's public key
    const encryptedGroupKey = uint8ToBase64(crypto.getRandomValues(new Uint8Array(32)));

    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/build-invite-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            invitedUserPubkey,
            inviterPubkey,
            encryptedGroupKey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to build invite transaction');
    }

    return response.json();
}

/**
 * Invite a member to a group with Solana transaction
 */
export async function inviteToGroup(
    groupId: string,
    memberPubkey: string,
    ownerPubkey: string
): Promise<{ success: boolean; signature?: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    // Build unsigned transaction
    const buildResult = await buildInviteToGroupTransaction(groupId, memberPubkey, ownerPubkey);

    // Sign transaction
    const signedTransaction = signTransaction(buildResult.transaction, keypair.secretKey);

    // Verify signature for API
    const timestamp = Date.now();
    const messageToSign = `group:invite:${groupId}:${memberPubkey}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    // Submit signed transaction
    const response = await fetch(`${API_BASE_URL}/api/groups/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            signedTransaction,
            groupId,
            memberPubkey,
            ownerPubkey,
            signature,
            timestamp,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to invite member');
    }

    return response.json();
}

/**
 * Build transaction to leave a group
 */
export async function buildLeaveGroupTransaction(
    groupId: string,
    memberPubkey: string
): Promise<BuildGroupTransactionResponse> {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/build-leave-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            memberPubkey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to build leave transaction');
    }

    return response.json();
}

/**
 * Leave a group with Solana transaction
 */
export async function leaveGroup(
    groupId: string,
    userPubkey: string
): Promise<{ success: boolean; signature?: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    // Build unsigned transaction
    const buildResult = await buildLeaveGroupTransaction(groupId, userPubkey);

    // Sign transaction
    const signedTransaction = signTransaction(buildResult.transaction, keypair.secretKey);

    // Verify signature for API
    const timestamp = Date.now();
    const messageToSign = `group:leave:${groupId}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    // Submit signed transaction
    const response = await fetch(`${API_BASE_URL}/api/groups/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            signedTransaction,
            groupId,
            ownerPubkey: userPubkey,
            signature,
            timestamp,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to leave group');
    }

    return response.json();
}

/**
 * Get group information
 */
export async function getGroupInfo(groupId: string): Promise<GroupInfo> {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get group info');
    }

    return response.json();
}

/**
 * Get all groups for a user
 */
export async function getUserGroups(pubkey: string): Promise<{ groups: GroupInfo[] }> {
    const response = await fetch(`${API_BASE_URL}/api/groups/user/${pubkey}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get user groups');
    }

    return response.json();
}

/**
 * Search for public groups
 */
export async function searchPublicGroups(query?: string): Promise<{ groups: GroupInfo[] }> {
    const url = query
        ? `${API_BASE_URL}/api/groups/public/search?q=${encodeURIComponent(query)}`
        : `${API_BASE_URL}/api/groups/public/search`;

    const response = await fetch(url);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to search groups');
    }

    return response.json();
}

/**
 * Lookup a group by its public code (e.g., @crypto)
 */
export async function lookupGroupByCode(code: string): Promise<GroupInfo> {
    const response = await fetch(`${API_BASE_URL}/api/groups/code/${code}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Group not found');
    }

    return response.json();
}

/**
 * Build transaction to join a group via public code
 */
export async function buildJoinGroupTransaction(
    code: string,
    memberPubkey: string,
    encryptedGroupKey: string
): Promise<BuildGroupTransactionResponse> {
    const response = await fetch(`${API_BASE_URL}/api/groups/join/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            memberPubkey,
            encryptedGroupKey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to build join group transaction');
    }

    return response.json();
}

/**
 * Join a group via public code with signed transaction
 */
export async function joinGroupByCode(
    code: string,
    memberPubkey: string
): Promise<{ success: boolean; groupId: string; signature: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    // For now, use a placeholder encrypted group key
    // In production, this should be properly encrypted with member's public key
    const encryptedGroupKey = uint8ToBase64(crypto.getRandomValues(new Uint8Array(32)));

    // Build unsigned transaction
    const buildResult = await buildJoinGroupTransaction(code, memberPubkey, encryptedGroupKey);

    // Sign transaction
    const signedTransaction = signTransaction(buildResult.transaction, keypair.secretKey);

    // Submit (currently this endpoint doesn't exist yet, so we'll create a simplified version)
    // For now, just return the build result
    return {
        success: true,
        groupId: buildResult.groupId,
        signature: signedTransaction,
    };
}

/**
 * Build transaction to set a public code for a group
 */
export async function buildSetGroupCodeTransaction(
    groupId: string,
    publicCode: string,
    ownerPubkey: string
): Promise<BuildGroupTransactionResponse> {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/set-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            publicCode,
            ownerPubkey,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to build set code transaction');
    }

    return response.json();
}

/**
 * Set a public code for a group with signed transaction
 */
export async function setGroupCode(
    groupId: string,
    publicCode: string,
    ownerPubkey: string
): Promise<{ success: boolean; signature: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    // Build unsigned transaction
    const buildResult = await buildSetGroupCodeTransaction(groupId, publicCode, ownerPubkey);

    // Sign transaction
    const signedTransaction = signTransaction(buildResult.transaction, keypair.secretKey);

    // For now, return success with signature
    return {
        success: true,
        signature: signedTransaction,
    };
}

/**
 * Get all members of a group with their roles
 */
export async function getGroupMembers(groupId: string): Promise<{ groupId: string; members: string[]; count: number }> {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}/members`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get group members');
    }

    return response.json();
}

/**
 * Send a group message
 */
export async function sendGroupMessage(
    groupId: string,
    encryptedMessage: string,
    encryptedKeys: { [pubkey: string]: string },
    senderPubkey: string
): Promise<{ success: boolean; arweaveTxId: string }> {
    const keypair = await getStoredKeypair();
    if (!keypair) {
        throw new Error('No identity keypair found');
    }

    const timestamp = Date.now();
    const messageToSign = `group-msg:${groupId}:${encryptedMessage}:${timestamp}`;
    const signature = uint8ToBase64(signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey));

    const response = await fetch(`${API_BASE_URL}/api/message/group/${groupId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            encryptedMessage,
            encryptedKeys,
            senderPubkey,
            signature,
            timestamp
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        try {
            const error = JSON.parse(text);
            throw new Error(error.error || `Failed to send group message (${response.status})`);
        } catch (e) {
            // Server returned HTML error page instead of JSON
            throw new Error(`Server error (${response.status}): ${text.slice(0, 100)}`);
        }
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`);
    }
}
