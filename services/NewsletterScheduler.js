const cron = require('node-cron');
const Subscriber = require('../models/Subscriber');
const AllUsers = require('../models/AllUsers');
const NewsletterHistory = require('../models/NewsletterHistory');
const NewsletterService = require('./NewsletterService');

class NewsletterScheduler {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  // Start the scheduler
  start() {
    if (this.isRunning) {
      console.log('📧 Newsletter scheduler is already running');
      return;
    }

    console.log('🚀 Starting newsletter scheduler...');
    
    // Schedule daily at 1:35 AM IST (8:05 PM UTC) - TESTING
    this.cronJob = cron.schedule('5 20 * * *', async () => {
      console.log('⏰ Daily newsletter cron triggered at 1:35 AM IST (TESTING)');
      await this.sendHourlyNewsletters();
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.isRunning = true;
    console.log('✅ Newsletter scheduler started - running daily at 1:35 AM IST (TESTING)');
  }

  // Stop the scheduler
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log('⏹️ Newsletter scheduler stopped');
  }

  // Send newsletters to all active subscribers
  async sendHourlyNewsletters() {
    const newsletterService = new NewsletterService();
    let newsletterHistory = null;
    
    try {
      // Create newsletter history entry
      const currentHour = new Date().getUTCHours();
      newsletterHistory = new NewsletterHistory({
        scheduledTime: new Date(),
        executionHour: currentHour,
        triggerType: 'cron',
        status: 'scheduled'
      });
      await newsletterHistory.save();
      console.log(`📊 Created newsletter history entry: ${newsletterHistory._id}`);
      
      console.log(`📬 Starting newsletter send at 1:35 AM IST (8:05 PM UTC) - TESTING`);
      await newsletterHistory.markAsStarted();

      // Get all active subscribers
      const subscribers = await Subscriber.find({ isActive: true });
      
      if (subscribers.length === 0) {
        console.log('📭 No active subscribers found');
        newsletterHistory.status = 'completed';
        newsletterHistory.totalSubscribers = 0;
        await newsletterHistory.save();
        return {
          success: true,
          message: 'No active subscribers',
          historyId: newsletterHistory._id
        };
      }

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      let allSentArticles = []; // Track all articles sent

      // Process subscribers in batches
      const batchSize = 10;
      for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (subscriber) => {
          try {
            const result = await newsletterService.sendNewsletterToSubscriber(subscriber);
            
            if (result.success && !result.skipped) {
              return { 
                success: true, 
                articlesCount: result.articlesCount,
                articles: result.articles || [] // Include articles in response
              };
            }
            
            return result;
          } catch (error) {
            console.error(`❌ Error processing subscriber ${subscriber.email}:`, error);
            
            newsletterHistory.errorMessages.push({
              subscriberEmail: subscriber.email,
              error: error.message,
              timestamp: new Date()
            });
            
            return { success: false, error: error.message };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach((result, index) => {
          const subscriber = batch[index];
          if (result.success && !result.skipped) {
            successCount++;
            // Collect unique articles sent
            if (result.articles && result.articles.length > 0) {
              result.articles.forEach(article => {
                const articleId = article.id || article._id;
                if (!allSentArticles.find(a => (a.id || a._id) === articleId)) {
                  allSentArticles.push(article);
                }
              });
            }
          } else if (result.skipped) {
            skippedCount++;
          } else {
            errorCount++;
            // Track error details
            if (result.error && subscriber) {
              newsletterHistory.errorMessages.push({
                subscriberEmail: subscriber.email,
                error: result.error,
                timestamp: new Date()
              });
            }
          }
        });

        if (i + batchSize < subscribers.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Calculate next scheduled run
      const nextRun = new Date();
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      nextRun.setUTCHours(20, 5, 0, 0); // 8:05 PM UTC = 1:35 AM IST
      
      const results = {
        successCount,
        errorCount,
        skippedCount
      };
      
      await newsletterHistory.markAsCompleted(results);
      
      // Add articles to newsletter history
      if (allSentArticles.length > 0) {
        const articleEntries = allSentArticles.map(article => ({
          articleId: article.id || article._id,
          title: article.title,
          section: article.section || article.category,
          source: article.source,
          publishedDate: article.publishedDate || article.publishedAt,
          sentToCount: successCount
        }));
        
        newsletterHistory.articlesSent = articleEntries;
        await newsletterHistory.save();
        console.log(`📰 Added ${allSentArticles.length} articles to newsletter history`);
      }
      
      newsletterHistory.nextScheduledRun = nextRun;
      await newsletterHistory.save();

      const totalProcessed = successCount + errorCount + skippedCount;
      console.log(`✅ Newsletter batch complete: ${successCount} sent, ${errorCount} errors, ${skippedCount} skipped (${totalProcessed}/${subscribers.length})`);
      
      return {
        success: true,
        message: 'Newsletter sending completed',
        results: results,
        totalSubscribers: subscribers.length,
        nextScheduledRun: nextRun,
        historyId: newsletterHistory._id
      };
      
    } catch (error) {
      console.error('❌ Error in hourly newsletter send:', error);
      
      if (newsletterHistory) {
        await newsletterHistory.markAsFailed(error);
      }
      
      return {
        success: false,
        error: error.message,
        historyId: newsletterHistory?._id
      };
    }
  }

  // Manual trigger for testing
  async sendTestNewsletter() {
    console.log('🧪 Sending test newsletter...');
    return await this.sendHourlyNewsletters();
  }

  // Get scheduler status
  async getStatus() {
    try {
      const newsletterService = new NewsletterService();
      const lastNewsletter = await NewsletterHistory.getLastNewsletter();
      const schedulingStats = await NewsletterHistory.getSchedulingStats();
      
      return {
        isRunning: this.isRunning,
        nextRun: this.cronJob ? this.getNextScheduledTime() : null,
        currentHour: newsletterService.getCurrentHour(),
        lastNewsletter: lastNewsletter ? {
          completedTime: lastNewsletter.completedTime,
          emailsSent: lastNewsletter.emailsSent,
          emailsFailed: lastNewsletter.emailsFailed,
          emailsSkipped: lastNewsletter.emailsSkipped,
          totalSubscribers: lastNewsletter.totalSubscribers,
          executionDuration: lastNewsletter.executionDuration,
          articlesCount: lastNewsletter.articlesSent?.length || 0
        } : null,
        schedulingStats: schedulingStats,
        nextScheduledNewsletter: this.getNextScheduledTime()
      };
    } catch (error) {
      console.error('❌ Error getting scheduler status:', error);
      return {
        isRunning: this.isRunning,
        error: error.message
      };
    }
  }
  
  // Calculate next scheduled newsletter time (1:35 AM IST = 8:05 PM UTC)
  getNextScheduledTime() {
    const now = new Date();
    const nextRun = new Date();
    
    nextRun.setUTCHours(20, 5, 0, 0);
    
    if (now.getTime() >= nextRun.getTime()) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }
    
    return nextRun;
  }
  
  // Get newsletter history
  async getNewsletterHistory(days = 7) {
    try {
      const since = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
      
      const history = await NewsletterHistory.find({
        scheduledTime: { $gte: since }
      })
      .sort({ scheduledTime: -1 })
      .limit(50)
      .lean();
      
      return history;
    } catch (error) {
      console.error('❌ Error getting newsletter history:', error);
      return [];
    }
  }
}

// Export a singleton instance
module.exports = new NewsletterScheduler();
