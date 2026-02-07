import pino from 'pino';
import { config } from '../config.js';

// Create base logger with structured JSON output
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
        level: (label) => ({ level: label }),
        bindings: () => ({ service: 'key-api', version: config.appVersion }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Use pino-pretty in development
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
});

// Request ID generator
let requestCounter = 0;
export function generateRequestId(): string {
    return `${Date.now().toString(36)}-${(requestCounter++).toString(36)}`;
}

// Create child logger with request context
export function createRequestLogger(requestId: string) {
    return logger.child({ requestId });
}

export default logger;
