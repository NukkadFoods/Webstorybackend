const express = require('express');
const router = express.Router();

// Import your article models with error handling
let Article;
try {
  Article = require('../models/article');
} catch (error) {
  // console.log('Article model not available, using static sitemap');
  Article = null;
}

// Bot User Agents for pre-rendering
const BOT_USER_AGENTS = [
  'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandexbot',
  'facebookexternalhit', 'twitterbot', 'linkedinbot', 'whatsapp', 'telegrambot',
  'pinterest', 'discordbot', 'slackbot', 'redditbot',
  'gptbot', 'chatgpt', 'perplexitybot', 'claudebot', 'anthropic',
  'instagram', 'JEODE'
];

/**
 * Check if request is from a bot/crawler
 */
function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

/**
 * Pre-render article page for social crawlers
 * Called by Vercel when bot user-agent is detected
 * Always returns full HTML with OG tags (no bot check - Vercel handles that)
 */
router.get('/article/:slug(*)', async (req, res) => {
  try {
    const { slug } = req.params;
    const baseUrl = 'https://forexyy.com';

    console.log(`[SEO] Pre-rendering article: ${slug}`);

    if (!Article) {
      console.log('[SEO] Article model not available');
      return res.send(generatePrerenderedHTML({
        title: 'Forexyy News',
        description: 'AI-powered news analysis with audio commentary.',
        image: `${baseUrl}/og-image.png`,
        url: `${baseUrl}/article/${slug}`
      }));
    }

    // Decode the URL-encoded slug
    const decodedSlug = decodeURIComponent(slug);
    console.log(`[SEO] Decoded slug: ${decodedSlug}`);

    // Try multiple matching strategies
    let article = null;

    // 1. Try exact URL match first
    if (decodedSlug.includes('http')) {
      article = await Article.findOne({ url: decodedSlug });
    }

    // 2. Try partial URL match
    if (!article) {
      const urlPart = decodedSlug.split('/').pop()?.replace(/\.html?$/, '');
      if (urlPart && urlPart.length > 10) {
        article = await Article.findOne({
          url: { $regex: urlPart, $options: 'i' }
        });
      }
    }

    // 3. Try title-based slug match
    if (!article) {
      const titleSearch = decodedSlug
        .replace(/https?:\/\/[^/]+\/?/g, '') // Remove URL prefix
        .replace(/[-_]/g, ' ')
        .replace(/\.(html?|php|aspx?)$/i, '')
        .trim();

      if (titleSearch.length > 5) {
        article = await Article.findOne({
          title: { $regex: titleSearch.substring(0, 50), $options: 'i' }
        });
      }
    }

    // 4. Try MongoDB ID match
    if (!article && decodedSlug.match(/^[a-f0-9]{24}$/i)) {
      article = await Article.findById(decodedSlug);
    }

    // 5. Get most recent article as fallback
    if (!article) {
      console.log('[SEO] No exact match, using most recent article');
      article = await Article.findOne().sort({ publishedDate: -1, createdAt: -1 });
    }

    if (!article) {
      // Return default OG tags if article not found
      return res.send(generatePrerenderedHTML({
        title: 'Article Not Found | Forexyy',
        description: 'The requested article could not be found.',
        image: `${baseUrl}/og-image.png`,
        url: `${baseUrl}/article/${slug}`
      }));
    }

    const articleUrl = `${baseUrl}/article/${encodeURIComponent(slug)}`;
    const publishDate = article.publishedDate || article.createdAt;

    // Generate pre-rendered HTML for bots
    const html = generatePrerenderedHTML({
      title: article.title,
      description: article.abstract || article.aiCommentary?.substring(0, 200) || article.title,
      image: article.imageUrl || `${baseUrl}/og-image.png`,
      url: articleUrl,
      type: 'article',
      section: article.section,
      publishedTime: publishDate?.toISOString(),
      author: article.byline || 'Forexyy News',
      keywords: article.keywords?.join(', ') || article.section,
      articleBody: article.aiCommentary?.substring(0, 1000) || article.abstract,
      articleId: article._id?.toString() || article.id,
      slug: slug,
      hasAiCommentary: !!article.aiCommentary
    });

    res.send(html);
  } catch (error) {
    console.error('Pre-render error:', error);
    next();
  }
});

