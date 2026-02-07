/**
 * Redis client using Upstash for user blocking.
 * Falls back to an in-memory Map when UPSTASH credentials are missing (local dev).
 */
import { Redis } from '@upstash/redis';

// ─── In-memory fallback for local dev without Upstash ───
function createInMemoryRedis(): any {
    const store = new Map<string, any>();
    console.warn('⚠️  UPSTASH_REDIS_REST_URL not set — using in-memory store (data lost on restart)');

    return {
        async ping() { return 'PONG'; },
        async get(key: string) { return store.get(key) ?? null; },
        async set(key: string, value: any, opts?: { ex?: number }) {
            store.set(key, value);
            if (opts?.ex) setTimeout(() => store.delete(key), opts.ex * 1000);
            return 'OK';
        },
        async del(...keys: string[]) { keys.forEach(k => store.delete(k)); return keys.length; },
        async sadd(key: string, ...members: string[]) {
            if (!store.has(key)) store.set(key, new Set());
            members.forEach(m => store.get(key).add(m));
            return members.length;
        },
        async srem(key: string, ...members: string[]) {
            const s: Set<string> | undefined = store.get(key);
            if (!s) return 0;
            members.forEach(m => s.delete(m));
            return members.length;
        },
        async smembers(key: string) {
            const s: Set<string> | undefined = store.get(key);
            return s ? Array.from(s) : [];
        },
        async sismember(key: string, member: string) {
            const s: Set<string> | undefined = store.get(key);
            return s?.has(member) ? 1 : 0;
        },
        async hset(key: string, field: Record<string, any>) {
            if (!store.has(key)) store.set(key, new Map());
            const m: Map<string, any> = store.get(key);
            Object.entries(field).forEach(([k, v]) => m.set(k, v));
            return Object.keys(field).length;
        },
        async hget(key: string, field: string) {
            const m: Map<string, any> | undefined = store.get(key);
            return m?.get(field) ?? null;
        },
        async hgetall(key: string) {
            const m: Map<string, any> | undefined = store.get(key);
            if (!m) return null;
            return Object.fromEntries(m);
        },
        async hdel(key: string, ...fields: string[]) {
            const m: Map<string, any> | undefined = store.get(key);
            if (!m) return 0;
            fields.forEach(f => m.delete(f));
            return fields.length;
        },
        async keys(pattern: string) {
            const prefix = pattern.replace('*', '');
            return Array.from(store.keys()).filter(k => k.startsWith(prefix));
        },
        async incr(key: string) {
            const v = (parseInt(store.get(key) || '0', 10) || 0) + 1;
            store.set(key, v);
            return v;
        },
        async incrbyfloat(key: string, increment: number) {
            const current = parseFloat(store.get(key) || '0') || 0;
            const newVal = current + increment;
            store.set(key, String(newVal));
            return String(newVal);
        },
        async expire(key: string, seconds: number) {
            if (store.has(key)) setTimeout(() => store.delete(key), seconds * 1000);
            return 1;
        },
    };
}

// Initialize Redis client — real Upstash or in-memory fallback
const redis: Redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : createInMemoryRedis();

// Key prefix for blocked users
const BLOCKED_KEY_PREFIX = 'blocked:';

/**
 * Block a user
 * @param blockerPubkey - The public key of the user doing the blocking
 * @param blockedPubkey - The public key of the user being blocked
 */
export async function blockUser(blockerPubkey: string, blockedPubkey: string): Promise<void> {
    const key = `${BLOCKED_KEY_PREFIX}${blockerPubkey}`;
    await redis.sadd(key, blockedPubkey);
}

/**
 * Unblock a user
 * @param blockerPubkey - The public key of the user doing the unblocking
 * @param blockedPubkey - The public key of the user being unblocked
 */
export async function unblockUser(blockerPubkey: string, blockedPubkey: string): Promise<void> {
    const key = `${BLOCKED_KEY_PREFIX}${blockerPubkey}`;
    await redis.srem(key, blockedPubkey);
}

/**
 * Check if a user is blocked
 * @param blockerPubkey - The public key of the potential blocker
 * @param blockedPubkey - The public key of the user to check
 * @returns true if blocked, false otherwise
 */
export async function isBlocked(blockerPubkey: string, blockedPubkey: string): Promise<boolean> {
    const key = `${BLOCKED_KEY_PREFIX}${blockerPubkey}`;
    return await redis.sismember(key, blockedPubkey) === 1;
}

/**
 * Get all blocked users for a user
 * @param blockerPubkey - The public key of the user
 * @returns Array of blocked public keys
 */
export async function getBlockedUsers(blockerPubkey: string): Promise<string[]> {
    const key = `${BLOCKED_KEY_PREFIX}${blockerPubkey}`;
    return await redis.smembers(key) as string[];
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
    try {
        await redis.ping();
        return true;
    } catch (error) {
        console.error('Redis connection failed:', error);
        return false;
    }
}



/**
 * Key prefix for message blobs
 */
const MSG_BLOB_PREFIX = 'msg:blob:';

/**
 * Store a large message blob (e.g. image)
 * @param id - Unique message ID
 * @param content - The content to store
 * @param ttlSeconds - Expiration in seconds (default 30 days)
 */
export async function storeMessageBlob(id: string, content: string, ttlSeconds: number = 30 * 24 * 60 * 60): Promise<void> {
    const key = `${MSG_BLOB_PREFIX}${id}`;
    await redis.set(key, content, { ex: ttlSeconds });
}

/**
 * Retrieve a message blob
 * @param id - Unique message ID
 */
export async function getMessageContent(id: string): Promise<string | null> {
    const key = `${MSG_BLOB_PREFIX}${id}`;
    return await redis.get<string>(key);
}

/**
 * Key prefix for user avatars
 */
const AVATAR_PREFIX = 'avatar:';

/**
 * Store a user's avatar (base64 encoded)
 * @param username - The username
 * @param avatarBase64 - Base64 encoded image data
 */
export async function storeAvatar(username: string, avatarBase64: string): Promise<void> {
    const key = `${AVATAR_PREFIX}${username}`;
    // Store avatar indefinitely (no TTL)
    await redis.set(key, avatarBase64);
}

/**
 * Retrieve a user's avatar
 * @param username - The username
 * @returns Base64 encoded image data or null
 */
export async function getAvatar(username: string): Promise<string | null> {
    const key = `${AVATAR_PREFIX}${username}`;
    return await redis.get<string>(key);
}

/**
 * Delete a user's avatar
 * @param username - The username
 */
export async function deleteAvatar(username: string): Promise<void> {
    const key = `${AVATAR_PREFIX}${username}`;
    await redis.del(key);
}

/**
 * Get group members
 * @param groupId - The group ID
 * @returns Array of member public keys
 */
export async function getGroupMembers(groupId: string): Promise<string[]> {
    const key = `group:members:${groupId}`;
    const members = await redis.smembers(key);
    return members || [];
}

export { redis };
