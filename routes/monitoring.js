const express = require('express');
const router = express.Router();
const MonitoringService = require('../services/monitoringService');

// Health check endpoint
router.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'webstory-backend',
    version: '1.0.0'
  });
});

// Root endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Webstory Backend API',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      articles: '/api/articles',
      search: '/api/articles/search',
      commentary: '/api/generate-commentary',
      newsletter: '/api/newsletter',
      monitoring: '/monitoring'
    }
  });
});

// Get current metrics
router.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await MonitoringService.collectMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get historical metrics
router.get('/api/metrics/history', async (req, res) => {
  try {
    const history = await MonitoringService.getMetricsHistory();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard HTML
router.get('/monitoring', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>System Monitoring Dashboard</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100">
      <div class="container mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold mb-8">System Monitoring Dashboard</h1>
        
        <!-- Cache Performance -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <h2 class="text-xl font-semibold mb-4">Cache Performance</h2>
          <canvas id="cacheChart"></canvas>
        </div>

        <!-- API Usage -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <h2 class="text-xl font-semibold mb-4">API Usage</h2>
          <canvas id="apiChart"></canvas>
        </div>

        <!-- Database Metrics -->
        <div class="bg-white rounded-lg shadow p-6 mb-6">
          <h2 class="text-xl font-semibold mb-4">Database Metrics</h2>
          <canvas id="dbChart"></canvas>
        </div>

        <!-- Real-time Stats -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-xl font-semibold mb-4">Real-time Statistics</h2>
          <div id="stats" class="grid grid-cols-1 md:grid-cols-3 gap-4"></div>
        </div>
      </div>

      <script>
        let charts = {};

        // Fetch and update metrics every 30 seconds
        async function updateMetrics() {
          const response = await fetch('/api/metrics');
          const metrics = await response.json();
          updateCharts(metrics);
          updateStats(metrics);
        }

        function updateCharts(metrics) {
          // Update cache performance chart
          updateCacheChart(metrics);
          updateAPIChart(metrics);
          updateDBChart(metrics);
        }

        function updateCacheChart(metrics) {
          const ctx = document.getElementById('cacheChart').getContext('2d');
          
          if (charts.cache) {
            charts.cache.destroy();
          }

          const categoryData = metrics.cache.categories;
          const categories = Object.keys(categoryData);
          const hits = categories.map(cat => categoryData[cat].hits);
          const misses = categories.map(cat => categoryData[cat].misses);

          charts.cache = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: categories,
              datasets: [
                {
                  label: 'Cache Hits',
                  data: hits,
                  backgroundColor: '#4CAF50'
                },
                {
                  label: 'Cache Misses',
                  data: misses,
                  backgroundColor: '#f44336'
                }
              ]
            },
            options: {
              responsive: true,
              scales: {
                y: {
                  beginAtZero: true,
                  stacked: true
                },
                x: {
                  stacked: true
                }
              }
            }
          });
        }

        function updateAPIChart(metrics) {
          const ctx = document.getElementById('apiChart').getContext('2d');
          
          if (charts.api) {
            charts.api.destroy();
          }

          charts.api = new Chart(ctx, {
            type: 'line',
            data: {
              labels: ['Total Calls', 'Rate Limited'],
              datasets: [{
                label: 'API Usage',
                data: [metrics.api.totalCalls, metrics.api.rateLimited],
                borderColor: '#2196F3',
                tension: 0.1
              }]
            },
            options: {
              responsive: true,
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });
        }

        function updateDBChart(metrics) {
          const ctx = document.getElementById('dbChart').getContext('2d');
          
          if (charts.db) {
            charts.db.destroy();
          }

          const dbMetrics = metrics.mongodb;
          charts.db = new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: ['Documents', 'Collections', 'Active Connections'],
              datasets: [{
                data: [
                  dbMetrics.documentCount,
                  dbMetrics.collections,
                  dbMetrics.activeConnections
                ],
                backgroundColor: [
                  '#FF9800',
                  '#9C27B0',
                  '#009688'
                ]
              }]
            },
            options: {
              responsive: true,
              plugins: {
                legend: {
                  position: 'right',
                }
              }
            }
          });
        }

        function updateStats(metrics) {
          const stats = document.getElementById('stats');
          stats.innerHTML = \`
            <div class="p-4 bg-blue-50 rounded">
              <h3 class="font-semibold">Cache Performance</h3>
              <p class="text-2xl font-bold text-blue-600">\${metrics.redis.cacheHitRate}%</p>
              <p class="text-sm text-gray-600">Hit Rate</p>
              <div class="mt-2">
                <div class="text-sm">Hits: \${metrics.redis.totalHits}</div>
                <div class="text-sm">Misses: \${metrics.redis.totalMisses}</div>
              </div>
            </div>
            <div class="p-4 bg-green-50 rounded">
              <h3 class="font-semibold">Database Health</h3>
              <p class="text-2xl font-bold text-green-600">\${metrics.mongodb.activeConnections}</p>
              <p class="text-sm text-gray-600">Active Connections</p>
              <div class="mt-2">
                <div class="text-sm">Collections: \${metrics.mongodb.collections}</div>
                <div class="text-sm">Documents: \${metrics.mongodb.documentCount}</div>
              </div>
            </div>
            <div class="p-4 bg-yellow-50 rounded">
              <h3 class="font-semibold">API Usage</h3>
              <p class="text-2xl font-bold text-yellow-600">\${metrics.api.totalCalls}</p>
              <p class="text-sm text-gray-600">Total Calls Today</p>
              <div class="mt-2">
                <div class="text-sm">Rate Limited: \${metrics.api.rateLimited}</div>
                <div class="text-sm">Limit Rate: \${((metrics.api.rateLimited / metrics.api.totalCalls) * 100).toFixed(2)}%</div>
              </div>
            </div>
          \`;
        }

        // Initial update
        updateMetrics();
        // Update every 30 seconds
        setInterval(updateMetrics, 30000);
      </script>
    </body>
    </html>
  `);
});

module.exports = router;
