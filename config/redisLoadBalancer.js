/**
 * 🔴 Redis Load Balancer - Smart Distribution with Health Checks
 * Features:
 * - Initial health check on startup
 * - Even load distribution across healthy instances
 * - Auto-recovery when instances come back online
 * - Consistent key routing for data integrity
 * - IORedis support for BullMQ
 */

const IORedis = require('ioredis');

class RedisLoadBalancer {
    constructor() {
        this.instances = [];
        this.isInitialized = false;
        this.DAILY_LIMIT_PER_INSTANCE = 9000;
        this.lastResetDate = new Date().toDateString();
        this.memoryCache = new Map();
        this.ioredisConnections = [];
        this.healthCheckInterval = null;
    }

    /**
     * Initialize and run health checks
     */
    async initialize() {
        if (this.isInitialized) return;
        this.isInitialized = true;  // Set early to prevent re-entry

        if (process.env.REDIS_DISABLED === 'true') {
            console.log('🔌 Redis DISABLED - using in-memory cache');
            return;
        }

        // Only load instances if not already loaded
        if (this.instances.length === 0) {
            for (let i = 1; i <= 4; i++) {
                const url = process.env[`UPSTASH_REDIS_REST_URL${i}`]?.replace(/"/g, '');
                const token = process.env[`UPSTASH_REDIS_REST_TOKEN${i}`]?.replace(/"/g, '');

                if (url && token) {
                    const name = url.split('.')[0].replace('https://', '');
                    this.instances.push({
                        id: i,
                        name: name,
                        url: url,
                        token: token,
                        healthy: false,
                        dead: false,
                        requests: 0,
                        errors: 0,
                        dailyRequests: 0,
                        lastHealthCheck: null,
                        latency: null
                    });
                }
            }
        }

        if (this.instances.length === 0) {
            console.log('⚠️  No Redis instances configured');
            return;
        }

        // Run initial health check
        console.log(`\n🔍 Running health check on ${this.instances.length} Redis instances...`);
        await this._runHealthCheck();

        // Create IORedis connections only for healthy instances
        this._initIORedisConnections();

        // Schedule periodic health checks (every 5 minutes)
        if (!this.healthCheckInterval) {
            this.healthCheckInterval = setInterval(() => {
                this._runHealthCheck();
            }, 5 * 60 * 1000);
        }

        this._printStatus();
    }

    /**
     * Run health check on all instances
     */
    async _runHealthCheck() {
        this._checkDailyReset();

        const results = await Promise.all(
            this.instances.map(async (inst) => {
                const start = Date.now();
                try {
                    const res = await fetch(`${inst.url}/ping`, {
                        headers: { Authorization: `Bearer ${inst.token}` },
                        signal: AbortSignal.timeout(5000)
                    });
                    const data = await res.json();
                    const latency = Date.now() - start;

                    if (data.result === 'PONG') {
                        inst.healthy = true;
                        inst.dead = false;
                        inst.latency = latency;
                        inst.lastHealthCheck = new Date();
                        return { inst, status: 'healthy', latency };
                    } else {
                        inst.healthy = false;
                        if (data.error?.includes('max requests limit exceeded')) {
                            inst.dead = true;
                        }
                        return { inst, status: 'error', error: data.error };
                    }
                } catch (err) {
                    inst.healthy = false;
                    inst.latency = null;
                    return { inst, status: 'error', error: err.message };
                }
            })
        );

        return results;
    }

    /**
     * Print current status
     */
    _printStatus() {
        const healthy = this.instances.filter(i => i.healthy);
        const dead = this.instances.filter(i => i.dead);

        console.log('\n┌─────────────────────────────────────────────────────┐');
        console.log('│           Redis Load Balancer Status                │');
        console.log('├─────────────────────────────────────────────────────┤');

        this.instances.forEach(inst => {
            const status = inst.dead ? '❌ DEAD' : inst.healthy ? '✅ OK  ' : '⚠️  DOWN';
            const latency = inst.latency ? `${inst.latency}ms` : 'N/A';
            const load = `${inst.dailyRequests}/${this.DAILY_LIMIT_PER_INSTANCE}`;
            console.log(`│ ${status} │ ${inst.name.padEnd(20)} │ ${latency.padStart(6)} │ ${load.padStart(10)} │`);
        });

        console.log('├─────────────────────────────────────────────────────┤');
        console.log(`│ Healthy: ${healthy.length}/${this.instances.length}  │  Dead: ${dead.length}  │  Ready for requests     │`);
        console.log('└─────────────────────────────────────────────────────┘\n');
    }

    /**
     * Reset daily counters at midnight
     */
    _checkDailyReset() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            console.log('\n🔄 New day - resetting counters and re-checking instances...');
            this.lastResetDate = today;

            this.instances.forEach(inst => {
                inst.dailyRequests = 0;
                // Give dead instances another chance
                if (inst.dead) {
                    inst.dead = false;
                    console.log(`   ↻ ${inst.name} - will retry`);
                }
            });
        }
    }

