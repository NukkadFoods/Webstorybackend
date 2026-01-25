const mongoose = require('mongoose');
const Article = require('../../models/article');

class DatabaseMonitor {
  /**
   * Get database statistics and storage usage
   */
  static async getDatabaseStats() {
    try {
      const db = mongoose.connection.db;
      
      // Get database stats using admin command
      const stats = await db.admin().command({ dbStats: 1 });
      
      // Get collection stats
      const collections = await db.listCollections().toArray();
      const collectionStats = {};
      
      for (const collection of collections) {
        try {
          const collectionStat = await db.admin().command({ collStats: collection.name });
          collectionStats[collection.name] = {
            count: collectionStat.count || 0,
            size: collectionStat.size || 0,
            storageSize: collectionStat.storageSize || 0,
            avgObjSize: collectionStat.avgObjSize || 0,
            totalIndexSize: collectionStat.totalIndexSize || 0
          };
        } catch (err) {
          // Fallback for collections without stats
          const count = await db.collection(collection.name).countDocuments();
          collectionStats[collection.name] = {
            count,
            size: 0,
            storageSize: 0,
            avgObjSize: 0,
            totalIndexSize: 0
          };
        }
      }
      
      return {
        database: {
          name: stats.db,
          collections: stats.collections,
          views: stats.views,
          objects: stats.objects,
          avgObjSize: stats.avgObjSize,
          dataSize: stats.dataSize,
          storageSize: stats.storageSize,
          totalIndexSize: stats.totalIndexSize,
          fsTotalSize: stats.fsTotalSize,
          fsUsedSize: stats.fsUsedSize
        },
        collections: collectionStats,
        usage: {
          totalSizeMB: Math.round(stats.storageSize / (1024 * 1024) * 100) / 100,
          freeTierLimitMB: 512,
          usagePercentage: Math.round((stats.storageSize / (512 * 1024 * 1024)) * 100 * 100) / 100,
          remainingMB: Math.round((512 - (stats.storageSize / (1024 * 1024))) * 100) / 100
        }
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return null;
    }
  }

  /**
   * Get article count and age distribution
   */
  static async getArticleStats() {
    try {
      const total = await Article.countDocuments();
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        todayCount,
        yesterdayCount,
        weekCount,
        monthCount,
        oldCount
      ] = await Promise.all([
        Article.countDocuments({ createdAt: { $gte: today } }),
        Article.countDocuments({ createdAt: { $gte: yesterday, $lt: today } }),
        Article.countDocuments({ createdAt: { $gte: weekAgo, $lt: yesterday } }),
        Article.countDocuments({ createdAt: { $gte: monthAgo, $lt: weekAgo } }),
        Article.countDocuments({ createdAt: { $lt: monthAgo } })
      ]);

      // Get categories distribution
      const categoryStats = await Article.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      return {
        total,
        byAge: {
          today: todayCount,
          yesterday: yesterdayCount,
          lastWeek: weekCount,
          lastMonth: monthCount,
          older: oldCount
        },
        byCategory: categoryStats.reduce((acc, item) => {
          acc[item._id || 'uncategorized'] = item.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Failed to get article stats:', error);
      return null;
    }
  }

  /**
   * Clean up oldest articles by insertion order (createdAt), not publication date
   */
  static async cleanupOldestArticles(options = {}) {
    const {
      cleanupPercentage = 5, // 5% of total articles
      maxToDelete = 100,     // Safety limit
      dryRun = false
    } = options;

    try {
      // Get total article count
      const totalArticles = await Article.countDocuments();
      
      if (totalArticles === 0) {
        return {
          dryRun,
          totalArticles: 0,
          toDelete: 0,
          deletedCount: 0,
          message: 'No articles found in database'
        };
      }

      // Calculate how many articles to delete (oldest by insertion order)
      const articlesToDelete = Math.min(
        Math.floor(totalArticles * (cleanupPercentage / 100)),
        maxToDelete
      );

      if (articlesToDelete === 0) {
        return {
          dryRun,
          totalArticles,
          toDelete: 0,
          deletedCount: 0,
          message: 'Cleanup percentage too small - no articles to delete'
        };
      }

      // Find the oldest articles by createdAt (insertion order)
      const oldestArticles = await Article.find()
        .sort({ createdAt: 1 }) // 1 = ascending (oldest first)
        .limit(articlesToDelete)
        .select('_id title createdAt publishedDate');

      if (dryRun) {
        console.log(`🔍 DRY RUN: Would delete ${oldestArticles.length} oldest articles (${cleanupPercentage}% of ${totalArticles})`);
        return {
          dryRun: true,
          totalArticles,
          toDelete: articlesToDelete,
          wouldDelete: oldestArticles.length,
          articles: oldestArticles.map(article => ({
            id: article._id,
            title: article.title.substring(0, 50) + '...',
            insertedAgo: Math.floor((Date.now() - article.createdAt) / (24 * 60 * 60 * 1000)),
            publishedAgo: Math.floor((Date.now() - article.publishedDate) / (24 * 60 * 60 * 1000))
          }))
        };
      }

      // Actually delete the oldest articles
      const articleIds = oldestArticles.map(article => article._id);
      const deleteResult = await Article.deleteMany({
        _id: { $in: articleIds }
      });

      console.log(`🧹 Cleaned up ${deleteResult.deletedCount} oldest articles (${cleanupPercentage}% of ${totalArticles})`);
      
      return {
        dryRun: false,
        totalArticles,
        toDelete: articlesToDelete,
        deletedCount: deleteResult.deletedCount,
        cleanupPercentage,
        remainingArticles: totalArticles - deleteResult.deletedCount
      };
    } catch (error) {
      console.error('Failed to cleanup oldest articles:', error);
      throw error;
    }
  }

  /**
   * Clean up old articles based on date threshold (keep for compatibility)
   */
  static async cleanupOldArticles(options = {}) {
    const {
      cleanupPercentage = 5, // Clean up 5% of oldest articles
      dryRun = false
    } = options;

    try {
      // Get total article count
      const totalArticles = await Article.countDocuments();
      const articlesToDelete = Math.floor(totalArticles * (cleanupPercentage / 100));
      
      if (articlesToDelete === 0) {
        console.log('📊 No articles to clean up');
        return { deletedCount: 0, totalArticles, percentage: cleanupPercentage };
      }
      
      // Find oldest articles to delete
      const oldestArticles = await Article.find()
        .sort({ createdAt: 1 }) // Oldest first
        .limit(articlesToDelete)
        .select('_id title createdAt category');

      if (dryRun) {
        console.log(`🔍 DRY RUN: Would delete ${articlesToDelete} oldest articles (${cleanupPercentage}% of ${totalArticles})`);
        return {
          dryRun: true,
          wouldDelete: articlesToDelete,
          totalArticles,
          percentage: cleanupPercentage,
          oldestDate: oldestArticles[0]?.createdAt,
          newestToDelete: oldestArticles[oldestArticles.length - 1]?.createdAt,
          articles: oldestArticles.map(a => ({
            id: a._id,
            title: a.title.substring(0, 50),
            age: Math.floor((Date.now() - a.createdAt) / (24 * 60 * 60 * 1000)),
            category: a.category
          }))
        };
      }

      // Delete oldest articles
      const articleIds = oldestArticles.map(a => a._id);
      const deleteResult = await Article.deleteMany({
        _id: { $in: articleIds }
      });

      console.log(`🧹 Cleaned up ${deleteResult.deletedCount} oldest articles (${cleanupPercentage}% of total)`);
      
      return {
        deletedCount: deleteResult.deletedCount,
        totalArticles,
        percentage: cleanupPercentage,
        oldestDeleted: oldestArticles[0]?.createdAt,
        newestDeleted: oldestArticles[oldestArticles.length - 1]?.createdAt
      };
    } catch (error) {
      console.error('Failed to cleanup oldest articles:', error);
      throw error;
    }
  }

  /**
   * Remove duplicate articles based on URL
   */
  static async removeDuplicates(dryRun = false) {
    try {
      // Find duplicates by URL
      const duplicates = await Article.aggregate([
        { $group: { _id: '$url', count: { $sum: 1 }, docs: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } }
      ]);

      let totalToDelete = 0;
      const deletionResults = [];

      for (const duplicate of duplicates) {
        // Keep the newest, delete the rest
        const docsToDelete = duplicate.docs.slice(1); // Keep first, delete rest
        totalToDelete += docsToDelete.length;

        if (!dryRun) {
          const deleteResult = await Article.deleteMany({
            _id: { $in: docsToDelete }
          });
          deletionResults.push({
            url: duplicate._id,
            duplicatesFound: duplicate.count,
            deleted: deleteResult.deletedCount
          });
        }
      }

      if (dryRun) {
        console.log(`🔍 DRY RUN: Would remove ${totalToDelete} duplicate articles`);
        return {
          dryRun: true,
          wouldDelete: totalToDelete,
          duplicateGroups: duplicates.length
        };
      }

      console.log(`🧹 Removed ${totalToDelete} duplicate articles`);
      return {
        deletedCount: totalToDelete,
        duplicateGroups: duplicates.length,
        results: deletionResults
      };
    } catch (error) {
      console.error('Failed to remove duplicates:', error);
      throw error;
    }
  }

  /**
   * Optimize database indexes
   */
  static async optimizeIndexes() {
    try {
      const db = mongoose.connection.db;
      const collection = db.collection('articles');
      
      // Get current indexes
      const indexes = await collection.indexes();
      console.log('Current indexes:', indexes.map(i => i.name));
      
      // Ensure required indexes exist
      const requiredIndexes = [
        { url: 1 }, // For finding by URL
        { publishedDate: -1 }, // For sorting by date
        { category: 1, publishedDate: -1 }, // For category queries
        { createdAt: 1 }, // For cleanup operations
        { title: 'text', content: 'text' } // For search
      ];

      for (const indexSpec of requiredIndexes) {
        try {
          await collection.createIndex(indexSpec);
          console.log(`✅ Ensured index:`, indexSpec);
        } catch (error) {
          if (!error.message.includes('already exists')) {
            console.error('Failed to create index:', indexSpec, error.message);
          }
        }
      }

      return { success: true, indexesChecked: requiredIndexes.length };
    } catch (error) {
      console.error('Failed to optimize indexes:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive database report
   */
  static async generateReport() {
    try {
      console.log('📊 Generating database report...');
      
      const [dbStats, articleStats] = await Promise.all([
        this.getDatabaseStats(),
        this.getArticleStats()
      ]);

      const report = {
        timestamp: new Date().toISOString(),
        database: dbStats,
        articles: articleStats,
        recommendations: []
      };

      // Add recommendations based on usage
      if (dbStats?.usage.usagePercentage > 80) {
        report.recommendations.push('⚠️ Database usage above 80% - consider cleanup');
      }
      
      if (dbStats?.usage.usagePercentage > 90) {
        report.recommendations.push('🚨 Database usage above 90% - immediate cleanup needed');
      }

      if (articleStats?.total > 2000) {
        report.recommendations.push('📝 Consider reducing article retention period');
      }

      if (articleStats?.byAge.older > 500) {
        report.recommendations.push('🧹 Many old articles - run cleanup job');
      }

      return report;
    } catch (error) {
      console.error('Failed to generate database report:', error);
      return { error: error.message, timestamp: new Date().toISOString() };
    }
  }
}

module.exports = DatabaseMonitor;
