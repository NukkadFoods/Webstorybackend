/**
 * Clean Articles by Section
 * 
 * Removes articles from sections that are not in our agreed-upon list
 * Keeps only: home, world, us, politics, business, technology, health, sports, entertainment, finance
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Article = require('./models/article');

// Agreed-upon sections ONLY
const ALLOWED_SECTIONS = [
  'home',
  'world',
  'us',
  'politics',
  'business',
  'technology',
  'health',
  'sports',
  'entertainment',
  'finance'
];

async function cleanArticlesBySections() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    console.log('📋 Allowed sections:', ALLOWED_SECTIONS.join(', '));
    console.log('');

    // Find all unique sections in database
    const allSections = await Article.distinct('section');
    console.log('📂 Current sections in database:', allSections.join(', '));
    console.log('');

    // Find sections to remove
    const sectionsToRemove = allSections.filter(s => !ALLOWED_SECTIONS.includes(s));
    
    if (sectionsToRemove.length === 0) {
      console.log('✅ Database is clean! Only allowed sections found.');
      return;
    }

    console.log('🗑️  Sections to be removed:', sectionsToRemove.join(', '));
    console.log('');

    // Count articles in sections to be removed
    const articlesToRemove = await Article.countDocuments({
      section: { $in: sectionsToRemove }
    });

    console.log(`📊 Found ${articlesToRemove} articles in unauthorized sections\n`);

    // Show breakdown
    console.log('📂 Breakdown by section:');
    for (const section of sectionsToRemove) {
      const count = await Article.countDocuments({ section });
      console.log(`   ${section}: ${count} articles`);
    }

    console.log(`\n⚠️  WARNING: This will DELETE ${articlesToRemove} articles!`);
    console.log('   Only articles from allowed sections will remain.');
    console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🗑️  Deleting articles from unauthorized sections...\n');

    // Delete articles from unauthorized sections
    const result = await Article.deleteMany({
      section: { $in: sectionsToRemove }
    });

    console.log(`✅ Deleted ${result.deletedCount} articles\n`);

    // Show final state
    const remaining = await Article.countDocuments();
    console.log('📊 Final Database Status:');
    console.log(`   Total Articles: ${remaining}`);
    console.log('');

    console.log('📂 Articles by Allowed Sections:');
    for (const section of ALLOWED_SECTIONS) {
      const count = await Article.countDocuments({ section });
      if (count > 0) {
        console.log(`   ${section}: ${count} articles`);
      }
    }

    // Clear Redis cache
    console.log('\n🧹 Clearing Redis cache...');
    const CacheService = require('./services/cache');
    const keys = await CacheService.keys('*');
    if (keys && keys.length > 0) {
      for (const key of keys) {
        await CacheService.del(key);
      }
      console.log(`✅ Cleared ${keys.length} cache keys`);
    }

    console.log('\n✅ Cleanup complete!');
    console.log('💡 Database now contains ONLY articles from allowed sections');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 MongoDB disconnected');
    process.exit(0);
  }
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║         CLEAN ARTICLES BY SECTION                        ║
║   Removes articles from unauthorized sections            ║
╚══════════════════════════════════════════════════════════╝
`);

cleanArticlesBySections();
