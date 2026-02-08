/**
 * Cross-Device Identity Recovery via Shamir's Secret Sharing (GF-256)
 *
 * Splits a 32-byte Ed25519 seed into N shares (threshold T) using
 * polynomial interpolation over GF(2^8). Each share is encrypted
 * to the respective guardian's X25519 encryption key via NaCl Box.
 *
 * Recovery flow:
 *   1. Recovering user enters username → initiates session with temp keypair
 *   2. Each guardian decrypts their shard, re-encrypts to temp pubkey, submits
 *   3. Once threshold is met, recovering user decrypts shards, combines → seed
 *   4. Seed → generateKeypairFromSeed → full identity restored
 */

import nacl from 'tweetnacl';
import {
    encryptMessage,
    decryptMessage,
    signMessage,
    uint8ToBase64,
    base64ToUint8,
    uint8ToBase58,
    getEncryptionKeypair,
    generateKeypairFromSeed,
} from './crypto';
import type { KeyPair } from './crypto';
import { getStoredKeypair } from './keychain';
import { getPublicKeyByUsername } from './api';

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app';

// ════════════════════════════════════════════════════════════════════
//  GF(256) Arithmetic
//  Field: GF(2^8) with irreducible polynomial x^8+x^4+x^3+x+1 (0x11B)
// ════════════════════════════════════════════════════════════════════

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function initGaloisField() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        EXP[i] = x;
        LOG[x] = i;
        x = (x << 1) ^ (x & 0x80 ? 0x11b : 0);
        x &= 0xff;
    }
    // Wrap-around for fast modular lookup
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
}

function gfDiv(a: number, b: number): number {
    if (b === 0) throw new Error('GF(256) division by zero');
    if (a === 0) return 0;
    return EXP[(LOG[a] + 255 - LOG[b]) % 255];
}

/** Evaluate polynomial at point x in GF(256) using Horner's method */
function evalPoly(coeffs: Uint8Array, x: number): number {
    let r = 0;
    for (let i = coeffs.length - 1; i >= 0; i--) {
        r = gfMul(r, x) ^ coeffs[i];
    }
    return r;
}

// ════════════════════════════════════════════════════════════════════
//  Shamir's Secret Sharing (byte-level)
// ════════════════════════════════════════════════════════════════════

/**
 * Split a secret byte array into `n` shares requiring `threshold` to reconstruct.
 * Each share is a Uint8Array: [x-coordinate (1..n), share_byte_0, share_byte_1, …]
 */
export function splitSecret(
    secret: Uint8Array,
    n: number,
    threshold: number,
): Uint8Array[] {
    if (threshold < 2) throw new Error('Threshold must be ≥ 2');
    if (threshold > n) throw new Error('Threshold cannot exceed share count');
    if (n > 255) throw new Error('Maximum 255 shares');

    const shares: Uint8Array[] = Array.from({ length: n }, (_, i) => {
        const s = new Uint8Array(secret.length + 1);
        s[0] = i + 1; // x-coordinate, never 0
        return s;
    });

    for (let b = 0; b < secret.length; b++) {
        const coeffs = new Uint8Array(threshold);
        coeffs[0] = secret[b]; // constant term = secret byte
        const rand = nacl.randomBytes(threshold - 1);
        for (let j = 1; j < threshold; j++) coeffs[j] = rand[j - 1];

        for (let i = 0; i < n; i++) {
            shares[i][b + 1] = evalPoly(coeffs, i + 1);
        }
    }
    return shares;
}

/**
 * Reconstruct the secret from ≥ threshold shares using Lagrange interpolation at x=0.
 */
export function combineShares(shares: Uint8Array[]): Uint8Array {
    if (shares.length === 0) throw new Error('No shares provided');
    const len = shares[0].length - 1;
    const secret = new Uint8Array(len);
    const xs = shares.map((s) => s[0]);

    for (let b = 0; b < len; b++) {
        let val = 0;
        for (let i = 0; i < shares.length; i++) {
            let basis = 1;
            for (let j = 0; j < shares.length; j++) {
                if (i === j) continue;
                // L_i(0) = ∏ (0 − x_j)/(x_i − x_j)  [in GF(256), 0−a = a, a−b = a⊕b]
                basis = gfMul(basis, gfDiv(xs[j], xs[i] ^ xs[j]));
            }
            val ^= gfMul(shares[i][b + 1], basis);
        }
        secret[b] = val;
    }
    return secret;
}

