import { Router, Request, Response } from 'express';
import { SendTransactionError, PublicKey } from '@solana/web3.js';
import {
    checkUsernameAvailable,
    getUserAccount,
    getUsernamePDA,
    getFeePayer,
    buildRegisterUsernameTransaction,
    relaySignedTransaction,
    closeUsernameOnChain,
    buildCloseUsernameTransaction,
    connection,
    findUserByOwner,
    getFeePayerBalance
} from '../services/solana.js';
import { spendingLimitMiddleware } from '../middleware/spendingLimits.js';

// Removed: getEncryptionKey, storeEncryptionKey from redis.js
// import { getEncryptionKey, storeEncryptionKey, deleteEncryptionKey } from '../services/redis.js';

const router = Router();
const MIN_FEE_PAYER_SOL = 0.2;

// Username validation regex: alphanumeric, 3-20 chars
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * GET /api/username/:name/check
 * Check if a username is available
 */
router.get('/:name/check', async (req: Request, res: Response) => {
    try {
        const { name } = req.params;

        if (!USERNAME_REGEX.test(name)) {
            return res.status(400).json({
                error: 'Invalid username',
                message: 'Username must be 3-20 alphanumeric characters',
                available: false,
            });
        }

        const available = await checkUsernameAvailable(name.toLowerCase());

        return res.json({
            username: name.toLowerCase(),
            available,
        });
    } catch (error) {
        console.error('❌ Username check error:', error);
        return res.status(500).json({
            error: 'Check failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/username/owner/:pubkey
 * Recover username data by owner public key
 */
router.get('/owner/:pubkey', async (req: Request, res: Response) => {
    try {
        const { pubkey } = req.params;
        try {
            new PublicKey(pubkey);
        } catch {
            return res.status(400).json({
                error: 'Invalid public key',
                message: 'Owner public key is not valid',
            });
        }

        const userAccount = await findUserByOwner(pubkey);
        if (!userAccount) {
            return res.status(404).json({
                error: 'User not found',
                message: 'No username registered for this owner',
            });
        }

        // Read encryption key from on-chain account data
        const encryptionKey = userAccount.encryptionKey;

        return res.json({
            username: userAccount.username,
            publicKey: userAccount.owner,
            encryptionKey: encryptionKey || null,
            registeredAt: new Date(userAccount.createdAt * 1000).toISOString(),
        });
    } catch (error) {
        console.error('❌ Owner lookup error:', error);
        return res.status(500).json({
            error: 'Lookup failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/username/:name
 * Get user's public keys by username
 */
router.get('/:name', async (req: Request, res: Response) => {
    try {
        const { name } = req.params;
        const username = name.toLowerCase();

        const userAccount = await getUserAccount(username);

        if (!userAccount) {
            return res.status(404).json({
                error: 'User not found',
                message: `Username @${username} is not registered`,
            });
        }

        // Read encryption key from on-chain account data
        const encryptionKey = userAccount.encryptionKey;

        return res.json({
            username,
            publicKey: userAccount.owner,
            encryptionKey: encryptionKey || null,
            registeredAt: new Date(userAccount.createdAt * 1000).toISOString(),
        });
    } catch (error) {
        console.error('❌ User lookup error:', error);
        return res.status(500).json({
            error: 'Lookup failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * PUT /api/username/:name/encryption-key
 * Update encryption key for an existing user
 * This is needed after server restart when in-memory store is cleared
 */
// ... imports
import { verifySignature } from '../middleware/auth.js';

// ... existing code

/**
 * PUT /api/username/:name/encryption-key
 * Update encryption key for an existing user
 * This is needed after server restart when in-memory store is cleared
 */
router.put('/:name/encryption-key', async (req: Request, res: Response) => {
    try {
        return res.status(410).json({
            error: 'Deprecated',
            message: 'Encryption keys are now stored on-chain. Use the update_encryption_key instruction.'
        });
    } catch (error) {
        return res.status(500).json({ error: 'Internal Error' });
    }
});

/**
 * POST /api/username/build-transaction
 * Build an unsigned transaction for username registration
 * The user will sign this with their keypair
 */
router.post('/build-transaction', spendingLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const { username, ownerPublicKey, encryptionKey } = req.body;

        console.log('🔧 Build transaction request:', {
            username,
            ownerPublicKey,
            encryptionKey: encryptionKey ? `Provided (${encryptionKey.length} chars)` : 'Missing',
            type: typeof ownerPublicKey,
            length: ownerPublicKey?.length
        });
        console.log('💰 Fee payer:', getFeePayer().publicKey.toBase58());

        if (!username || !USERNAME_REGEX.test(username)) {
            return res.status(400).json({
                error: 'Invalid username',
                message: 'Username must be 3-20 alphanumeric characters',
            });
        }

        if (!ownerPublicKey) {
            return res.status(400).json({
                error: 'Missing ownerPublicKey',
                message: 'Owner public key is required',
            });
        }

        if (!encryptionKey) {
            return res.status(400).json({
                error: 'Missing encryptionKey',
                message: 'Encryption key is required for registration',
            });
        }

        const lowerUsername = username.toLowerCase();

        // Check availability
        const available = await checkUsernameAvailable(lowerUsername);
        if (!available) {
            return res.status(409).json({
                error: 'Username taken',
                message: 'This username is already registered onchain',
            });
        }

        // Build the transaction (requires funded fee payer)
        const feePayerBalance = await getFeePayerBalance();
        if (feePayerBalance < MIN_FEE_PAYER_SOL) {
            return res.status(503).json({
                error: 'Fee payer low balance',
                message: `Fee payer requires at least ${MIN_FEE_PAYER_SOL} SOL to build transactions`,
            });
        }

        // Build the transaction with rent pre-fund
        const { transaction, blockhash, lastValidBlockHeight } =
            await buildRegisterUsernameTransaction(lowerUsername, ownerPublicKey, encryptionKey);

        // Serialize transaction (base64)
        const serializedTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        console.log(`📦 Built registration tx for @${lowerUsername}, owner: ${ownerPublicKey.slice(0, 8)}...`);

        return res.json({
            success: true,
            transaction: serializedTx,
            blockhash,
            lastValidBlockHeight,
            message: 'Sign this transaction with your keypair, then submit to /register',
        });
    } catch (error) {
        console.error('❌ Build transaction error:', error);
        return res.status(500).json({
            error: 'Build failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/username/register
 * Register a username onchain
 * Accepts a signed transaction (user signed) and adds fee payer signature
 */
router.post('/register', spendingLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const { username, signedTransaction, encryptionKey, publicKey } = req.body;

        if (!username || !USERNAME_REGEX.test(username)) {
            return res.status(400).json({
                error: 'Invalid username',
                message: 'Username must be 3-20 alphanumeric characters',
            });
        }

        if (!encryptionKey) {
            return res.status(400).json({
                error: 'Missing encryptionKey',
                message: 'Encryption key is required for messaging',
            });
        }

        const lowerUsername = username.toLowerCase();

        // Check availability
        const available = await checkUsernameAvailable(lowerUsername);
        if (!available) {
            return res.status(409).json({
                error: 'Username taken',
                message: 'This username is already registered onchain',
            });
        }

        // Ensure fee payer is funded before attempting relay
        const feePayerBalance = await getFeePayerBalance();
        if (feePayerBalance < MIN_FEE_PAYER_SOL) {
            return res.status(503).json({
                error: 'Fee payer low balance',
                message: `Fee payer requires at least ${MIN_FEE_PAYER_SOL} SOL to submit transactions`,
            });
        }

        let signature: string;

        if (signedTransaction) {
            // Production flow: Relay user-signed transaction
            console.log(`📝 Relaying signed tx for @${lowerUsername}...`);
            signature = await relaySignedTransaction(signedTransaction);
        } else if (publicKey) {
            // Simplified flow: API creates and signs (for development)
            // This is ONLY for testing - the fee payer becomes the owner
            console.log(`⚠️  Warning: Using simplified registration (fee payer = owner)`);
            const { registerUsernameOnChain } = await import('../services/solana.js');
            signature = await registerUsernameOnChain(lowerUsername, publicKey, encryptionKey);
        } else {
            return res.status(400).json({
                error: 'Missing transaction',
                message: 'Either signedTransaction or publicKey is required',
            });
        }

        // Store encryption key - REDIS REMOVED
        // await storeEncryptionKey(lowerUsername, encryptionKey);

        console.log(`✅ Username @${lowerUsername} registered: ${signature}`);

        return res.json({
            success: true,
            username: lowerUsername,
            signature,
            explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        });
    } catch (error) {
        if (error instanceof SendTransactionError) {
            const logs = await error.getLogs(connection);
            console.error('❌ Registration simulation logs:', logs);
            return res.status(400).json({
                error: 'Registration failed',
                message: error.message,
                logs,
            });
        }
        console.error('❌ Registration error:', error);
        return res.status(500).json({
            error: 'Registration failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/username/test
 * Create a test user (encryption key only, no onchain)
 */
router.post('/test', spendingLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const { username, encryptionKey } = req.body;

        if (!username || !USERNAME_REGEX.test(username)) {
            return res.status(400).json({
                error: 'Invalid username',
                message: 'Username must be 3-20 alphanumeric characters',
            });
        }

        if (!encryptionKey) {
            return res.status(400).json({
                error: 'Missing encryptionKey',
                message: 'Encryption key is required',
            });
        }

        const lowerUsername = username.toLowerCase();
        // await storeEncryptionKey(lowerUsername, encryptionKey);
        console.log(`🧪 Test user @${lowerUsername} created (No-op for Redis removal)`);

        return res.json({
            success: true,
            username: lowerUsername,
            encryptionKey,
            message: 'Test user created (encryption key only)',
        });
    } catch (error) {
        console.error('❌ Test user error:', error);
        return res.status(500).json({
            error: 'Creation failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/username/:name/release
 * Release a username (close onchain account)
 * Note: Requires program modification to support account closing
 */
/**
 * POST /api/username/build-release-transaction
 * Build transaction to close/burn a username (user signs)
 */
router.post('/build-release-transaction', spendingLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const { username, ownerPublicKey } = req.body;
        const lowerUsername = username.toLowerCase();

        // Check if username exists onchain
        const userAccount = await getUserAccount(lowerUsername);

        if (!userAccount) {
            return res.status(404).json({
                error: 'User not found',
                message: 'Username is not registered onchain',
            });
        }

        if (userAccount.owner !== ownerPublicKey) {
            return res.status(403).json({
                error: 'Unauthorized',
                message: 'Provided public key does not own this username',
            });
        }

        // Build the close transaction
        const { transaction, blockhash, lastValidBlockHeight } =
            await buildCloseUsernameTransaction(lowerUsername, ownerPublicKey);

        // Serialize transaction (base64)
        const serializedTx = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        }).toString('base64');

        return res.json({
            success: true,
            transaction: serializedTx,
            blockhash,
            lastValidBlockHeight,
        });
    } catch (error) {
        console.error('❌ Build release tx error:', error);
        return res.status(500).json({
            error: 'Build failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/username/release
 * Relays a signed transaction to release/burn a username
 */
router.post('/:name/release', spendingLimitMiddleware, async (req: Request, res: Response) => {
    try {
        const { name } = req.params;
        const { signedTransaction } = req.body;
        const username = name.toLowerCase();

        if (signedTransaction) {
            console.log(`📝 Relaying signed release tx for @${username}...`);
            const signature = await relaySignedTransaction(signedTransaction);

            // Clear encryption key - REDIS REMOVED
            // await deleteEncryptionKey(username);

            return res.json({
                success: true,
                username,
                signature,
                explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
                message: 'Username released! Account closed onchain.',
            });
        }

        // Fallback or error if no signed tx provided (old behavior deprecated)
        return res.status(400).json({
            error: 'Missing transaction',
            message: 'signedTransaction is required',
        });
    } catch (error) {
        if (error instanceof SendTransactionError) {
            const logs = await error.getLogs(connection);
            console.error('❌ Release simulation logs:', logs);
            return res.status(400).json({
                error: 'Release failed',
                message: error.message,
                logs,
            });
        }
        console.error('❌ Release error:', error);
        return res.status(500).json({
            error: 'Release failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
