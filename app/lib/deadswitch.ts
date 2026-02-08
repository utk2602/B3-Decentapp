/**
 * Dead Man's Switch (DMS) – client library
 *
 * Handles configuration, check-in, status polling, and teardown.
 * Pre-encrypts each recipient's message client-side so the server
 * never sees plaintext.
 */

import { getStoredKeypair } from './keychain';
import { signMessage, uint8ToBase64, uint8ToBase58, encryptMessage, getEncryptionKeypair, base64ToUint8 } from './crypto';
import { getPublicKeyByUsername } from './api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://keyapp-production.up.railway.app';

// ────────────────────── Types ──────────────────────

export interface DMSRecipientInput {
  username: string;
  message: string; // plaintext – will be encrypted per-recipient
}

export interface DMSConfigureResult {
  success: boolean;
  intervalHours: number;
  ttlSeconds: number;
  recipientCount: number;
}

export interface DMSStatusResult {
  enabled: boolean;
  intervalHours?: number;
  recipientCount?: number;
  lastSeenAlive?: boolean;
  triggered?: boolean;
  configuredAt?: number;
}

// ────────────────── Helpers ──────────────────

async function getAuthFields(messageStr: string) {
  const keypair = await getStoredKeypair();
  if (!keypair) throw new Error('No identity keypair found');

  const timestamp = Date.now();
  const toSign = messageStr.replace('{ts}', String(timestamp));
  const signature = uint8ToBase64(
    signMessage(new TextEncoder().encode(toSign), keypair.secretKey),
  );

  return { pubkey: keypair.publicKey, signature, timestamp, keypair };
}

// ────────────────── Configure ──────────────────

/**
 * Set up (or update) the Dead Man's Switch.
 *
 * 1. Resolves each recipient's encryption key on-chain.
 * 2. Encrypts the message per-recipient using NaCl Box.
 * 3. Sends the encrypted bundles to PUT /api/dms/configure.
 */
export async function configureDMS(
  intervalHours: number,
  recipients: DMSRecipientInput[],
): Promise<DMSConfigureResult> {
  const keypair = await getStoredKeypair();
  if (!keypair) throw new Error('No identity keypair found');

  const encKp = getEncryptionKeypair(keypair);

  // Resolve encryption keys & encrypt per-recipient
  const messages: { recipientPubkey: string; encryptedMessage: string }[] = [];

  for (const r of recipients) {
    const userData = await getPublicKeyByUsername(r.username);
    if (!userData) throw new Error(`User "${r.username}" not found`);
    if (!userData.encryptionKey) throw new Error(`User "${r.username}" has no encryption key`);

    const encrypted = encryptMessage(r.message, base64ToUint8(userData.encryptionKey), encKp.secretKey);
    messages.push({
      recipientPubkey: userData.publicKey,
      encryptedMessage: encrypted,
    });
  }

  // Auth
  const timestamp = Date.now();
  const sigPayload = `dms:configure:${intervalHours}:${timestamp}`;
  const signature = uint8ToBase64(
    signMessage(new TextEncoder().encode(sigPayload), keypair.secretKey),
  );

  const res = await fetch(`${API_BASE_URL}/api/dms/configure`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: uint8ToBase58(keypair.publicKey),
      signature,
      timestamp,
      intervalHours,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to configure DMS');
  }

  return res.json();
}

// ────────────────── Check-in ──────────────────

/**
 * Heartbeat – resets the countdown so the switch doesn't fire.
 * Can be called silently on app foreground.
 */
export async function checkinDMS(): Promise<{ success: boolean; nextDeadline: number }> {
  const keypair = await getStoredKeypair();
  if (!keypair) throw new Error('No identity keypair found');

  const timestamp = Date.now();
  const sigPayload = `dms:checkin:${timestamp}`;
  const signature = uint8ToBase64(
    signMessage(new TextEncoder().encode(sigPayload), keypair.secretKey),
  );

  const res = await fetch(`${API_BASE_URL}/api/dms/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: uint8ToBase58(keypair.publicKey),
      signature,
      timestamp,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Check-in failed');
  }

  return res.json();
}

// ────────────────── Status ──────────────────

/**
 * Fetch current DMS status (unauthenticated – uses pubkey only).
 */
export async function getDMSStatus(pubkey: string): Promise<DMSStatusResult> {
  const res = await fetch(`${API_BASE_URL}/api/dms/status/${pubkey}`);
  if (!res.ok) throw new Error('Failed to fetch DMS status');
  return res.json();
}

// ────────────────── Disable ──────────────────

/**
 * Fully disarm the switch and delete all stored DMS data server-side.
 */
export async function disableDMS(): Promise<{ success: boolean }> {
  const keypair = await getStoredKeypair();
  if (!keypair) throw new Error('No identity keypair found');

  const timestamp = Date.now();
  const sigPayload = `dms:disable:${timestamp}`;
  const signature = uint8ToBase64(
    signMessage(new TextEncoder().encode(sigPayload), keypair.secretKey),
  );

  const res = await fetch(`${API_BASE_URL}/api/dms/disable`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey: uint8ToBase58(keypair.publicKey),
      signature,
      timestamp,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to disable DMS');
  }

  return res.json();
}
