/**
 * Redis Refresh Service
 * 
 * Refreshes Redis cache from MongoDB in LIFO (Last In First Out) order
 * Runs every 30 minutes to keep Redis cache fresh with latest articles
 * 
 * LIFO ensures newest articles get cached first, which is what users want to see
 */

const CacheService = require('./cache');
const Article = require('../models/article');

class RedisRefreshService {
  constructor() {
    this.isRefreshing = false;
    this.lastRefresh = null;
    this.batchSize = 50; // Refresh 50 articles per batch
  }

  /**
   * Refresh Redis cache with latest articles from MongoDB (LIFO)
   * @returns {Promise<Object>} Refresh statistics
   */
  async refreshCache() {
    if (this.isRefreshing) {
      // console.log('⏭️  Redis refresh already in progress, skipping...');
      return { skipped: true };
    }

    try {
      this.isRefreshing = true;
      const startTime = Date.now();

      // console.log('\n🔄 Starting Redis LIFO refresh from MongoDB...');

      // Fetch latest articles with commentary (LIFO - newest first)
      const articles = await Article.find({
        aiCommentary: { $exists: true, $ne: null }
      })
        .sort({ publishedDate: -1 }) // Newest first (LIFO)
        .limit(this.batchSize)
        .select('_id title headline abstract url imageUrl byline section publishedDate aiCommentary')
        .lean();

      if (!articles || articles.length === 0) {
        // console.log('⚠️  No articles with commentary found in MongoDB');
        return { success: false, message: 'No articles found' };
      }

      // console.log(`📦 Found ${articles.length} articles to cache`);

      let cached = 0;
      let failed = 0;

      // Cache each article to Redis with 30min TTL
      for (const article of articles) {
        try {
          const cacheKey = `article:${article._id}`;
          const cacheData = {
            _id: article._id,
            title: article.title,
            headline: article.headline || article.title,
            abstract: article.abstract,
            url: article.url,
            imageUrl: article.imageUrl,
            byline: article.byline,
            section: article.section,
            publishedDate: article.publishedDate,
            aiCommentary: article.aiCommentary,
            _cachedAt: new Date(),
            _commentarySource: 'database-refresh'
          };

          await CacheService.set(cacheKey, JSON.stringify(cacheData), 1800); // 30 min TTL
          cached++;

          // Log first few to show progress
          if (cached <= 3) {
            // console.log(`  ✅ Cached: ${article.title.substring(0, 50)}...`);
          }
        } catch (err) {
          failed++;
          console.error(`  ❌ Failed to cache article ${article._id}:`, err.message);
        }
      }

      const duration = Date.now() - startTime;
      this.lastRefresh = new Date();

      const stats = {
        success: true,
        cached,
        failed,
        total: articles.length,
        duration: `${duration}ms`,
        timestamp: this.lastRefresh
      };

      // console.log(`✅ Redis refresh complete: ${cached} cached, ${failed} failed in ${duration}ms`);
      // console.log(`📊 Next refresh scheduled for 30 minutes from now\n`);

      return stats;

    } catch (error) {
      console.error('❌ Redis refresh failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Start automatic refresh every 30 minutes
   */
  startAutoRefresh() {
    // console.log('🚀 Starting Redis auto-refresh (every 30 minutes, LIFO order)...');

    // Run immediately on startup
    this.refreshCache();

    // Then run every 30 minutes
    setInterval(() => {
      this.refreshCache();
    }, 30 * 60 * 1000); // 30 minutes
  }

  /**
   * Get refresh status
   */
  getStatus() {
    return {
      isRefreshing: this.isRefreshing,
      lastRefresh: this.lastRefresh,
      batchSize: this.batchSize,
      nextRefresh: this.lastRefresh
        ? new Date(this.lastRefresh.getTime() + 30 * 60 * 1000)
        : null
    };
  }
}

module.exports = new RedisRefreshService();
