const CacheService = require('./cache');
const mongoose = require('mongoose');

class MonitoringService {
  static async collectMetrics() {
    const metrics = {
      timestamp: new Date(),
      redis: await this.getRedisMetrics(),
      mongodb: await this.getMongoMetrics(),
      api: await this.getAPIMetrics(),
      cache: await this.getCacheMetrics()
    };

    // Store metrics in cache for tracking
    CacheService.set(
      `metrics:${Date.now()}`,
      metrics,
      86400 // 24 hours
    );

    return metrics;
  }

  static async getRedisMetrics() {
    try {
      const stats = CacheService.stats();
      const cacheHitRate = stats.hits > 0 
        ? (stats.hits / (stats.hits + stats.misses)) * 100
        : 0;

      return {
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
        totalHits: stats.hits || 0,
        totalMisses: stats.misses || 0
      };
    } catch (error) {
      console.error('Cache metrics error:', error);
      return {
        cacheHitRate: 0,
        totalHits: 0,
        totalMisses: 0
      };
    }
  }

  static async getMongoMetrics() {
    try {
      if (mongoose.connection.readyState !== 1) {
        return {
          collections: 0,
          documentCount: 0,
          storageSize: 0,
          activeConnections: 0,
          totalOperations: {}
        };
      }

      const db = mongoose.connection.db;
      const stats = await db.stats();
      const serverStatus = await db.command({ serverStatus: 1 });

      return {
        collections: stats.collections,
        documentCount: stats.objects,
        storageSize: stats.storageSize,
        activeConnections: serverStatus.connections.current,
        totalOperations: serverStatus.opcounters
      };
    } catch (error) {
      console.error('MongoDB metrics error:', error);
      return {
        collections: 0,
        documentCount: 0,
        storageSize: 0,
        activeConnections: 0,
        totalOperations: {}
      };
    }
  }

  static async getAPIMetrics() {
    try {
      const apiCalls = CacheService.get('api-calls:total');
      const rateLimited = CacheService.get('api-calls:limited');

      return {
        totalCalls: parseInt(apiCalls) || 0,
        rateLimited: parseInt(rateLimited) || 0,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('API metrics error:', error);
      return {
        totalCalls: 0,
        rateLimited: 0,
        timestamp: new Date()
      };
    }
  }

  static async getCacheMetrics() {
    try {
      const metrics = {
        categories: {},
        searches: {}
      };

      // Get category cache stats
      const categories = ['technology', 'business', 'politics', 'entertainment'];
      for (const category of categories) {
        const hits = CacheService.get(`cache:category:${category}:hit`) || 0;
        const misses = CacheService.get(`cache:category:${category}:miss`) || 0;
        metrics.categories[category] = {
          hits: parseInt(hits),
          misses: parseInt(misses)
        };
      }

      return metrics;
    } catch (error) {
      console.error('Cache metrics error:', error);
      return {
        categories: {},
        searches: {}
      };
    }
  }

  // Generate monitoring report
  static async generateReport() {
    const metrics = await this.collectMetrics();
    
    const report = {
      summary: {
        cacheEfficiency: `${metrics.redis.cacheHitRate}% hit rate`,
        databaseHealth: metrics.mongodb.activeConnections < 100 ? 'Good' : 'Warning',
        apiUsage: `${metrics.api.totalCalls} calls (${metrics.api.rateLimited} rate limited)`
      },
      details: metrics
    };

    // Store report in cache
    CacheService.set(
      `report:${Date.now()}`,
      report,
      86400 // 24 hours
    );

    return report;
  }

  static async getMetricsHistory() {
    // This would typically fetch from a time-series database
    // For now, return mock data
    return {
      hourly: [],
      daily: [],
      weekly: []
    };
  }
}

module.exports = MonitoringService;