// ════════════════════════════════════════════════════════════════════
//  Recovery Configuration (Owner Side)
// ════════════════════════════════════════════════════════════════════

/**
 * Configure recovery guardians: splits the signing seed and encrypts each
 * share to the respective guardian's X25519 encryption key, then uploads
 * to the relay server.
 */
export async function configureRecovery(
    guardianUsernames: string[],
    threshold: number,
): Promise<{ success: boolean; error?: string }> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) throw new Error('No identity found');

        const seed = keypair.secretKey.slice(0, 32);
        const ownerEncKp = getEncryptionKeypair(keypair);
        const ownerEncPubB64 = uint8ToBase64(ownerEncKp.publicKey);
        const ownerPubkey = uint8ToBase58(keypair.publicKey);

        // Fetch each guardian's encryption public key
        const guardianData: {
            pubkey: string;
            encPub: Uint8Array;
            username: string;
        }[] = [];
        for (const u of guardianUsernames) {
            const ud = await getPublicKeyByUsername(u);
            if (!ud || !ud.encryptionKey) {
                return {
                    success: false,
                    error: `Guardian @${u} not found or has no encryption key`,
                };
            }
            guardianData.push({
                pubkey: ud.publicKey,
                encPub: base64ToUint8(ud.encryptionKey),
                username: u,
            });
        }

        // Split seed into shares
        const shares = splitSecret(seed, guardianData.length, threshold);

        // Encrypt each share for its guardian
        const guardians = guardianData.map((g, i) => ({
            pubkey: g.pubkey,
            encryptedShard: encryptMessage(
                uint8ToBase64(shares[i]),
                g.encPub,
                ownerEncKp.secretKey,
            ),
        }));

        // Sign & upload
        const timestamp = Math.floor(Date.now() / 1000);
        const msg = `recovery:configure:${threshold}:${timestamp}`;
        const sig = signMessage(new TextEncoder().encode(msg), keypair.secretKey);

        const res = await fetch(`${API_BASE_URL}/api/recovery/configure`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guardians,
                threshold,
                senderPubkey: ownerPubkey,
                ownerEncryptionPubkey: ownerEncPubB64,
                signature: uint8ToBase64(sig),
                timestamp,
            }),
        });

        if (!res.ok) {
            const err = await res.json();
            return { success: false, error: err.error || 'Configuration failed' };
        }
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Disable recovery for the current identity.
 */
export async function disableRecovery(): Promise<{ success: boolean }> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) throw new Error('No identity found');

        const timestamp = Math.floor(Date.now() / 1000);
        const msg = `recovery:disable:${timestamp}`;
        const sig = signMessage(new TextEncoder().encode(msg), keypair.secretKey);

        const res = await fetch(`${API_BASE_URL}/api/recovery/disable`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                senderPubkey: uint8ToBase58(keypair.publicKey),
                signature: uint8ToBase64(sig),
                timestamp,
            }),
        });
        return { success: res.ok };
    } catch {
        return { success: false };
    }
}

// ════════════════════════════════════════════════════════════════════
//  Recovery Initiation (Recovering User — new device, no keypair)
// ════════════════════════════════════════════════════════════════════

export interface RecoverySession {
    recoveryId: string;
    threshold: number;
    guardians: string[];
    submittedCount: number;
    status: string;
    ready: boolean;
    /** Ephemeral X25519 keypair – guardians re-encrypt shards to this pubkey */
    tempKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
}

/**
 * Initiate a recovery session. Returns session info plus a temporary
 * encryption keypair. The temp public key is sent to the server so guardians
 * can re-encrypt their shards to it.
 */
