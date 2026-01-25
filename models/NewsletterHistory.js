const mongoose = require('mongoose');

const newsletterHistorySchema = new mongoose.Schema({
  // Scheduling information
  scheduledTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  completedTime: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['scheduled', 'sending', 'completed', 'failed', 'skipped'],
    default: 'scheduled'
  },
  
  // Execution details
  totalSubscribers: {
    type: Number,
    default: 0
  },
  emailsSent: {
    type: Number,
    default: 0
  },
  emailsFailed: {
    type: Number,
    default: 0
  },
  emailsSkipped: {
    type: Number,
    default: 0
  },
  
  // Articles sent in this batch
  articlesSent: [{
    articleId: String,
    title: String,
    section: String,
    source: String,
    publishedDate: Date,
    sentToCount: {
      type: Number,
      default: 0
    }
  }],
  
  // Timing and frequency
  executionHour: {
    type: Number,
    required: true,
    min: 0,
    max: 23
  },
  timeZone: {
    type: String,
    default: 'America/New_York'
  },
  
  // Performance metrics
  executionDuration: {
    type: Number, // in milliseconds
    default: null
  },
  errorMessages: [{
    subscriberEmail: String,
    error: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Next scheduled run
  nextScheduledRun: {
    type: Date,
    default: null
  },
  
  // Additional metadata
  triggerType: {
    type: String,
    enum: ['cron', 'manual', 'api'],
    default: 'cron'
  },
  serverVersion: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for performance
newsletterHistorySchema.index({ scheduledTime: -1 });
newsletterHistorySchema.index({ status: 1 });
newsletterHistorySchema.index({ executionHour: 1 });
newsletterHistorySchema.index({ 'articlesSent.articleId': 1 });

// Helper methods
newsletterHistorySchema.methods.markAsStarted = function() {
  this.status = 'sending';
  this.completedTime = null;
  return this.save();
};

newsletterHistorySchema.methods.markAsCompleted = function(results) {
  this.status = 'completed';
  this.completedTime = new Date();
  this.executionDuration = this.completedTime - this.scheduledTime;
  
  if (results) {
    this.emailsSent = results.successCount || 0;
    this.emailsFailed = results.errorCount || 0;
    this.emailsSkipped = results.skippedCount || 0;
    this.totalSubscribers = (this.emailsSent + this.emailsFailed + this.emailsSkipped);
  }
  
  return this.save();
};

newsletterHistorySchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  this.completedTime = new Date();
  this.executionDuration = this.completedTime - this.scheduledTime;
  
  if (error) {
    this.errorMessages.push({
      error: error.message || error.toString(),
      timestamp: new Date()
    });
  }
  
  return this.save();
};

newsletterHistorySchema.methods.addArticle = function(article, sentToCount = 0) {
  this.articlesSent.push({
    articleId: article.id,
    title: article.title,
    section: article.section || article.category,
    source: article.source,
    publishedDate: article.publishedDate || article.publishedAt,
    sentToCount: sentToCount
  });
  
  return this.save();
};

// Static methods for queries
newsletterHistorySchema.statics.getLastNewsletter = function() {
  return this.findOne({ status: 'completed' })
    .sort({ completedTime: -1 })
    .lean();
};

newsletterHistorySchema.statics.getRecentArticles = function(hours = 24) {
  const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  return this.find({ 
    completedTime: { $gte: since },
    status: 'completed'
  })
  .select('articlesSent')
  .lean();
};

newsletterHistorySchema.statics.getSchedulingStats = function() {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      }
    },
    {
      $group: {
        _id: '$executionHour',
        totalRuns: { $sum: 1 },
        avgEmailsSent: { $avg: '$emailsSent' },
        avgDuration: { $avg: '$executionDuration' },
        successRate: {
          $avg: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

module.exports = mongoose.model('NewsletterHistory', newsletterHistorySchema);
