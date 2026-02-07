import {
    Connection,
    Keypair,
    Transaction,
    VersionedTransaction,
    sendAndConfirmTransaction,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from '../config.js';

// Program ID from deployed Anchor program
const PROGRAM_ID = new PublicKey('96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ');

// Initialize connection to Solana
export const connection = new Connection(config.solanaRpcUrl, 'confirmed');

// Fee payer wallet - this pays for all transactions
let feePayerKeypair: Keypair | null = null;

export function initFeePayer(): Keypair {
    if (!config.feePayerPrivateKey) {
        // Generate a new keypair for development
        console.warn('⚠️  No FEE_PAYER_PRIVATE_KEY set, generating temporary keypair');
        feePayerKeypair = Keypair.generate();
        console.log('Fee Payer Address:', feePayerKeypair.publicKey.toBase58());
        return feePayerKeypair;
    }

    try {
        const secretKey = bs58.decode(config.feePayerPrivateKey);
        feePayerKeypair = Keypair.fromSecretKey(secretKey);
        console.log('✅ Fee Payer loaded:', feePayerKeypair.publicKey.toBase58());
        return feePayerKeypair;
    } catch (error) {
        throw new Error('Invalid FEE_PAYER_PRIVATE_KEY');
    }
}

export function getFeePayer(): Keypair {
    if (!feePayerKeypair) {
        throw new Error('Fee payer not initialized');
    }
    return feePayerKeypair;
}

/**
 * Get the PDA for a username
 */
export function getUsernamePDA(username: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('username'), Buffer.from(username.toLowerCase())],
        PROGRAM_ID
    );
}

/**
 * Check if a username is available (checks if PDA exists)
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
    const [pda] = getUsernamePDA(username);
    const accountInfo = await connection.getAccountInfo(pda);
    return accountInfo === null; // Available if account doesn't exist
}

/**
 * Get user account data from onchain (raw account parsing)
 */
export async function getUserAccount(username: string): Promise<{
    owner: string;
    username: string;
    createdAt: number;
    bump: number;
    encryptionKey: string; // Base64 encoded
} | null> {
    try {
        const [pda] = getUsernamePDA(username);
        const accountInfo = await connection.getAccountInfo(pda);

        if (!accountInfo) {
            return null;
        }

        // Parse the account data (Anchor format: 8-byte discriminator + data)
        const data = accountInfo.data;

        // Skip 8-byte discriminator
        let offset = 8;

        // Owner (32 bytes)
        const owner = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;

        // Username (4 bytes length + string)
        const usernameLen = data.readUInt32LE(offset);
        offset += 4;
        const usernameStr = data.slice(offset, offset + usernameLen).toString('utf-8');
        offset += usernameLen;

        // Created at (8 bytes i64)
        const createdAt = Number(data.readBigInt64LE(offset));
        offset += 8;

        // Bump (1 byte)
        const bump = data.readUInt8(offset);
        offset += 1;

        // Encryption Key (32 bytes)
        // If account data is too short (old account), return empty or handle error
        // But for now assuming clean environment or new accounts
        const encryptionKeyBuf = data.slice(offset, offset + 32);
        const encryptionKey = encryptionKeyBuf.length === 32
            ? encryptionKeyBuf.toString('base64')
            : '';

        return {
            owner,
            username: usernameStr,
            createdAt,
            bump,
            encryptionKey,
        };
    } catch (error) {
        console.error('Error fetching user account:', error);
        return null;
    }
}

/**
 * Lookup a username by owner public key (for account recovery)
 */
export async function findUserByOwner(ownerPubkey: string): Promise<{
    owner: string;
    username: string;
    createdAt: number;
    bump: number;
    encryptionKey: string;
} | null> {
    try {
        const owner = new PublicKey(ownerPubkey);
        const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 8, // discriminator
                        bytes: owner.toBase58(),
                    },
                },
            ],
        });

        if (accounts.length === 0) return null;

        const data = accounts[0].account.data as Buffer;

        let offset = 8;
        const ownerKey = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;
        const usernameLen = data.readUInt32LE(offset);
        offset += 4;
        const usernameStr = data.slice(offset, offset + usernameLen).toString('utf-8');
        offset += usernameLen;
        const createdAt = Number(data.readBigInt64LE(offset));
        offset += 8;
        const bump = data.readUInt8(offset);
        offset += 1;

        const encryptionKeyBuf = data.slice(offset, offset + 32);
        const encryptionKey = encryptionKeyBuf.length === 32
            ? encryptionKeyBuf.toString('base64')
            : '';

        return {
            owner: ownerKey,
            username: usernameStr,
            createdAt,
            bump,
            encryptionKey,
        };
    } catch (error) {
        console.error('Error finding user by owner:', error);
        return null;
    }
}

