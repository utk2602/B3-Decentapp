import dotenv from 'dotenv';
dotenv.config();

export const config = {
    // Solana Network
    network: (process.env.NETWORK || 'devnet') as 'devnet' | 'mainnet-beta',
    solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    feePayerPrivateKey: process.env.FEE_PAYER_PRIVATE_KEY || '',

    // Server
    port: parseInt(process.env.PORT || '3000', 10),

    // App Version Info
    appVersion: process.env.APP_VERSION || '1.0.0',
    gitCommit: process.env.GIT_COMMIT || 'development',
    githubUrl: process.env.GITHUB_URL || 'https://github.com/serpepe/KeyApp',

    // Rate limiting: 1 message per 2 seconds by default
    rateLimit: {
        points: parseInt(process.env.RATE_LIMIT_POINTS || '1', 10),
        duration: parseInt(process.env.RATE_LIMIT_DURATION || '2', 10),
    },

    // Spending Limits (Security)
    spendingLimits: {
        maxLamportsPerTx: 5000,           // Max cost per single transaction (0.000005 SOL)
        maxDailySolPerUser: 0.01,         // Max SOL a user can consume per day (~100 txs)
        minFeePayerBalance: 0.1,          // Minimum balance before warning/rejecting
    },
};
