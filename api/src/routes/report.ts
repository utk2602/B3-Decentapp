import express from 'express';
import { redis } from '../services/redis.js';
import { config } from '../config.js';

const router = express.Router();

// Key prefix for content reports
const REPORT_KEY_PREFIX = 'report:';
const REPORT_TTL = 60 * 60 * 24 * 30; // 30 days in seconds

interface ReportData {
    reporterPubkey: string;
    reportedPubkey: string;
    messageSignature: string;
    reason: string;
    timestamp: number;
    status: 'pending' | 'reviewed';
}

/**
 * Submit a content report
 * POST /api/report
 */
router.post('/', async (req, res) => {
    try {
        const { reporterPubkey, reportedPubkey, messageSignature, reason } = req.body;

        // Validate required fields
        if (!reporterPubkey || !reportedPubkey || !messageSignature || !reason) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        // Validate reason
        const validReasons = ['harassment', 'spam', 'inappropriate', 'illegal', 'scam', 'other'];
        if (!validReasons.includes(reason)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid reason' 
            });
        }

        const reportId = `report:${Date.now()}:${reporterPubkey.slice(0, 8)}`;
        const reportData: ReportData = {
            reporterPubkey,
            reportedPubkey,
            messageSignature,
            reason,
            timestamp: Date.now(),
            status: 'pending'
        };

        // Store report in Redis
        await redis.set(
            `${REPORT_KEY_PREFIX}${reportId}`,
            JSON.stringify(reportData),
            { ex: REPORT_TTL }
        );

        console.log(`🚨 New report: ${reason} - ${reportedPubkey.slice(0, 8)}...`);

        res.json({
            success: true,
            reportId,
            message: 'Report submitted. We will review within 24 hours.'
        });
    } catch (error) {
        console.error('Report submission failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to submit report' 
        });
    }
});

/**
 * Get all pending reports (for admin review)
 * GET /api/report/pending
 * 
 * NOTE: This endpoint is for internal admin use only.
 * In production, this should be protected with authentication.
 */
router.get('/pending', async (req, res) => {
    try {
        // Get all report keys
        const keys = await redis.keys(`${REPORT_KEY_PREFIX}*`);
        const reports: ReportData[] = [];

        for (const key of keys) {
            const data = await redis.get<string>(key);
            if (data) {
                const parsed = JSON.parse(data) as ReportData;
                if (parsed.status === 'pending') {
                    reports.push(parsed);
                }
            }
        }

        res.json({
            success: true,
            count: reports.length,
            reports
        });
    } catch (error) {
        console.error('Failed to fetch reports:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch reports' 
        });
    }
});

/**
 * Mark a report as reviewed (admin endpoint)
 * PUT /api/report/:id/reviewed
 * 
 * NOTE: This endpoint is for internal admin use only.
 * In production, this should be protected with authentication.
 */
router.put('/:id/reviewed', async (req, res) => {
    try {
        const { action } = req.body; // 'block' or 'dismiss'
        const reportKey = `${REPORT_KEY_PREFIX}${req.params.id}`;

        const data = await redis.get<string>(reportKey);
        if (!data) {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }

        const report = JSON.parse(data) as ReportData;

        if (action === 'block') {
            // Block reported user
            await redis.sadd(`blocked:${report.reporterPubkey}`, report.reportedPubkey);
            console.log(`🚫 User blocked due to report: ${report.reportedPubkey.slice(0, 8)}...`);
        }

        // Mark report as reviewed
        report.status = 'reviewed';
        await redis.set(reportKey, JSON.stringify(report), { ex: REPORT_TTL });

        res.json({
            success: true,
            message: 'Report marked as reviewed'
        });
    } catch (error) {
        console.error('Failed to review report:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to review report' 
        });
    }
});

export default router;
