/**
 * Delete Articles Without Commentary
 * 
 * Removes all articles from DB that don't have commentary
 * This ensures only complete articles remain in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Article = require('./models/article');

async function deleteArticlesWithoutCommentary() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    // Count articles without commentary
    const count = await Article.countDocuments({
      $or: [
        { aiCommentary: { $exists: false } },
        { aiCommentary: null },
        { aiCommentary: '' }
      ]
    });

    console.log(`📊 Found ${count} articles WITHOUT commentary\n`);

    if (count === 0) {
      console.log('✅ No articles to delete!');
      return;
    }

    // Show breakdown by section
    console.log('📂 Breakdown by section:');
    const bySection = await Article.aggregate([
      { 
        $match: { 
          $or: [
            { aiCommentary: { $exists: false } },
            { aiCommentary: null },
            { aiCommentary: '' }
          ]
        }
      },
      { $group: { _id: '$section', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    bySection.forEach(s => console.log(`   ${s._id}: ${s.count} articles`));

    // Ask for confirmation
    console.log(`\n⚠️  WARNING: This will DELETE ${count} articles from the database!`);
    console.log('   Only articles WITH commentary will remain.');
    console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('🗑️  Deleting articles without commentary...\n');

    // Delete articles without commentary
    const result = await Article.deleteMany({
      $or: [
        { aiCommentary: { $exists: false } },
        { aiCommentary: null },
        { aiCommentary: '' }
      ]
    });

    console.log(`✅ Deleted ${result.deletedCount} articles\n`);

    // Show remaining articles
    const remaining = await Article.countDocuments();
    const withCommentary = await Article.countDocuments({
      aiCommentary: { $exists: true, $ne: null, $ne: '' }
    });

    console.log('📊 Database Status After Cleanup:');
    console.log(`   Total Articles: ${remaining}`);
    console.log(`   With Commentary: ${withCommentary}`);
    console.log(`   Without Commentary: ${remaining - withCommentary}`);

    console.log('\n📂 Articles WITH Commentary by Section:');
    const remainingBySection = await Article.aggregate([
      { $match: { aiCommentary: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$section', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    remainingBySection.forEach(s => console.log(`   ${s._id}: ${s.count}`));

    // Clear Redis cache
    console.log('\n🧹 Clearing Redis cache...');
    const CacheService = require('./services/cache');
    const keys = await CacheService.keys('*');
    if (keys && keys.length > 0) {
      for (const key of keys) {
        await CacheService.del(key);
      }
      console.log(`✅ Cleared ${keys.length} cache keys`);
    } else {
      console.log('✅ Cache already clear');
    }

    console.log('\n✅ Cleanup complete!');
    console.log('💡 Now only complete articles (with commentary) remain in the database');
    console.log('💡 The Section Rotation Worker will fetch new articles and add commentary');

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
║         DELETE ARTICLES WITHOUT COMMENTARY               ║
║   Cleans database by removing incomplete articles        ║
╚══════════════════════════════════════════════════════════╝
`);

deleteArticlesWithoutCommentary();
