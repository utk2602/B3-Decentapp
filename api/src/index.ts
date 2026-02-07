import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initFeePayer, getFeePayerBalance, connection } from './services/solana.js';
import relayRouter from './routes/relay.js';
import usernameRouter from './routes/username.js';
import configRouter from './routes/config.js';
import messageRouter from './routes/message.js';
import blockRouter from './routes/block.js';
import profileRouter from './routes/profile.js';
import adminRouter from './routes/admin.js';
import receiptsRouter from './routes/receipts.js';
import reportRouter from './routes/report.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', async (_req, res) => {
    const checks: Record<string, { status: string; latency?: number; details?: string }> = {};

    // Solana RPC check
    const rpcStart = Date.now();
    try {
        const slot = await connection.getSlot();
        checks.solana = { status: 'ok', latency: Date.now() - rpcStart, details: `slot ${slot}` };
    } catch (error) {
        checks.solana = { status: 'error', details: error instanceof Error ? error.message : 'Unknown' };
    }

    // Fee payer balance
    try {
        const balance = await getFeePayerBalance();
        checks.feePayer = {
            status: balance >= 0.01 ? 'ok' : 'warning',
            details: `${balance.toFixed(4)} SOL`
        };
    } catch (error) {
        checks.feePayer = { status: 'error', details: error instanceof Error ? error.message : 'Unknown' };
    }

    // Redis check
    const redisStart = Date.now();
    try {
        const { testRedisConnection } = await import('./services/redis.js');
        const isConnected = await testRedisConnection();
        checks.redis = {
            status: isConnected ? 'ok' : 'error',
            latency: Date.now() - redisStart
        };
    } catch (error) {
        checks.redis = { status: 'error', details: error instanceof Error ? error.message : 'Unknown' };
    }

    // Overall status
    const hasError = Object.values(checks).some(c => c.status === 'error');
    const hasWarning = Object.values(checks).some(c => c.status === 'warning');

    res.status(hasError ? 503 : 200).json({
        status: hasError ? 'error' : hasWarning ? 'warning' : 'ok',
        timestamp: new Date().toISOString(),
        version: config.appVersion,
        checks
    });
});

// API Routes
app.use('/api/relay', relayRouter);
app.use('/api/username', usernameRouter);
app.use('/api/config', configRouter);
app.use('/api/message', messageRouter);
app.use('/api/block', blockRouter);
app.use('/api/profile', profileRouter);
app.use('/api/admin', adminRouter);
app.use('/api/receipt', receiptsRouter);
app.use('/api/report', reportRouter);
import contactsRouter from './routes/contacts.js';
app.use('/api/contacts', contactsRouter);
import groupsRouter from './routes/groups.js';
app.use('/api/groups', groupsRouter);
import signalingRouter from './routes/signaling.js';
app.use('/api/signaling', signalingRouter);

// Start server
async function start() {
    console.log('🔑 Key Fee Payer API');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📡 Network: ${config.network}`);
    console.log(`📦 Version: ${config.appVersion} (${config.gitCommit.slice(0, 7)})`);

    // Initialize fee payer
    initFeePayer();

    // Check balance
    try {
        const balance = await getFeePayerBalance();
        console.log(`💰 Fee Payer Balance: ${balance.toFixed(4)} SOL`);

        if (balance < 0.01) {
            console.warn('⚠️  Low balance! Please fund the fee payer wallet');
        }
    } catch (error) {
        console.warn('⚠️  Could not check balance:', error);
    }

    // Start listening - bind to 0.0.0.0 for VPS/Railway
    app.listen(config.port, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${config.port}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Endpoints:');
        console.log(`  GET  /health`);
        console.log(`  GET  /api/config`);
        console.log(`  POST /api/relay`);
        console.log(`  GET  /api/username/:name/check`);
        console.log(`  POST /api/username/register`);
        console.log(`  POST /api/message/send`);
    });
}

start().catch(console.error);
