const express = require('express');
const router = express.Router();
const { getAllArticles } = require('../services/db/articleService');

// Route to populate database with sample articles for testing
router.post('/seed', async (req, res) => {
  try {
    const { saveArticles } = require('../services/db/articleService');
    
    // Sample articles with UUIDs that match frontend expectations
    const sampleArticles = [
      {
        id: '2eb6152b-bd20-5d7d-acd0-8e6fb6f82fd0',
        title: 'Breaking: Major Technology Breakthrough Announced',
        abstract: 'A groundbreaking discovery in artificial intelligence has been announced by leading researchers.',
        url: 'https://example.com/tech-breakthrough',
        section: 'technology',
        publishedDate: new Date(),
        byline: 'By Tech Reporter',
        multimedia: [{
          url: 'https://via.placeholder.com/800x400/0066cc/ffffff?text=Tech+News',
          format: 'Large',
          height: 400,
          width: 800,
          caption: 'Technology breakthrough visualization'
        }]
      },
      {
        id: '225fc7f1-ab1b-594e-93d5-b2c5eaba9cef',
        title: 'Global Markets Show Strong Performance',
        abstract: 'International markets are showing unprecedented growth following recent economic policies.',
        url: 'https://example.com/markets-performance',
        section: 'business',
        publishedDate: new Date(),
        byline: 'By Business Analyst',
        multimedia: [{
          url: 'https://via.placeholder.com/800x400/00cc66/ffffff?text=Market+News',
          format: 'Large',
          height: 400,
          width: 800,
          caption: 'Market performance chart'
        }]
      },
      {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        title: 'Environmental Summit Reaches Historic Agreement',
        abstract: 'World leaders have reached a consensus on new environmental protection measures.',
        url: 'https://example.com/environmental-summit',
        section: 'world',
        publishedDate: new Date(),
        byline: 'By Environmental Correspondent',
        multimedia: [{
          url: 'https://via.placeholder.com/800x400/00cc00/ffffff?text=Environment+News',
          format: 'Large',
          height: 400,
          width: 800,
          caption: 'Environmental summit meeting'
        }]
      }
    ];

    const savedArticles = await saveArticles(sampleArticles);
    
    res.json({
      message: `Seeded ${savedArticles.length} articles successfully`,
      articles: savedArticles.map(a => ({ id: a.id, title: a.title }))
    });
  } catch (error) {
    console.error('Error seeding articles:', error);
    res.status(500).json({ error: 'Failed to seed articles' });
  }
});

// Route to get all articles with their IDs for debugging
router.get('/debug', async (req, res) => {
  try {
    const articles = await getAllArticles(20);
    const articleInfo = articles.map(article => ({
      _id: article._id,
      id: article.id,
      title: article.title,
      url: article.url
    }));
    
    res.json({
      count: articles.length,
      articles: articleInfo
    });
  } catch (error) {
    console.error('Error getting debug info:', error);
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

// Route to clear all caches (for debugging optimization issues)
router.post('/clear-cache', async (req, res) => {
  try {
    const { advancedCache } = require('../middleware/advancedCache');
    
    // Clear all caches
    await advancedCache.clearAll();
    
    // Also clear any specific article caches
    await advancedCache.clearPattern('articles');
    
    res.json({
      success: true,
      message: 'All caches cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to clear cache',
      message: error.message 
    });
  }
});

module.exports = router;
