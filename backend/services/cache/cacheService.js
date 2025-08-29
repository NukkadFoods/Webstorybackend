const NodeCache = require('node-cache');

// Initialize cache with standard TTL of 10 minutes and check period of 2 minutes
const cache = new NodeCache({
  stdTTL: 600,
  checkperiod: 120,
  useClones: false
});

// Stats storage
const stats = {
  'cache:homepage:hit': 0,
  'cache:homepage:miss': 0,
  'cache:search:hit': 0,
  'cache:search:miss': 0,
  'cache:homepage:set': 0,
  'cache:search:set': 0
};

// Rate limits storage
const rateLimits = new NodeCache({
  stdTTL: 900, // 15 minutes
  checkperiod: 60
});

// Cache keys
const CACHE_KEYS = {
  HOME_PAGE: 'homepage:latest',
  CATEGORY: (cat) => `category:${cat}`,
  SEARCH: (query) => `search:${query}`,
  ARTICLE: (id) => `article:${id}`,
};

// Default cache durations (in seconds)
const CACHE_DURATION = {
  HOME_PAGE: 300, // 5 minutes
  CATEGORY: 600, // 10 minutes
  SEARCH: 900, // 15 minutes
  ARTICLE: 1800, // 30 minutes
};

class CacheService {
  // Cache homepage articles
  static async cacheHomePageArticles(articles) {
    try {
      const success = cache.set(CACHE_KEYS.HOME_PAGE, articles, CACHE_DURATION.HOME_PAGE);
      if (success) stats['cache:homepage:set']++;
      return success;
    } catch (error) {
      console.error('Cache error:', error);
      return false;
    }
  }

  // Get cached homepage articles
  static async getHomePageArticles() {
    try {
      const cached = cache.get(CACHE_KEYS.HOME_PAGE);
      if (cached !== undefined) {
        stats['cache:homepage:hit']++;
        return cached;
      }
      stats['cache:homepage:miss']++;
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Cache category articles
  static async cacheCategoryArticles(category, articles) {
    try {
      const success = cache.set(CACHE_KEYS.CATEGORY(category), articles, CACHE_DURATION.CATEGORY);
      if (success) {
        const statKey = `cache:category:${category}:set`;
        stats[statKey] = (stats[statKey] || 0) + 1;
      }
      return success;
    } catch (error) {
      console.error('Category cache error:', error);
      return false;
    }
  }

  // Get cached category articles
  static async getCategoryArticles(category) {
    try {
      const cached = cache.get(CACHE_KEYS.CATEGORY(category));
      if (cached !== undefined) {
        const hitKey = `cache:category:${category}:hit`;
        stats[hitKey] = (stats[hitKey] || 0) + 1;
        return cached;
      }
      const missKey = `cache:category:${category}:miss`;
      stats[missKey] = (stats[missKey] || 0) + 1;
      return null;
    } catch (error) {
      console.error('Category cache get error:', error);
      return null;
    }
  }

  // Cache search results
  static async cacheSearchResults(query, results, duration = CACHE_DURATION.SEARCH) {
    try {
      const success = cache.set(CACHE_KEYS.SEARCH(query), results, duration);
      if (success) stats['cache:search:set']++;
      return success;
    } catch (error) {
      console.error('Search cache error:', error);
      return false;
    }
  }

  // Get cached search results
  static async getSearchResults(query) {
    try {
      const cached = cache.get(CACHE_KEYS.SEARCH(query));
      if (cached !== undefined) {
        stats['cache:search:hit']++;
        return cached;
      }
      stats['cache:search:miss']++;
      return null;
    } catch (error) {
      console.error('Search cache get error:', error);
      return null;
    }
  }

  // Rate limiting for API calls
  static async checkRateLimit(category) {
    try {
      const key = `api-call:${category}`;
      const limitInfo = rateLimits.get(key) || { count: 0 };

      if (limitInfo.count > 5) {
        return false;
      }

      limitInfo.count++;
      rateLimits.set(key, limitInfo);
      return true;
    } catch (error) {
      console.error('Rate limit check error:', error);
      return true; // Allow on error
    }
  }

  // Usage monitoring
  static async getUsageStats() {
    try {
      return {
        homepageHits: stats['cache:homepage:hit'] || 0,
        homepageMisses: stats['cache:homepage:miss'] || 0,
        searchHits: stats['cache:search:hit'] || 0,
        searchMisses: stats['cache:search:miss'] || 0
      };
    } catch (error) {
      console.error('Stats retrieval error:', error);
      return null;
    }
  }

  // Clear expired cache (not needed with node-cache as it auto-cleans)
  static async clearExpiredCache() {
    try {
      cache.flushStats();
      return true;
    } catch (error) {
      console.error('Cache cleanup error:', error);
      return false;
    }
  }
}

module.exports = CacheService;