/**
 * Build the instruction data for registerUsername
 * Anchor discriminator + borsh-serialized args
 */
function buildRegisterUsernameData(username: string, encryptionKey: Buffer): Buffer {
    // Anchor discriminator for "register_username" 
    // = first 8 bytes of sha256('global:register_username')
    const discriminator = Buffer.from([0x86, 0x36, 0x7b, 0xb5, 0x1c, 0x97, 0x24, 0x00]);

    // Borsh serialize the username string: 4-byte length + utf8 bytes
    const usernameBytes = Buffer.from(username.toLowerCase());
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(usernameBytes.length);

    // Encryption Key: 32 bytes
    if (!encryptionKey || encryptionKey.length !== 32) {
        throw new Error('Encryption key must be 32 bytes');
    }

    return Buffer.concat([discriminator, lengthBuf, usernameBytes, encryptionKey]);
}

/**
 * Register a username onchain
 * The fee payer pays for the transaction and account creation
 * 
 * Note: For proper implementation, the owner would sign client-side.
 * Here, fee payer becomes the owner for simplicity.
 * 
 * @param username - The username to register
 * @param ownerPubkey - The owner's public key (currently ignored, fee payer is used)
 * @returns Transaction signature
 */
export async function registerUsernameOnChain(
    username: string,
    _ownerPubkey: string, // Ignored for now
    encryptionKey: string // Base64 encoded
): Promise<string> {
    const feePayer = getFeePayer();
    const [userAccountPDA, bump] = getUsernamePDA(username);

    console.log(`📝 Registering @${username} onchain...`);
    console.log(`   PDA: ${userAccountPDA.toBase58()}`);
    console.log(`   Owner/Payer: ${feePayer.publicKey.toBase58()}`);

    // 8 (discriminator) + 32 (owner) + 4+20 (username string) + 8 (created_at) + 1 (bump) + 32 (encryption_key)
    const space = 8 + 32 + 4 + 20 + 8 + 1 + 32;
    const lamports = await connection.getMinimumBalanceForRentExemption(space);

    const encryptionKeyBuf = Buffer.from(encryptionKey, 'base64');
    const instructionData = buildRegisterUsernameData(username, encryptionKeyBuf);

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: userAccountPDA, isSigner: false, isWritable: true },
            { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // Sign and send
    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayer],
        { commitment: 'confirmed' }
    );

    console.log(`✅ Username @${username} registered: ${signature}`);
    return signature;
}

/**
 * Build a transaction for username registration (user will sign)
 * This is the production-ready flow where the USER owns the username
 * 
 * @param username - The username to register
 * @param ownerPubkey - The owner's public key (user's pubkey)
 * @returns Unsigned transaction and blockhash info
 */
export async function buildRegisterUsernameTransaction(
    username: string,
    ownerPubkey: string,
    encryptionKey: string // Base64 encoded
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const owner = new PublicKey(ownerPubkey);
    const [userAccountPDA] = getUsernamePDA(username);

    console.log(`📦 Building registration tx for @${username}...`);
    console.log(`   Owner: ${ownerPubkey.slice(0, 8)}...`);
    console.log(`   Fee Payer: ${feePayer.publicKey.toBase58().slice(0, 8)}...`);
    console.log(`   PDA: ${userAccountPDA.toBase58()}`);

    const encryptionKeyBuf = Buffer.from(encryptionKey, 'base64');
    const instructionData = buildRegisterUsernameData(username, encryptionKeyBuf);

    // Calculate rent for the PDA account
    const accountSpace = 8 + 32 + 4 + 20 + 8 + 1 + 32; // discriminator + struct
    const pdaRentLamports = await connection.getMinimumBalanceForRentExemption(accountSpace);

    // Owner account must ALSO remain rent-exempt after paying for PDA creation
    // A standard 0-data account requires ~890880 lamports to be rent-exempt
    const ownerRentExempt = await connection.getMinimumBalanceForRentExemption(0);

    // Total = PDA rent + owner rent-exempt minimum + small buffer
    // This ensures the owner has enough to pay for PDA AND stay rent-exempt
    const totalFunding = pdaRentLamports + ownerRentExempt + 100_000;

    console.log(`   PDA rent: ${pdaRentLamports} lamports`);
    console.log(`   Owner rent-exempt: ${ownerRentExempt} lamports`);
    console.log(`   Total funding: ${totalFunding} lamports (~${(totalFunding / 1e9).toFixed(4)} SOL)`);

    const fundOwnerInstruction = SystemProgram.transfer({
        fromPubkey: feePayer.publicKey,
        toPubkey: owner,
        lamports: totalFunding,
    });

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: userAccountPDA, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: true }, // User is owner and signer
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    // Fund owner first so the register instruction can allocate the account
    const transaction = new Transaction().add(fundOwnerInstruction, instruction);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Relay a user-signed transaction by adding fee payer signature
 * @param serializedTx - Base64 encoded user-signed transaction
 * @returns Transaction signature
 */
