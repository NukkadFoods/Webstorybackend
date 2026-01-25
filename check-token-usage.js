/**
 * Daily Token Usage Monitor
 * 
 * Estimates how many tokens you've used today based on:
 * - Articles in MongoDB with commentary generated today
 * - Temp articles in Redis (homepage cache)
 */

require('dotenv').config();
const Article = require('./models/article');
const CacheService = require('./services/cache');
const { connectToMongoDB } = require('./config/database');

async function checkDailyTokenUsage() {
  try {
    console.log('🔌 Connecting to services...\n');
    await connectToMongoDB();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log(`📅 Checking usage for: ${today.toDateString()}\n`);
    
    // Count articles with commentary generated today
    const articlesToday = await Article.countDocuments({
      commentaryGeneratedAt: { $gte: today },
      aiCommentary: { $exists: true, $ne: null }
    });
    
    console.log(`📊 Articles with commentary generated today: ${articlesToday}`);
    
    // Estimate tokens (avg 600 tokens per article)
    const estimatedTokens = articlesToday * 600;
    const dailyLimit = 100000;
    const remaining = dailyLimit - estimatedTokens;
    const percentUsed = (estimatedTokens / dailyLimit * 100).toFixed(1);
    
    console.log(`\n💰 Token Usage Estimate:`);
    console.log(`  Used: ~${estimatedTokens.toLocaleString()} tokens (${percentUsed}%)`);
    console.log(`  Remaining: ~${remaining.toLocaleString()} tokens`);
    console.log(`  Daily Limit: ${dailyLimit.toLocaleString()} tokens/day`);
    
    if (remaining < 10000) {
      console.log(`\n⚠️  WARNING: Less than 10,000 tokens remaining!`);
      console.log(`   You can generate ~${Math.floor(remaining / 600)} more articles today`);
    } else {
      console.log(`\n✅ You can generate ~${Math.floor(remaining / 600)} more articles today`);
    }
    
    // Show breakdown by section
    console.log(`\n📈 Breakdown by Section:`);
    const sections = await Article.aggregate([
      {
        $match: {
          commentaryGeneratedAt: { $gte: today },
          aiCommentary: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$section',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    sections.forEach(s => {
      console.log(`  ${s._id || 'Unknown'}: ${s.count} articles (~${s.count * 600} tokens)`);
    });
    
    // Tips
    console.log(`\n💡 Tips to manage token usage:`);
    console.log(`  1. Use Redis cache (30min) to avoid regenerating`);
    console.log(`  2. Use browser cache (5min) to reduce API calls`);
    console.log(`  3. Limit homepage articles to avoid temp IDs`);
    console.log(`  4. Generate commentary only for viewed articles`);
    console.log(`  5. Upgrade to Dev Tier for 200k tokens/day`);
    
    console.log(`\n🔄 Rate limit resets at: Midnight UTC (${new Date().toUTCString()})`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDailyTokenUsage();
