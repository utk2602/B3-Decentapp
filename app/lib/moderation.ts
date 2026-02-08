/**
 * Client-side content moderation
 *
 * Runs locally BEFORE encryption so plaintext is never sent to the server.
 * If a violation is detected the message is blocked and a hashed flag is
 * auto-reported to the moderation API (server only sees the hash, not the
 * actual text).
 */

import { getStoredKeypair } from './keychain';
import { signMessage, uint8ToBase64, uint8ToBase58 } from './crypto';

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app';

// ── Harmful content patterns by category ──

interface PatternCategory {
    patterns: RegExp[];
    severity: 'critical' | 'high' | 'medium' | 'low';
}

const CATEGORIES: Record<string, PatternCategory> = {
    threats: {
        patterns: [
            /\b(i\s+will|i'?m\s+going\s+to|gonna)\s+(kill|murder|hurt|harm|destroy)\s+(you|them|him|her)\b/i,
            /\bkill\s+(your|you)r?self\b/i,
            /\bdeath\s+threat\b/i,
        ],
        severity: 'critical',
    },
    harassment: {
        patterns: [
            /\b(stalk|doxx|doxing|swat)\s*(you|them|him|her|ing)?\b/i,
            /\b(go\s+die|drop\s+dead)\b/i,
        ],
        severity: 'high',
    },
    spam: {
        patterns: [
            // Repeated characters (e.g., "aaaaaaaa")
            /(.)\1{9,}/,
            // Typical spam phrases
            /\b(buy\s+now|click\s+here|free\s+money|act\s+now|limited\s+offer)\b/i,
            // Excessive URLs
            /(https?:\/\/\S+\s*){4,}/i,
        ],
        severity: 'low',
    },
    solicitation: {
        patterns: [
            /\b(send\s+(nudes?|pics))\b/i,
            /\b(venmo|cashapp|paypal)\s+me\b/i,
        ],
        severity: 'medium',
    },
};

// ── Leetspeak / unicode normalization ──

const LEET_MAP: Record<string, string> = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '@': 'a',
    '$': 's',
    '!': 'i',
};

function normalizeLeet(text: string): string {
    let out = '';
    for (const ch of text) {
        out += LEET_MAP[ch] || ch;
    }
    // Collapse repeated whitespace
    return out.replace(/\s+/g, ' ').trim();
}

// ── Public API ──

export interface ModerationResult {
    safe: boolean;
    category?: string;
    severity?: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Check text content against moderation rules.
 * Runs entirely on-device — no network call.
 */
export function checkContent(text: string): ModerationResult {
    const normalized = normalizeLeet(text.toLowerCase());

    for (const [cat, { patterns, severity }] of Object.entries(CATEGORIES)) {
        for (const rx of patterns) {
            if (rx.test(normalized) || rx.test(text)) {
                return { safe: false, category: cat, severity };
            }
        }
    }
    return { safe: true };
}

/**
 * Simple FNV-1a hash to produce a deterministic fingerprint of the
 * flagged content. The server only ever sees the hash.
 */
function hashContent(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Auto-report a content violation to the moderation API.
 * Sends only the category and a hash — never the actual message text.
 */
export async function flagContent(
    category: string,
): Promise<{ strikes?: number; status?: string }> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) return {};

        const senderPubkey = uint8ToBase58(keypair.publicKey);
        const contentHash = hashContent(`${category}:${Date.now()}`);
        const timestamp = Math.floor(Date.now() / 1000);

        const msg = `mod:flag:${contentHash}:${timestamp}`;
        const sig = signMessage(new TextEncoder().encode(msg), keypair.secretKey);

        const res = await fetch(`${API_BASE_URL}/api/moderation/flag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                senderPubkey,
                category,
                contentHash,
                signature: uint8ToBase64(sig),
                timestamp,
            }),
        });

        if (!res.ok) return {};
        return res.json();
    } catch {
        return {};
    }
}

/**
 * Check the current user's moderation status from the server.
 */
export async function getModerationStatus(): Promise<{
    strikes: number;
    status: string;
    banned: boolean;
} | null> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) return null;

        const pubkey = uint8ToBase58(keypair.publicKey);
        const res = await fetch(
            `${API_BASE_URL}/api/moderation/status/${pubkey}`,
        );
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}
