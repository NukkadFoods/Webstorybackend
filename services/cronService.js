const cron = require('node-cron');
const CacheService = require('./cache');
const { getTopStories } = require('./storyService');
const { saveArticles } = require('./db/articleService');
const DatabaseMonitor = require('./db/databaseMonitor');

class CronService {
  static initializeJobs() {
    // Pre-fetch and cache homepage content every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      console.log('🔄 Running homepage pre-fetch job');
      try {
        const articles = await getTopStories('home');
        CacheService.set('homepage:latest', articles, 300); // 5 minutes
        await saveArticles(articles);
      } catch (error) {
        console.error('❌ Homepage pre-fetch error:', error);
      }
    });

    // Pre-fetch popular categories every 30 minutes
    const popularCategories = ['technology', 'business', 'politics', 'entertainment'];
    cron.schedule('*/30 * * * *', async () => {
      console.log('🔄 Running category pre-fetch job');
      for (const category of popularCategories) {
        try {
          const articles = await getTopStories(category);
          CacheService.set(`category:${category}`, articles, 600); // 10 minutes
          await saveArticles(articles);
        } catch (error) {
          console.error(`❌ Category ${category} pre-fetch error:`, error);
        }
      }
    });

    // Database cleanup and monitoring every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      console.log('🧹 Running database cleanup job');
      try {
        // Generate database report
        const report = await DatabaseMonitor.generateReport();
        console.log('📊 Database Usage:', report.database?.usage);
        
        // Conservative cleanup only if usage is above 75%
        if (report.database?.usage?.usagePercentage > 75) {
          console.log(`⚠️ Database usage at ${report.database.usage.usagePercentage}% - running conservative cleanup...`);
          
          // Remove duplicates first (they take space unnecessarily)
          const duplicateCleanup = await DatabaseMonitor.removeDuplicates(false);
          console.log(`🧹 Removed ${duplicateCleanup.deletedCount} duplicate articles`);
          
          // Conservative cleanup: Remove only 5% of oldest articles
          const oldestCleanup = await DatabaseMonitor.cleanupOldestArticles({
            cleanupPercentage: 5,
            dryRun: false
          });
          console.log(`🧹 Removed ${oldestCleanup.deletedCount} oldest articles (5% of total)`);
          
          // Optimize indexes after cleanup
          await DatabaseMonitor.optimizeIndexes();
          console.log('⚡ Database indexes optimized');
          
          // Check new usage after cleanup
          const updatedReport = await DatabaseMonitor.generateReport();
          console.log(`📈 Storage after cleanup: ${updatedReport.database?.usage?.usagePercentage}%`);
        } else {
          console.log(`✅ Database usage at ${report.database?.usage?.usagePercentage || 0}% - no cleanup needed`);
        }
        
        // Log recommendations
        if (report.recommendations?.length > 0) {
          console.log('💡 Database Recommendations:');
          report.recommendations.forEach(rec => console.log(`  ${rec}`));
        }
      } catch (error) {
        console.error('❌ Database cleanup error:', error);
      }
    });

    // Clean up expired cache daily at midnight
    cron.schedule('0 0 * * *', async () => {
      console.log('🧹 Running cache cleanup job');
      const stats = CacheService.stats();
      console.log('📊 Cache stats before cleanup:', stats);
      
      // Generate daily database report
      try {
        const report = await DatabaseMonitor.generateReport();
        console.log('📊 Daily Database Report:');
        console.log(`  📝 Total Articles: ${report.articles?.total || 0}`);
        console.log(`  💾 Storage Used: ${report.database?.usage?.totalSizeMB || 0} MB (${report.database?.usage?.usagePercentage || 0}%)`);
        console.log(`  🆓 Remaining: ${report.database?.usage?.remainingMB || 0} MB`);
      } catch (error) {
        console.error('❌ Daily report error:', error);
      }
    });

    // Generate detailed monitoring report every hour
    cron.schedule('0 * * * *', async () => {
      console.log('📊 Generating monitoring report');
      try {
        const MonitoringService = require('./monitoringService');
        const report = await MonitoringService.generateReport();
        console.log('📊 Monitoring Report:', JSON.stringify(report.summary, null, 2));
      } catch (error) {
        console.error('❌ Monitoring report error:', error);
      }
    });

    console.log('✅ Cron jobs initialized:');
    console.log('  🔄 Homepage pre-fetch: Every 15 minutes');
    console.log('  🔄 Category pre-fetch: Every 30 minutes');
    console.log('  🧹 Database cleanup: Every 6 hours');
    console.log('  📊 Daily report: Daily at midnight');
    console.log('  📊 Monitoring: Every hour');
  }
}

module.exports = CronService;
