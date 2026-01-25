/**
 * 🌐 Edge Caching Strategy
 * Implements intelligent caching for Vercel Edge Network and CDN optimization
 */

class EdgeCacheManager {
  constructor() {
    this.cacheStrategies = {
      // Static content - long cache
      static: {
        maxAge: 86400, // 24 hours
        sMaxAge: 86400,
        staleWhileRevalidate: 604800 // 7 days
      },
      
      // API responses - medium cache
      api: {
        maxAge: 300, // 5 minutes
        sMaxAge: 300,
        staleWhileRevalidate: 3600 // 1 hour
      },
      
      // Dynamic content - short cache
      dynamic: {
        maxAge: 60, // 1 minute
        sMaxAge: 60,
        staleWhileRevalidate: 300 // 5 minutes
      },
      
      // Real-time data - minimal cache
      realtime: {
        maxAge: 10, // 10 seconds
        sMaxAge: 10,
        staleWhileRevalidate: 60 // 1 minute
      }
    };
  }

  /**
   * Get cache headers for different content types
   */
  getCacheHeaders(type = 'api', customTTL = null) {
    const strategy = this.cacheStrategies[type] || this.cacheStrategies.api;
    const maxAge = customTTL || strategy.maxAge;
    
    return {
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${strategy.sMaxAge}, stale-while-revalidate=${strategy.staleWhileRevalidate}`,
      'CDN-Cache-Control': `max-age=${strategy.sMaxAge}`,
      'Vary': 'Accept-Encoding, Accept',
      'X-Cache-Strategy': type
    };
  }

  /**
   * Middleware for automatic cache header setting
   */
  middleware() {
    return (req, res, next) => {
      // Determine cache strategy based on route
      let cacheType = 'api';
      
      if (req.path.includes('/articles/')) {
        cacheType = 'api'; // Individual articles cache for 5 minutes
      } else if (req.path.includes('/search')) {
        cacheType = 'dynamic'; // Search results cache for 1 minute
      } else if (req.path.includes('/performance') || req.path.includes('/system-status')) {
        cacheType = 'realtime'; // Monitoring data cache briefly
      } else if (req.path.includes('/static') || req.path.includes('.js') || req.path.includes('.css')) {
        cacheType = 'static'; // Static assets cache long
      }

      // Apply cache headers
      const headers = this.getCacheHeaders(cacheType);
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      // Add ETag for better caching
      const originalSend = res.send;
      res.send = function(data) {
        if (data && typeof data === 'object') {
          const etag = require('crypto').createHash('md5').update(JSON.stringify(data)).digest('hex');
          res.setHeader('ETag', `"${etag}"`);
          
          // Check if client has cached version
          if (req.headers['if-none-match'] === `"${etag}"`) {
            res.status(304).end();
            return;
          }
        }
        originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Invalidate edge cache for specific patterns
   */
  async invalidateCache(patterns) {
    // In a real implementation, this would call Vercel's edge cache invalidation API
    console.log(`🗑️ Cache invalidation requested for patterns: ${patterns.join(', ')}`);
    
    // For now, we'll just log the invalidation
    // In production, you'd implement:
    // - Vercel Edge Cache purging
    // - CloudFlare cache invalidation
    // - Custom CDN cache busting
  }

  /**
   * Preload critical content to edge locations
   */
  async preloadCriticalContent() {
    const criticalEndpoints = [
      '/api/articles?category=home&limit=20',
      '/api/articles?category=politics&limit=10',
      '/api/articles?category=business&limit=10'
    ];

    console.log('🚀 Preloading critical content to edge locations...');
    
    for (const endpoint of criticalEndpoints) {
      try {
        // Make a request to warm up the cache
        const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}${endpoint}`, {
          headers: {
            'X-Cache-Preload': 'true'
          }
        });
        
        if (response.ok) {
          console.log(`✅ Preloaded: ${endpoint}`);
        }
      } catch (error) {
        console.log(`⚠️ Failed to preload: ${endpoint}`);
      }
    }
  }
}

// Enhanced response compression
const setupCompression = () => {
  const compression = require('compression');
  
  return compression({
    filter: (req, res) => {
      // Don't compress if client doesn't support it
      if (req.headers['x-no-compression']) {
        return false;
      }
      
      // Always compress JSON responses
      if (res.getHeader('content-type')?.includes('application/json')) {
        return true;
      }
      
      return compression.filter(req, res);
    },
    level: 6, // Good balance between compression and CPU usage
    threshold: 1024, // Only compress responses larger than 1KB
    chunkSize: 16 * 1024, // 16KB chunks
    memLevel: 8 // Memory usage level
  });
};

// Create singleton instance
const edgeCacheManager = new EdgeCacheManager();

module.exports = {
  edgeCacheManager,
  setupCompression
};
