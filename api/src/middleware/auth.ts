import nacl from 'tweetnacl';
import bs58 from 'bs58';

/**
 * Verify an Ed25519 signature
 * @param signatureBase64 - The base64 encoded signature
 * @param timestamp - The timestamp used in the message
 * @param messagePayload - The string payload that was signed
 * @param publicKeyBase58 - The signer's public key
 */
export function verifySignature(
    signatureBase64: string,
    timestamp: number,
    messagePayload: string,
    publicKeyBase58: string
): boolean {
    if (!signatureBase64 || !timestamp || !messagePayload || !publicKeyBase58) {
        return false;
    }

    // 1. Check timestamp (5 min window)
    const now = Date.now();
    if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
        console.warn(`⚠️ Signature timestamp out of bounds: diff ${now - timestamp}ms`);
        return false; // Replay protection
    }

    try {
        // 2. Prepare message
        const message = new TextEncoder().encode(messagePayload);

        // 3. Decode keys/sig
        const signature = new Uint8Array(Buffer.from(signatureBase64, 'base64'));
        const publicKey = bs58.decode(publicKeyBase58);

        return nacl.sign.detached.verify(message, signature, publicKey);
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}
