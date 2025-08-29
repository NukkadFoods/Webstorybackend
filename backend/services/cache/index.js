const NodeCache = require('node-cache');

// Create multiple cache instances for different data types
const hotCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 min for hot data
const searchCache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // 10 min for searches
const categoryCache = new NodeCache({ stdTTL: 900, checkperiod: 180 }); // 15 min for categories

// Statistics tracking
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  searches: 0,
  categories: 0
};

/**
 * Homepage hot cache (5 minutes)
 */
const cacheHomepage = (articles) => {
  const success = hotCache.set('homepage:latest', articles);
  if (success) stats.sets++;
  return success;
};

const getHomepage = () => {
  const cached = hotCache.get('homepage:latest');
  if (cached) {
    stats.hits++;
    return cached;
  }
  stats.misses++;
  return null;
};

/**
 * Category cache (15 minutes)
 */
const cacheCategory = (category, articles) => {
  const key = `category:${category}`;
  const success = categoryCache.set(key, articles);
  if (success) {
    stats.categories++;
    stats.sets++;
  }
  return success;
};

const getCategory = (category) => {
  const key = `category:${category}`;
  const cached = categoryCache.get(key);
  if (cached) {
    stats.hits++;
    return cached;
  }
  stats.misses++;
  return null;
};

/**
 * Search results cache (10 minutes)
 */
const cacheSearch = (query, results) => {
  const key = `search:${query.toLowerCase()}`;
  const success = searchCache.set(key, results);
  if (success) {
    stats.searches++;
    stats.sets++;
  }
  return success;
};

const getSearch = (query) => {
  const key = `search:${query.toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) {
    stats.hits++;
    return cached;
  }
  stats.misses++;
  return null;
};

/**
 * Generic cache operations
 */
const get = (key) => {
  return hotCache.get(key);
};

const set = (key, value, ttl = 300) => {
  const success = hotCache.set(key, value, ttl);
  if (success) stats.sets++;
  return success;
};

const del = (key) => {
  return hotCache.del(key);
};

const clear = () => {
  hotCache.clear();
  searchCache.clear();
  categoryCache.clear();
  return true;
};

/**
 * Cache statistics and monitoring
 */
const getStats = () => {
  return {
    ...stats,
    hitRate: stats.hits + stats.misses > 0 ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) : 0,
    hotCacheStats: hotCache.getStats(),
    searchCacheStats: searchCache.getStats(),
    categoryCacheStats: categoryCache.getStats(),
    timestamp: new Date().toISOString()
  };
};

const has = (key) => {
  return hotCache.has(key);
};

module.exports = {
  // Generic operations
  get,
  set,
  del,
  clear,
  stats: getStats,
  has,
  
  // Specialized caching
  cacheHomepage,
  getHomepage,
  cacheCategory,
  getCategory,
  cacheSearch,
  getSearch,
  
  // Raw cache instances for direct access if needed
  hotCache,
  searchCache,
  categoryCache
};
