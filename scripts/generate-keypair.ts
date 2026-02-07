/**
 * Generate a Solana keypair for local development (fee payer).
 *
 * Usage:
 *   npx tsx scripts/generate-keypair.ts
 *
 * This will:
 *  1. Generate a new Ed25519 keypair
 *  2. Print the public key and base58 private key
 *  3. Write the secret-key JSON to ~/.config/solana/id.json (Anchor default)
 *  4. Output a line you can paste into api/.env
 */

import { Keypair, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function main() {
  // --- 1. Generate keypair ---
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKeyBs58 = bs58.encode(keypair.secretKey);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑  New Solana Keypair Generated');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Public Key  : ${publicKey}`);
  console.log(`Private Key : ${privateKeyBs58}`);
  console.log();

  // --- 2. Save as Solana CLI compatible JSON ---
  const solanaDir = path.join(os.homedir(), '.config', 'solana');
  const idPath = path.join(solanaDir, 'id.json');

  if (!fs.existsSync(solanaDir)) {
    fs.mkdirSync(solanaDir, { recursive: true });
  }

  // Write as JSON byte-array (Solana CLI format)
  fs.writeFileSync(idPath, JSON.stringify(Array.from(keypair.secretKey)));
  console.log(`✅ Saved to ${idPath}`);

  // --- 3. Write/update api/.env ---
  const apiEnvPath = path.join(__dirname, '..', 'api', '.env');
  let envContent = '';

  if (fs.existsSync(apiEnvPath)) {
    envContent = fs.readFileSync(apiEnvPath, 'utf-8');
    // Replace existing FEE_PAYER_PRIVATE_KEY line
    if (envContent.includes('FEE_PAYER_PRIVATE_KEY=')) {
      envContent = envContent.replace(
        /FEE_PAYER_PRIVATE_KEY=.*/,
        `FEE_PAYER_PRIVATE_KEY=${privateKeyBs58}`
      );
    } else {
      envContent += `\nFEE_PAYER_PRIVATE_KEY=${privateKeyBs58}\n`;
    }
    fs.writeFileSync(apiEnvPath, envContent);
  }
  console.log(`✅ Updated api/.env with FEE_PAYER_PRIVATE_KEY`);

  // --- 4. Request devnet airdrop ---
  console.log();
  console.log('💧 Requesting devnet airdrop of 2 SOL ...');
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  try {
    const sig = await connection.requestAirdrop(
      keypair.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    console.log(`   Signature: ${sig}`);

    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature: sig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`   ✅ Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  } catch (err: any) {
    console.warn(`   ⚠️  Airdrop failed (rate-limited?): ${err.message}`);
    console.log('   You can retry manually:');
    console.log(`     npx tsx scripts/generate-keypair.ts`);
    console.log(`   Or use the Solana faucet: https://faucet.solana.com`);
  }

  // --- 5. Summary ---
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Paste this into api/.env :');
  console.log(`   FEE_PAYER_PRIVATE_KEY=${privateKeyBs58}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);
