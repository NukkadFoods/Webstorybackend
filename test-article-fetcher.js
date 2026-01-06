/**
 * Manual Article Fetcher Test
 * 
 * Use this to manually fetch and process articles for a specific section
 * Useful for testing and initial population
 */

require('dotenv').config();
const mongoose = require('mongoose');
const articleFetcherService = require('./services/db/articleFetcherService');

async function testFetcher() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    const section = process.argv[2] || 'technology';
    const count = parseInt(process.argv[3]) || 5;

    console.log(`📰 Fetching ${count} articles for section: ${section.toUpperCase()}\n`);
    
    const processedCount = await articleFetcherService.fetchAndProcessSection(section, count);

    console.log(`\n✅ Test complete! Processed ${processedCount} articles with commentary`);
    console.log(`\n💡 Now check frontend or API: GET /api/sections/${section}/articles`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║         ARTICLE FETCHER TEST                             ║
║  Fetches NYT → Generates Commentary → Saves to DB        ║
╚══════════════════════════════════════════════════════════╝
`);

testFetcher();
