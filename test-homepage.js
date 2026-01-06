/**
 * Test Homepage Article Fetching
 * Directly tests the database queries for homepage
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Article = require('./models/article');

async function testHomepage() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    const sections = ['world', 'us', 'politics', 'business', 'technology', 'health', 'sports', 'entertainment', 'finance'];
    const articlesPerSection = 2;
    
    console.log('📊 Testing homepage article fetching...\n');
    
    for (const section of sections) {
      const articles = await Article.find({
        section,
        aiCommentary: { $exists: true, $ne: null, $ne: '' }
      })
      .sort({ publishedDate: -1 })
      .limit(articlesPerSection)
      .lean();
      
      console.log(`${section.padEnd(15)}: ${articles.length} articles`);
      if (articles.length > 0) {
        articles.forEach((a, i) => {
          console.log(`  ${i+1}. ${a.title.substring(0, 50)}...`);
        });
      }
    }
    
    // Test all at once (like the API does)
    console.log('\n🏠 Testing Promise.all approach...\n');
    
    const allSectionArticles = await Promise.all(
      sections.map(section => 
        Article.find({
          section,
          aiCommentary: { $exists: true, $ne: null, $ne: '' }
        })
        .sort({ publishedDate: -1 })
        .limit(articlesPerSection)
        .lean()
      )
    );
    
    const flattened = allSectionArticles.flat();
    console.log(`Total articles fetched: ${flattened.length}`);
    console.log('\nArticles by section:');
    allSectionArticles.forEach((arts, i) => {
      console.log(`  ${sections[i]}: ${arts.length} articles`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testHomepage();
