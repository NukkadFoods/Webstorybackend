/**
 * 🚀 Advanced Multi-Tier Caching System
 * Implements stale-while-revalidate pattern with Redis and in-memory caching
 */

const NodeCache = require('node-cache');
let redisClient = null;

// Try to initialize Redis if available
try {
  // Only attempt Redis connection if explicitly configured
  if (process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379') {
    const redis = require('ioredis');
    redisClient = new redis(process.env.REDIS_URL, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 800
    });
    
    redisClient.on('error', (err) => {
      console.log('Redis connection error (falling back to memory cache):', err.message);
      redisClient = null;
    });
    
    redisClient.on('connect', () => {
      console.log('✅ Redis cache connected');
    });
  } else {
    console.log('📦 Redis not configured, using memory cache only');
    redisClient = null;
  }
} catch (error) {
  console.log('📦 Redis not available, using memory cache only');
  redisClient = null;
}

// L1: Ultra-fast in-memory cache with memory management
const memoryCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes default
  checkperiod: 60, // Check expired keys every minute
  useClones: false, // Better performance
  maxKeys: 500 // Reduced from 1000 to lower memory usage
});

class AdvancedCache {
  constructor() {
    this.hitCount = 0;
    this.missCount = 0;
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      avgResponseTime: 0
    };
  }

  /**
   * Initialize the cache system
   */
  async initialize() {
    try {
      console.log('🚀 Initializing advanced cache system...');
      
      // Test Redis connection if available
      if (redisClient) {
        try {
          await redisClient.ping();
          console.log('✅ Redis cache ready');
        } catch (error) {
          console.log('📦 Redis unavailable, using memory cache only');
          redisClient = null;
        }
      } else {
        console.log('📦 Using memory cache only (Redis not configured)');
      }
      
      return this;
    } catch (error) {
      console.warn('⚠️ Cache initialization warning:', error.message);
      return this;
    }
  }

  /**
   * Stale-While-Revalidate implementation
   * Returns cached data immediately, refreshes in background if stale
   */
  async getWithSWR(key, fetchFunction, options = {}) {
    const start = Date.now();
    const {
      ttl = 300, // 5 minutes default
      staleTime = 60, // 1 minute stale threshold
      priority = 'normal'
    } = options;

    try {
      // L1: Check memory cache first (fastest)
      const memoryData = memoryCache.get(key);
      if (memoryData) {
        this.hitCount++;
        this.metrics.hits++;
        
        // Check if data is approaching expiration
        const age = Date.now() - memoryData.timestamp;
        const isStale = age > (ttl - staleTime) * 1000;
        
        if (isStale && priority !== 'low') {
          // Background refresh for stale data
          this.backgroundRefresh(key, fetchFunction, ttl);
        }
        
        this.updateMetrics(start);
        return memoryData.data;
      }

      // L2: Check Redis cache if available
      if (redisClient) {
        try {
          const redisData = await redisClient.get(key);
          if (redisData) {
            const parsedData = JSON.parse(redisData);
            
            // Store in memory for next time
            memoryCache.set(key, {
              data: parsedData.data,
              timestamp: parsedData.timestamp
            }, ttl);
            
            this.hitCount++;
            this.metrics.hits++;
            this.updateMetrics(start);
            return parsedData.data;
          }
        } catch (redisError) {
          console.log('Redis get error:', redisError.message);
          this.metrics.errors++;
        }
      }

      // Cache miss - fetch fresh data
      this.missCount++;
      this.metrics.misses++;
      
      const freshData = await this.refreshCache(key, fetchFunction, ttl);
      this.updateMetrics(start);
      return freshData;

    } catch (error) {
      console.error('Cache error for key:', key, error.message);
      this.metrics.errors++;
      
      // Fallback to direct fetch
      try {
        return await fetchFunction();
      } catch (fetchError) {
        console.error('Fetch function error:', fetchError.message);
        throw fetchError;
      }
    }
  }

  /**
   * Refresh cache with new data
   */
  async refreshCache(key, fetchFunction, ttl) {
    try {
      const freshData = await fetchFunction();
      
      // 🔧 FIX: Don't cache empty arrays for articles - they might be errors
      if (key.includes('articles') && Array.isArray(freshData) && freshData.length === 0) {
        console.warn(`⚠️ Not caching empty articles result for key: ${key}`);
        return freshData; // Return but don't cache
      }
      
      const cacheEntry = {
        data: freshData,
        timestamp: Date.now()
      };

      // Store in memory cache
      memoryCache.set(key, cacheEntry, ttl);

      // Store in Redis if available
      if (redisClient) {
        try {
          await redisClient.setex(key, ttl, JSON.stringify(cacheEntry));
        } catch (redisError) {
          console.log('Redis set error:', redisError.message);
        }
      }

      return freshData;
    } catch (error) {
      console.error('Error refreshing cache for key:', key, error.message);
      throw error;
    }
  }

  /**
   * Background refresh for stale data
   */
  backgroundRefresh(key, fetchFunction, ttl) {
    // Use setTimeout to avoid blocking the main thread
    setTimeout(async () => {
      try {
        await this.refreshCache(key, fetchFunction, ttl);
        console.log(`Background refresh completed for key: ${key}`);
      } catch (error) {
        console.error(`Background refresh failed for key: ${key}`, error.message);
      }
    }, 100); // Small delay to ensure current request completes first
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hitCount + this.missCount;
    const hitRate = total > 0 ? (this.hitCount / total * 100).toFixed(2) : 0;
    
    return {
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: `${hitRate}%`,
      memoryKeys: memoryCache.keys().length,
      redisConnected: redisClient?.status === 'ready',
      metrics: this.metrics
    };
  }

  /**
   * Clear all caches
   */
  async clearAll() {
    memoryCache.flushAll();
    
    if (redisClient) {
      try {
        await redisClient.flushall();
      } catch (error) {
        console.log('Redis clear error:', error.message);
      }
    }
    
    this.hitCount = 0;
    this.missCount = 0;
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      avgResponseTime: 0
    };
    
    console.log('🧹 All caches cleared');
  }

  /**
   * Clear specific cache keys (useful for debugging)
   */
  async clearPattern(pattern) {
    // Clear memory cache
    const memoryKeys = memoryCache.keys();
    for (const key of memoryKeys) {
      if (key.includes(pattern)) {
        memoryCache.del(key);
        console.log(`🧹 Cleared memory cache for key: ${key}`);
      }
    }
    
    // Clear Redis cache if available
    if (redisClient) {
      try {
        const keys = await redisClient.keys(`*${pattern}*`);
        if (keys.length > 0) {
          await redisClient.del(...keys);
          console.log(`🧹 Cleared ${keys.length} Redis keys matching pattern: ${pattern}`);
        }
      } catch (error) {
        console.log('Redis pattern clear error:', error.message);
      }
    }
  }

  /**
   * Delete specific cache key
   */
  async delete(key) {
    memoryCache.del(key);
    
    if (redisClient) {
      try {
        await redisClient.del(key);
      } catch (error) {
        console.log('Redis delete error:', error.message);
      }
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics(startTime) {
    const duration = Date.now() - startTime;
    this.metrics.avgResponseTime = (this.metrics.avgResponseTime + duration) / 2;
  }

  /**
   * Get cache key for articles
   */
  getArticleKey(category = 'home', limit = 20, offset = 0) {
    return `articles:${category}:${limit}:${offset}`;
  }

  /**
   * Get cache key for search results
   */
  getSearchKey(query, limit = 10) {
    return `search:${encodeURIComponent(query)}:${limit}`;
  }

  /**
   * Get cache key for single article
   */
  getArticleByIdKey(id) {
    return `article:${id}`;
  }

  /**
   * Get TTL based on content type
   */
  getTTL(type) {
    const ttlMap = {
      'articles': 300,      // 5 minutes
      'search': 600,        // 10 minutes
      'commentary': 1800,   // 30 minutes
      'static': 3600,       // 1 hour
      'nyt_data': 900       // 15 minutes
    };
    return ttlMap[type] || 300;
  }
}

// Export singleton instance
const advancedCache = new AdvancedCache();

// Add methods for compatibility with optimization manager
advancedCache.ping = async function() {
  try {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.ping();
      return true;
    }
    // Memory cache is always available
    return true;
  } catch (error) {
    // Don't log Redis ping failures to reduce noise
    return false;
  }
};

