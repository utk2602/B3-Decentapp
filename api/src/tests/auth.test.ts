import { verifySignature } from '../middleware/auth.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { describe, it, expect } from 'vitest';

describe('Auth Middleware', () => {
    it('should verify a valid signature', () => {
        const keypair = nacl.sign.keyPair();
        const timestamp = Date.now();
        const payload = 'test-payload';
        // Message format must match what verification expects 
        // (but verifySignature takes the exact message to verify, so we just match what we pass)

        const messageBytes = new TextEncoder().encode(payload);
        const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
        const signatureBase64 = Buffer.from(signature).toString('base64');
        const pubkey = bs58.encode(keypair.publicKey);

        const isValid = verifySignature(signatureBase64, timestamp, payload, pubkey);
        expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
        const keypair = nacl.sign.keyPair();
        const timestamp = Date.now();
        const payload = 'test-payload';

        // Sign wrong message
        const messageBytes = new TextEncoder().encode('wrong-message');
        const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
        const signatureBase64 = Buffer.from(signature).toString('base64');
        const pubkey = bs58.encode(keypair.publicKey);

        const isValid = verifySignature(signatureBase64, timestamp, payload, pubkey);
        expect(isValid).toBe(false);
    });

    it('should reject old timestamp', () => {
        const keypair = nacl.sign.keyPair();
        const timestamp = Date.now() - 10 * 60 * 1000; // 10 mins ago
        const payload = 'test-payload';

        const messageBytes = new TextEncoder().encode(payload);
        const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
        const signatureBase64 = Buffer.from(signature).toString('base64');
        const pubkey = bs58.encode(keypair.publicKey);

        // verifySignature checks timestamp vs now
        const isValid = verifySignature(signatureBase64, timestamp, payload, pubkey);
        expect(isValid).toBe(false);
    });
});
