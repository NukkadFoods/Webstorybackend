const express = require('express');
const router = express.Router();
const DatabaseMonitor = require('../services/db/databaseMonitor');

// GET /api/database/stats - Get database statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await DatabaseMonitor.getDatabaseStats();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get database stats:', error);
    res.status(500).json({ error: 'Failed to get database statistics' });
  }
});

// GET /api/database/articles - Get article statistics
router.get('/articles', async (req, res) => {
  try {
    const stats = await DatabaseMonitor.getArticleStats();
    res.json(stats);
  } catch (error) {
    console.error('Failed to get article stats:', error);
    res.status(500).json({ error: 'Failed to get article statistics' });
  }
});

// GET /api/database/report - Get comprehensive database report
router.get('/report', async (req, res) => {
  try {
    const report = await DatabaseMonitor.generateReport();
    res.json(report);
  } catch (error) {
    console.error('Failed to generate database report:', error);
    res.status(500).json({ error: 'Failed to generate database report' });
  }
});

// POST /api/database/cleanup - Run database cleanup (with dry-run option)
router.post('/cleanup', async (req, res) => {
  try {
    const { 
      dryRun = true, 
      keepDays = 30,
      cleanupPercentage = 5,
      method = 'percentage' // 'percentage' for oldest 5%, 'days' for date-based
    } = req.body;
    
    console.log('🔍 Cleanup route called with:', { method, cleanupPercentage, dryRun });
    
    let result;
    
    if (method === 'percentage') {
      // Clean oldest articles by insertion order
      const [duplicateResult, oldestResult] = await Promise.all([
        DatabaseMonitor.removeDuplicates(dryRun),
        DatabaseMonitor.cleanupOldestArticles({ cleanupPercentage, dryRun })
      ]);
      
      result = {
        timestamp: new Date().toISOString(),
        method: 'percentage',
        dryRun,
        duplicates: duplicateResult,
        oldestArticles: oldestResult
      };
    } else {
      // Clean articles by date threshold (old method)
      const [duplicateResult, oldArticleResult] = await Promise.all([
        DatabaseMonitor.removeDuplicates(dryRun),
        DatabaseMonitor.cleanupOldArticles({ keepDays, dryRun })
      ]);
      
      result = {
        timestamp: new Date().toISOString(),
        method: 'days',
        dryRun,
        duplicates: duplicateResult,
        oldArticles: oldArticleResult
      };
    }
    
    if (!dryRun) {
      // Also optimize indexes if actually cleaning
      await DatabaseMonitor.optimizeIndexes();
      result.indexesOptimized = true;
    }
    
    res.json(result);
  } catch (error) {
    console.error('Failed to run cleanup:', error);
    res.status(500).json({ error: 'Failed to run cleanup' });
  }
});

// GET /api/database/health - Quick health check
router.get('/health', async (req, res) => {
  try {
    const stats = await DatabaseMonitor.getDatabaseStats();
    const articleStats = await DatabaseMonitor.getArticleStats();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      storage: {
        usedMB: stats?.usage?.totalSizeMB || 0,
        limitMB: 512,
        usagePercentage: stats?.usage?.usagePercentage || 0,
        remainingMB: stats?.usage?.remainingMB || 512
      },
      articles: {
        total: articleStats?.total || 0,
        recent: articleStats?.byAge?.today || 0
      },
      alerts: []
    };
    
    // Add health alerts
    if (health.storage.usagePercentage > 90) {
      health.status = 'critical';
      health.alerts.push('Database storage usage above 90%');
    } else if (health.storage.usagePercentage > 75) {
      health.status = 'warning';
      health.alerts.push('Database storage usage above 75%');
    }
    
    if (health.articles.total > 3000) {
      health.alerts.push('High article count - consider cleanup');
    }
    
    res.json(health);
  } catch (error) {
    console.error('Failed to get database health:', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Failed to get database health',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
