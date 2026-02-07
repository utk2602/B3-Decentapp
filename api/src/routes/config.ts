import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

/**
 * GET /api/config
 * Returns full app configuration for bootstrapping
 */
router.get('/', (_req, res) => {
    res.json({
        network: config.network,
        version: config.appVersion,
        commit: config.gitCommit,
        githubUrl: config.githubUrl,
        rpcUrl: config.network === 'mainnet-beta'
            ? 'https://api.mainnet-beta.solana.com'
            : 'https://api.devnet.solana.com',
    });
});

/**
 * GET /api/config/network
 * Returns current network only
 */
router.get('/network', (_req, res) => {
    res.json({
        network: config.network,
        rpcUrl: config.solanaRpcUrl,
    });
});

/**
 * GET /api/config/version
 * Returns version and git commit
 */
router.get('/version', (_req, res) => {
    res.json({
        version: config.appVersion,
        commit: config.gitCommit,
        buildTime: new Date().toISOString(),
    });
});

export default router;
