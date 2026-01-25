/**
 * Check Redis Cache for Old/Incompatible Articles
 * Verifies cached articles match the new schema requirements
 */

require('dotenv').config();
const CacheService = require('./services/cache');

const REQUIRED_FIELDS = ['id', 'title', 'url', 'section', 'aiCommentary'];

async function checkRedisCache() {
  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           REDIS CACHE INSPECTION                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Get all article keys
    const articleKeys = await CacheService.keys('article:*');
    const sectionKeys = await CacheService.keys('section:*');
    
    console.log(`📊 Cache Statistics:`);
    console.log(`   Article keys: ${articleKeys.length}`);
    console.log(`   Section keys: ${sectionKeys.length}`);
    console.log(`   Total keys: ${articleKeys.length + sectionKeys.length}\n`);

    if (articleKeys.length === 0 && sectionKeys.length === 0) {
      console.log('✅ Redis cache is empty (clean state)\n');
      console.log('💡 Cache will be populated after threshold is met\n');
      process.exit(0);
    }

    let compatible = 0;
    let incompatible = 0;
    let parseErrors = 0;
    const issues = [];

    // Check each article
    console.log('🔍 Checking cached articles...\n');
    
    for (const key of articleKeys) {
      try {
        const cached = await CacheService.get(key);
        
        if (!cached) {
          issues.push({ key, issue: 'Empty cache entry' });
          incompatible++;
          continue;
        }

        // Parse article
        let article;
        try {
          article = typeof cached === 'string' ? JSON.parse(cached) : cached;
        } catch (parseError) {
          issues.push({ key, issue: 'Invalid JSON' });
          parseErrors++;
          continue;
        }

        // Check required fields
        const missing = [];
        for (const field of REQUIRED_FIELDS) {
          if (!article[field] || article[field] === '' || article[field] === null) {
            missing.push(field);
          }
        }

        if (missing.length > 0) {
          issues.push({ 
            key, 
            issue: `Missing fields: ${missing.join(', ')}`,
            title: article.title?.substring(0, 40) || 'No title'
          });
          incompatible++;
        } else {
          compatible++;
        }

      } catch (error) {
        issues.push({ key, issue: `Error: ${error.message}` });
        incompatible++;
      }
    }

    // Print results
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║                CACHE VALIDATION RESULTS                  ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Compatible articles: ${compatible}`);
    console.log(`❌ Incompatible articles: ${incompatible}`);
    console.log(`⚠️  Parse errors: ${parseErrors}\n`);

    if (issues.length > 0) {
      console.log('❌ Issues found:\n');
      issues.slice(0, 10).forEach((issue, i) => {
        console.log(`${i + 1}. ${issue.key}`);
        console.log(`   Issue: ${issue.issue}`);
        if (issue.title) console.log(`   Title: "${issue.title}"`);
        console.log();
      });

      if (issues.length > 10) {
        console.log(`... and ${issues.length - 10} more issues\n`);
      }

      console.log('🗑️  RECOMMENDATION: Clear Redis cache to remove old articles\n');
      console.log('   Run: node clean-redis-cache.js\n');
      
      // Ask to clear cache
      console.log('🗑️  Clear cache now? Waiting 5 seconds...');
      console.log('   Press Ctrl+C to cancel\n');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('🗑️  Clearing Redis cache...\n');
      
      let deletedArticles = 0;
      let deletedSections = 0;
      
      for (const key of articleKeys) {
        await CacheService.del(key);
        deletedArticles++;
      }
      
      for (const key of sectionKeys) {
        await CacheService.del(key);
        deletedSections++;
      }
      
      console.log(`✅ Deleted ${deletedArticles} article keys`);
      console.log(`✅ Deleted ${deletedSections} section keys`);
      console.log('✅ Redis cache cleared successfully\n');
      
    } else {
      console.log('✅ All cached articles are compatible!\n');
      console.log('💡 Cache is ready for use\n');
    }

    // Check section caches
    if (sectionKeys.length > 0) {
      console.log('📋 Section Cache Keys:');
      sectionKeys.forEach(key => {
        console.log(`   ${key}`);
      });
      console.log();
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkRedisCache();