    /**
     * Initialize IORedis connections for BullMQ
     */
    _initIORedisConnections() {
        // Skip if already initialized
        if (this.ioredisConnections.length > 0) return;

        // Create connections only for healthy instances (skip set-gibbon)
        for (const inst of this.instances) {
            if (!inst.healthy || inst.dead || inst.name.includes('set-gibbon')) {
                console.log(`   ⏭️  IORedis skip: ${inst.name}`);
                continue;
            }

            try {
                const host = inst.url.replace('https://', '').replace('http://', '');
                const redisUrl = `rediss://default:${inst.token}@${host}:6379`;

                const conn = new IORedis(redisUrl, {
                    maxRetriesPerRequest: null,
                    enableReadyCheck: false,
                    connectTimeout: 10000,
                    lazyConnect: true,
                    retryStrategy(times) {
                        if (times > 3) return null;
                        return Math.min(times * 500, 3000);
                    },
                    tls: { rejectUnauthorized: false }
                });

                conn.on('error', (err) => {
                    if (err.message.includes('max requests limit exceeded')) {
                        inst.dead = true;
                        inst.healthy = false;
                    }
                });

                this.ioredisConnections.push({ conn, instance: inst });
                console.log(`   🔌 IORedis: ${inst.name}`);
            } catch (err) {
                console.error(`   ❌ IORedis failed: ${inst.name}`);
            }
        }
    }

    /**
     * Get instance with lowest load (even distribution)
     */
    _getInstanceEvenDistribution() {
        if (!this.isInitialized) this.initialize();
        this._checkDailyReset();

        // Filter healthy instances not at daily limit
        const available = this.instances.filter(inst =>
            inst.healthy &&
            !inst.dead &&
            inst.dailyRequests < this.DAILY_LIMIT_PER_INSTANCE
        );

        if (available.length === 0) return null;

        // Pick instance with lowest daily requests (even distribution)
        available.sort((a, b) => a.dailyRequests - b.dailyRequests);
        const selected = available[0];

        selected.requests++;
        selected.dailyRequests++;

        return selected;
    }

