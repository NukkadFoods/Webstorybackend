/**
 * 📊 Advanced Performance Monitoring System
 * Real-time tracking of API performance, cache efficiency, and system health
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      api: {
        totalRequests: 0,
        avgResponseTime: 0,
        slowRequests: 0,
        errorRate: 0,
        endpoints: {}
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0,
        avgResponseTime: 0
      },
      groq: {
        tokensUsed: 0,
        requestsCompleted: 0,
        requestsQueued: 0,
        errors: 0,
        avgWaitTime: 0
      },
      database: {
        connections: 0,
        avgQueryTime: 0,
        slowQueries: 0,
        errors: 0
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };
    
    this.alerts = [];
    this.thresholds = {
      slowRequest: 1000,     // 1 second
      highErrorRate: 0.05,   // 5%
      lowCacheHitRate: 0.8,  // 80%
      highMemoryUsage: 0.95, // 95% (increased from 90%)
      slowDbQuery: 500       // 500ms
    };
    
    // Start monitoring
    this.startSystemMonitoring();
    console.log('📊 Performance monitoring initialized');
  }

  /**
   * Track API request performance
   */
  trackAPIRequest(req, res, duration, error = null) {
    const endpoint = this.normalizeEndpoint(req.path);
    
    // Initialize endpoint metrics if not exists
    if (!this.metrics.api.endpoints[endpoint]) {
      this.metrics.api.endpoints[endpoint] = {
        requests: 0,
        avgResponseTime: 0,
        errors: 0,
        slowRequests: 0
      };
    }
    
    const endpointMetrics = this.metrics.api.endpoints[endpoint];
    
    // Update overall API metrics
    this.metrics.api.totalRequests++;
    this.metrics.api.avgResponseTime = this.updateAverage(
      this.metrics.api.avgResponseTime,
      duration,
      this.metrics.api.totalRequests
    );
    
    // Update endpoint metrics
    endpointMetrics.requests++;
    endpointMetrics.avgResponseTime = this.updateAverage(
      endpointMetrics.avgResponseTime,
      duration,
      endpointMetrics.requests
    );
    
    // Track slow requests
    if (duration > this.thresholds.slowRequest) {
      this.metrics.api.slowRequests++;
      endpointMetrics.slowRequests++;
      
      this.addAlert('warning', `Slow API request: ${endpoint} took ${duration}ms`);
    }
    
    // Track errors
    if (error) {
      endpointMetrics.errors++;
      this.metrics.api.errorRate = this.calculateErrorRate();
      
      this.addAlert('error', `API error in ${endpoint}: ${error.message}`);
    }
  }

  /**
   * Track cache performance
   */
  trackCachePerformance(hit, duration = 0) {
    if (hit) {
      this.metrics.cache.hits++;
    } else {
      this.metrics.cache.misses++;
    }
    
    const totalCacheRequests = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = this.metrics.cache.hits / totalCacheRequests;
    
    if (duration > 0) {
      this.metrics.cache.avgResponseTime = this.updateAverage(
        this.metrics.cache.avgResponseTime,
        duration,
        totalCacheRequests
      );
    }
    
    // Alert on low cache hit rate
    if (this.metrics.cache.hitRate < this.thresholds.lowCacheHitRate && totalCacheRequests > 100) {
      this.addAlert('warning', `Low cache hit rate: ${(this.metrics.cache.hitRate * 100).toFixed(2)}%`);
    }
  }

  /**
   * Track Groq API usage
   */
  trackGroqUsage(tokensUsed, waitTime = 0, error = null) {
    this.metrics.groq.tokensUsed += tokensUsed;
    
    if (error) {
      this.metrics.groq.errors++;
      this.addAlert('error', `Groq API error: ${error.message}`);
    } else {
      this.metrics.groq.requestsCompleted++;
    }
    
    if (waitTime > 0) {
      this.metrics.groq.avgWaitTime = this.updateAverage(
        this.metrics.groq.avgWaitTime,
        waitTime,
        this.metrics.groq.requestsCompleted
      );
    }
    
    // Alert on high token usage
    if (this.metrics.groq.tokensUsed > 5000) { // Approaching 6000 limit
      this.addAlert('warning', `High Groq token usage: ${this.metrics.groq.tokensUsed}/6000`);
    }
  }

  /**
   * Track database performance
   */
  trackDatabaseQuery(duration, error = null) {
    this.metrics.database.connections++;
    this.metrics.database.avgQueryTime = this.updateAverage(
      this.metrics.database.avgQueryTime,
      duration,
      this.metrics.database.connections
    );
    
    if (duration > this.thresholds.slowDbQuery) {
      this.metrics.database.slowQueries++;
      this.addAlert('warning', `Slow database query: ${duration}ms`);
    }
    
    if (error) {
      this.metrics.database.errors++;
      this.addAlert('error', `Database error: ${error.message}`);
    }
  }

  /**
   * Start system-level monitoring
   */
  startSystemMonitoring() {
    setInterval(() => {
      // Update system metrics
      this.metrics.system.uptime = process.uptime();
      this.metrics.system.memoryUsage = process.memoryUsage();
      this.metrics.system.cpuUsage = process.cpuUsage();
      
      // Check memory usage
      const memUsagePercent = this.metrics.system.memoryUsage.heapUsed / this.metrics.system.memoryUsage.heapTotal;
      if (memUsagePercent > this.thresholds.highMemoryUsage) {
        this.addAlert('warning', `High memory usage: ${(memUsagePercent * 100).toFixed(2)}%`);
        
        // Suggest garbage collection for very high usage
        if (memUsagePercent > 0.98 && global.gc) {
          try {
            global.gc();
            console.log('🧹 Performed garbage collection due to high memory usage');
          } catch (e) {
            console.log('💡 Consider running with --expose-gc flag for automatic garbage collection');
          }
        }
      }
      
      // Clean old alerts (keep last 100)
      if (this.alerts.length > 100) {
        this.alerts = this.alerts.slice(-100);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Add alert to the system
   */
  addAlert(level, message) {
    const alert = {
      level,
      message,
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random()
    };
    
    this.alerts.unshift(alert);
    
    // Log critical alerts
    if (level === 'error') {
      console.error(`🚨 ALERT: ${message}`);
    } else if (level === 'warning') {
      console.warn(`⚠️ WARNING: ${message}`);
    }
  }

  /**
   * Get comprehensive performance report
   */
  getPerformanceReport() {
    return {
      summary: {
        totalRequests: this.metrics.api.totalRequests,
        avgResponseTime: Math.round(this.metrics.api.avgResponseTime),
        cacheHitRate: (this.metrics.cache.hitRate * 100).toFixed(2) + '%',
        uptime: Math.round(this.metrics.system.uptime),
        errorRate: (this.metrics.api.errorRate * 100).toFixed(2) + '%'
      },
      detailed: this.metrics,
      alerts: this.alerts.slice(0, 20), // Last 20 alerts
      health: this.getHealthStatus(),
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Get system health status
   */
  getHealthStatus() {
    const issues = [];
    
    if (this.metrics.api.errorRate > this.thresholds.highErrorRate) {
      issues.push('High API error rate');
    }
    
    if (this.metrics.cache.hitRate < this.thresholds.lowCacheHitRate) {
      issues.push('Low cache hit rate');
    }
    
    const memUsagePercent = this.metrics.system.memoryUsage.heapUsed / this.metrics.system.memoryUsage.heapTotal;
    if (memUsagePercent > this.thresholds.highMemoryUsage) {
      issues.push('High memory usage');
    }
    
    return {
      status: issues.length === 0 ? 'healthy' : 'needs_attention',
      issues,
      score: Math.max(0, 100 - (issues.length * 20))
    };
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    // API performance recommendations
    if (this.metrics.api.avgResponseTime > this.thresholds.slowRequest) {
      recommendations.push({
        category: 'API Performance',
        suggestion: 'Consider implementing response compression and query optimization',
        priority: 'high'
      });
    }
    
    // Cache recommendations
    if (this.metrics.cache.hitRate < this.thresholds.lowCacheHitRate) {
      recommendations.push({
        category: 'Caching',
        suggestion: 'Increase cache TTL or implement more aggressive caching strategies',
        priority: 'medium'
      });
    }
    
    // Database recommendations
    if (this.metrics.database.avgQueryTime > this.thresholds.slowDbQuery) {
      recommendations.push({
        category: 'Database',
        suggestion: 'Add database indexes or optimize query patterns',
        priority: 'high'
      });
    }
    
    // Groq usage recommendations
    const groqUsagePercent = this.metrics.groq.tokensUsed / 6000;
    if (groqUsagePercent > 0.8) {
      recommendations.push({
        category: 'AI Usage',
        suggestion: 'Implement more aggressive rate limiting or queue management',
        priority: 'high'
      });
    }
    
    return recommendations;
  }

  /**
   * Utility functions
   */
  updateAverage(currentAvg, newValue, count) {
    return ((currentAvg * (count - 1)) + newValue) / count;
  }

  calculateErrorRate() {
    const totalErrors = Object.values(this.metrics.api.endpoints)
      .reduce((sum, endpoint) => sum + endpoint.errors, 0);
    return this.metrics.api.totalRequests > 0 ? totalErrors / this.metrics.api.totalRequests : 0;
  }

  normalizeEndpoint(path) {
    // Normalize dynamic paths like /api/articles/123 to /api/articles/:id
    return path
      .replace(/\/[0-9a-f]{24}/g, '/:id') // MongoDB ObjectIds
      .replace(/\/\d+/g, '/:id')          // Numeric IDs
      .replace(/\/[^\/]+\?/g, '/:param?') // Query parameters
      .substring(0, 50); // Limit length
  }

  /**
   * Reset metrics (for testing or maintenance)
   */
  resetMetrics() {
    this.metrics = {
      api: { totalRequests: 0, avgResponseTime: 0, slowRequests: 0, errorRate: 0, endpoints: {} },
      cache: { hits: 0, misses: 0, hitRate: 0, avgResponseTime: 0 },
      groq: { tokensUsed: 0, requestsCompleted: 0, requestsQueued: 0, errors: 0, avgWaitTime: 0 },
      database: { connections: 0, avgQueryTime: 0, slowQueries: 0, errors: 0 },
      system: { uptime: process.uptime(), memoryUsage: process.memoryUsage(), cpuUsage: process.cpuUsage() }
    };
    this.alerts = [];
    console.log('📊 Performance metrics reset');
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

/**
 * Express middleware for automatic performance tracking
 */
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Track when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const error = res.statusCode >= 400 ? new Error(`HTTP ${res.statusCode}`) : null;
    performanceMonitor.trackAPIRequest(req, res, duration, error);
  });
  
  // Add performance tracking methods to request
  req.trackCache = (hit, duration) => performanceMonitor.trackCachePerformance(hit, duration);
  req.trackGroq = (tokens, waitTime, error) => performanceMonitor.trackGroqUsage(tokens, waitTime, error);
  req.trackDb = (duration, error) => performanceMonitor.trackDatabaseQuery(duration, error);
  
  next();
};

/**
 * Express route for performance dashboard
 */
const createDashboardRoute = () => {
  return (req, res) => {
    res.json(performanceMonitor.getPerformanceReport());
  };
};

module.exports = {
  performanceMonitor,
  performanceMiddleware,
  createDashboardRoute
};
