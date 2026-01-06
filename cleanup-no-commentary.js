/**
 * Cleanup Script: Remove articles without commentary
 * 
 * This removes old articles that don't have AI commentary generated yet.
 * Keeps articles with commentary and temp articles (homepage cache).
 */

require('dotenv').config();
const Article = require('./models/article');
const { connectToMongoDB } = require('./config/database');

async function cleanupArticlesWithoutCommentary() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectToMongoDB();
    
    console.log('\n🔍 Finding articles without commentary...');
    
    // Find articles without aiCommentary
    const articlesWithoutCommentary = await Article.find({
      $or: [
        { aiCommentary: { $exists: false } },
        { aiCommentary: null },
        { aiCommentary: '' }
      ]
    }).select('_id title url publishedDate');
    
    console.log(`📊 Found ${articlesWithoutCommentary.length} articles without commentary`);
    
    if (articlesWithoutCommentary.length === 0) {
      console.log('✅ No articles to clean up!');
      process.exit(0);
    }
    
    // Show some examples
    console.log('\n📝 Examples (first 5):');
    articlesWithoutCommentary.slice(0, 5).forEach((article, i) => {
      console.log(`  ${i + 1}. ${article.title?.substring(0, 60)}...`);
      console.log(`     ID: ${article._id}`);
      console.log(`     Published: ${article.publishedDate}`);
    });
    
    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will permanently delete these articles!');
    console.log('Press Ctrl+C to cancel or wait 10 seconds to proceed...\n');
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('🗑️  Deleting articles without commentary...');
    
    const result = await Article.deleteMany({
      $or: [
        { aiCommentary: { $exists: false } },
        { aiCommentary: null },
        { aiCommentary: '' }
      ]
    });
    
    console.log(`✅ Deleted ${result.deletedCount} articles without commentary`);
    
    // Show remaining count
    const remaining = await Article.countDocuments();
    console.log(`📊 Remaining articles: ${remaining}`);
    
    const withCommentary = await Article.countDocuments({ 
      aiCommentary: { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`✅ Articles with commentary: ${withCommentary}`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanupArticlesWithoutCommentary();
