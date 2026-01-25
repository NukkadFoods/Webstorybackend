const mongoose = require('mongoose');

const allUsersSchema = new mongoose.Schema({
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
  firstSubscribedAt: {
    type: Date,
    default: Date.now
  },
  totalSubscriptions: {
    type: Number,
    default: 1
  },
  isCurrentlySubscribed: {
    type: Boolean,
    default: true
  },
  lastSubscriptionAt: {
    type: Date,
    default: Date.now
  },
  lastUnsubscribeAt: {
    type: Date,
    default: null
  },
  subscriptionHistory: [{
    action: {
      type: String,
      enum: ['subscribe', 'unsubscribe'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    preferences: {
      genres: [String],
      frequency: String
    }
  }]
}, {
  timestamps: true
});

// Index for faster queries (email already has unique index)
allUsersSchema.index({ isCurrentlySubscribed: 1 });
allUsersSchema.index({ firstSubscribedAt: 1 });

module.exports = mongoose.model('AllUsers', allUsersSchema);
