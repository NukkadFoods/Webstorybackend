/**
 * 🔴 Redis Load Balancer - Distributes requests across multiple Upstash instances
 * Doubles free tier limits (500K + 500K = 1M requests/month)
 */

const IORedis = require('ioredis');

class RedisLoadBalancer {
    constructor() {
        this.connections = [];
        this.currentIndex = 0;
        this.connectionStats = [];
        this.isInitialized = false;
        // Daily request tracking (Upstash free tier: ~10K commands/day)
        this.DAILY_LIMIT_PER_INSTANCE = 9000; // Leave buffer below 10K
        this.dailyRequests = [];
        this.lastResetDate = new Date().toDateString();
    }

    /**
     * Reset daily counters at midnight
     */
    _checkDailyReset() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            console.log('🔄 Resetting daily Redis request counters');
            this.dailyRequests = this.dailyRequests.map(() => 0);
            this.lastResetDate = today;
            // Also reset dead status - give instances a fresh chance
            this.connectionStats.forEach(stats => {
                if (stats.dead && stats.name !== 'mock') {
                    stats.dead = false;
                    stats.healthy = true;
                    console.log(`✅ ${stats.name} reset for new day`);
                }
            });
        }
    }

    /**
     * Initialize connections from environment variables
     * Supports REDIS_URL, REDIS_URL_2, REDIS_URL_3, etc.
     */
    initialize() {
        if (this.isInitialized) return;

        // Check if Redis is disabled for local development
        if (process.env.REDIS_DISABLED === 'true') {
            // console.log('🔌 Redis DISABLED - using Mock Redis (in-memory)');
            // console.log('   Set REDIS_DISABLED=false when Upstash limits reset');
            this.connections.push(new MockRedis());
            this.connectionStats.push({ requests: 0, errors: 0, name: 'mock', healthy: true });
            this.isInitialized = true;
            return;
        }

        const redisUrls = this._getRedisUrls();

        if (redisUrls.length === 0) {
            // console.log('⚠️  No Redis URLs found - using Mock Redis');
            this.connections.push(new MockRedis());
            this.connectionStats.push({ requests: 0, errors: 0, name: 'mock', healthy: true });
            this.dailyRequests.push(0);
        } else {
            redisUrls.forEach((url, idx) => {
                try {
                    const conn = this._createConnection(url, idx);
                    this.connections.push(conn);
                    this.connectionStats.push({
                        requests: 0,
                        errors: 0,
                        name: `redis-${idx + 1}`,
                        healthy: true
                    });
                    this.dailyRequests.push(0);
                    console.log(`✅ Redis Pool ${idx + 1} configured (daily limit: ${this.DAILY_LIMIT_PER_INSTANCE})`);
                } catch (err) {
                    console.error(`❌ Failed to configure Redis ${idx + 1}:`, err.message);
                }
            });
        }

        // Fallback to mock if no connections succeeded
        if (this.connections.length === 0) {
            // console.log('⚠️  All Redis connections failed - using Mock Redis');
            this.connections.push(new MockRedis());
            this.connectionStats.push({ requests: 0, errors: 0, name: 'mock', healthy: true });
            this.dailyRequests.push(0);
        }

        this.isInitialized = true;
        // console.log(`🔄 Redis Load Balancer initialized with ${this.connections.length} connection(s)`);
    }

    _getRedisUrls() {
        const urls = [];

        // Primary URL
        if (process.env.REDIS_URL) {
            urls.push(process.env.REDIS_URL);
        }

        // Additional URLs (REDIS_URL_2, REDIS_URL_3, etc.)
        for (let i = 2; i <= 10; i++) {
            const url = process.env[`REDIS_URL_${i}`];
            if (url) urls.push(url);
        }

        return urls;
    }

    _createConnection(url, index) {
        // Convert redis:// to rediss:// for TLS if using upstash
        const redisUrl = url.includes('upstash.io')
            ? url.replace('redis://', 'rediss://')
            : url;

        const conn = new IORedis(redisUrl, {
            maxRetriesPerRequest: null, // Required for BullMQ compatibility
            enableReadyCheck: false,
            connectTimeout: 10000,
            retryStrategy(times) {
                if (times > 5) return null; // Stop retrying after 5 attempts
                return Math.min(times * 200, 3000);
            },
            tls: url.includes('upstash.io') ? { rejectUnauthorized: false } : undefined,
        });

        conn.on('error', (err) => {
            if (!err.message.includes('ECONNRESET')) {
                console.error(`🔴 Redis-${index + 1} Error:`, err.message);
                if (this.connectionStats[index]) {
                    this.connectionStats[index].errors++;
                    // Mark as DEAD if limit exceeded (won't recover this billing cycle)
                    if (err.message.includes('max requests limit exceeded')) {
                        this.connectionStats[index].healthy = false;
                        this.connectionStats[index].dead = true;
                        // console.log(`💀 Redis-${index + 1} marked as DEAD (limit exceeded)`);
                    } else {
                        this.connectionStats[index].healthy = false;
                    }
                }
            }
        });

        conn.on('ready', () => {
            if (this.connectionStats[index] && !this.connectionStats[index].dead) {
                this.connectionStats[index].healthy = true;
            }
        });

        return conn;
    }

    /**
     * Get the next connection using smart load balancing:
     * 1. Check daily reset
     * 2. Skip instances at daily limit
     * 3. Prefer instance with fewer daily requests (least-used first)
     */
    _getConnection() {
        if (!this.isInitialized) this.initialize();

        // Reset daily counters if new day
        this._checkDailyReset();

        // Find the best available connection
        let bestIndex = -1;
        let lowestUsage = Infinity;

        for (let i = 0; i < this.connections.length; i++) {
            const stats = this.connectionStats[i];
            const dailyCount = this.dailyRequests[i] || 0;

            // Skip dead or unhealthy connections
            if (stats.dead || !stats.healthy) continue;

            // Skip if at daily limit (unless it's mock which has no limit)
            if (stats.name !== 'mock' && dailyCount >= this.DAILY_LIMIT_PER_INSTANCE) {
                console.log(`⚠️ ${stats.name} at daily limit (${dailyCount}/${this.DAILY_LIMIT_PER_INSTANCE}), skipping`);
                continue;
            }

            // Prefer the connection with lowest daily usage
            if (dailyCount < lowestUsage) {
                lowestUsage = dailyCount;
                bestIndex = i;
            }
        }

        // If no connection found, use mock or first available
        if (bestIndex === -1) {
            console.warn('⚠️ All Redis instances exhausted or unhealthy, using fallback');
            // Try to find mock or any connection
            bestIndex = this.connectionStats.findIndex(s => s.name === 'mock');
            if (bestIndex === -1) bestIndex = 0;
        }

        // Update counters
        this.connectionStats[bestIndex].requests++;
        this.dailyRequests[bestIndex] = (this.dailyRequests[bestIndex] || 0) + 1;

        return { connection: this.connections[bestIndex], index: bestIndex };
    }

    /**
     * Execute a Redis command with automatic failover
     */
    async _execute(command, ...args) {
        const { connection, index } = this._getConnection();

        try {
            const result = await connection[command](...args);
            return result;
        } catch (err) {
            // Mark connection as unhealthy
            if (this.connectionStats[index]) {
                this.connectionStats[index].errors++;
                this.connectionStats[index].healthy = false;

                // If rate limited, mark as dead and max out daily counter
                if (err.message && err.message.includes('max requests limit exceeded')) {
                    this.connectionStats[index].dead = true;
                    this.dailyRequests[index] = this.DAILY_LIMIT_PER_INSTANCE;
                    console.error(`💀 Redis-${index + 1} rate limited - marked as exhausted for today`);
                }
            }

            // Try another connection if available
            if (this.connections.length > 1) {
                for (let i = 0; i < this.connections.length; i++) {
                    if (i === index) continue;
                    const stats = this.connectionStats[i];
                    const dailyCount = this.dailyRequests[i] || 0;

                    // Skip if dead, unhealthy, or at limit
                    if (stats.dead || !stats.healthy) continue;
                    if (stats.name !== 'mock' && dailyCount >= this.DAILY_LIMIT_PER_INSTANCE) continue;

                    try {
                        this.dailyRequests[i] = dailyCount + 1;
                        return await this.connections[i][command](...args);
                    } catch (fallbackErr) {
                        // Mark this one as failed too
                        stats.errors++;
                        if (fallbackErr.message?.includes('max requests limit exceeded')) {
                            stats.dead = true;
                            this.dailyRequests[i] = this.DAILY_LIMIT_PER_INSTANCE;
                        }
                    }
                }
            }

            throw err;
        }
    }

    // Redis command proxies
    async get(key) { return this._execute('get', key); }
    async set(key, value, ...args) { return this._execute('set', key, value, ...args); }
    async setex(key, seconds, value) { return this._execute('setex', key, seconds, value); }
    async del(...keys) { return this._execute('del', ...keys); }
    async keys(pattern) { return this._execute('keys', pattern); }
    async exists(key) { return this._execute('exists', key); }
    async ttl(key) { return this._execute('ttl', key); }
    async ping() { return this._execute('ping'); }
    async incr(key) { return this._execute('incr', key); }
    async expire(key, seconds) { return this._execute('expire', key, seconds); }
    async hget(key, field) { return this._execute('hget', key, field); }
    async hset(key, field, value) { return this._execute('hset', key, field, value); }
    async hgetall(key) { return this._execute('hgetall', key); }

    /**
     * Get a raw connection (for BullMQ which needs direct access)
     * Tests connection with ping, skips dead/failing ones
     */
    getRawConnection() {
        if (!this.isInitialized) this.initialize();

        // Find first working connection by testing each
        for (let idx = 0; idx < this.connections.length; idx++) {
            const stats = this.connectionStats[idx];

            // Skip known dead connections
            if (stats.dead) {
                // console.log(`⏭️ Skipping dead Redis-${idx + 1}`);
                continue;
            }

            // This connection is candidate
            // console.log(`📍 Selecting Redis-${idx + 1} for BullMQ`);
            return this.connections[idx];
        }

        // All dead - return first anyway (will error but that's expected)
        // console.warn('⚠️ All Redis connections exhausted');
        return this.connections[0];
    }

    /**
     * Async version that tests with ping before returning
     */
    async getRawConnectionAsync() {
        if (!this.isInitialized) this.initialize();

        for (let idx = 0; idx < this.connections.length; idx++) {
            const stats = this.connectionStats[idx];
            const conn = this.connections[idx];

            if (stats.dead) {
                // console.log(`⏭️ Skipping dead Redis-${idx + 1}`);
                continue;
            }

            // Test with ping
            try {
                await conn.ping();
                // console.log(`✅ Redis-${idx + 1} ping successful, using for BullMQ`);
                return conn;
            } catch (err) {
                // console.log(`❌ Redis-${idx + 1} ping failed: ${err.message}`);
                stats.healthy = false;
                if (err.message.includes('max requests limit exceeded')) {
                    stats.dead = true;
                }
            }
        }

        // console.warn('⚠️ All Redis connections failed ping test');
        return this.connections[0];
    }

    /**
     * Get load balancer statistics
     */
    getStats() {
        this._checkDailyReset();
        return {
            totalConnections: this.connections.length,
            dailyLimit: this.DAILY_LIMIT_PER_INSTANCE,
            connections: this.connectionStats.map((stats, idx) => ({
                ...stats,
                index: idx,
                dailyRequests: this.dailyRequests[idx] || 0,
                dailyRemaining: this.DAILY_LIMIT_PER_INSTANCE - (this.dailyRequests[idx] || 0),
                atLimit: (this.dailyRequests[idx] || 0) >= this.DAILY_LIMIT_PER_INSTANCE
            })),
            totalRequests: this.connectionStats.reduce((sum, s) => sum + s.requests, 0),
            totalErrors: this.connectionStats.reduce((sum, s) => sum + s.errors, 0),
            totalDailyRequests: this.dailyRequests.reduce((sum, r) => sum + r, 0)
        };
    }

    /**
     * Gracefully close all connections
     */
    async quit() {
        await Promise.all(this.connections.map(conn => {
            if (conn.quit) return conn.quit();
            return Promise.resolve();
        }));
    }

    // Event handlers (for compatibility)
    on(event, handler) {
        this.connections.forEach(conn => {
            if (conn.on) conn.on(event, handler);
        });
    }
}

