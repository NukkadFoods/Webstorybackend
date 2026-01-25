/**
 * Add Commentary to Existing Articles
 * 
 * Processes articles that are already in DB but don't have commentary
 * Useful for migrating existing articles to the new system
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { generateGroqCommentary } = require('./services/aiService');
const Article = require('./models/article');
const CacheService = require('./services/cache');

async function addCommentaryToExisting() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    const section = process.argv[2] || 'all';
    const limit = parseInt(process.argv[3]) || 10;

    let query = {
      $or: [
        { aiCommentary: { $exists: false } },
        { aiCommentary: null },
        { aiCommentary: '' }
      ]
    };

    if (section !== 'all') {
      query.section = section;
    }

    console.log(`🔍 Finding articles without commentary...`);
    const articles = await Article.find(query).limit(limit);

    console.log(`📝 Found ${articles.length} articles without commentary\n`);

    if (articles.length === 0) {
      console.log('✅ No articles need commentary!');
      return;
    }

    let processed = 0;
    let failed = 0;

    for (const article of articles) {
      try {
        console.log(`\n🤖 [${processed + 1}/${articles.length}] Processing: "${article.title.substring(0, 50)}..."`);
        console.log(`   Section: ${article.section}`);

        // Generate commentary
        const commentary = await generateGroqCommentary(
          article.title,
          article.abstract || '',
          article.section
        );

        if (!commentary) {
          console.log(`   ⚠️  Commentary generation returned empty`);
          failed++;
          continue;
        }

        // Update article in DB
        article.aiCommentary = commentary;
        article.updatedAt = new Date();
        await article.save();

        // Cache the complete article
        const cacheKey = `article:${article.id || article._id}`;
        await CacheService.set(cacheKey, JSON.stringify(article.toObject()), 1800);

        console.log(`   ✅ Commentary added and cached`);
        processed++;

        // Rate limiting: Wait 3 seconds between articles
        if (processed < articles.length) {
          console.log(`   ⏳ Waiting 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        failed++;
        
        // If rate limit hit, stop processing
        if (error.message.includes('RATE_LIMIT')) {
          console.log(`\n⚠️  Rate limit reached. Stopping processing.`);
          break;
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Processed: ${processed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📝 Total: ${articles.length}`);

    // Clear section caches
    console.log(`\n🧹 Clearing section caches...`);
    const sectionArticleService = require('./services/db/sectionArticleService');
    const sections = ['home', 'world', 'us', 'politics', 'business', 'technology', 'health', 'sports'];
    for (const sec of sections) {
      await sectionArticleService.clearSectionCache(sec);
    }
    console.log(`✅ Caches cleared`);

  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║   ADD COMMENTARY TO EXISTING ARTICLES                    ║
║   Processes articles already in DB but missing commentary║
╚══════════════════════════════════════════════════════════╝

Usage:
  node add-commentary-to-existing.js [section] [limit]

Examples:
  node add-commentary-to-existing.js              # Process 10 articles from all sections
  node add-commentary-to-existing.js technology   # Process 10 from technology section
  node add-commentary-to-existing.js all 20       # Process 20 from all sections
  node add-commentary-to-existing.js business 5   # Process 5 from business section
`);

addCommentaryToExisting();
