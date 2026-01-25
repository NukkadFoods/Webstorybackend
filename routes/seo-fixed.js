const express = require('express');
const router = express.Router();

// Import your article models with error handling
let Article;
try {
  Article = require('../models/article');
} catch (error) {
  console.log('Article model not available, using static sitemap');
  Article = null;
}

/**
 * Dynamic Sitemap Generator for Forexyy.com
 * Generates XML sitemap with current articles and categories
 */
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://forexyy.com';
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Static pages and categories
    const staticUrls = [
      { loc: '/', priority: '1.0', changefreq: 'hourly' },
      { loc: '/articles', priority: '0.8', changefreq: 'hourly' },
      { loc: '/search', priority: '0.6', changefreq: 'weekly' },
      
      // Category pages
      { loc: '/category/politics', priority: '0.9', changefreq: 'daily' },
      { loc: '/category/business', priority: '0.9', changefreq: 'daily' },
      { loc: '/category/technology', priority: '0.9', changefreq: 'daily' },
      { loc: '/category/finance', priority: '0.9', changefreq: 'daily' },
      { loc: '/category/wallstreet', priority: '0.9', changefreq: 'hourly' },
      { loc: '/category/health', priority: '0.8', changefreq: 'daily' },
      { loc: '/category/science', priority: '0.8', changefreq: 'daily' },
      { loc: '/category/sports', priority: '0.8', changefreq: 'daily' },
      { loc: '/category/entertainment', priority: '0.8', changefreq: 'daily' },
      { loc: '/category/world', priority: '0.8', changefreq: 'daily' },
      { loc: '/category/us', priority: '0.8', changefreq: 'daily' },
      { loc: '/category/opinion', priority: '0.7', changefreq: 'daily' },
      { loc: '/category/arts', priority: '0.7', changefreq: 'daily' },
      { loc: '/category/travel', priority: '0.7', changefreq: 'weekly' },
      { loc: '/category/realestate', priority: '0.7', changefreq: 'weekly' },
      { loc: '/category/automobiles', priority: '0.7', changefreq: 'weekly' },
      { loc: '/category/fashion', priority: '0.7', changefreq: 'weekly' },
      { loc: '/category/food', priority: '0.7', changefreq: 'weekly' }
    ];

    // Start building XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;

    // Add static URLs
    staticUrls.forEach(page => {
      xml += `  <url>
    <loc>${baseUrl}${page.loc}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>
`;
    });

    // Add dynamic articles from database
    if (Article) {
      try {
        // Get recent articles from your database (last 1000 articles for better SEO)
        const recentArticles = await Article.find({})
          .sort({ publishedDate: -1, createdAt: -1 })
          .limit(1000)
          .select('title url section publishedDate createdAt keywords abstract');
        
        console.log(`Found ${recentArticles.length} articles for sitemap`);
        
        recentArticles.forEach(article => {
          // Create SEO-friendly slug from URL or title
          const slug = article.url ? 
            article.url.split('/').pop().replace(/\.html?$/, '') : 
            article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          
          // Use published date or creation date
          const articleDate = article.publishedDate || article.createdAt;
          const formattedDate = articleDate.toISOString().split('T')[0];
          
          // Extract keywords for news schema
          const articleKeywords = article.keywords && article.keywords.length > 0 ? 
            article.keywords.join(', ') : 
            `${article.section || 'news'}, breaking news, ${article.title.split(' ').slice(0, 3).join(', ')}`;
          
          xml += `  <url>
    <loc>${baseUrl}/article/${slug}</loc>
    <lastmod>${formattedDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <news:news>
      <news:publication>
        <news:name>Forexyy</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${formattedDate}</news:publication_date>
      <news:title><![CDATA[${article.title}]]></news:title>
      <news:keywords><![CDATA[${articleKeywords}]]></news:keywords>
    </news:news>
  </url>
`;
        });

      } catch (dbError) {
        console.log('Database query failed, using static samples:', dbError.message);
      }
    }
    
    // Always add some sample articles for demonstration and fallback
    const sampleArticles = [
      { 
        slug: 'breaking-news-politics-update', 
        title: 'Breaking News: Politics Update',
        category: 'politics',
        date: currentDate,
        keywords: 'politics, breaking news, government, policy'
      },
      { 
        slug: 'stock-market-analysis-today', 
        title: 'Stock Market Analysis Today',
        category: 'finance',
        date: currentDate,
        keywords: 'finance, stocks, market, trading, investment'
      },
      { 
        slug: 'technology-innovation-ai-breakthrough', 
        title: 'Technology Innovation: AI Breakthrough',
        category: 'technology',
        date: currentDate,
        keywords: 'technology, AI, innovation, artificial intelligence'
      },
      { 
        slug: 'wall-street-trading-update', 
        title: 'Wall Street Trading Update',
        category: 'wallstreet',
        date: currentDate,
        keywords: 'wall street, trading, finance, stocks'
      },
      { 
        slug: 'healthcare-policy-changes', 
        title: 'Healthcare Policy Changes',
        category: 'health',
        date: currentDate,
        keywords: 'health, healthcare, policy, medical'
      }
    ];

    sampleArticles.forEach(article => {
      xml += `  <url>
    <loc>${baseUrl}/article/${article.slug}</loc>
    <lastmod>${article.date}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
    <news:news>
      <news:publication>
        <news:name>Forexyy</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${article.date}</news:publication_date>
      <news:title><![CDATA[${article.title}]]></news:title>
      <news:keywords><![CDATA[${article.keywords}]]></news:keywords>
    </news:news>
  </url>
`;
    });

    // Close XML
    xml += '</urlset>';

    // Set proper headers for dynamic content
    res.set({
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=1800' // Cache for 30 minutes (rapid content changes)
    });

    res.send(xml);

  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

/**
 * Robots.txt endpoint
 */
router.get('/robots.txt', (req, res) => {
  const robotsTxt = `User-agent: *
Allow: /

# Sitemap
Sitemap: https://forexyy.com/sitemap.xml

# Allow all major search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /

User-agent: DuckDuckBot
Allow: /

User-agent: Baiduspider
Allow: /

User-agent: YandexBot
Allow: /

# Allow crawling of all content
User-agent: *
Allow: /article/
Allow: /category/
Allow: /search
Allow: /articles

# Crawl-delay for respectful crawling
Crawl-delay: 1

# Host directive
Host: forexyy.com`;

  res.set({
    'Content-Type': 'text/plain',
    'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
  });

  res.send(robotsTxt);
});

module.exports = router;
