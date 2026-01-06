/**
 * Article Fetcher and Processor
 * 
 * Fetches articles from NYT API or newsdata.io, generates commentary, saves complete articles to DB
 * NEVER sends incomplete articles to client
 * Includes duplicate prevention at API, MongoDB, and Redis levels
 */

const { generateGroqCommentary } = require('../aiService');
const Article = require('../../models/article');
const CacheService = require('../cache');
const thresholdService = require('./thresholdService');
const fetch = require('node-fetch');

class ArticleFetcherService {
  constructor() {
    // NYT API sections (removed sports - now using newsdata.io)
    this.nytSections = [
      'world',
      'us',
      'politics',
      'business',
      'technology',
      'health'
    ];
    
    // newsdata.io sections (using newsdata for sports, entertainment, finance)
    this.newsdataSections = ['entertainment', 'finance', 'sports'];
  }

  /**
   * Fetch articles from NYT or newsdata.io, generate commentary, save complete articles
   * @param {string} section - Section name
   * @param {number} articlesToProcess - How many articles to fully process
   */
  async fetchAndProcessSection(section, articlesToProcess = 1) {
    try {
      console.log(`\n🔄 [Article Fetcher] Processing section: ${section.toUpperCase()}`);
      
      let rawArticles = [];
      
      // Choose API based on section
      if (this.nytSections.includes(section)) {
        rawArticles = await this.fetchFromNYT(section);
      } else if (this.newsdataSections.includes(section)) {
        rawArticles = await this.fetchFromNewsdata(section);
      } else {
        console.error(`❌ Unknown section: ${section}`);
        return 0;
      }
      
      if (rawArticles.length === 0) {
        console.log(`⚠️ No articles fetched for ${section}`);
        return 0;
      }

      console.log(`📥 Fetched ${rawArticles.length} raw articles for ${section}`);

      let processedCount = 0;

      // 2. Process each article: Check duplicates → Generate commentary → Save
      for (const rawArticle of rawArticles.slice(0, articlesToProcess)) {
        try {
          // ✅ DUPLICATE CHECK #1: Check if article already exists in MongoDB
          const exists = await Article.findOne({ url: rawArticle.url });
          
          if (exists && exists.aiCommentary) {
            console.log(`⏭️  Article already exists with commentary: "${rawArticle.title.substring(0, 40)}..."`);
            continue;
          }

          console.log(`🤖 Generating commentary for: "${rawArticle.title.substring(0, 40)}..."`);

          // 3. Generate commentary BEFORE saving
          const commentary = await generateGroqCommentary(
            rawArticle.title,
            rawArticle.abstract || rawArticle.description || '',
            section
          );

          if (!commentary) {
            console.log(`⚠️  Commentary generation failed, skipping article`);
            continue;
          }

          // 4. Create COMPLETE article document
          const completeArticle = {
            id: rawArticle.id || rawArticle.url,
            title: rawArticle.title,
            abstract: rawArticle.abstract || rawArticle.description || '',
            url: rawArticle.url,
            publishedDate: rawArticle.publishedDate || rawArticle.pubDate || new Date(),
            source: rawArticle.source || (this.nytSections.includes(section) ? 'nytimes' : 'newsdata'),
            section: section,
            byline: rawArticle.byline || rawArticle.creator?.[0] || '',
            imageUrl: rawArticle.imageUrl || rawArticle.image_url || null,
            multimedia: rawArticle.multimedia || [],
            keywords: rawArticle.keywords || [],
            aiCommentary: commentary, // ✅ COMMENTARY INCLUDED
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // 5. Save complete article to DB (with duplicate prevention)
          await Article.findOneAndUpdate(
            { url: completeArticle.url },
            completeArticle,
            { upsert: true, new: true }
          );

          console.log(`✅ Saved complete article with commentary: "${rawArticle.title.substring(0, 40)}..."`);

          // 6. Check threshold before caching (only cache after 8-10 articles per section)
          const thresholdStatus = await thresholdService.checkThreshold();
          
          if (thresholdStatus.thresholdMet) {
            // ✅ DUPLICATE CHECK #2: Check Redis cache before caching
            const cacheKey = `article:${completeArticle.id}`;
            const cached = await CacheService.get(cacheKey);
            
            if (!cached) {
              await CacheService.set(cacheKey, JSON.stringify(completeArticle), 1800); // 30 min
              console.log(`💾 Cached to Redis: ${cacheKey}`);
            } else {
              console.log(`⏭️  Already in Redis cache: ${cacheKey}`);
            }
          } else {
            console.log(`⏳ Skipping cache - Building database (${section}: ${thresholdStatus.sections.find(s => s.section === section)?.count || 0}/8)`);
          }

          processedCount++;

          // Rate limiting: Wait 2 seconds between articles
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (articleError) {
          console.error(`❌ Error processing article:`, articleError.message);
        }
      }

      console.log(`✅ [${section}] Processed ${processedCount}/${articlesToProcess} complete articles`);
      
      // Clear section cache to force refresh
      const sectionArticleService = require('./sectionArticleService');
      await sectionArticleService.clearSectionCache(section);

      return processedCount;

    } catch (error) {
      console.error(`❌ Error in fetchAndProcessSection for ${section}:`, error);
      return 0;
    }
  }

  /**
   * Fetch articles from NYT API
   */
  async fetchFromNYT(section) {
    try {
      const nytUrl = `https://api.nytimes.com/svc/topstories/v2/${section}.json?api-key=${process.env.NYT_API_KEY}`;
      const response = await fetch(nytUrl);
      
      if (!response.ok) {
        console.error(`❌ NYT API error for ${section}: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const articles = (data.results || []).map(article => ({
        id: article.uri || article.url,
        title: article.title,
        abstract: article.abstract,
        url: article.url,
        publishedDate: article.published_date,
        byline: article.byline,
        imageUrl: article.multimedia?.[0]?.url,
        multimedia: article.multimedia || [],
        keywords: article.des_facet || [],
        source: 'nytimes'
      }));

      return articles;
    } catch (error) {
      console.error(`❌ NYT API error:`, error.message);
      return [];
    }
  }

  /**
   * Fetch articles from newsdata.io API
   */
  async fetchFromNewsdata(section) {
    try {
      const newsdataLoadBalancer = require('../newsdataLoadBalancer');
      
      const category = section === 'finance' ? 'business' : (section === 'sports' ? 'sports' : 'entertainment');
      
      // Use tryAllKeys for automatic retry with different keys
      const response = await newsdataLoadBalancer.tryAllKeys(async (apiKey) => {
        console.log(`🔑 Trying Newsdata Key for ${section}...`);
        const newsdataUrl = `https://newsdata.io/api/1/news?apikey=${apiKey}&category=${category}&language=en&country=us`;
        
        const result = await fetch(newsdataUrl);
        
        if (!result.ok) {
          throw new Error(`HTTP ${result.status}: ${result.statusText}`);
        }

        const data = await result.json();
        
        if (data.status === 'error') {
          throw new Error(data.results?.message || 'API returned error status');
        }
        
        return data;
      });
      
      const articles = (response.results || []).map(article => ({
        id: article.article_id,
        title: article.title,
        description: article.description,
        url: article.link,
        pubDate: article.pubDate,
        creator: article.creator,
        // Convert newsdata.io image_url to multimedia array format (NYT compatible)
        multimedia: article.image_url ? [{
          url: article.image_url,
          format: 'Large Thumbnail',
          height: 150,
          width: 150
        }] : [],
        source: 'newsdata'
      }));

      return articles;
    } catch (error) {
      console.error(`❌ All newsdata.io API keys failed for ${section}:`, error.message);
      return [];
    }
  }

  /**
   * Process all sections in rotation
   */
  async processAllSections(articlesPerSection = 3) {
    console.log('\n🔄 [Article Fetcher] Starting full section processing...\n');
    
    const results = {};
    
    for (const section of this.sections) {
      results[section] = await this.fetchAndProcessSection(section, articlesPerSection);
      
      // Wait 5 seconds between sections
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log('\n✅ [Article Fetcher] Completed full processing:');
    console.log(results);
    
    return results;
  }
}

module.exports = new ArticleFetcherService();
