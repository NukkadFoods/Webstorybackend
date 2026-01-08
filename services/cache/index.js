/**
 * 🎯 Redis Cache Service - Production Grade
 * Implements getOrSet pattern for optimal cache usage
 * Survives server restarts and scales across multiple instances
 */

const redis = require('../../config/redis');

class CacheService {
  constructor() {
    this.DEFAULT_TTL = 3600; // 1 hour default
    this.STRATEGY_TTL = {
      commentary: 86400,      // 24 hours for AI commentary
      article: 300,           // 5 minutes for articles
      nytapi: 1800,           // 30 minutes for NYT API responses
      subscriber: 600,        // 10 minutes for subscriber data
      short: 60,              // 1 minute for frequently changing data
      long: 604800            // 7 days for rarely changing data
    };
    console.log('✅ Redis CacheService initialized');
  }

  /**
   * 🚀 Smart Fetch Pattern: Cache-aside with automatic population
   * Returns cached data if exists, otherwise executes fetchFunction and caches result
   * 
   * @param {string} key - Cache key
   * @param {Function} fetchFunction - Async function to fetch fresh data
   * @param {number|string} ttl - TTL in seconds or strategy name
   * @returns {Promise<any>} Cached or fresh data
   */
  async getOrSet(key, fetchFunction, ttl = this.DEFAULT_TTL) {
    try {
      // Resolve TTL from strategy name if string
      const ttlSeconds = typeof ttl === 'string' ? this.STRATEGY_TTL[ttl] || this.DEFAULT_TTL : ttl;

      // 1. Check Cache First
      const cachedData = await redis.get(key);
      if (cachedData) {
        console.log(`⚡ Cache Hit: ${key}`);
        try {
          return JSON.parse(cachedData);
        } catch {
          return cachedData; // Return as-is if not JSON
        }
      }

      // 2. Cache Miss - Fetch Fresh Data
      console.log(`🐢 Cache Miss: ${key} - Fetching...`);
      const freshData = await fetchFunction();

      // 3. Cache the Result (if data exists)
      if (freshData !== null && freshData !== undefined) {
        const dataToCache = typeof freshData === 'string' ? freshData : JSON.stringify(freshData);
        await redis.setex(key, ttlSeconds, dataToCache);
        console.log(`💾 Cached: ${key} (TTL: ${ttlSeconds}s)`);
      }

      return freshData;
    } catch (error) {
      console.error(`❌ Cache Service Error for key "${key}":`, error.message);
      // Fallback: Run function directly if cache fails
      try {
        return await fetchFunction();
      } catch (fetchError) {
        console.error(`❌ Fetch Function Error for key "${key}":`, fetchError.message);
        throw fetchError;
      }
    }
  }

