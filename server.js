const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { Groq } = require('groq-sdk');
const { connectToMongoDB } = require('./config/database');
const CacheService = require('./services/cache');
const CronService = require('./services/cronService');
const RedisRefreshService = require('./services/redisRefreshService');
const groqLoadBalancer = require('./services/groqLoadBalancer');
const newsdataLoadBalancer = require('./services/newsdataLoadBalancer');
const sectionRotationWorker = require('./workers/sectionRotationWorker');

const app = express();
const port = process.env.PORT || 3001;

// Initialize cron jobs
CronService.initializeJobs();

// Start section rotation worker (1 article per section every 5 minutes)
sectionRotationWorker.start();

// Initialize Groq client only if API key is available (legacy fallback)
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
  });
}

// CORS configuration for production and development
const corsOptions = {
  origin: function (origin, callback) {
    console.log('CORS request from origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000', // Development frontend
      'http://localhost:3001', // Development backend
      'https://webstory-frontend.vercel.app', // Production frontend
      'https://forexyy.com', // Production domain
      'https://www.forexyy.com', // Production domain with www
      'http://forexyy.com', // HTTP version
      'http://www.forexyy.com' // HTTP version with www
    ];
    
    // Check if origin matches any allowed origin (exact match)
    if (allowedOrigins.includes(origin)) {
      console.log('CORS allowed for origin:', origin);
      return callback(null, true);
    }
    
    // Check if origin is a Vercel deployment URL (for development/testing)
    if (origin && origin.includes('.vercel.app')) {
      console.log('CORS allowed for Vercel deployment:', origin);
      return callback(null, true);
    }
    
    // Enhanced check for any forexyy.com domain variations
    if (origin) {
      // Remove protocol and check if it's a forexyy.com domain
      const domain = origin.replace(/^https?:\/\//, '');
      
      // Check for exact forexyy.com matches
      if (domain === 'forexyy.com' || 
          domain === 'www.forexyy.com' ||
          domain.endsWith('.forexyy.com')) {
        console.log('CORS allowed for forexyy.com domain variation:', origin);
        return callback(null, true);
      }
      
      // Check for localhost variations (development)
      if (domain.startsWith('localhost:') || domain.startsWith('127.0.0.1:')) {
        console.log('CORS allowed for localhost:', origin);
        return callback(null, true);
      }
    }
    
    console.error('CORS blocked origin:', origin);
    console.error('Allowed origins:', allowedOrigins);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(compression()); // Gzip compression

// Handle preflight OPTIONS requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).send();
});

// Cache-Control headers for CDN/Edge caching
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
  }
  next();
});

// 🚀 System status route
app.get('/api/system-status', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    optimizations: {
      multiTierCaching: '✅ Active (Redis)',
      groqRateLimiting: '✅ Active (5500 tokens/minute)',
      databasePooling: '✅ Active (10 connections)',
      performanceMonitoring: '✅ Active',
      backgroundCommentary: commentaryStats.isRunning ? '✅ Active' : '❌ Inactive',
      edgeCaching: '✅ Active (Vercel CDN)',
      compression: '✅ Active (gzip/deflate)',
      redis: systemStatus.components.cache.stats?.redisConnected ? '✅ Connected' : '📦 Memory-only'
    },
    status: 'optimized'
  });
});

// Initialize newsletter scheduler for hourly sending
const NewsletterScheduler = require('./services/NewsletterScheduler');

// Load routes
const monitoringRoutes = require('./routes/monitoring');
const articlesRoutes = require('./routes/articles');
const debugRoutes = require('./routes/debug');
const databaseRoutes = require('./routes/database');
const newsletterRoutes = require('./routes/newsletter');
const commentaryRoutes = require('./routes/commentary');
const seoRoutes = require('./routes/seo');
const youtubeRoutes = require('./routes/youtube');
const sectionsRoutes = require('./routes/sections');

