const Article = require('../../models/article');
const { connectToMongoDB, isConnected } = require('../../config/database');

/**
 * Ensure database connection before operations
 */
const ensureConnection = async () => {
  if (!isConnected()) {
    console.log('Establishing database connection...');
    await connectToMongoDB();
  }
};

/**
 * Save an article to the database
 * @param {Object} articleData - Article data to save
 * @returns {Promise<Object>} Saved article
 */
const saveArticle = async (articleData) => {
  try {
    // Ensure we're connected to MongoDB
    await ensureConnection();
    
    // Check if the article already exists by URL
    const existingArticle = await Article.findOne({ url: articleData.url });
    
    if (existingArticle) {
      // Update existing article
      Object.assign(existingArticle, articleData);
      await existingArticle.save();
      return existingArticle;
    } else {
      // Create new article
      const newArticle = new Article(articleData);
      await newArticle.save();
      return newArticle;
    }
  } catch (error) {
    console.error('Error saving article to MongoDB:', error);
    return null;
  }
};

/**
 * Save multiple articles to the database
 * @param {Array<Object>} articles - Array of article data
 * @returns {Promise<Array<Object>>} Saved articles
 */
const saveArticles = async (articles) => {
  try {
    // Ensure we're connected to MongoDB
    await ensureConnection();
    
    const savedArticles = [];
    
    // Process articles in batches to avoid overwhelming the database
    for (const article of articles) {
      const savedArticle = await saveArticle(article);
      if (savedArticle) {
        savedArticles.push(savedArticle);
      }
    }
    
    return savedArticles;
  } catch (error) {
    console.error('Error saving articles to MongoDB:', error);
    return [];
  }
};

/**
 * Get articles by section
 * @param {string} section - Section name
 * @param {number} limit - Maximum number of articles to return
 * @returns {Promise<Array<Object>>} Articles in the section
 */
const getArticlesBySection = async (section, limit = 10) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    const articles = await Article.find({ section })
      .sort({ publishedDate: -1 })
      .limit(limit);
    
    return articles;
  } catch (error) {
    console.error(`Error getting articles for section ${section}:`, error);
    return [];
  }
};

/**
 * Search articles by keyword
 * @param {string} keyword - Keyword to search for
 * @param {number} limit - Maximum number of articles to return
 * @returns {Promise<Array<Object>>} Matching articles
 */
const searchArticles = async (keyword, limit = 10) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    // Create a regex to search for the keyword in multiple fields
    const searchRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    
    const articles = await Article.find({
      $or: [
        { title: searchRegex },
        { abstract: searchRegex },
        { section: searchRegex },
        { keywords: searchRegex },
        { des_facet: searchRegex },
        { content: searchRegex }
      ]
    }).sort({ publishedDate: -1 }).limit(limit);
    
    return articles;
  } catch (error) {
    console.error(`Error searching articles for keyword ${keyword}:`, error);
    return [];
  }
};

/**
 * Get all articles
 * @param {number} limit - Maximum number of articles to return
 * @returns {Promise<Array<Object>>} All articles
 */
const getAllArticles = async (limit = 100) => {
  try {
    // Ensure we're connected to MongoDB
    await ensureConnection();
    
    const articles = await Article.find()
      .sort({ publishedDate: -1 })
      .limit(limit);
    
    return articles;
  } catch (error) {
    console.error('Error getting all articles:', error);
    return [];
  }
};

/**
 * Get article by ID (MongoDB ObjectId)
 * @param {string} id - Article ID
 * @returns {Promise<Object|null>} Article or null if not found
 */
const getArticleById = async (id) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    const article = await Article.findById(id);
    return article;
  } catch (error) {
    console.error(`Error getting article by ID ${id}:`, error);
    return null;
  }
};

/**
 * Get article by URL
 * @param {string} url - Article URL
 * @returns {Promise<Object|null>} Article or null if not found
 */
const getArticleByUrl = async (url) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    const decodedUrl = decodeURIComponent(url);
    const article = await Article.findOne({ url: decodedUrl });
    return article;
  } catch (error) {
    console.error(`Error getting article by URL ${url}:`, error);
    return null;
  }
};

/**
 * Smart article finder that searches by multiple criteria
 * @param {string} identifier - Can be MongoDB ObjectId, URL, title, or UUID
 * @returns {Promise<Object|null>} Article or null if not found
 */
const findArticleByIdentifier = async (identifier) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    let article = null;
    
    // Try different search strategies
    // 1. MongoDB ObjectId
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      article = await Article.findById(identifier);
      if (article) return article;
    }
    
    // 2. URL (exact match)
    const decodedIdentifier = decodeURIComponent(identifier);
    article = await Article.findOne({ url: decodedIdentifier });
    if (article) return article;
    
    // 3. URL contains identifier
    article = await Article.findOne({ url: { $regex: decodedIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } });
    if (article) return article;
    
    // 4. Title match
    article = await Article.findOne({ title: { $regex: decodedIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } });
    if (article) return article;
    
    // 5. Try finding by custom ID fields that might exist
    article = await Article.findOne({
      $or: [
        { id: identifier },
        { uri: identifier },
        { slug_name: identifier }
      ]
    });
    if (article) return article;
    
    // 6. If UUID pattern, try to find any article and return the first available one as fallback
    if (identifier.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)) {
      console.log(`UUID ${identifier} not found, returning latest article as fallback`);
      article = await Article.findOne().sort({ publishedDate: -1 });
      if (article) {
        // Add a note that this is a fallback
        article._fallback = true;
        article._originalId = identifier;
        return article;
      }
    }
    
    return article;
  } catch (error) {
    console.error(`Error finding article by identifier ${identifier}:`, error);
    return null;
  }
};

/**
 * Delete article by URL
 * @param {string} url - URL of the article to delete
 * @returns {Promise<boolean>} Whether the deletion was successful
 */
const deleteArticleByUrl = async (url) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    await Article.findOneAndDelete({ url });
    return true;
  } catch (error) {
    console.error(`Error deleting article with URL ${url}:`, error);
    return false;
  }
};

module.exports = {
  saveArticle,
  saveArticles,
  getArticlesBySection,
  searchArticles,
  getAllArticles,
  deleteArticleByUrl,
  getArticleById,
  getArticleByUrl,
  findArticleByIdentifier
};