  /**
   * Get value from cache only (no fetch fallback)
   */
  async get(key) {
    try {
      const data = await redis.get(key);
      if (!data) return null;
      
      try {
        return JSON.parse(data);
      } catch {
        return data;
      }
    } catch (error) {
      console.error(`Cache get error for "${key}":`, error.message);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key, value, ttl = this.DEFAULT_TTL) {
    try {
      const ttlSeconds = typeof ttl === 'string' ? this.STRATEGY_TTL[ttl] || this.DEFAULT_TTL : ttl;
      const dataToCache = typeof value === 'string' ? value : JSON.stringify(value);
      await redis.setex(key, ttlSeconds, dataToCache);
      return true;
    } catch (error) {
      console.error(`Cache set error for "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key) {
    try {
      await redis.del(key);
      console.log(`🗑️ Deleted cache key: ${key}`);
      return true;
    } catch (error) {
      console.error(`Cache delete error for "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`🗑️ Deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
      return keys.length;
    } catch (error) {
      console.error(`Cache delete pattern error for "${pattern}":`, error.message);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key) {
    try {
      return (await redis.exists(key)) === 1;
    } catch (error) {
      console.error(`Cache exists check error for "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Get TTL for a key (seconds remaining)
   */
  async ttl(key) {
    try {
      return await redis.ttl(key);
    } catch (error) {
      console.error(`Cache TTL error for "${key}":`, error.message);
      return -1;
    }
  }

  /**
   * Invalidate cache for specific patterns (useful for article updates)
   */
  async invalidate(patterns) {
    const patternArray = Array.isArray(patterns) ? patterns : [patterns];
    const results = await Promise.all(patternArray.map(p => this.delPattern(p)));
    const totalDeleted = results.reduce((sum, count) => sum + count, 0);
    console.log(`🔄 Invalidated ${totalDeleted} cache entries`);
    return totalDeleted;
  }

  /**
   * Flush entire cache (use with caution!)
   */
  async flush() {
    try {
      await redis.flushdb();
      console.log('🧹 Cache flushed completely');
      return true;
    } catch (error) {
      console.error('Cache flush error:', error.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const info = await redis.info('stats');
      const dbSize = await redis.dbsize();
      const memory = await redis.info('memory');
      
      return {
        dbSize,
        info: info.split('\r\n').reduce((acc, line) => {
          const [key, value] = line.split(':');
          if (key && value) acc[key] = value;
          return acc;
        }, {}),
        memory: memory.split('\r\n').reduce((acc, line) => {
          const [key, value] = line.split(':');
          if (key && value) acc[key] = value;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Cache stats error:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Health check for Redis connection
   */
  async ping() {
    try {
      const response = await redis.ping();
      return response === 'PONG';
    } catch (error) {
      console.error('Redis ping failed:', error.message);
      return false;
    }
  }

  // Legacy compatibility methods (for gradual migration)
  keys() {
    return redis.keys('*');
  }

  /**
   * 🚀 REDIS LIST OPERATIONS - For "Top 20" Hot Path
   * These methods implement the architecture diagram's Redis List optimization
   */

  /**
   * Push article IDs to the "Top 20" list (LPUSH + LTRIM pattern)
   * @param {string} listKey - Redis list key (e.g., 'homepage:top20')
   * @param {Array<string>} articleIds - Array of article IDs to push
   * @param {number} maxLength - Maximum list length (default 20)
   */
  async pushToList(listKey, articleIds, maxLength = 20) {
    try {
      if (!Array.isArray(articleIds) || articleIds.length === 0) return 0;
      
      // LPUSH adds to the front of the list (newest first)
      await redis.lpush(listKey, ...articleIds);
      
      // LTRIM keeps only the first 'maxLength' items
      await redis.ltrim(listKey, 0, maxLength - 1);
      
      console.log(`📋 Updated Redis List "${listKey}" with ${articleIds.length} articles (max: ${maxLength})`);
      return articleIds.length;
    } catch (error) {
      console.error(`Redis list push error for "${listKey}":`, error.message);
      return 0;
    }
  }

  /**
   * 🔄 FIFO Cache Management for Sections
   * When new articles are added, remove the OLDEST articles (FIFO - First In First Out)
   * Keeps newest articles visible, oldest removed to prevent cache crowding
   * @param {string} section - Section name
   * @param {Array<string>} newArticleIds - New article IDs to add
   * @param {number} maxArticles - Maximum articles to keep per section (default 20)
   * @returns {Promise<Object>} {added, removed} counts
   */
  async manageSectionCacheFIFO(section, newArticleIds, maxArticles = 20) {
    try {
      if (!Array.isArray(newArticleIds) || newArticleIds.length === 0) {
        return { added: 0, removed: 0 };
      }

      const sectionKey = `section:${section}:articles`;
      
      // Get current articles in the section cache
      const currentIds = await redis.lrange(sectionKey, 0, -1);
      
      // Add new articles to the END (using RPUSH - right push)
      // This maintains insertion order: oldest on left, newest on right
      await redis.rpush(sectionKey, ...newArticleIds);
      
      // Get total count after adding
      const totalCount = await redis.llen(sectionKey);
      
      let removed = 0;

      // If we exceed maxArticles, remove from the LEFT (FIFO - oldest first)
      if (totalCount > maxArticles) {
        const toRemove = totalCount - maxArticles;
        
        // LRANGE to get the IDs we're about to remove (for cleanup)
        const oldestIds = await redis.lrange(sectionKey, 0, toRemove - 1);
        
        // Remove the oldest articles from the list
        await redis.ltrim(sectionKey, toRemove, -1);
        
        // Also remove individual article caches for the oldest articles
        for (const articleId of oldestIds) {
          const articleKey = `article:${articleId}`;
          await redis.del(articleKey);
          removed++;
        }
        
        console.log(`🗑️ [${section}] FIFO: Added ${newArticleIds.length}, Removed ${removed} oldest articles (cache limited to ${maxArticles})`);
      } else {
        console.log(`✅ [${section}] FIFO: Added ${newArticleIds.length} articles (total: ${totalCount}/${maxArticles})`);
      }

      return { added: newArticleIds.length, removed };
    } catch (error) {
      console.error(`❌ FIFO cache management error for section "${section}":`, error.message);
      return { added: 0, removed: 0 };
    }
  }

  /**
   * Get articles from section cache (FIFO order - oldest to newest)
   * @param {string} section - Section name
   * @param {number} count - Number of articles to retrieve (default 20)
   * @returns {Promise<Array<string>>} Article IDs in cache order
   */
  async getSectionArticles(section, count = 20) {
    try {
      // Get newest articles from the right side of the list
      // Since RPUSH adds to right, newest articles are at the end
      // We retrieve from the end to show newest first
      const sectionKey = `section:${section}:articles`;
      const ids = await redis.lrange(sectionKey, -count, -1);
      // Reverse to get newest first
      return ids.reverse();
    } catch (error) {
      console.error(`❌ Error getting section articles for "${section}":`, error.message);
      return [];
    }
  }

  /**
   * Get article IDs from "Top 20" list
   * @param {string} listKey - Redis list key
   * @param {number} start - Start index (default 0)
   * @param {number} end - End index (default 19 for top 20)
   * @returns {Promise<Array<string>>} Array of article IDs
   */
  async getFromList(listKey, start = 0, end = 19) {
    try {
      const ids = await redis.lrange(listKey, start, end);
      console.log(`📋 Fetched ${ids.length} articles from Redis List "${listKey}"`);
      return ids;
    } catch (error) {
      console.error(`Redis list get error for "${listKey}":`, error.message);
      return [];
    }
  }

  /**
   * Get list length
   */
  async getListLength(listKey) {
    try {
      return await redis.llen(listKey);
    } catch (error) {
      console.error(`Redis list length error for "${listKey}":`, error.message);
      return 0;
    }
  }

  /**
   * Clear a list
   */
  async clearList(listKey) {
    try {
      await redis.del(listKey);
      console.log(`🗑️ Cleared Redis List: ${listKey}`);
      return true;
    } catch (error) {
      console.error(`Redis list clear error for "${listKey}":`, error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new CacheService();
