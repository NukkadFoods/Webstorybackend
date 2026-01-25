const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { saveArticles } = require('./db/articleService');

/**
 * NYT API Service for fetching and transforming articles
 */
class NYTService {
  constructor() {
    this.apiKey = process.env.NYT_API_KEY;
    this.baseUrl = 'https://api.nytimes.com/svc';
  }

  /**
   * Transform NYT article to our database format
   */
  transformNYTArticle(nytArticle) {
    return {
      id: nytArticle.uri || uuidv4(),
      title: nytArticle.title,
      abstract: nytArticle.abstract,
      url: nytArticle.url,
      publishedDate: new Date(nytArticle.published_date || Date.now()),
      source: 'nyt',
      section: nytArticle.section,
      subsection: nytArticle.subsection,
      byline: nytArticle.byline,
      multimedia: nytArticle.multimedia || [],
      keywords: nytArticle.des_facet || [],
      des_facet: nytArticle.des_facet || [],
      geo_facet: nytArticle.geo_facet || [],
      per_facet: nytArticle.per_facet || [],
      org_facet: nytArticle.org_facet || []
    };
  }

  /**
   * Fetch articles from NYT Top Stories API
   */
  async fetchTopStories(section = 'home', limit = 20) {
    try {
      // Handle 'all' section by defaulting to 'home'
      if (section === 'all' || !section) {
        section = 'home';
      }

      console.log(`🔄 Fetching ${section} articles from NYT API...`);
      
      const url = `${this.baseUrl}/topstories/v2/${section}.json?api-key=${this.apiKey}`;
      const response = await axios.get(url);
      
      const articles = response.data.results
        .slice(0, limit)
        .map(article => this.transformNYTArticle(article));
      
      console.log(`✅ Fetched ${articles.length} articles from NYT`);
      
      // Save to database
      await saveArticles(articles);
      console.log(`💾 Saved ${articles.length} articles to database`);
      
      return articles;
    } catch (error) {
      console.error('❌ NYT API Error:', error.message);
      throw error;
    }
  }

  /**
   * Search articles using NYT Article Search API
   */
  async searchArticles(query, limit = 10) {
    try {
      console.log(`🔍 Searching NYT for: "${query}"`);
      
      const url = `${this.baseUrl}/search/v2/articlesearch.json`;
      const response = await axios.get(url, {
        params: {
          'api-key': this.apiKey,
          q: query,
          sort: 'newest',
          fl: 'web_url,snippet,lead_paragraph,abstract,print_page,blog,source,multimedia,headline,byline,pub_date,document_type,news_desk,section_name,subsection_name,uri,_id',
          page: 0
        }
      });

      const docs = response.data.response.docs || [];
      const articles = docs.slice(0, limit).map(doc => ({
        id: doc.uri || doc._id || uuidv4(),
        title: doc.headline?.main || 'No Title',
        summary: doc.abstract || doc.snippet || doc.lead_paragraph || '',
        content: doc.lead_paragraph || doc.snippet || doc.abstract || '',
        author: doc.byline?.original || 'NYT Staff',
        publishedAt: doc.pub_date,
        published_date: doc.pub_date,
        category: doc.section_name || 'General',
        section: doc.section_name || 'General',
        url: doc.web_url,
        source: 'nyt',
        multimedia: Array.isArray(doc.multimedia) 
          ? doc.multimedia.map(media => ({
              url: media.url ? `https://nytimes.com/${media.url}` : '',
              format: media.subtype || 'image',
              height: media.height || 0,
              width: media.width || 0,
              type: media.type || 'image',
              subtype: media.subtype || 'photo',
              caption: media.caption || '',
              copyright: media.copyright || ''
            }))
          : [],
        keywords: doc.keywords ? doc.keywords.map(k => k.value) : []
      }));

      console.log(`✅ Found ${articles.length} articles from NYT search`);
      
      // Save to database
      if (articles.length > 0) {
        await saveArticles(articles);
        console.log(`💾 Saved ${articles.length} search results to database`);
      }
      
      return articles;
    } catch (error) {
      console.error('❌ NYT Search Error:', error.message);
      throw error;
    }
  }
}

module.exports = new NYTService();