// Mock Redis for fallback
class MockRedis {
    constructor() {
        this.store = new Map();
        // console.log('⚠️  Using Mock Redis (in-memory)');
    }

    async get(key) { return this.store.get(key) || null; }
    async set(key, value) { this.store.set(key, value); return 'OK'; }
    async setex(key, seconds, value) {
        this.store.set(key, value);
        setTimeout(() => this.store.delete(key), seconds * 1000);
        return 'OK';
    }
    async del(...keys) { keys.forEach(k => this.store.delete(k)); return keys.length; }
    async keys(pattern) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Array.from(this.store.keys()).filter(k => regex.test(k));
    }
    async exists(key) { return this.store.has(key) ? 1 : 0; }
    async ttl(key) { return -1; }
    async ping() { return 'PONG'; }
    async quit() { this.store.clear(); }
    async incr(key) {
        const val = parseInt(this.store.get(key) || '0', 10) + 1;
        this.store.set(key, String(val));
        return val;
    }
    async expire() { return 1; }
    async hget(key, field) {
        const hash = this.store.get(key);
        return hash?.[field] || null;
    }
    async hset(key, field, value) {
        const hash = this.store.get(key) || {};
        hash[field] = value;
        this.store.set(key, hash);
        return 1;
    }
    async hgetall(key) { return this.store.get(key) || {}; }
    on() { }
}

// Export singleton instance
const loadBalancer = new RedisLoadBalancer();
module.exports = loadBalancer;
