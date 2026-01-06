/**
 * 🔴 Redis Configuration - Singleton Connection Pool
 * Shared across cache and BullMQ queues
 */

const IORedis = require('ioredis');

// Mock Redis for local development without Redis server
class MockRedis {
  constructor() {
    this.store = new Map();
    console.log('⚠️  Using Mock Redis (in-memory) - Set REDIS_URL for production');
  }
  
  async get(key) { return this.store.get(key) || null; }
  async set(key, value, ...args) { 
    this.store.set(key, value); 
    return 'OK';
  }
  async setex(key, seconds, value) {
    this.store.set(key, value);
    setTimeout(() => this.store.delete(key), seconds * 1000);
    return 'OK';
  }
  async del(...keys) { 
    keys.forEach(k => this.store.delete(k)); 
    return keys.length; 
  }
  async keys(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.store.keys()).filter(k => regex.test(k));
  }
  async exists(key) { return this.store.has(key) ? 1 : 0; }
  async ttl(key) { return -1; }
  async ping() { return 'PONG'; }
  async quit() { this.store.clear(); }
  on() {}
}

// Use real Redis if REDIS_URL is provided (Vercel), otherwise use mock
let connection;

if (process.env.REDIS_URL) {
  // Convert redis:// to rediss:// for TLS if using upstash
  const redisUrl = process.env.REDIS_URL.includes('upstash.io') 
    ? process.env.REDIS_URL.replace('redis://', 'rediss://')
    : process.env.REDIS_URL;
  
  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false, // Disable ready check for Upstash
    connectTimeout: 10000,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 3000);
      return delay;
    },
    tls: redisUrl.includes('upstash.io') ? {
      rejectUnauthorized: false
    } : undefined,
    reconnectOnError(err) {
      console.log('Reconnect on error triggered:', err.message);
      return true;
    }
  });

  connection.on('error', (err) => {
    if (!err.message.includes('ECONNRESET')) {
      console.error('🔴 Redis Connection Error:', err.message);
    }
  });

  connection.on('connect', () => {
    console.log('✅ Redis Connected Successfully');
  });

  connection.on('ready', () => {
    console.log('✅ Redis Ready for Commands');
  });

  connection.on('reconnecting', () => {
    // Suppress reconnecting logs to reduce noise
  });

  connection.on('close', () => {
    // Suppress close logs to reduce noise
  });
} else {
  connection = new MockRedis();
}

module.exports = connection;
