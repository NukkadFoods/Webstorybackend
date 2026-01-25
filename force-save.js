/**
 * Force Save Article with Commentary
 */
require('dotenv').config();
const redis = require('./config/redis');
const Article = require('./models/article');
const { connectToMongoDB } = require('./db/connection');

async function forceSaveArticle() {
  try {
    await connectToMongoDB();
    console.log('✅ Connected to MongoDB\n');
    
    const articleId = 'nyt://article/a837b209-0d08-5f4c-b38d-e459939a6c23';
    const cacheKey = `commentary:${articleId}`;
    
    // Get fresh commentary from Redis
    console.log('🔍 Fetching commentary from Redis cache...');
    const freshCommentary = await redis.get(cacheKey);
    
    if (!freshCommentary) {
      console.log('❌ No commentary found in Redis cache');
      process.exit(1);
    }
    
    console.log('✅ Found fresh commentary in Redis\n');
    
    // Search by title
    const title = "Trump Says U.S. Is 'In Charge' of Venezuela, While Rubio Stresses Coercing It";
    console.log('🔍 Searching for article by title...');
    
    let article = await Article.findOne({ 
      title: { $regex: 'Trump Says.*Venezuela', $options: 'i' }
    });
    
    if (!article) {
      console.log('❌ Article not found in MongoDB');
      console.log('💡 Creating new article entry...\n');
      
      // Create the article
      article = new Article({
        url: 'https://www.nytimes.com/2026/01/04/us/politics/rubio-military-quarantine-venezuela-oil.html',
        title: title,
        abstract: 'The secretary of state said that a military quarantine on some oil exports from Venezuela would remain in place to put pressure on the country\'s acting leadership.',
        section: 'us',
        publishedDate: new Date(),
        source: 'New York Times',
        byline: 'By Edward Wong',
        aiCommentary: freshCommentary,
        commentaryGeneratedAt: new Date(),
        commentarySource: 'ai'
      });
      
      await article.save();
      console.log('✅ Article created successfully!');
    } else {
      console.log('✅ Article found in MongoDB\n');
      console.log('📝 Current commentary length:', article.aiCommentary?.length || 0);
      console.log('📝 New commentary length:', freshCommentary.length);
      
      // Update with fresh commentary
      article.aiCommentary = freshCommentary;
      article.commentaryGeneratedAt = new Date();
      article.commentarySource = 'ai';
      
      await article.save();
      console.log('✅ Article updated successfully!');
    }
    
    console.log('\n📊 Verification:');
    console.log('   Title:', article.title);
    console.log('   Has Key Points:', article.aiCommentary.includes('Key Points'));
    console.log('   Has Impact Analysis:', article.aiCommentary.includes('Impact Analysis'));
    console.log('   Has Future Outlook:', article.aiCommentary.includes('Future Outlook'));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

forceSaveArticle();
