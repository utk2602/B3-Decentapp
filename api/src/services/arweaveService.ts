import { Solana } from '@irys/upload-solana';
import { config } from '../config.js';

// Using any type for Irys client as the SDK types are complex
let irysClient: any = null;

/**
 * Initialize Irys client with fee payer key
 */
async function getIrysClient(): Promise<any> {
    if (irysClient) return irysClient;

    console.log('🌐 Initializing Irys client for Arweave uploads...');
    console.log('📡 Using RPC:', config.solanaRpcUrl);

    // Dynamic import to avoid ESM issues
    const { Uploader } = await import('@irys/upload');

    // Create Irys uploader with Solana wallet and devnet RPC
    const irysUploader = await Uploader(Solana)
        .withWallet(config.feePayerPrivateKey)
        .withRpc(config.solanaRpcUrl)
        .devnet(); // Use devnet for testing; remove .devnet() for mainnet

    irysClient = irysUploader;
    console.log('✅ Irys client initialized');

    return irysClient;
}

/**
 * Upload encrypted data to Arweave via Irys
 * @param data - The encrypted data string to upload
 * @returns Arweave transaction ID
 */
export async function uploadToArweave(data: string): Promise<string> {
    const client = await getIrysClient();

    // Convert string to buffer
    const dataBuffer = Buffer.from(data, 'utf-8');

    // Check price and fund if needed
    const price = await client.getPrice(dataBuffer.length);
    const balance = await client.getBalance();

    console.log(`💰 Irys balance: ${balance.toString()}, price: ${price.toString()}`);

    if (balance.lt(price)) {
        console.log(`💸 Funding Irys account...`);
        // Fund 20% extra for safety margin - must be integer
        const fundAmount = price.multipliedBy(1.2).integerValue();
        await client.fund(fundAmount);
    }

    // Upload data
    const receipt = await client.upload(dataBuffer, {
        tags: [
            { name: 'Content-Type', value: 'text/plain' },
            { name: 'App-Name', value: 'KeyMessage' },
            { name: 'Type', value: 'encrypted-message' },
        ],
    });

    console.log(`✅ Uploaded to Arweave: ${receipt.id}`);
    return receipt.id;
}

/**
 * Get Arweave gateway URL for a transaction ID
 */
export function getArweaveUrl(txId: string): string {
    return `https://arweave.net/${txId}`;
}
