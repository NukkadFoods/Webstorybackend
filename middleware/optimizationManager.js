/**
 * 🚀 Optimization Manager - Central orchestrator for performance systems
 * Integrates caching, rate limiting, database optimization, and monitoring
 */

const { advancedCache } = require('./advancedCache');
const { groqRateLimiter } = require('./groqRateLimiter');
const databaseManager = require('./databaseManager');
const { performanceMonitor, performanceMiddleware } = require('./performanceMonitor');

class OptimizationManager {
  constructor() {
    this.isInitialized = false;
    this.components = {
      cache: null,
      rateLimiter: null,
      database: null,
      monitor: performanceMonitor
    };
    
    this.config = {
      enableRedis: true,
      enableMonitoring: true,
      enableCompression: true,
      enableRateLimit: true,
      cacheStrategies: {
        articles: { ttl: 300, staleWhileRevalidate: true },      // 5 minutes
        commentary: { ttl: 3600, staleWhileRevalidate: true },   // 1 hour
        nyt: { ttl: 1800, staleWhileRevalidate: true },          // 30 minutes
        subscribers: { ttl: 600, staleWhileRevalidate: false }   // 10 minutes
      }
    };
    
    console.log('🚀 Optimization Manager initializing...');
  }

  /**
   * Initialize all optimization components
   */
  async initialize() {
    try {
      console.log('🔧 Starting optimization component initialization...');
      
      // Initialize cache system
      this.components.cache = await advancedCache.initialize();
      console.log('✅ Advanced cache system initialized');
      
      // Initialize rate limiter
      this.components.rateLimiter = groqRateLimiter;
      console.log('✅ Groq rate limiter initialized');
      
      // Initialize database manager
      this.components.database = databaseManager;
      await this.components.database.initialize();
      console.log('✅ Database manager initialized');
      
      this.isInitialized = true;
      console.log('🚀 Optimization Manager fully initialized');
      
      // Start health monitoring
      this.startHealthChecks();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Optimization Manager:', error);
      throw error;
    }
  }

