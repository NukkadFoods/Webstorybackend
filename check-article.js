/**
 * Check specific article commentary
 */
require('dotenv').config();
const redis = require('./config/redis');

async function checkArticleCommentary() {
  try {
    const searchTitle = "Trump Says U.S. Is 'In Charge' of Venezuela";
    console.log(`🔍 Searching for article: "${searchTitle}"\n`);
    
    // Get all commentary keys
    const keys = await redis.keys('commentary:*');
    console.log(`Found ${keys.length} total commentary entries in cache\n`);
    
    let found = false;
    
    // Search through all keys
    for (const key of keys) {
      const commentary = await redis.get(key);
      
      // Check if this commentary matches our article (crude search)
      if (commentary && (
        commentary.toLowerCase().includes('venezuela') && 
        commentary.toLowerCase().includes('trump')
      )) {
        console.log('✅ FOUND MATCHING COMMENTARY');
        console.log('━'.repeat(80));
        console.log(`Key: ${key}`);
        console.log('━'.repeat(80));
        console.log(commentary);
        console.log('━'.repeat(80));
        
        // Check sections
        const hasKeyPoints = commentary.includes('Key Points');
        const hasImpactAnalysis = commentary.includes('Impact Analysis');
        const hasFutureOutlook = commentary.includes('Future Outlook');
        
        console.log('\n📊 Section Check:');
        console.log(`  ${hasKeyPoints ? '✅' : '❌'} Key Points`);
        console.log(`  ${hasImpactAnalysis ? '✅' : '❌'} Impact Analysis`);
        console.log(`  ${hasFutureOutlook ? '✅' : '❌'} Future Outlook`);
        
        if (hasKeyPoints && hasImpactAnalysis && hasFutureOutlook) {
          console.log('\n🎉 COMPLETE: All 3 sections present!');
        } else {
          console.log('\n⚠️ INCOMPLETE: Missing sections!');
        }
        
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log('❌ No commentary found for this article');
      console.log('💡 Try visiting the article page to trigger generation');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkArticleCommentary();
