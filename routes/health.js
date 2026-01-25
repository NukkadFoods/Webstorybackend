const express = require('express');
const router = express.Router();

// GET /api/health - Health check endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Webstory Backend API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// GET /api/health/detailed - Detailed health check
router.get('/detailed', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Webstory Backend API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    memory: process.memoryUsage(),
    platform: process.platform,
    nodeVersion: process.version,
    endpoints: {
      articles: '/api/articles',
      search: '/api/articles/search',
      newsletter: '/api/newsletter',
      commentary: '/api/generate-commentary',
      health: '/api/health'
    }
  });
});

module.exports = router;
