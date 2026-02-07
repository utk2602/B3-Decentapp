/**
 * Airdrop SOL to the local fee-payer wallet on devnet.
 *
 * Usage:  npx tsx scripts/airdrop.ts [amount_in_sol]
 * Default: 1 SOL
 *
 * Uses smaller amounts to avoid rate-limit issues with the public faucet.
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

async function main() {
  const amount = parseFloat(process.argv[2] || '1');

  // Load keypair from ~/.config/solana/id.json
  const idPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  if (!fs.existsSync(idPath)) {
    console.error('❌ No keypair found. Run: npx tsx scripts/generate-keypair.ts');
    process.exit(1);
  }

  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(idPath, 'utf-8')));
  const keypair = Keypair.fromSecretKey(secretKey);

  console.log(`Wallet : ${keypair.publicKey.toBase58()}`);
  console.log(`Amount : ${amount} SOL`);
  console.log();

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Check current balance
  const balanceBefore = await connection.getBalance(keypair.publicKey);
  console.log(`Balance before: ${(balanceBefore / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Request airdrop (max 2 SOL per request on devnet)
  const lamports = Math.min(amount, 2) * LAMPORTS_PER_SOL;
  console.log(`\n💧 Requesting airdrop of ${lamports / LAMPORTS_PER_SOL} SOL ...`);

  try {
    const sig = await connection.requestAirdrop(keypair.publicKey, lamports);
    console.log(`   TX: ${sig}`);

    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature: sig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    const balanceAfter = await connection.getBalance(keypair.publicKey);
    console.log(`\n✅ Balance after: ${(balanceAfter / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  } catch (err: any) {
    console.error(`\n⚠️  Airdrop failed: ${err.message}`);
    console.log('\nAlternatives:');
    console.log(`  1. Visit https://faucet.solana.com and paste your public key:`);
    console.log(`     ${keypair.publicKey.toBase58()}`);
    console.log(`  2. Wait a moment and run this script again`);
  }
}

main().catch(console.error);
