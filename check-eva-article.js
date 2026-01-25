/**
 * Check specific article by title
 */

require('dotenv').config();
const Article = require('./models/article');
const { connectToMongoDB } = require('./config/database');

async function checkArticle() {
  try {
    await connectToMongoDB();
    
    const article = await Article.findOne({
      title: { $regex: /Eva Schloss.*Anne Frank/i }
    }).select('_id title aiCommentary url section');
    
    if (!article) {
      console.log('❌ Article not found in database');
      console.log('This means it needs to be fetched from NYT API first');
      process.exit(0);
    }
    
    console.log('\n📰 Article Found:');
    console.log(`Title: ${article.title}`);
    console.log(`ID: ${article._id}`);
    console.log(`Section: ${article.section}`);
    console.log(`URL: ${article.url}`);
    console.log(`\n💬 Has Commentary: ${!!article.aiCommentary}`);
    
    if (article.aiCommentary) {
      console.log(`\n📝 Commentary Preview:`);
      console.log(article.aiCommentary.substring(0, 200) + '...');
    } else {
      console.log(`\n⚠️  No commentary in database`);
      console.log(`This article needs commentary generation`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkArticle();
