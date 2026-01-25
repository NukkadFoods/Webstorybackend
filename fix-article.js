/**
 * Fix Article Commentary - Update DB from Redis Cache
 */
require('dotenv').config();
const redis = require('./config/redis');
const Article = require('./models/article');
const { connectToMongoDB } = require('./db/connection');

async function fixArticle() {
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
      console.log('💡 Try: node flush-cache.js && restart server');
      process.exit(1);
    }
    
    console.log('✅ Found fresh commentary in Redis\n');
    console.log('━'.repeat(80));
    console.log(freshCommentary);
    console.log('━'.repeat(80));
    
    // Update MongoDB
    console.log('\n📝 Updating MongoDB...');
    const result = await Article.findOneAndUpdate(
      { url: { $regex: 'a837b209-0d08-5f4c-b38d-e459939a6c23' } },
      { 
        $set: { 
          aiCommentary: freshCommentary,
          commentaryGeneratedAt: new Date(),
          commentarySource: 'ai'
        } 
      },
      { new: true }
    );
    
    if (result) {
      console.log('✅ MongoDB updated successfully!');
      console.log('   Article:', result.title);
      console.log('   Has full commentary:', result.aiCommentary.includes('Key Points'));
    } else {
      console.log('❌ Article not found in MongoDB');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixArticle();