    /**
     * Get instance using consistent key hashing
     */
    _getInstanceForKey(key) {
        if (!this.isInitialized) this.initialize();
        this._checkDailyReset();

        const available = this.instances.filter(inst =>
            inst.healthy &&
            !inst.dead &&
            inst.dailyRequests < this.DAILY_LIMIT_PER_INSTANCE
        );

        if (available.length === 0) return null;

        // Consistent hash
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash << 5) - hash) + key.charCodeAt(i);
            hash = hash & hash;
        }
        const idx = Math.abs(hash) % available.length;
        const selected = available[idx];

        selected.requests++;
        selected.dailyRequests++;

        return selected;
    }

    /**
     * Execute REST API call
     */
    async _restCall(instance, command) {
        const response = await fetch(`${instance.url}/${command}`, {
            headers: { Authorization: `Bearer ${instance.token}` }
        });

        const data = await response.json();

        if (data.error) {
            instance.errors++;
            if (data.error.includes('max requests limit exceeded')) {
                instance.dead = true;
                instance.healthy = false;
            }
            throw new Error(data.error);
        }

        return data.result;
    }

    /**
     * Execute command with key-based routing
     */
    async _execute(command, key = null) {
        const instance = key ? this._getInstanceForKey(key) : this._getInstanceEvenDistribution();

        if (!instance) {
            return null; // All instances exhausted
        }

        try {
            return await this._restCall(instance, command);
        } catch (err) {
            console.error(`❌ ${instance.name}: ${err.message.substring(0, 50)}`);
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Redis Commands (REST API)
    // ═══════════════════════════════════════════════════════════════════

    async get(key) {
        const result = await this._execute(`get/${encodeURIComponent(key)}`, key);
        return result ?? this.memoryCache.get(key) ?? null;
    }

    async set(key, value, ...args) {
        this.memoryCache.set(key, value);
        let cmd = `set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
        if (args[0]?.toUpperCase() === 'EX') cmd += `/EX/${args[1]}`;
        return (await this._execute(cmd, key)) || 'OK';
    }

    async setex(key, seconds, value) {
        this.memoryCache.set(key, value);
        setTimeout(() => this.memoryCache.delete(key), seconds * 1000);
        return (await this._execute(`setex/${encodeURIComponent(key)}/${seconds}/${encodeURIComponent(value)}`, key)) || 'OK';
    }

    async del(...keys) {
        keys.forEach(k => this.memoryCache.delete(k));
        return (await this._execute(`del/${keys.map(k => encodeURIComponent(k)).join('/')}`, keys[0])) || keys.length;
    }

    async exists(key) {
        const result = await this._execute(`exists/${encodeURIComponent(key)}`, key);
        return result ?? (this.memoryCache.has(key) ? 1 : 0);
    }

    async ttl(key) {
        return (await this._execute(`ttl/${encodeURIComponent(key)}`, key)) ?? -1;
    }

    async ping() {
        return (await this._execute('ping')) || 'PONG';
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
        return (await this._execute(`expire/${encodeURIComponent(key)}/${seconds}`, key)) ?? 1;
    }

    async keys(pattern) {
        // Search all healthy instances
        const allKeys = new Set();
        for (const inst of this.instances.filter(i => i.healthy && !i.dead)) {
            try {
                const result = await this._restCall(inst, `keys/${encodeURIComponent(pattern)}`);
                if (Array.isArray(result)) result.forEach(k => allKeys.add(k));
            } catch (e) { }
        }
        return Array.from(allKeys);
    }

    async hget(key, field) {
        return await this._execute(`hget/${encodeURIComponent(key)}/${encodeURIComponent(field)}`, key);
    }

    async hset(key, field, value) {
        return (await this._execute(`hset/${encodeURIComponent(key)}/${encodeURIComponent(field)}/${encodeURIComponent(value)}`, key)) ?? 1;
    }

    async hgetall(key) {
        return (await this._execute(`hgetall/${encodeURIComponent(key)}`, key)) || {};
    }

    // List operations
    async lpush(key, ...values) {
        const encoded = values.map(v => encodeURIComponent(v)).join('/');
        return (await this._execute(`lpush/${encodeURIComponent(key)}/${encoded}`, key)) ?? values.length;
    }

    async rpush(key, ...values) {
        const encoded = values.map(v => encodeURIComponent(v)).join('/');
        return (await this._execute(`rpush/${encodeURIComponent(key)}/${encoded}`, key)) ?? values.length;
    }

    async lrange(key, start, end) {
        return (await this._execute(`lrange/${encodeURIComponent(key)}/${start}/${end}`, key)) || [];
    }

    async llen(key) {
        return (await this._execute(`llen/${encodeURIComponent(key)}`, key)) ?? 0;
    }

    async ltrim(key, start, end) {
        return (await this._execute(`ltrim/${encodeURIComponent(key)}/${start}/${end}`, key)) || 'OK';
    }

    // Database operations
    async info(section = '') {
        return (await this._execute(section ? `info/${section}` : 'info')) || '';
    }

    async dbsize() {
        let total = 0;
        for (const inst of this.instances.filter(i => i.healthy && !i.dead)) {
            try {
                total += (await this._restCall(inst, 'dbsize')) || 0;
            } catch (e) { }
        }
        return total;
    }

    async flushdb() {
        for (const inst of this.instances.filter(i => i.healthy && !i.dead)) {
            try { await this._restCall(inst, 'flushdb'); } catch (e) { }
        }
        this.memoryCache.clear();
        return 'OK';
    }

    // ═══════════════════════════════════════════════════════════════════
    // BullMQ Support (IORedis)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Get raw IORedis connection for BullMQ
     * Creates connections on-demand, skipping rate-limited instances
     * NOTE: Instance 1 (set-gibbon) is rate-limited until next month
     */
    getRawConnection() {
        // Ensure instances are loaded (skip instance 1 - rate limited)
        if (this.instances.length === 0) {
            console.log('\n🔌 Initializing BullMQ connections...');
            // Start from instance 2 to skip rate-limited set-gibbon
            for (let i = 2; i <= 4; i++) {
                const url = process.env[`UPSTASH_REDIS_REST_URL${i}`]?.replace(/"/g, '');
                const token = process.env[`UPSTASH_REDIS_REST_TOKEN${i}`]?.replace(/"/g, '');
                if (url && token) {
                    this.instances.push({
                        id: i,
                        name: url.split('.')[0].replace('https://', ''),
                        url, token,
                        healthy: true,
                        dead: false,
                        requests: 0, errors: 0, dailyRequests: 0
                    });
                }
            }
            console.log(`   ⏭️  Skipping instance 1 (set-gibbon) - rate limited`);
        }

        // Create IORedis connections if not already created
        if (this.ioredisConnections.length === 0) {
            for (const inst of this.instances) {
                // Skip set-gibbon (rate-limited) - other instances are healthy
                if (inst.name.includes('set-gibbon')) {
                    console.log(`   ⏭️  BullMQ skip: ${inst.name} (rate-limited)`);
                    continue;
                }

                try {
                    const host = inst.url.replace('https://', '');
                    const redisUrl = `rediss://default:${inst.token}@${host}:6379`;

                    const conn = new IORedis(redisUrl, {
                        maxRetriesPerRequest: null,
                        enableReadyCheck: false,
                        connectTimeout: 10000,
                        lazyConnect: true,
                        retryStrategy(times) {
                            if (times > 3) return null;
                            return Math.min(times * 500, 3000);
                        },
                        tls: { rejectUnauthorized: false }
                    });

                    conn.on('error', (err) => {
                        if (err.message.includes('max requests limit exceeded')) {
                            inst.dead = true;
                            inst.healthy = false;
                        }
                    });

                    this.ioredisConnections.push({ conn, instance: inst });
                    inst.healthy = true;  // Mark as healthy for BullMQ
                    console.log(`   🔌 BullMQ: ${inst.name}`);
                } catch (err) {
                    console.error(`   ❌ IORedis failed: ${inst.name}`);
                }
            }
        }

        // Find connection with lowest load from healthy instances
        const healthyConns = this.ioredisConnections.filter(
            ({ instance }) => !instance.dead && instance.healthy
        );

        if (healthyConns.length === 0) {
            console.warn('⚠️ No healthy Redis connections for BullMQ');
            return this.ioredisConnections[0]?.conn || null;
        }

        // Sort by daily requests (even distribution)
        healthyConns.sort((a, b) => a.instance.dailyRequests - b.instance.dailyRequests);
        return healthyConns[0].conn;
    }

    async getRawConnectionAsync() {
        if (!this.isInitialized) await this.initialize();

        for (const { conn, instance } of this.ioredisConnections) {
            if (instance.dead) continue;
            try {
                await conn.ping();
                instance.healthy = true;
                return conn;
            } catch (err) {
                instance.healthy = false;
                if (err.message.includes('max requests limit exceeded')) {
                    instance.dead = true;
                }
            }
        }

        return this.ioredisConnections[0]?.conn || null;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Stats & Management
    // ═══════════════════════════════════════════════════════════════════

    getStats() {
        return {
            totalInstances: this.instances.length,
            healthyInstances: this.instances.filter(i => i.healthy && !i.dead).length,
            deadInstances: this.instances.filter(i => i.dead).length,
            dailyLimit: this.DAILY_LIMIT_PER_INSTANCE,
            instances: this.instances.map(inst => ({
                id: inst.id,
                name: inst.name,
                healthy: inst.healthy,
                dead: inst.dead,
                latency: inst.latency,
                requests: inst.requests,
                errors: inst.errors,
                dailyRequests: inst.dailyRequests,
                dailyRemaining: this.DAILY_LIMIT_PER_INSTANCE - inst.dailyRequests,
                loadPercent: Math.round((inst.dailyRequests / this.DAILY_LIMIT_PER_INSTANCE) * 100)
            })),
            totalRequests: this.instances.reduce((sum, i) => sum + i.requests, 0),
            totalDailyRequests: this.instances.reduce((sum, i) => sum + i.dailyRequests, 0),
            memoryCacheSize: this.memoryCache.size
        };
    }

    async healthCheck() {
        return this._runHealthCheck();
    }

    async quit() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        for (const { conn } of this.ioredisConnections) {
            try { await conn.quit(); } catch (e) { }
        }
        this.ioredisConnections = [];
        this.memoryCache.clear();
        console.log('🔌 Redis Load Balancer shut down');
    }

    on(event, handler) {
        for (const { conn } of this.ioredisConnections) {
            conn.on(event, handler);
        }
    }
}

// Export singleton
const loadBalancer = new RedisLoadBalancer();
module.exports = loadBalancer;
