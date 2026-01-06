const mongoose = require('mongoose');

// Define the schema for articles
const ArticleSchema = new mongoose.Schema({
  id: {
    type: String,
    trim: true,
    index: true // Add index for faster lookups
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  abstract: {
    type: String,
    trim: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  publishedDate: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    trim: true
  },
  section: {
    type: String,
    trim: true
  },
  subsection: {
    type: String,
    trim: true
  },
  byline: {
    type: String,
    trim: true
  },
  multimedia: [{
    url: String,
    format: String,
    height: Number,
    width: Number,
    caption: String
  }],
  keywords: [String],
  des_facet: [String],
  org_facet: [String],
  per_facet: [String],
  geo_facet: [String],
  content: String,
  aiCommentary: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
ArticleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add indexes for performance optimization
ArticleSchema.index({ section: 1, publishedDate: -1 }); // Category filtering and sorting
ArticleSchema.index({ publishedDate: -1 }); // Latest articles
ArticleSchema.index({ url: 1 }, { unique: true }); // Deduplication
ArticleSchema.index({ title: 'text', content: 'text', section: 'text' }); // Full-text search
ArticleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 }); // TTL index - 7 days

// Create the Article model
const Article = mongoose.model('Article', ArticleSchema);

module.exports = Article;
