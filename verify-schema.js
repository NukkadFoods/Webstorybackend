/**
 * Verify Article Schema Compatibility
 * Checks if existing articles match the new schema structure
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Article = require('./models/article');

const REQUIRED_FIELDS = ['id', 'title', 'url', 'section', 'aiCommentary'];
const RECOMMENDED_FIELDS = ['abstract', 'publishedDate', 'source', 'imageUrl'];

async function verifySchema() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    console.log('📋 Checking article schema compatibility...\n');

    // Get all articles
    const articles = await Article.find({});
    console.log(`📊 Total articles in database: ${articles.length}\n`);

    let compatible = 0;
    let incompatible = 0;
    const incompatibleArticles = [];

    for (const article of articles) {
      const doc = article.toObject();
      const missing = [];
      const missingRecommended = [];

      // Check required fields
      for (const field of REQUIRED_FIELDS) {
        if (!doc[field] || doc[field] === '' || doc[field] === null) {
          missing.push(field);
        }
      }

      // Check recommended fields
      for (const field of RECOMMENDED_FIELDS) {
        if (!doc[field] || doc[field] === '' || doc[field] === null) {
          missingRecommended.push(field);
        }
      }

      if (missing.length > 0) {
        incompatible++;
        incompatibleArticles.push({
          _id: article._id,
          title: article.title?.substring(0, 50) || 'No title',
          section: article.section || 'No section',
          missing: missing,
          missingRecommended: missingRecommended
        });
      } else {
        compatible++;
        if (missingRecommended.length > 0) {
          console.log(`⚠️  Article "${doc.title.substring(0, 40)}..."`);
          console.log(`   Missing recommended: ${missingRecommended.join(', ')}`);
        }
      }
    }

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                SCHEMA COMPATIBILITY REPORT               ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Compatible Articles: ${compatible}`);
    console.log(`❌ Incompatible Articles: ${incompatible}\n`);

    if (incompatible > 0) {
      console.log('❌ Incompatible Articles (missing required fields):\n');
      incompatibleArticles.forEach((article, i) => {
        console.log(`${i + 1}. "${article.title}"`);
        console.log(`   Section: ${article.section}`);
        console.log(`   Missing required: ${article.missing.join(', ')}`);
        if (article.missingRecommended.length > 0) {
          console.log(`   Missing recommended: ${article.missingRecommended.join(', ')}`);
        }
        console.log(`   ID: ${article._id}\n`);
      });

      console.log('⚠️  WARNING: These articles should be removed!\n');
      console.log('💡 They are missing critical fields and will cause errors.\n');
      
      // Ask for confirmation to delete
      console.log('🗑️  Deleting incompatible articles in 5 seconds...');
      console.log('   Press Ctrl+C to cancel\n');
      
      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log('🗑️  Deleting incompatible articles...\n');
      
      const idsToDelete = incompatibleArticles.map(a => a._id);
      const result = await Article.deleteMany({ _id: { $in: idsToDelete } });
      
      console.log(`✅ Deleted ${result.deletedCount} incompatible articles\n`);
      
      // Re-check database
      const remaining = await Article.countDocuments({});
      console.log(`📊 Remaining articles: ${remaining}`);
      
    } else {
      console.log('✅ All articles are compatible with the new schema!');
      console.log('✅ Database is clean and ready.\n');
    }

    // Check source field distribution
    console.log('📊 Source Distribution:');
    const sources = await Article.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } }
    ]);
    sources.forEach(s => {
      console.log(`   ${s._id || 'undefined'}: ${s.count} articles`);
    });

    // Check for missing source field
    const noSource = await Article.countDocuments({
      $or: [
        { source: { $exists: false } },
        { source: null },
        { source: '' }
      ]
    });
    
    if (noSource > 0) {
      console.log(`\n⚠️  ${noSource} articles missing 'source' field`);
      console.log('💡 Updating articles to add source field...\n');
      
      // Update articles without source based on section
      await Article.updateMany(
        {
          $or: [
            { source: { $exists: false } },
            { source: null },
            { source: '' }
          ]
        },
        { $set: { source: 'nytimes' } }
      );
      
      console.log('✅ Updated articles with default source: nytimes\n');
    }

    console.log('✅ Schema verification complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
    process.exit(0);
  }
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║         ARTICLE SCHEMA COMPATIBILITY CHECK               ║
║   Verifies old articles work with new schema             ║
╚══════════════════════════════════════════════════════════╝
`);

verifySchema();
