const Article = require('../../models/article');
const { connectToMongoDB, isConnected } = require('../../config/database');

/**
 * Helper function to ensure articles have consistent ID fields
 * @param {Object|Array} articles - Article(s) to transform
 * @returns {Object|Array} Transformed article(s) with id field
 */
const ensureArticleIds = (articles) => {
  const transformArticle = (article) => {
    if (!article) return article;
    
    // Convert Mongoose document to plain object if needed
    const articleObj = article.toObject ? article.toObject() : { ...article };
    
    // Ensure the article has an 'id' field for frontend compatibility
    if (!articleObj.id && articleObj._id) {
      articleObj.id = articleObj._id.toString();
      console.log('✅ Added id field:', articleObj.id);
    } else if (articleObj.id) {
      // Reduced logging - only show id when needed for debugging
      // console.log('✅ Article already has id field:', articleObj.id);
    } else {
      console.log('❌ No _id field found to convert');
    }
    
    return articleObj;
  };
  
  if (Array.isArray(articles)) {
    console.log(`🔧 Processing ${articles.length} articles for ID transformation`);
    return articles.map(transformArticle);
  } else {
    console.log('🔧 Processing single article for ID transformation');
    return transformArticle(articles);
  }
};

/**
 * Enhanced connection helper with timeout
 */
const ensureConnection = async () => {
  if (!isConnected()) {
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
    
    // Use findOneAndUpdate with upsert to avoid version conflicts
    const updatedArticle = await Article.findOneAndUpdate(
      { url: articleData.url },
      { $set: articleData },
      { 
        upsert: true, 
        new: true, 
        runValidators: true,
        // Disable version checking to avoid conflicts
        overwrite: false
      }
    );
    
    return updatedArticle;
  } catch (error) {
    // Handle version errors gracefully
    if (error.name === 'VersionError') {
      console.log(`⚠️ Version conflict for article ${articleData.url}, retrying...`);
      // Retry once with fresh data
      try {
        const retryArticle = await Article.findOneAndUpdate(
          { url: articleData.url },
          { $set: articleData },
          { 
            upsert: true, 
            new: true, 
            runValidators: true
          }
        );
        return retryArticle;
      } catch (retryError) {
        console.log(`⚠️ Retry failed for article ${articleData.url}, skipping...`);
        return null;
      }
    }
    
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
 * @returns {Promise<Array<Object>>} Articles in the section WITH commentary
 */
const getArticlesBySection = async (section, limit = 10) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    // ONLY return articles WITH commentary
    const articles = await Article.find({ 
      section,
      aiCommentary: { $exists: true, $ne: null, $ne: '' }
    })
      .sort({ publishedDate: -1 })
      .limit(limit);
    
    return ensureArticleIds(articles);
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
    
    return ensureArticleIds(articles);
  } catch (error) {
    console.error(`Error searching articles for keyword ${keyword}:`, error);
    return [];
  }
};

/**
 * Get all articles with optional filtering
 * @param {number} limit - Maximum number of articles to return
 * @param {number} offset - Number of articles to skip (for pagination)
 * @param {string} category - Category/section filter
 * @param {string} searchQuery - Search query filter
 * @returns {Promise<Array<Object>>} All articles
 */
const getAllArticles = async (limit = 100, offset = 0, category = null, searchQuery = null) => {
  try {
    // Ensure we're connected to MongoDB with timeout
    await Promise.race([
      ensureConnection(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
    ]);
    
    // Build query object
    let query = {};
    
    // Add category filter if provided
    if (category && category !== 'home' && category !== 'all') {
      query.section = category;
    }
    
    // Add search query filter if provided
    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { title: searchRegex },
        { abstract: searchRegex },
        { content: searchRegex },
        { section: searchRegex }
      ];
    }
    
    const articles = await Article.find(query)
      .sort({ publishedDate: -1 })
      .skip(offset)
      .limit(limit);
    
    return ensureArticleIds(articles);
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
 * Update article by ID
 * @param {string} id - Article ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object|null>} Updated article or null if not found
 */
const updateArticleById = async (id, updateData) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    const updatedArticle = await Article.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    return updatedArticle;
  } catch (error) {
    console.error(`Error updating article by ID ${id}:`, error);
    return null;
  }
};

/**
 * Create or update article (upsert operation)
 * @param {Object} articleData - Article data to create/update
 * @returns {Promise<Object|null>} Created/updated article or null if failed
 */
const createOrUpdateArticle = async (articleData) => {
  try {
    // Ensure we're connected to MongoDB
    if (!isConnected()) {
      await connectToMongoDB();
    }
    
    // Use URL as the unique identifier for upsert
    const updatedArticle = await Article.findOneAndUpdate(
      { url: articleData.url },
      { $set: articleData },
      { 
        upsert: true, 
        new: true, 
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );
    
    return updatedArticle;
  } catch (error) {
    console.error(`Error creating/updating article:`, error);
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
  findArticleByIdentifier,
  updateArticleById,
  createOrUpdateArticle
};