advancedCache.close = async function() {
  try {
    if (redisClient) {
      await redisClient.quit();
    }
    memoryCache.close();
    console.log('✅ Cache connections closed');
  } catch (error) {
    console.warn('Cache close warning:', error.message);
  }
};

advancedCache.getStats = function() {
  return {
    ...this.metrics,
    memoryKeys: memoryCache.keys().length,
    redisConnected: redisClient && redisClient.status === 'ready'
  };
};

// Add cache cleanup method to manage memory
advancedCache.cleanup = function() {
  try {
    const keyCount = memoryCache.keys().length;
    
    // If we have too many keys, clear some old ones
    if (keyCount > 400) {
      const keys = memoryCache.keys();
      const keysToDelete = keys.slice(0, Math.floor(keyCount * 0.2)); // Remove 20% of keys
      
      keysToDelete.forEach(key => memoryCache.del(key));
      console.log(`🧹 Cleaned up ${keysToDelete.length} cache entries to manage memory`);
    }
  } catch (error) {
    console.warn('Cache cleanup warning:', error.message);
  }
};

// Start periodic cleanup
setInterval(() => {
  advancedCache.cleanup();
}, 300000); // Every 5 minutes

// Middleware function for Express
const cacheMiddleware = (options = {}) => {
  return async (req, res, next) => {
    const {
      keyGenerator = (req) => `${req.method}:${req.originalUrl}`,
      ttl = 300,
      condition = () => true
    } = options;

    // Skip caching for certain conditions
    if (!condition(req) || req.method !== 'GET') {
      return next();
    }

    const key = keyGenerator(req);
    
    try {
      const cachedData = await advancedCache.getWithSWR(
        key,
        async () => {
          // This will be called if cache miss occurs
          // We'll capture the response in the modified res.json
          return null;
        },
        { ttl }
      );

      if (cachedData) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', key);
        return res.json(cachedData);
      }

      // Cache miss - continue to route handler
      res.setHeader('X-Cache', 'MISS');
      res.setHeader('X-Cache-Key', key);
      
      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(data) {
        // Cache the response for next time
        advancedCache.refreshCache(key, async () => data, ttl);
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      next();
    }
  };
};

module.exports = {
  advancedCache,
  cacheMiddleware
};
