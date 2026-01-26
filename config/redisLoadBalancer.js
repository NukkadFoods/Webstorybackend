/**
 * 🔴 Redis Load Balancer - Distributes requests across multiple Upstash instances
 * Uses REST API for better serverless compatibility
 * Supports 4 instances for ~2M requests/month free tier
 */

class RedisLoadBalancer {
    constructor() {
        this.instances = [];
        this.currentIndex = 0;
        this.isInitialized = false;
        // Daily request tracking (Upstash free tier: ~10K commands/day per instance)
        this.DAILY_LIMIT_PER_INSTANCE = 9000; // Leave buffer below 10K
        this.dailyRequests = [];
        this.lastResetDate = new Date().toDateString();
        // In-memory fallback cache
        this.memoryCache = new Map();
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
            // Reset dead status - give instances a fresh chance
            this.instances.forEach(inst => {
                if (inst.dead) {
                    inst.dead = false;
                    inst.healthy = true;
                    console.log(`✅ ${inst.name} reset for new day`);
                }
            });
        }
    }

    /**
     * Initialize connections from environment variables
     * Supports UPSTASH_REDIS_REST_URL1/TOKEN1 through URL4/TOKEN4
     */
    initialize() {
        if (this.isInitialized) return;

        // Check if Redis is disabled
        if (process.env.REDIS_DISABLED === 'true') {
            console.log('🔌 Redis DISABLED - using in-memory cache');
            this.isInitialized = true;
            return;
        }

        // Load all Upstash REST API instances
        for (let i = 1; i <= 4; i++) {
            const url = process.env[`UPSTASH_REDIS_REST_URL${i}`]?.replace(/"/g, '');
            const token = process.env[`UPSTASH_REDIS_REST_TOKEN${i}`]?.replace(/"/g, '');

            if (url && token) {
                this.instances.push({
                    name: `redis-${i}`,
                    url: url,
                    token: token,
                    requests: 0,
                    errors: 0,
                    healthy: true,
                    dead: false
                });
                this.dailyRequests.push(0);
                console.log(`✅ Redis-${i} configured: ${url.split('.')[0].replace('https://', '')}`);
            }
        }

        if (this.instances.length === 0) {
            console.log('⚠️  No Redis instances configured - using in-memory cache');
        } else {
            console.log(`🔄 Redis Load Balancer: ${this.instances.length} instances ready`);
        }

        this.isInitialized = true;
    }

    /**
     * Simple hash function for consistent key routing
     */
    _hashKey(key) {
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            const char = key.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Get instance using consistent key-based routing
     * Same key always goes to same healthy instance (for data consistency)
     */
    _getInstanceForKey(key) {
        if (!this.isInitialized) this.initialize();
        this._checkDailyReset();

        if (this.instances.length === 0) return null;

        // Get healthy instances
        const healthyIndices = [];
        for (let i = 0; i < this.instances.length; i++) {
            const inst = this.instances[i];
            const dailyCount = this.dailyRequests[i] || 0;

            if (inst.dead || !inst.healthy) continue;
            if (dailyCount >= this.DAILY_LIMIT_PER_INSTANCE) continue;

            healthyIndices.push(i);
        }

        if (healthyIndices.length === 0) return null;

        // Use consistent hashing to route key to same instance
        const hash = this._hashKey(key || 'default');
        const targetIndex = healthyIndices[hash % healthyIndices.length];

        this.dailyRequests[targetIndex]++;
        this.instances[targetIndex].requests++;
        return this.instances[targetIndex];
    }

    /**
     * Get the best available instance using round-robin (for non-key operations)
     */
    _getInstance() {
        if (!this.isInitialized) this.initialize();
        this._checkDailyReset();

        // Find instance with lowest daily usage that isn't dead/unhealthy
        let bestIndex = -1;
        let lowestUsage = Infinity;

        for (let i = 0; i < this.instances.length; i++) {
            const inst = this.instances[i];
            const dailyCount = this.dailyRequests[i] || 0;

            if (inst.dead || !inst.healthy) continue;
            if (dailyCount >= this.DAILY_LIMIT_PER_INSTANCE) {
                continue;
            }

            if (dailyCount < lowestUsage) {
                lowestUsage = dailyCount;
                bestIndex = i;
            }
        }

        if (bestIndex === -1) {
            return null; // All instances exhausted
        }

        this.dailyRequests[bestIndex]++;
        this.instances[bestIndex].requests++;
        return this.instances[bestIndex];
    }

    /**
     * Execute REST API call to Upstash
     */
    async _restCall(instance, command) {
        try {
            const response = await fetch(`${instance.url}/${command}`, {
                headers: { Authorization: `Bearer ${instance.token}` }
            });

            const data = await response.json();

            if (data.error) {
                if (data.error.includes('max requests limit exceeded')) {
                    instance.dead = true;
                    instance.healthy = false;
                    console.error(`💀 ${instance.name} rate limited - marked dead`);
                }
                throw new Error(data.error);
            }

            return data.result;
        } catch (err) {
            instance.errors++;
            instance.healthy = false;
            throw err;
        }
    }

    /**
     * Execute command with automatic failover
     * Uses consistent key routing when key is provided
     */
    async _execute(command, key = null) {
        // Get instance - use key-based routing for data consistency
        const instance = key ? this._getInstanceForKey(key) : this._getInstance();

        if (!instance) {
            // All Redis instances exhausted
            return null;
        }

        try {
            return await this._restCall(instance, command);
        } catch (err) {
            // Log error but don't retry (maintain consistency)
            console.error(`❌ ${instance.name} failed: ${err.message}`);
            return null;
        }
    }

    // Redis command implementations using REST API with consistent key routing
    async get(key) {
        const result = await this._execute(`get/${encodeURIComponent(key)}`, key);
        if (result === null) {
            return this.memoryCache.get(key) || null;
        }
        return result;
    }

    async set(key, value, ...args) {
        this.memoryCache.set(key, value);
        let command = `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
        if (args.length >= 2 && args[0]?.toUpperCase() === 'EX') {
            command += `/EX/${args[1]}`;
        }
        const result = await this._execute(command, key);
        return result || 'OK';
    }

    async setex(key, seconds, value) {
        this.memoryCache.set(key, value);
        setTimeout(() => this.memoryCache.delete(key), seconds * 1000);
        const result = await this._execute(
            `setex/${encodeURIComponent(key)}/${seconds}/${encodeURIComponent(value)}`, key
        );
        return result || 'OK';
    }

    async del(...keys) {
        keys.forEach(k => this.memoryCache.delete(k));
        // For multi-key delete, route to first key's instance
        const result = await this._execute(`del/${keys.map(k => encodeURIComponent(k)).join('/')}`, keys[0]);
        return result || keys.length;
    }

    async exists(key) {
        const result = await this._execute(`exists/${encodeURIComponent(key)}`, key);
        if (result === null) {
            return this.memoryCache.has(key) ? 1 : 0;
        }
        return result;
    }

    async ttl(key) {
        const result = await this._execute(`ttl/${encodeURIComponent(key)}`, key);
        return result ?? -1;
    }

    async ping() {
        const result = await this._execute('ping');
        return result || 'PONG';
    }

    async incr(key) {
        const result = await this._execute(`incr/${encodeURIComponent(key)}`, key);
        if (result === null) {
            const val = parseInt(this.memoryCache.get(key) || '0', 10) + 1;
            this.memoryCache.set(key, String(val));
            return val;
        }
        return result;
    }

    async expire(key, seconds) {
        const result = await this._execute(`expire/${encodeURIComponent(key)}/${seconds}`, key);
        return result ?? 1;
    }

    async keys(pattern) {
        // Keys command searches all instances and merges results
        const allKeys = new Set();
        for (const inst of this.instances) {
            if (inst.dead || !inst.healthy) continue;
            try {
                const result = await this._restCall(inst, `keys/${encodeURIComponent(pattern)}`);
                if (Array.isArray(result)) {
                    result.forEach(k => allKeys.add(k));
                }
            } catch (e) { /* continue */ }
        }
        return Array.from(allKeys);
    }

    async hget(key, field) {
        const result = await this._execute(`hget/${encodeURIComponent(key)}/${encodeURIComponent(field)}`, key);
        return result;
    }

    async hset(key, field, value) {
        const result = await this._execute(
            `hset/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${encodeURIComponent(value)}`, key
        );
        return result ?? 1;
    }

    async hgetall(key) {
        const result = await this._execute(`hgetall/${encodeURIComponent(key)}`, key);
        return result || {};
    }

    // List operations (for CacheService FIFO patterns) - all routed by key
    async lpush(key, ...values) {
        const encodedValues = values.map(v => encodeURIComponent(v)).join('/');
        const result = await this._execute(`lpush/${encodeURIComponent(key)}/${encodedValues}`, key);
        return result ?? values.length;
    }

    async rpush(key, ...values) {
        const encodedValues = values.map(v => encodeURIComponent(v)).join('/');
        const result = await this._execute(`rpush/${encodeURIComponent(key)}/${encodedValues}`, key);
        return result ?? values.length;
    }

    async lrange(key, start, end) {
        const result = await this._execute(`lrange/${encodeURIComponent(key)}/${start}/${end}`, key);
        return result || [];
    }

    async llen(key) {
        const result = await this._execute(`llen/${encodeURIComponent(key)}`, key);
        return result ?? 0;
    }

    async ltrim(key, start, end) {
        const result = await this._execute(`ltrim/${encodeURIComponent(key)}/${start}/${end}`, key);
        return result || 'OK';
    }

    // Database info operations (non-key specific)
    async info(section = '') {
        const result = await this._execute(section ? `info/${section}` : 'info');
        return result || '';
    }

    async dbsize() {
        // Sum dbsize from all instances
        let total = 0;
        for (const inst of this.instances) {
            if (inst.dead || !inst.healthy) continue;
            try {
                const result = await this._restCall(inst, 'dbsize');
                total += result || 0;
            } catch (e) { /* continue */ }
        }
        return total;
    }

    async flushdb() {
        // Flush all instances
        for (const inst of this.instances) {
            if (inst.dead || !inst.healthy) continue;
            try {
                await this._restCall(inst, 'flushdb');
            } catch (e) { /* continue */ }
        }
        this.memoryCache.clear();
        return 'OK';
    }

    /**
     * Get load balancer statistics
     */
    getStats() {
        if (!this.isInitialized) this.initialize();
        this._checkDailyReset();

        return {
            totalInstances: this.instances.length,
            dailyLimit: this.DAILY_LIMIT_PER_INSTANCE,
            instances: this.instances.map((inst, idx) => ({
                name: inst.name,
                healthy: inst.healthy,
                dead: inst.dead,
                requests: inst.requests,
                errors: inst.errors,
                dailyRequests: this.dailyRequests[idx] || 0,
                dailyRemaining: this.DAILY_LIMIT_PER_INSTANCE - (this.dailyRequests[idx] || 0),
                atLimit: (this.dailyRequests[idx] || 0) >= this.DAILY_LIMIT_PER_INSTANCE
            })),
            totalRequests: this.instances.reduce((sum, i) => sum + i.requests, 0),
            totalErrors: this.instances.reduce((sum, i) => sum + i.errors, 0),
            totalDailyRequests: this.dailyRequests.reduce((sum, r) => sum + r, 0),
            memoryCacheSize: this.memoryCache.size
        };
    }

    /**
     * Test all connections and return health status
     */
    async healthCheck() {
        if (!this.isInitialized) this.initialize();

        const results = [];
        for (const inst of this.instances) {
            const start = Date.now();
            try {
                const res = await fetch(`${inst.url}/ping`, {
                    headers: { Authorization: `Bearer ${inst.token}` }
                });
                const data = await res.json();
                const latency = Date.now() - start;

                if (data.result === 'PONG') {
                    inst.healthy = true;
                    results.push({ name: inst.name, status: 'connected', latency });
                } else {
                    inst.healthy = false;
                    results.push({ name: inst.name, status: 'failed', error: data.error });
                }
            } catch (err) {
                inst.healthy = false;
                results.push({ name: inst.name, status: 'error', error: err.message });
            }
        }

        return results;
    }

    /**
     * Gracefully close (clear memory cache)
     */
    async quit() {
        this.memoryCache.clear();
        console.log('🔌 Redis Load Balancer shut down');
    }

    // Event handlers (for compatibility - no-op for REST API)
    on(event, handler) {
        // REST API doesn't have persistent connections
    }
}

// Export singleton instance
const loadBalancer = new RedisLoadBalancer();
module.exports = loadBalancer;
