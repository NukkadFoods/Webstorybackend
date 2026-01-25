const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  preferences: {
    genres: {
      type: [String],
      default: ['politics', 'business', 'technology'],
      enum: [
        'politics', 
        'business', 
        'technology', 
        'science', 
        'health', 
        'sports', 
        'entertainment', 
        'world', 
        'finance',
        'arts',
        'opinion'
      ]
    },
    frequency: {
      type: String,
      default: 'hourly',
      enum: ['hourly', 'daily', 'weekly']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscribedAt: {
    type: Date,
    default: Date.now
  },
  lastEmailSent: {
    type: Date,
    default: null
  },
  lastNewsletterSent: {
    type: Date,
    default: null
  },
  sentArticleIds: {
    type: [String],
    default: []
  },
  newsletterHistory: [{
    newsletterId: {
      type: String,
      required: true
    },
    sentAt: {
      type: Date,
      required: true
    },
    articlesCount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      required: true
    },
    errorMessage: {
      type: String,
      default: null
    }
  }],
  unsubscribeToken: {
    type: String,
    unique: true,
    required: true
  },
  timezone: {
    type: String,
    default: 'America/New_York'
  }
}, {
  timestamps: true
});

// Index for faster queries (email and unsubscribeToken already have unique indexes)
subscriberSchema.index({ isActive: 1 });

module.exports = mongoose.model('Subscriber', subscriberSchema);
