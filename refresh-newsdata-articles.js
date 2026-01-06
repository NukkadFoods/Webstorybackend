const { connectToMongoDB } = require('./config/database');
const Article = require('./models/article');
const articleFetcherService = require('./services/db/articleFetcherService');

async function refreshNewsdataArticles() {
  console.log('🔄 Refreshing newsdata.io articles (sports, entertainment, finance)...\n');
  
  await connectToMongoDB();
  
  const sections = ['sports', 'entertainment', 'finance'];
  
  for (const section of sections) {
    console.log(`\n📊 Processing ${section.toUpperCase()}...`);
    
    // Count current articles
    const count = await Article.countDocuments({ 
      section,
      aiCommentary: { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`   Current: ${count} articles with commentary`);
    
    // Delete all articles from this section
    const deleteResult = await Article.deleteMany({ section });
    console.log(`   🗑️  Deleted: ${deleteResult.deletedCount} articles`);
    
    // Fetch fresh articles with images
    console.log(`   📥 Fetching fresh articles with images...`);
    const result = await articleFetcherService.fetchAndProcessSection(section, 8);
    
    if (result && result.processedCount > 0) {
      console.log(`   ✅ Added ${result.processedCount} new articles with images`);
    } else {
      console.log(`   ⚠️  Failed to fetch articles for ${section}`);
    }
    
    // Wait 5 seconds between sections to avoid rate limits
    if (section !== 'finance') {
      console.log(`   ⏸️  Waiting 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log('\n✅ Refresh complete!');
  process.exit(0);
}

refreshNewsdataArticles().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