  /**
   * Get middleware stack for Express app
   */
  getMiddlewareStack() {
    const middleware = [];
    
    // Performance monitoring (always first)
    if (this.config.enableMonitoring) {
      middleware.push(performanceMiddleware);
    }
    
    // Compression middleware
    if (this.config.enableCompression) {
      const compression = require('compression');
      middleware.push(compression({
        filter: (req, res) => {
          if (req.headers['x-no-compression']) return false;
          return compression.filter(req, res);
        },
        level: 6,
        threshold: 1024
      }));
    }
    
    // Security headers
    const helmet = require('helmet');
    middleware.push(helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false
    }));
    
    // Rate limiting middleware
    if (this.config.enableRateLimit) {
      const rateLimit = require('express-rate-limit');
      middleware.push(rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000, // 1000 requests per window
        message: 'Too many requests from this IP',
        standardHeaders: true,
        legacyHeaders: false
      }));
    }
    
    return middleware;
  }

  /**
   * Enhanced cache method with strategy-based caching
   */
  async smartCache(key, fetchFunction, strategy = 'default') {
    if (!this.isInitialized) {
      console.warn('⚠️ Optimization Manager not initialized, using direct fetch');
      return await fetchFunction();
    }
    
    const cacheConfig = this.config.cacheStrategies[strategy] || { ttl: 300, staleWhileRevalidate: true };
    const startTime = Date.now();
    
    try {
      const result = await this.components.cache.getWithSWR(
        key,
        fetchFunction,
        cacheConfig.ttl,
        cacheConfig.staleWhileRevalidate
      );
      
      const duration = Date.now() - startTime;
      performanceMonitor.trackCachePerformance(result.fromCache, duration);
      
      return result.data;
    } catch (error) {
      console.error(`Cache error for key ${key}:`, error);
      performanceMonitor.trackCachePerformance(false, Date.now() - startTime);
      return await fetchFunction();
    }
  }

  /**
   * Enhanced Groq API calls with rate limiting and retries
   */
  async callGroqAPI(request, priority = 'normal') {
    if (!this.isInitialized) {
      console.warn('⚠️ Optimization Manager not initialized, using direct API call');
      // Fallback to direct call if not initialized
      return await request();
    }
    
    const startTime = Date.now();
    
    try {
      const result = await this.components.rateLimiter.executeRequest(request, { priority });
      const waitTime = Date.now() - startTime;
      
      performanceMonitor.trackGroqUsage(result.tokensUsed || 0, waitTime);
      
      return result.data;
    } catch (error) {
      const waitTime = Date.now() - startTime;
      performanceMonitor.trackGroqUsage(0, waitTime, error);
      throw error;
    }
  }

  /**
   * Enhanced database operations with connection management
   */
  async databaseOperation(operation, retries = 3) {
    if (!this.isInitialized) {
      console.warn('⚠️ Optimization Manager not initialized, using direct database operation');
      return await operation();
    }
    
    const startTime = Date.now();
    
    try {
      const result = await this.components.database.executeWithRetry(operation, retries);
      const duration = Date.now() - startTime;
      
      performanceMonitor.trackDatabaseQuery(duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      performanceMonitor.trackDatabaseQuery(duration, error);
      throw error;
    }
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus() {
    return {
      initialized: this.isInitialized,
      components: {
        cache: {
          status: this.components.cache ? 'active' : 'inactive',
          stats: this.components.cache?.getStats() || null
        },
        rateLimiter: {
          status: this.components.rateLimiter ? 'active' : 'inactive',
          stats: this.components.rateLimiter?.getStats() || null
        },
        database: {
          status: this.components.database ? 'active' : 'inactive',
          stats: this.components.database?.getStats() || null
        },
        monitoring: {
          status: 'active',
          stats: performanceMonitor.getPerformanceReport()
        }
      },
      config: this.config,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };
  }

  /**
   * Start health monitoring for all components
   */
  startHealthChecks() {
    setInterval(async () => {
      try {
        // Check cache health
        if (this.components.cache) {
          await this.components.cache.ping();
        }
        
        // Check database health
        if (this.components.database) {
          await this.components.database.healthCheck();
        }
        
        // Check rate limiter health
        if (this.components.rateLimiter) {
          const stats = this.components.rateLimiter.getStats();
          if (stats.queueLength > 50) {
            performanceMonitor.addAlert('warning', `Large Groq API queue: ${stats.queueLength} requests`);
          }
        }
        
      } catch (error) {
        performanceMonitor.addAlert('error', `Health check failed: ${error.message}`);
      }
    }, 60000); // Every minute
  }

  /**
   * Graceful shutdown of all components
   */
  async shutdown() {
    console.log('🛑 Optimization Manager shutting down...');
    
    try {
      if (this.components.database) {
        await this.components.database.disconnect();
      }
      
      if (this.components.cache) {
        await this.components.cache.close();
      }
      
      console.log('✅ Optimization Manager shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('📝 Configuration updated:', newConfig);
  }

  /**
   * Preload critical data into cache
   */
  async preloadCache() {
    console.log('🚀 Preloading critical data into cache...');
    
    try {
      // Preload recent articles
      await this.smartCache('preload:recent_articles', async () => {
        // This would typically fetch from your API
        return { preloaded: true, timestamp: Date.now() };
      }, 'articles');
      
      console.log('✅ Cache preloading complete');
    } catch (error) {
      console.error('❌ Cache preloading failed:', error);
    }
  }
}

// Create singleton instance
const optimizationManager = new OptimizationManager();

/**
 * Convenience functions for easy integration
 */
const optimizedFetch = (key, fetchFn, strategy) => 
  optimizationManager.smartCache(key, fetchFn, strategy);

const optimizedGroqCall = (request, priority) => 
  optimizationManager.callGroqAPI(request, priority);

const optimizedDbOperation = (operation, retries) => 
  optimizationManager.databaseOperation(operation, retries);

module.exports = {
  optimizationManager,
  optimizedFetch,
  optimizedGroqCall,
  optimizedDbOperation
};
