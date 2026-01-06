/**
 * Section-based Article Routes
 * Serves articles by section with ONLY commentary included
 */

const express = require('express');
const router = express.Router();
const sectionArticleService = require('../services/db/sectionArticleService');

/**
 * GET /api/sections/:section/articles
 * Get articles for a specific section (with commentary only)
 */
router.get('/:section/articles', async (req, res) => {
  try {
    const { section } = req.params;
    const { limit = 20, skip = 0 } = req.query;

    const articles = await sectionArticleService.getArticlesBySection(
      section,
      parseInt(limit),
      parseInt(skip)
    );

    res.json({
      success: true,
      section,
      count: articles.length,
      articles,
      hasMore: articles.length === parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching section articles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch articles'
    });
  }
});

/**
 * GET /api/sections/stats
 * Get statistics about articles per section
 */
router.get('/stats', async (req, res) => {
  try {
    const counts = await sectionArticleService.getSectionCounts();
    const needingArticles = await sectionArticleService.getSectionsNeedingArticles(10);

    res.json({
      success: true,
      counts,
      needingArticles,
      totalSections: Object.keys(counts).length,
      totalArticles: Object.values(counts).reduce((sum, count) => sum + count, 0)
    });
  } catch (error) {
    console.error('Error fetching section stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

/**
 * POST /api/sections/:section/refresh-cache
 * Clear and refresh cache for a section
 */
router.post('/:section/refresh-cache', async (req, res) => {
  try {
    const { section } = req.params;
    await sectionArticleService.clearSectionCache(section);
    
    res.json({
      success: true,
      message: `Cache cleared for section: ${section}`
    });
  } catch (error) {
    console.error('Error refreshing section cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh cache'
    });
  }
});

module.exports = router;
