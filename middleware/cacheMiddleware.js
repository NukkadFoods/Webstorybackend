const CacheService = require('../services/cache');

/**
 * Smart caching middleware with different TTLs based on endpoint
 */
const smartCacheMiddleware = (cacheType = 'default', ttl = 300) => {
  return async (req, res, next) => {
    const cacheKey = `${req.originalUrl || req.url}`;
    
    try {
      let cached = null;
      
      // Use specialized cache methods based on type
      if (cacheType === 'search' && req.query.q) {
        cached = CacheService.getSearch(req.query.q);
      } else if (cacheType === 'category' && req.params.section) {
        cached = CacheService.getCategory(req.params.section);
      } else if (cacheType === 'homepage') {
        cached = CacheService.getHomepage();
      } else {
        cached = CacheService.get(cacheKey);
      }
      
      if (cached) {
        console.log(`Cache HIT for ${cacheKey}`);
        return res.json(cached);
      }
      
      console.log(`Cache MISS for ${cacheKey}`);
      
      // Intercept the response to cache it
      res.sendResponse = res.json;
      res.json = (body) => {
        // Cache the response based on type
        if (cacheType === 'search' && req.query.q) {
          CacheService.cacheSearch(req.query.q, body);
        } else if (cacheType === 'category' && req.params.section) {
          CacheService.cacheCategory(req.params.section, body);
        } else if (cacheType === 'homepage') {
          CacheService.cacheHomepage(body);
        } else {
          CacheService.set(cacheKey, body, ttl);
        }
        
        res.sendResponse(body);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Optimized rate limiting with Redis-like functionality
 */
const smartRateLimitMiddleware = async (req, res, next) => {
  try {
    const clientIP = req.ip || req.connection.remoteAddress;
    const endpoint = req.route?.path || req.path;
    const key = `rateLimit:${clientIP}:${endpoint}`;
    
    const current = CacheService.get(key) || 0;
    
    // Different limits for different endpoints
    let limit = 60; // Default: 60 requests per minute
    if (endpoint.includes('search')) limit = 30;
    if (endpoint.includes('articles')) limit = 100;
    
    if (current >= limit) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: 60,
        limit: limit,
        current: current
      });
    }
    
    CacheService.set(key, current + 1, 60); // 1 minute window
    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    next(); // Allow request on error
  }
};

/**
 * Cache performance monitoring middleware
 */
const monitoringMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const stats = CacheService.stats();
    
    // Log slow requests
    if (duration > 1000) {
      console.warn(`Slow request: ${req.method} ${req.originalUrl} - ${duration}ms`);
    }
    
    // Log cache performance every 100 requests
    if (stats.sets % 100 === 0) {
      console.log('Cache Performance:', {
        hitRate: stats.hitRate + '%',
        totalHits: stats.hits,
        totalMisses: stats.misses,
        totalSets: stats.sets
      });
    }
  });
  
  next();
};

module.exports = {
  smartCacheMiddleware,
  smartRateLimitMiddleware,
  monitoringMiddleware,
  
  // Legacy support
  cacheMiddleware: smartCacheMiddleware,
  rateLimitMiddleware: smartRateLimitMiddleware
};

const rateLimitMiddleware = async (req, res, next) => {
  // Skip rate limiting for certain paths
  if (req.path.startsWith('/api/articles') || req.path.startsWith('/monitoring')) {
    return next();
  }
  
  const category = req.body?.category || 'default';
  try {
    const key = `api-call:${category}`;
    const limitInfo = CacheService.get(key) || { count: 0 };

    if (limitInfo.count > 20) { // Increased limit
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: 900 // 15 minutes
      });
    }

    limitInfo.count++;
    CacheService.set(key, limitInfo, 900); // 15 minutes
    next();
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    next();
  }
};

module.exports = {
  smartCacheMiddleware,
  smartRateLimitMiddleware,
  monitoringMiddleware,
  rateLimitMiddleware
};
