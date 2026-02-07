import { Router, Request, Response } from 'express';
import { relayTransaction } from '../services/solana.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import { Transaction } from '@solana/web3.js';
import { config } from '../config.js';
import { spendingLimitMiddleware } from '../middleware/spendingLimits.js';

const router = Router();

interface RelayRequest {
    transaction: string; // Base64 encoded partially signed transaction
    senderPublicKey: string; // For rate limiting
}

/**
 * POST /api/relay
 * Accepts a partially signed transaction, adds fee payer signature, and submits to Solana
 */
router.post('/', rateLimitMiddleware, spendingLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const { transaction, senderPublicKey } = req.body as RelayRequest;

        // Validation
        if (!transaction) {
            return res.status(400).json({
                error: 'Missing transaction',
                message: 'Transaction data is required',
            });
        }

        if (!senderPublicKey) {
            return res.status(400).json({
                error: 'Missing senderPublicKey',
                message: 'Sender public key is required for rate limiting',
            });
        }

        // Validate base64 format
        try {
            Buffer.from(transaction, 'base64');
        } catch {
            return res.status(400).json({
                error: 'Invalid transaction format',
                message: 'Transaction must be base64 encoded',
            });
        }

        // Check transaction cost (anti-spam/drain)
        const tx = Transaction.from(Buffer.from(transaction, 'base64'));
        if (tx.signatures.length * 5000 > config.spendingLimits.maxLamportsPerTx) {
            return res.status(400).json({
                error: 'Transaction too expensive',
                message: `Transaction cost exceeds limit of ${config.spendingLimits.maxLamportsPerTx} lamports`,
            });
        }

        console.log(`📤 Relaying transaction from ${senderPublicKey.slice(0, 8)}...`);

        // Relay the transaction
        const signature = await relayTransaction(transaction);

        console.log(`✅ Transaction confirmed: ${signature}`);

        return res.json({
            success: true,
            signature,
            explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        });
    } catch (error) {
        console.error('❌ Relay error:', error);
        return res.status(500).json({
            error: 'Transaction failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
