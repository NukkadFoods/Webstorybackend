/**
 * Flush Redis Cache - Quick utility script
 */
require('dotenv').config();
const redis = require('./config/redis');

async function flushCache() {
  try {
    console.log('🧹 Flushing Redis cache...');
    
    // Get all commentary keys
    const keys = await redis.keys('commentary:*');
    console.log(`Found ${keys.length} commentary cache entries`);
    
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`✅ Deleted ${keys.length} commentary entries`);
    }
    
    // Also clear homepage list
    await redis.del('homepage:top20');
    console.log('✅ Cleared homepage:top20 list');
    
    console.log('🎉 Cache flush complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error flushing cache:', error.message);
    process.exit(1);
  }
}

flushCache();
