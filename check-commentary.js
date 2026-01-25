/**
 * Check Commentary - Verify 3-section format
 */
require('dotenv').config();
const redis = require('./config/redis');

async function checkCommentary() {
  try {
    console.log('🔍 Checking recent commentary...\n');
    
    // Get a recent commentary from cache
    const keys = await redis.keys('commentary:temp-*');
    
    if (keys.length === 0) {
      console.log('❌ No temp commentary found in cache');
      process.exit(0);
    }
    
    // Check the first one
    const key = keys[0];
    const commentary = await redis.get(key);
    
    console.log('📋 Cache Key:', key);
    console.log('━'.repeat(80));
    console.log(commentary);
    console.log('━'.repeat(80));
    
    // Check for sections
    const hasKeyPoints = commentary.includes('Key Points');
    const hasImpactAnalysis = commentary.includes('Impact Analysis');
    const hasFutureOutlook = commentary.includes('Future Outlook');
    
    console.log('\n✅ Section Check:');
    console.log(`  ${hasKeyPoints ? '✓' : '✗'} Key Points`);
    console.log(`  ${hasImpactAnalysis ? '✓' : '✗'} Impact Analysis`);
    console.log(`  ${hasFutureOutlook ? '✓' : '✗'} Future Outlook`);
    
    if (hasKeyPoints && hasImpactAnalysis && hasFutureOutlook) {
      console.log('\n🎉 All 3 sections present!');
    } else {
      console.log('\n⚠️ Missing sections detected!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkCommentary();