export async function initiateRecovery(
    ownerPubkey: string,
): Promise<{ session?: RecoverySession; error?: string }> {
    try {
        const tempKeypair = nacl.box.keyPair();
        const tempPubB64 = uint8ToBase64(tempKeypair.publicKey);

        const res = await fetch(`${API_BASE_URL}/api/recovery/initiate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerPubkey, tempPubkey: tempPubB64 }),
        });

        if (!res.ok) {
            const err = await res.json();
            return { error: err.error || 'Initiation failed' };
        }

        const data = await res.json();
        return {
            session: {
                recoveryId: data.recoveryId,
                threshold: data.threshold,
                guardians: data.guardians,
                submittedCount: 0,
                status: data.status,
                ready: false,
                tempKeypair,
            },
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/** Poll a recovery session for progress. */
export async function checkRecoveryStatus(recoveryId: string): Promise<{
    submittedCount: number;
    threshold: number;
    ready: boolean;
    status: string;
} | null> {
    try {
        const res = await fetch(
            `${API_BASE_URL}/api/recovery/session/${recoveryId}`,
        );
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

/**
 * Fetch submitted (re-encrypted) shards and reconstruct the identity.
 */
export async function completeRecovery(
    recoveryId: string,
    tempSecretKey: Uint8Array,
): Promise<{ keypair?: KeyPair; error?: string }> {
    try {
        const res = await fetch(
            `${API_BASE_URL}/api/recovery/shards/${recoveryId}`,
        );
        if (!res.ok) {
            const err = await res.json();
            return { error: err.error || 'Could not fetch shards' };
        }

        const { shards } = await res.json();
        // shards: { [guardianPubkey]: { encryptedShard, guardianEncryptionPubkey } }

        const decryptedShares: Uint8Array[] = [];
        for (const gpk of Object.keys(shards)) {
            const { encryptedShard, guardianEncryptionPubkey } = shards[gpk];
            const guardianEncPub = base64ToUint8(guardianEncryptionPubkey);
            const shardB64 = decryptMessage(
                encryptedShard,
                guardianEncPub,
                tempSecretKey,
            );
            decryptedShares.push(base64ToUint8(shardB64));
        }

        const seed = combineShares(decryptedShares);
        const keypair = generateKeypairFromSeed(seed);

        // Mark session complete on server
        await fetch(`${API_BASE_URL}/api/recovery/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recoveryId }),
        });

        return { keypair };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : 'Reconstruction failed',
        };
    }
}

// ════════════════════════════════════════════════════════════════════
//  Guardian Side
// ════════════════════════════════════════════════════════════════════

export interface PendingRecoveryRequest {
    recoveryId: string;
    ownerPubkey: string;
    tempPubkey: string;
    ownerEncryptionPubkey: string;
    threshold: number;
    submittedCount: number;
    encryptedShard: string;
    createdAt: number;
}

/** Fetch pending recovery requests where the current user is a guardian. */
export async function getPendingRecoveryRequests(): Promise<
    PendingRecoveryRequest[]
> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) return [];

        const guardianPubkey = uint8ToBase58(keypair.publicKey);
        const timestamp = Math.floor(Date.now() / 1000);
        const msg = `recovery:pending:${timestamp}`;
        const sig = signMessage(new TextEncoder().encode(msg), keypair.secretKey);

        const url =
            `${API_BASE_URL}/api/recovery/pending/${guardianPubkey}` +
            `?signature=${encodeURIComponent(uint8ToBase64(sig))}&timestamp=${timestamp}`;

        const res = await fetch(url);
        if (!res.ok) return [];

        const { pendingRequests } = await res.json();
        return pendingRequests || [];
    } catch {
        return [];
    }
}

/**
 * Approve a recovery request: decrypt the original shard, re-encrypt
 * it to the recovery session's temp public key, and submit.
 */
export async function approveRecoveryRequest(
    request: PendingRecoveryRequest,
): Promise<{ success: boolean; error?: string }> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) throw new Error('No identity found');

        const guardianEncKp = getEncryptionKeypair(keypair);
        const ownerEncPub = base64ToUint8(request.ownerEncryptionPubkey);
        const tempPub = base64ToUint8(request.tempPubkey);

        // 1. Decrypt the shard (owner → guardian)
        const shardB64 = decryptMessage(
            request.encryptedShard,
            ownerEncPub,
            guardianEncKp.secretKey,
        );

        // 2. Re-encrypt for recovery session (guardian → temp)
        const reEncrypted = encryptMessage(
            shardB64,
            tempPub,
            guardianEncKp.secretKey,
        );

        // 3. Sign & submit
        const guardianPubkey = uint8ToBase58(keypair.publicKey);
        const timestamp = Math.floor(Date.now() / 1000);
        const msg = `recovery:submit:${request.recoveryId}:${timestamp}`;
        const sig = signMessage(new TextEncoder().encode(msg), keypair.secretKey);

        const res = await fetch(`${API_BASE_URL}/api/recovery/submit-shard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recoveryId: request.recoveryId,
                encryptedShard: reEncrypted,
                guardianPubkey,
                guardianEncryptionPubkey: uint8ToBase64(guardianEncKp.publicKey),
                signature: uint8ToBase64(sig),
                timestamp,
            }),
        });

        if (!res.ok) {
            const err = await res.json();
            return { success: false, error: err.error || 'Submission failed' };
        }
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