export async function relaySignedTransaction(serializedTx: string): Promise<string> {
    const feePayer = getFeePayer();

    // Decode the transaction
    const txBuffer = Buffer.from(serializedTx, 'base64');
    const transaction = Transaction.from(txBuffer);

    console.log(`📤 Relaying user-signed transaction...`);

    // Ensure fee payer matches what we expect (do not mutate the message)
    if (transaction.feePayer && !transaction.feePayer.equals(feePayer.publicKey)) {
        throw new Error('Fee payer mismatch in transaction');
    }
    transaction.feePayer = feePayer.publicKey;

    // Require the user/owner signature to be present before relaying
    const missingOwnerSignature = transaction.signatures.some(
        (sig) => !sig.publicKey.equals(feePayer.publicKey) && !sig.signature
    );
    if (missingOwnerSignature) {
        throw new Error('Missing owner signature');
    }

    // Add fee payer signature (user already signed)
    transaction.partialSign(feePayer);

    // Serialize and relay without re-signing (avoids wiping user signature)
    const rawTx = transaction.serialize({ requireAllSignatures: true });
    const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction(signature, 'confirmed');

    console.log(`✅ Transaction relayed: ${signature}`);
    return signature;
}

/**
 * Legacy relay function (for backwards compatibility)
 */
export async function relayTransaction(serializedTx: string): Promise<string> {
    return relaySignedTransaction(serializedTx);
}

/**
 * Get balance of fee payer
 */
export async function getFeePayerBalance(): Promise<number> {
    const feePayer = getFeePayer();
    const balance = await connection.getBalance(feePayer.publicKey);
    return balance / 1e9; // Convert lamports to SOL
}

/**
 * Build the instruction data for closeAccount
 * Anchor discriminator + borsh-serialized args
 */
function buildCloseAccountData(username: string): Buffer {
    // Anchor discriminator for "close_account" 
    // = first 8 bytes of sha256('global:close_account')
    const discriminator = Buffer.from([0x7d, 0xff, 0x95, 0x0e, 0x6e, 0x22, 0x48, 0x18]);

    // Borsh serialize the username string: 4-byte length + utf8 bytes
    const usernameBytes = Buffer.from(username.toLowerCase());
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(usernameBytes.length);

    return Buffer.concat([discriminator, lengthBuf, usernameBytes]);
}

/**
 * Close/release a username account onchain
 * This deletes the account and returns rent to the owner
 * 
 * Note: For proper implementation, the owner would sign client-side.
 * Here, fee payer (as owner) closes the account.
 * 
 * @param username - The username to close
 * @returns Transaction signature
 */
export async function closeUsernameOnChain(username: string): Promise<string> {
    const feePayer = getFeePayer();
    const [userAccountPDA] = getUsernamePDA(username);

    console.log(`🗑️ Closing account for @${username}...`);
    console.log(`   PDA: ${userAccountPDA.toBase58()}`);
    console.log(`   Owner: ${feePayer.publicKey.toBase58()}`);

    const instructionData = buildCloseAccountData(username);

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: userAccountPDA, isSigner: false, isWritable: true },
            { pubkey: feePayer.publicKey, isSigner: true, isWritable: true },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    // Sign and send
    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [feePayer],
        { commitment: 'confirmed' }
    );

    console.log(`✅ Username @${username} account closed: ${signature}`);
    return signature;
}

/**
 * Build a transaction for closing a username account (user will sign)
 * 
 * @param username - The username to close
 * @param ownerPubkey - The owner's public key
 * @returns Unsigned transaction and blockhash info
 */
export async function buildCloseUsernameTransaction(
    username: string,
    ownerPubkey: string
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const owner = new PublicKey(ownerPubkey);
    const [userAccountPDA] = getUsernamePDA(username);

    console.log(`📦 Building close tx for @${username}...`);
    console.log(`   Owner: ${ownerPubkey}`);
    console.log(`   PDA: ${userAccountPDA.toBase58()}`);

    const instructionData = buildCloseAccountData(username);

    const instruction = new TransactionInstruction({
        keys: [
            { pubkey: userAccountPDA, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: true }, // User must sign
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}