/**
 * Generate pre-rendered HTML with OG tags for social crawlers
 */
function generatePrerenderedHTML(meta) {
  const baseUrl = 'https://forexyy.com';


  return `<!DOCTYPE html>
<html lang="en" prefix="og: http://ogp.me/ns#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.title)} | Forexyy</title>
  <meta name="description" content="${escapeHtml(meta.description)}">

  <!-- JSON-LD Schema: NewsArticle -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": "${meta.url}",
    "headline": "${escapeJson(meta.title)}",
    "description": "${escapeJson(meta.description)}",
    "url": "${meta.url}",
    "image": "${meta.image}",
    ${meta.publishedTime ? `"datePublished": "${meta.publishedTime}",` : ''}
    "author": {
      "@type": "Organization",
      "name": "${escapeJson(meta.author || 'Forexyy News')}"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Forexyy",
      "logo": { "@type": "ImageObject", "url": "${baseUrl}/logo.png" }
    },
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": [".article-title", ".article-summary", ".ai-commentary"]
    }
  }
  </script>

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="${meta.type || 'article'}">
  <meta property="og:url" content="${meta.url}">
  <meta property="og:title" content="${escapeHtml(meta.title)}">
  <meta property="og:description" content="${escapeHtml(meta.description)}">
  <meta property="og:image" content="${meta.image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="Forexyy">
  <meta property="og:locale" content="en_US">
  ${meta.publishedTime ? `<meta property="article:published_time" content="${meta.publishedTime}">` : ''}
  ${meta.section ? `<meta property="article:section" content="${meta.section}">` : ''}
  ${meta.author ? `<meta property="article:author" content="${escapeHtml(meta.author)}">` : ''}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${meta.url}">
  <meta name="twitter:title" content="${escapeHtml(meta.title)}">
  <meta name="twitter:description" content="${escapeHtml(meta.description)}">
  <meta name="twitter:image" content="${meta.image}">

  <!-- Additional SEO -->
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${meta.url}">
  ${meta.keywords ? `<meta name="keywords" content="${escapeHtml(meta.keywords)}">` : ''}
</head>
<body>
  <article>
    <h1 class="article-title">${escapeHtml(meta.title)}</h1>
    <p class="article-summary">${escapeHtml(meta.description)}</p>
    ${meta.articleBody ? `<div class="ai-commentary">${escapeHtml(meta.articleBody)}</div>` : ''}
    ${meta.image ? `<img src="${meta.image}" alt="${escapeHtml(meta.title)}">` : ''}
  </article>
  <p>For the full experience with AI audio commentary, please enable JavaScript or visit <a href="${baseUrl}">forexyy.com</a></p>
</body>
</html>`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJson(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
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

    // Add ALL articles from database (general sitemap = archival, no 48h limit)
    // Articles that age out of news-sitemap.xml stay discoverable here (FIFO pattern)
    if (Article) {
      try {
        const allArticles = await Article.find({})
          .sort({ publishedDate: -1, createdAt: -1 })
          .limit(5000) // General sitemap can hold more URLs
          .select('title url section publishedDate createdAt imageUrl');

        allArticles.forEach(article => {
          // Create SEO-friendly slug from URL or title
          const slug = article.url ?
            article.url.split('/').pop().replace(/\.html?$/, '') :
            article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

          // Use published date or creation date
          const articleDate = article.publishedDate || article.createdAt;
          const formattedDate = articleDate.toISOString().split('T')[0];

          xml += `  <url>
    <loc>${baseUrl}/article/${encodeURIComponent(slug)}</loc>
    <lastmod>${formattedDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>${article.imageUrl ? `
    <image:image>
      <image:loc>${article.imageUrl}</image:loc>
      <image:title><![CDATA[${article.title}]]></image:title>
    </image:image>` : ''}
  </url>
`;
        });

      } catch (dbError) {
        console.error('Sitemap DB query failed:', dbError.message);
      }
    }

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

# Sitemaps
Sitemap: https://forexyy.com/sitemap.xml
Sitemap: https://forexyy.com/news-sitemap.xml
Sitemap: https://forexyy.com/video-sitemap.xml

# Allow all major search engines
User-agent: Googlebot
Allow: /

User-agent: Googlebot-News
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

# AI Search Engines (GEO - Generative Engine Optimization)
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: Anthropic-AI
Allow: /

User-agent: cohere-ai
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

/**
 * Google News Sitemap (strict 48-hour window)
 * Optimized for Google News crawlers
 */
router.get('/news-sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://forexyy.com';
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
`;

    if (Article) {
      const newsArticles = await Article.find({
        $or: [
          { publishedDate: { $gte: fortyEightHoursAgo } },
          { createdAt: { $gte: fortyEightHoursAgo } }
        ]
      })
        .sort({ publishedDate: -1 })
        .limit(1000)
        .select('title url section publishedDate createdAt keywords');

      newsArticles.forEach(article => {
        const slug = article.url ?
          article.url.split('/').pop().replace(/\.html?$/, '') :
          article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        const articleDate = article.publishedDate || article.createdAt;
        const isoDate = articleDate.toISOString();

        const keywords = article.keywords?.length > 0 ?
          article.keywords.slice(0, 10).join(', ') :
          article.section || 'news';

        xml += `  <url>
    <loc>${baseUrl}/article/${encodeURIComponent(slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>Forexyy</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${isoDate}</news:publication_date>
      <news:title><![CDATA[${article.title}]]></news:title>
      <news:keywords><![CDATA[${keywords}]]></news:keywords>
    </news:news>
  </url>
`;
      });
    }

    xml += '</urlset>';

    res.set({
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=900' // 15 minutes for news
    });

    res.send(xml);
  } catch (error) {
    console.error('Error generating news sitemap:', error);
    res.status(500).send('Error generating news sitemap');
  }
});

/**
 * JSON-LD Schema endpoint for articles
 * Returns NewsArticle + Speakable schema for SEO
 */
router.get('/api/schema/:articleId', async (req, res) => {
  try {
    const { articleId } = req.params;
    const baseUrl = 'https://forexyy.com';

    if (!Article) {
      return res.status(500).json({ error: 'Article model not available' });
    }

    // Find article by ID or slug
    let article = await Article.findOne({
      $or: [
        { _id: articleId },
        { id: articleId },
        { url: { $regex: articleId, $options: 'i' } }
      ]
    });

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const slug = article.url ?
      article.url.split('/').pop().replace(/\.html?$/, '') :
      article.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const articleUrl = `${baseUrl}/article/${encodeURIComponent(slug)}`;
    const publishDate = (article.publishedDate || article.createdAt).toISOString();

    // Generate JSON-LD schema with NewsArticle + Speakable
    const newsArticleSchema = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "@id": articleUrl,
      "headline": article.title,
      "description": article.abstract || article.title,
      "url": articleUrl,
      "datePublished": publishDate,
      "dateModified": (article.updatedAt || article.createdAt).toISOString(),
      "author": {
        "@type": "Organization",
        "name": article.byline || "Forexyy News",
        "url": baseUrl
      },
      "publisher": {
        "@type": "Organization",
        "name": "Forexyy",
        "url": baseUrl,
        "logo": {
          "@type": "ImageObject",
          "url": `${baseUrl}/logo.png`
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": articleUrl
      },
      "articleSection": article.section || "News",
      "keywords": article.keywords?.join(', ') || article.section || "news",
      // Speakable schema for voice assistants (Google Assistant, Siri)
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": [".article-title", ".article-summary", ".ai-commentary"]
      }
    };

    // Add image if available
    if (article.imageUrl) {
      newsArticleSchema.image = {
        "@type": "ImageObject",
        "url": article.imageUrl,
        "width": 1200,
        "height": 630
      };
    }

    // Add AI commentary as article body if available
    if (article.aiCommentary) {
      newsArticleSchema.articleBody = article.aiCommentary.substring(0, 5000);
    }

    res.json(newsArticleSchema);
  } catch (error) {
    console.error('Error generating schema:', error);
    res.status(500).json({ error: 'Error generating schema' });
  }
});

/**
 * Video Sitemap Generator
 * Lists articles with AI commentary as video content for Google Video indexing
 */
router.get('/video-sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://forexyy.com';
    const axios = require('axios');
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyBO1mrYoksmwSJFgOFtSc16b00yWi8cIwk';
    const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCBkp7FF7Gpy9eA26cgvHPAw';

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
`;

    try {
      // Step 1: Search for videos from the YouTube channel
      const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          key: YOUTUBE_API_KEY,
          channelId: CHANNEL_ID,
          part: 'snippet',
          order: 'date',
          maxResults: 50,
          type: 'video'
        }
      });

      const searchResults = searchResponse.data.items || [];

      if (searchResults.length > 0) {
        // Step 2: Get detailed video info (duration, stats)
        const videoIds = searchResults.map(item => item.id.videoId).join(',');
        const videosResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            key: YOUTUBE_API_KEY,
            id: videoIds,
            part: 'snippet,contentDetails,statistics'
          }
        });

        const videos = videosResponse.data.items || [];

        videos.forEach(video => {
          const videoId = video.id;
          const title = video.snippet.title.replace(/[<>&'"]/g, ' ');
          const description = (video.snippet.description || title)
            .replace(/[<>&'"]/g, ' ').substring(0, 2048);
          const thumbnailUrl = video.snippet.thumbnails.maxres?.url
            || video.snippet.thumbnails.high?.url
            || video.snippet.thumbnails.medium?.url
            || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          const publishDate = video.snippet.publishedAt;

          // Parse ISO 8601 duration to seconds (e.g., "PT1M30S" -> 90)
          const durationMatch = video.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          const durationSeconds = durationMatch
            ? (parseInt(durationMatch[1] || 0) * 3600) + (parseInt(durationMatch[2] || 0) * 60) + parseInt(durationMatch[3] || 0)
            : 60;

          const tags = video.snippet.tags?.slice(0, 10).join(', ') || 'news, forexyy';

          xml += `  <url>
    <loc>${baseUrl}/reels</loc>
    <video:video>
      <video:thumbnail_loc>${thumbnailUrl}</video:thumbnail_loc>
      <video:title><![CDATA[${video.snippet.title}]]></video:title>
      <video:description><![CDATA[${description}]]></video:description>
      <video:player_loc>https://www.youtube.com/embed/${videoId}</video:player_loc>
      <video:duration>${durationSeconds}</video:duration>
      <video:view_count>${video.statistics.viewCount || 0}</video:view_count>
      <video:publication_date>${publishDate}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
      <video:live>no</video:live>
      <video:tag>${tags}</video:tag>
    </video:video>
  </url>
`;
        });
      }
    } catch (ytError) {
      console.error('Video sitemap YouTube API error:', ytError.message);
      // Sitemap will still be valid XML, just empty
    }

    xml += '</urlset>';

    res.set({
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600' // Cache for 1 hour (YouTube data changes less often)
    });

    res.send(xml);
  } catch (error) {
    console.error('Error generating video sitemap:', error);
    res.status(500).send('Error generating video sitemap');
  }
});

module.exports = router;
