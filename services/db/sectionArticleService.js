/**
 * Section-based Article Service
 * 
 * Manages articles by section with the following rules:
 * 1. Only return articles WITH commentary
 * 2. Ensure even distribution across sections
 * 3. Redis caches complete articles (with commentary)
 * 4. Load more fetches from DB with commentary filter
 */

const Article = require('../../models/article');
const CacheService = require('../cache');

class SectionArticleService {
  constructor() {
    this.sections = [
      'world',
      'us',
      'politics',
      'business',
      'technology',
      'health',
      'sports',
      'entertainment',
      'finance'
    ];
  }

  /**
   * Get articles for a specific section (ONLY with commentary)
   * @param {string} section - Section name
   * @param {number} limit - Number of articles to return
   * @param {number} skip - Number of articles to skip (for pagination)
   * @returns {Promise<Array>} Articles with commentary
   */
  async getArticlesBySection(section, limit = 20, skip = 0) {
    try {
      // Normalize section name
      const normalizedSection = section === 'home' ? 'home' : section.toLowerCase();
      
      console.log(`📰 Fetching ${limit} articles from section: ${normalizedSection} (skip: ${skip})`);

      // Check Redis cache first
      const cacheKey = `section:${normalizedSection}:${skip}:${limit}`;
      const cached = await CacheService.get(cacheKey);
      
      if (cached) {
        // CacheService.get already parses JSON, don't parse again
        console.log(`⚡ Cache hit for ${normalizedSection}: ${cached.length} articles`);
        return cached;
      }

      // Query MongoDB - ONLY articles with commentary
      const query = {
        section: normalizedSection,
        aiCommentary: { $exists: true, $ne: null, $ne: '' }
      };

      const articles = await Article.find(query)
        .sort({ publishedDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      console.log(`💾 DB query returned ${articles.length} articles with commentary for ${normalizedSection}`);

      // Cache the result for 30 minutes
      if (articles.length > 0) {
        await CacheService.set(cacheKey, JSON.stringify(articles), 1800);
      }

      return articles;
    } catch (error) {
      console.error(`❌ Error fetching articles for section ${section}:`, error);
      return [];
    }
  }

  /**
   * Get count of articles with commentary per section
   * @returns {Promise<Object>} Section counts
   */
  async getSectionCounts() {
    try {
      const counts = {};
      
      for (const section of this.sections) {
        const count = await Article.countDocuments({
          section: section,
          aiCommentary: { $exists: true, $ne: null, $ne: '' }
        });
        counts[section] = count;
      }

      console.log('📊 Articles with commentary per section:', counts);
      return counts;
    } catch (error) {
      console.error('❌ Error getting section counts:', error);
      return {};
    }
  }

  /**
   * Get sections that need more articles (< minimum threshold)
   * @param {number} minArticles - Minimum articles per section
   * @returns {Promise<Array>} Sections needing articles
   */
  async getSectionsNeedingArticles(minArticles = 10) {
    try {
      const counts = await this.getSectionCounts();
      const needingArticles = [];

      for (const section of this.sections) {
        const count = counts[section] || 0;
        if (count < minArticles) {
          needingArticles.push({
            section,
            current: count,
            needed: minArticles - count
          });
        }
      }

      if (needingArticles.length > 0) {
        console.log('⚠️  Sections needing more articles:', needingArticles);
      }

      return needingArticles;
    } catch (error) {
      console.error('❌ Error checking sections needing articles:', error);
      return [];
    }
  }

  /**
   * Get articles WITHOUT commentary for a section (for commentary generation)
   * @param {string} section - Section name
   * @param {number} limit - Number to return
   * @returns {Promise<Array>} Articles without commentary
   */
  async getArticlesWithoutCommentary(section, limit = 1) {
    try {
      const articles = await Article.find({
        section: section,
        $or: [
          { aiCommentary: { $exists: false } },
          { aiCommentary: null },
          { aiCommentary: '' }
        ]
      })
      .sort({ publishedDate: -1 })
      .limit(limit)
      .lean()
      .exec();

      console.log(`📝 Found ${articles.length} articles without commentary in ${section}`);
      return articles;
    } catch (error) {
      console.error(`❌ Error fetching articles without commentary:`, error);
      return [];
    }
  }

  /**
   * Clear cache for a specific section
   * @param {string} section - Section to clear
   */
  async clearSectionCache(section) {
    try {
      // Clear all pagination caches for this section
      const keys = await CacheService.keys(`section:${section}:*`);
      for (const key of keys) {
        await CacheService.del(key);
      }
      console.log(`🧹 Cleared cache for section: ${section}`);
    } catch (error) {
      console.error(`❌ Error clearing section cache:`, error);
    }
  }

  /**
   * Clear all section caches
   */
  async clearAllSectionCaches() {
    try {
      for (const section of this.sections) {
        await this.clearSectionCache(section);
      }
      console.log('🧹 Cleared all section caches');
    } catch (error) {
      console.error('❌ Error clearing all section caches:', error);
    }
  }
}

module.exports = new SectionArticleService();
