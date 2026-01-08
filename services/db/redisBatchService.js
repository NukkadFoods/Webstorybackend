/**
 * Redis Batch Update Service
 * 
 * Pushes fresh articles to Redis every 15 minutes
 * Keeps top 5 articles per section, removes stale articles
 * Only runs after threshold is met (8-10 articles per section)
 */

const CacheService = require('../cache');
const Article = require('../../models/article');
const thresholdService = require('./thresholdService');

class RedisBatchService {
  constructor() {
    this.sections = [
      'world', 'us', 'politics', 'business',
      'technology', 'health', 'sports', 'entertainment', 'finance'
    ];
    this.isRunning = false;
    this.intervalId = null;
    this.articlesPerSection = 5; // Top 5 articles per section
  }

  /**
   * Start batch update service (every 15 minutes)
   * Only starts if threshold is met
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Redis Batch Service already running');
      return;
    }

    // Check threshold before starting
    const status = await thresholdService.displayStatus();
    
    if (!status.thresholdMet) {
      console.log('⏳ Redis Batch Service NOT started - Waiting for threshold');
      console.log('💡 Service will check threshold every 15 minutes\n');
      
      // Check threshold periodically and start when ready
      this.intervalId = setInterval(async () => {
        const newStatus = await thresholdService.checkThreshold();
        if (newStatus.thresholdMet) {
          console.log('\n✅ Threshold met! Starting Redis Batch Service...\n');
          clearInterval(this.intervalId);
          this.startBatchUpdates();
        }
      }, 15 * 60 * 1000); // Check every 15 minutes
      
      return;
    }

    this.startBatchUpdates();
  }

  /**
   * Actually start the batch update process
   */
  startBatchUpdates() {
    this.isRunning = true;
    console.log('▶️  Starting Redis Batch Service (15 min intervals)');
    console.log(`   Updates top ${this.articlesPerSection} fresh articles per section in Redis`);

    // Run immediately
    this.updateAllSections();

    // Then run every 15 minutes
    this.intervalId = setInterval(() => {
      this.updateAllSections();
    }, 15 * 60 * 1000); // 15 minutes
  }

  /**
   * Stop batch service
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️  Redis Batch Service not running');
      return;
    }

    clearInterval(this.intervalId);
    this.isRunning = false;
    console.log('⏹️  Redis Batch Service stopped');
  }

  /**
   * Update all sections in Redis
   */
  async updateAllSections() {
    console.log('\n🔄 [Redis Batch] Starting batch update for all sections...');
    
    let totalUpdated = 0;
    let totalRemoved = 0;

    for (const section of this.sections) {
      try {
        const { updated, removed } = await this.updateSection(section);
        totalUpdated += updated;
        totalRemoved += removed;
      } catch (error) {
        console.error(`❌ Error updating section ${section}:`, error.message);
      }
    }

    console.log(`✅ [Redis Batch] Complete: ${totalUpdated} articles updated, ${totalRemoved} stale articles removed\n`);
  }

  /**
   * Update a single section in Redis
   * @param {string} section - Section name
   * @returns {Object} - {updated, removed} counts
   */
  async updateSection(section) {
    try {
      // 1. Get top 5 fresh articles WITH commentary from DB
      const freshArticles = await Article.find({
        section,
        aiCommentary: { $exists: true, $ne: null, $ne: '' }
      })
      .sort({ publishedDate: -1, createdAt: -1 })
      .limit(this.articlesPerSection)
      .lean();

      if (freshArticles.length === 0) {
        console.log(`⚠️  [${section}] No articles with commentary found`);
        return { updated: 0, removed: 0 };
      }

      let updated = 0;

      // 2. Cache individual articles in Redis
      const articleIds = [];
      for (const article of freshArticles) {
        const cacheKey = `article:${article.id || article._id}`;
        
        // ✅ Check if already in Redis (duplicate prevention)
        const existing = await CacheService.get(cacheKey);
        
        if (!existing) {
          await CacheService.set(cacheKey, JSON.stringify(article), 1800); // 30 min TTL
          updated++;
        }
        
        articleIds.push(article.id || article._id.toString());
      }

      // 3. Use FIFO cache management for the section
      // When adding new articles, oldest articles are automatically removed to prevent crowding
      const { added, removed } = await CacheService.manageSectionCacheFIFO(section, articleIds, 20);

      return { updated, removed };

    } catch (error) {
      console.error(`❌ Error in updateSection for ${section}:`, error.message);
      return { updated: 0, removed: 0 };
    }
  }

  /**
   * Get section statistics
   */
  async getSectionStats(section) {
    try {
      const dbCount = await Article.countDocuments({
        section,
        aiCommentary: { $exists: true, $ne: null, $ne: '' }
      });

      const sectionKey = `section:${section}:fresh`;
      const cached = await CacheService.get(sectionKey);
      const redisCount = cached ? JSON.parse(cached).length : 0;

      return {
        section,
        dbArticles: dbCount,
        redisCached: redisCount
      };
    } catch (error) {
      return {
        section,
        dbArticles: 0,
        redisCached: 0,
        error: error.message
      };
    }
  }

  /**
   * Get all sections statistics
   */
  async getAllStats() {
    const stats = [];
    for (const section of this.sections) {
      const sectionStats = await this.getSectionStats(section);
      stats.push(sectionStats);
    }
    return stats;
  }
}

module.exports = new RedisBatchService();