// Mount routes  
app.use('/', monitoringRoutes);
app.use('/api/articles', articlesRoutes);
app.use('/api/sections', sectionsRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/', seoRoutes); // SEO routes for sitemap.xml and robots.txt

// Vercel Cron endpoint for newsletter (GET - for Vercel cron)
app.get('/api/cron/newsletter', async (req, res) => {
  try {
    console.log('🕐 Vercel cron job triggered for newsletter sending at 8:27 AM IST (GET)');
    
    // Verify this is a cron request from Vercel
    const userAgent = req.headers['user-agent'] || '';
    if (!userAgent.includes('vercel-cron') && !userAgent.includes('curl')) {
      console.log('⚠️ Non-Vercel cron request detected from:', userAgent);
    }
    
    const NewsletterScheduler = require('./services/NewsletterScheduler');
    
    // Execute the newsletter sending
    const result = await NewsletterScheduler.sendHourlyNewsletters();
    
    console.log('✅ Cron job completed successfully:', result);
    
    return res.status(200).json({
      success: true,
      message: 'Newsletter cron job executed successfully at 8:27 AM IST (GET)',
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Cron job failed:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Newsletter cron job failed (GET)',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Vercel Cron endpoint for newsletter (POST - for manual testing)
app.post('/api/cron/newsletter', async (req, res) => {
  try {
    console.log('🕐 Vercel cron job triggered for newsletter sending at 8:27 AM IST');
    
    // Verify this is a cron request from Vercel or allow manual testing
    const userAgent = req.headers['user-agent'] || '';
    if (!userAgent.includes('vercel-cron') && !userAgent.includes('curl')) {
      console.log('⚠️ Non-Vercel cron request detected from:', userAgent);
    }
    
    const NewsletterScheduler = require('./services/NewsletterScheduler');
    
    // Execute the newsletter sending
    const result = await NewsletterScheduler.sendHourlyNewsletters();
    
    console.log('✅ Cron job completed successfully:', result);
    
    return res.status(200).json({
      success: true,
      message: 'Newsletter cron job executed successfully at 8:27 AM IST',
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Cron job failed:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Newsletter cron job failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
// ✨ Vercel Cron endpoint for section rotation (GET)
app.get('/api/cron/rotate-sections', async (req, res) => {
  try {
    console.log('🔄 Vercel cron job triggered for section rotation (GET)');
    
    // Verify this is a cron request from Vercel
    const userAgent = req.headers['user-agent'] || '';
    if (!userAgent.includes('vercel-cron') && !userAgent.includes('curl')) {
      console.log('⚠️ Non-Vercel cron request detected from:', userAgent);
    }
    
    const sectionRotationWorker = require('./workers/sectionRotationWorker');
    
    // Process next section in rotation
    await sectionRotationWorker.processNextSection();
    
    const status = sectionRotationWorker.getStatus();
    
    return res.status(200).json({
      success: true,
      message: 'Section rotation cron job executed successfully',
      currentSection: status.currentSection,
      progress: `${status.currentIndex + 1}/${status.totalSections}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Section rotation cron job failed:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Section rotation cron job failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 📝 Vercel Cron endpoint for fill-threshold (GET)
app.get('/api/cron/fill-threshold', async (req, res) => {
  try {
    console.log('📝 Vercel cron job triggered for fill-threshold (GET)');
    
    // Verify this is a cron request from Vercel
    const userAgent = req.headers['user-agent'] || '';
    if (!userAgent.includes('vercel-cron') && !userAgent.includes('curl')) {
      console.log('⚠️ Non-Vercel cron request detected from:', userAgent);
    }
    
    const articleFetcherService = require('./services/db/articleFetcherService');
    const thresholdService = require('./services/db/thresholdService');
    
    // Check current threshold status
    const status = await thresholdService.checkThreshold();
    
    if (status.thresholdMet) {
      return res.status(200).json({
        success: true,
        message: 'Threshold already met - all sections have enough articles',
        thresholdMet: true,
        total: status.total,
        timestamp: new Date().toISOString()
      });
    }
    
    // Get sections needing articles (prioritize sections with fewest)
    const sectionsNeedingArticles = status.sections
      .filter(s => !s.met)
      .sort((a, b) => a.count - b.count);
    
    if (sectionsNeedingArticles.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Threshold met',
        thresholdMet: true,
        total: status.total,
        timestamp: new Date().toISOString()
      });
    }
    
    // Process the section with fewest articles (process 2 articles per cron)
    const sectionToProcess = sectionsNeedingArticles[0].section;
    console.log(`🎯 Processing section with lowest count: ${sectionToProcess}`);
    
    const processedCount = await articleFetcherService.fetchAndProcessSection(sectionToProcess, 2);
    
    // Get updated status
    const updatedStatus = await thresholdService.checkThreshold();
    
    return res.status(200).json({
      success: true,
      message: 'Fill-threshold cron job executed successfully',
      processedArticles: processedCount,
      sectionProcessed: sectionToProcess,
      thresholdProgress: {
        total: updatedStatus.total,
        needed: 72 - updatedStatus.total,
        percentComplete: Math.round((updatedStatus.total / 72) * 100)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Fill-threshold cron job failed:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Fill-threshold cron job failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
app.use('/api', commentaryRoutes);

// � Load Balancer Status Endpoint
app.get('/api/groq-status', (req, res) => {
  try {
    if (!groqLoadBalancer) {
      return res.status(503).json({
        error: 'Load balancer not initialized',
        message: 'No Groq API keys configured'
      });
    }
    
    const stats = groqLoadBalancer.getStats();
    res.json({
      success: true,
      loadBalancer: stats,
      message: `Using ${stats.availableKeys}/${stats.totalKeys} API keys`,
      canGenerateMore: stats.remainingTokens > 5000
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// � Section Rotation Worker Status Endpoint
app.get('/api/rotation-status', (req, res) => {
  try {
    const status = sectionRotationWorker.getStatus();
    res.json({
      success: true,
      worker: status,
      message: `Processing ${status.currentSection} (${status.currentIndex + 1}/${status.totalSections})`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// �📊 Cache Status Endpoint
app.get('/api/cache-status', async (req, res) => {
  try {
    const redisStatus = RedisRefreshService.getStatus();
    const groqStats = groqLoadBalancer ? groqLoadBalancer.getStats() : null;
    
    res.json({
      success: true,
      redis: redisStatus,
      groq: groqStats,
      architecture: {
        browser: '5 minutes TTL',
        redis: '30 minutes TTL',
        mongodb: 'Source of truth',
        refreshStrategy: 'Lazy refresh (on-access)',
        note: 'Redis refreshes automatically when articles are accessed with stale cache'
      },
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔄 Manual Redis Refresh Endpoint (for external schedulers like Vercel Cron)
app.post('/api/refresh-cache', async (req, res) => {
  try {
    const result = await RedisRefreshService.refreshCache();
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Endpoint to list available models
app.get('/api/list-models', async (req, res) => {
  if (!groq) {
    return res.status(503).json({ error: 'AI service not available' });
  }
  try {
    const models = await groq.models.list();
    res.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});
// Initialize MongoDB connection immediately when server starts
let dbConnectionPromise = null;
let isDbConnected = false;

// Connect to MongoDB immediately at startup (but don't fail if it doesn't work)
const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing MongoDB connection at startup...');
    
    // Check if MongoDB URI is available
    if (!process.env.MONGODB_URI) {
      console.warn('⚠️ MONGODB_URI not found, running without database');
      isDbConnected = false;
      return null;
    }
    
    const connection = await connectToMongoDB();
    isDbConnected = true;
    console.log('✅ MongoDB connection established successfully at startup');
    
    // Set up connection event listeners to maintain connection
    if (connection) {
      connection.on('connected', () => {
        console.log('📡 MongoDB connected');
        isDbConnected = true;
      });
      
      connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
        isDbConnected = false;
      });
      
      connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected');
        isDbConnected = false;
        // Attempt to reconnect
        setTimeout(() => {
          console.log('🔄 Attempting to reconnect to MongoDB...');
          connectToMongoDB().catch(console.error);
        }, 5000);
      });
    }
    
    return connection;
  } catch (error) {
    console.error('❌ Failed to initialize MongoDB connection:', error.message);
    isDbConnected = false;
    return null; // Don't throw, just return null
  }
};

// Start database initialization immediately
dbConnectionPromise = initializeDatabase();

// Middleware to ensure database is connected before processing requests
app.use(async (req, res, next) => {
  try {
    // Wait for database connection if not already connected
    if (!isDbConnected && dbConnectionPromise) {
      console.log('⏳ Waiting for database connection...');
      await dbConnectionPromise;
    }
    next();
  } catch (error) {
    console.error('Database connection middleware error:', error);
    // Continue anyway to allow the app to function with fallback
    next();
  }
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  try {
    // Stop BullMQ commentary queue and worker
    const { shutdown } = require('./workers/commentaryQueue');
    await shutdown();
    
    // Disconnect from MongoDB
    const { disconnectFromMongoDB } = require('./config/database');
    await disconnectFromMongoDB();
    
    // Close Redis connection
    const redis = require('./config/redis');
    await redis.quit();
    
    console.log('✅ Graceful shutdown complete');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  try {
    // Stop BullMQ commentary queue and worker
    const { shutdown } = require('./workers/commentaryQueue');
    await shutdown();
    
    // Disconnect from MongoDB
    const { disconnectFromMongoDB } = require('./config/database');
    await disconnectFromMongoDB();
    
    // Close Redis connection
    const redis = require('./config/redis');
    await redis.quit();
    
    console.log('✅ Graceful shutdown complete');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
});

// Start the server after attempting database initialization
dbConnectionPromise
  .then(() => {
    console.log('✅ Database connected, server ready');
    
    // Start section rotation worker (generates commentary for 1 article per section every 5 min)
    console.log('🔄 Starting Section Rotation Worker...');
    sectionRotationWorker.start();
    
    // Start background fill-threshold worker if running on Render (not Vercel serverless)
    if (process.env.NODE_ENV === 'production' && process.env.RENDER) {
      console.log('🚀 Starting Background Fill-Threshold Worker (Render environment detected)...');
      const startBackgroundWorker = async () => {
        try {
          // Import the fill-threshold logic as a module
          const { fillThresholdWorker } = require('./workers/fillThresholdWorker');
          // Run in background without blocking server startup
          fillThresholdWorker().catch(error => {
            console.error('❌ Background worker error:', error);
          });
        } catch (error) {
          console.warn('⚠️ Could not start background worker:', error.message);
        }
      };
      // Start worker after a short delay to let server start first
      setTimeout(startBackgroundWorker, 3000);
    }
    
    // Only start server if not in Vercel environment
    if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
      app.listen(port, () => {
        console.log(`🚀 Optimized server running on port ${port} with database ${isDbConnected ? 'connected' : 'disconnected'}`);
        // Start newsletter scheduler for hourly emails only if DB is connected
        if (isDbConnected) {
          NewsletterScheduler.start();
        }
      });
    } else {
      console.log(`🚀 Optimized serverless function ready with database ${isDbConnected ? 'connected' : 'disconnected'}`);
      // Start newsletter scheduler in serverless environment only if DB is connected
      if (isDbConnected) {
        NewsletterScheduler.start();
      }
    }
  })
  .catch((error) => {
    console.error('❌ Database initialization failed, starting server anyway:', error);
    // Start server anyway to allow functioning with fallbacks
    if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
      app.listen(port, () => {
        console.log(`⚠️ Server running on port ${port} without database connection`);
      });
    } else {
      console.log('⚠️ Serverless function ready without database connection');
    }
  });

// Export the Express API for Vercel
module.exports = app;
