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
                    // console.log(`✅ Redis Pool ${idx + 1} configured`);
                } catch (err) {
                    console.error(`❌ Failed to configure Redis ${idx + 1}:`, err.message);
                }
            });
        }

        // Fallback to mock if no connections succeeded
        if (this.connections.length === 0) {
            // console.log('⚠️  All Redis connections failed - using Mock Redis');
            this.connections.push(new MockRedis());
            this.connectionStats.push({ requests: 0, errors: 0, name: 'mock' });
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
     * Get the next connection using round-robin with health check
     */
    _getConnection() {
        if (!this.isInitialized) this.initialize();

        // Find a healthy connection using round-robin
        const startIndex = this.currentIndex;
        let attempts = 0;

        do {
            const conn = this.connections[this.currentIndex];
            const stats = this.connectionStats[this.currentIndex];

            this.currentIndex = (this.currentIndex + 1) % this.connections.length;
            attempts++;

            // Return if healthy or if we've tried all connections
            if (stats.healthy || attempts >= this.connections.length) {
                stats.requests++;
                return { connection: conn, index: this.currentIndex };
            }
        } while (this.currentIndex !== startIndex);

        // Fallback to first connection
        this.connectionStats[0].requests++;
        return { connection: this.connections[0], index: 0 };
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
            }

            // Try another connection if available
            if (this.connections.length > 1) {
                const fallback = this.connections.find((_, i) =>
                    i !== index && this.connectionStats[i]?.healthy
                );
                if (fallback) {
                    try {
                        return await fallback[command](...args);
                    } catch (fallbackErr) {
                        throw fallbackErr;
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
        return {
            totalConnections: this.connections.length,
            connections: this.connectionStats.map((stats, idx) => ({
                ...stats,
                index: idx
            })),
            totalRequests: this.connectionStats.reduce((sum, s) => sum + s.requests, 0),
            totalErrors: this.connectionStats.reduce((sum, s) => sum + s.errors, 0)
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
