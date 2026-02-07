
import { redis, testRedisConnection } from '../src/services/redis';

async function flushRedis() {
    console.log('🧹 Flushing Redis database...');
    console.log('Redis URL:', process.env.UPSTASH_REDIS_REST_URL ? 'Defined' : 'Missing');

    // Test connection first
    const isConnected = await testRedisConnection();
    if (!isConnected) {
        console.error('❌ Could not connect to Upstash Redis. Check credentials.');
        process.exit(1);
    }

    try {
        await redis.flushdb();
        console.log('✅ Redis database flushed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to flush Redis:', error);
        process.exit(1);
    }
}

flushRedis();
