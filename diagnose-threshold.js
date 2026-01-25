const { connectToMongoDB } = require('./config/database');
const Article = require('./models/article');
const groqLoadBalancer = require('./services/groqLoadBalancer');
const { generateGroqCommentary } = require('./services/aiService');

const SECTIONS = ['world', 'us', 'politics', 'business', 'technology', 'health', 'sports', 'entertainment', 'finance'];

async function diagnoseThreshold() {
  console.log('🔍 THRESHOLD DIAGNOSTIC REPORT\n');
  console.log('═'.repeat(70));
  
  await connectToMongoDB();
  
  // 1. Check current status
  console.log('\n📊 CURRENT DATABASE STATUS:');
  console.log('─'.repeat(70));
  
  let total = 0;
  const sectionStats = {};
  
  for (const section of SECTIONS) {
    const withCommentary = await Article.countDocuments({ 
      section,
      aiCommentary: { $exists: true, $ne: null, $ne: '' }
    });
    
    const withoutCommentary = await Article.countDocuments({ 
      section,
      $or: [
        { aiCommentary: { $exists: false } },
        { aiCommentary: null },
        { aiCommentary: '' }
      ]
    });
    
    const total_section = withCommentary + withoutCommentary;
    
    sectionStats[section] = { withCommentary, withoutCommentary, total_section };
    total += withCommentary;
    
    const status = withCommentary >= 8 ? '✅' : '⏳';
    const needsTag = withoutCommentary > 0 ? ` 🔴 ${withoutCommentary} WITHOUT commentary` : '';
    console.log(`${status} ${section.padEnd(15)} ${withCommentary}/8${needsTag}`);
  }
  
  console.log(`\n🎯 Total: ${total}/72 articles with commentary`);
  console.log(`📊 Progress: ${Math.round(total/72*100)}%\n`);
  
  // 2. Check Groq API status
  console.log('🔐 GROQ API STATUS:');
  console.log('─'.repeat(70));
  
  if (!groqLoadBalancer) {
    console.log('❌ Groq Load Balancer NOT initialized - check API keys in .env');
  } else {
    const stats = groqLoadBalancer.getStats();
    console.log(`✅ API Keys available: ${stats.availableKeys}/${stats.totalKeys}`);
    console.log(`📈 Total tokens used: ${stats.totalTokensUsed}/${stats.totalDailyLimit} (${stats.percentUsed}%)`);
    console.log(`⏱️  Reset time: ${stats.resetTime.toISOString()}\n`);
    
    stats.keys.forEach(key => {
      const icon = key.isAvailable ? '✅' : '❌';
      console.log(`${icon} Key ${key.id}: ${key.tokensUsed}/${key.dailyLimit} (${key.percentUsed}%) ${key.lastError ? '- ' + key.lastError : ''}`);
    });
  }
  
  // 3. Test commentary generation
  console.log('\n🧪 TESTING COMMENTARY GENERATION:');
  console.log('─'.repeat(70));
  
  const testArticle = {
    title: 'Test Article: Tech Innovation Drives Market Growth',
    abstract: 'New technology innovation is shaping the future of markets and driving growth across sectors.',
    section: 'technology'
  };
  
  try {
    console.log('🤖 Generating test commentary...');
    const commentary = await generateGroqCommentary(
      testArticle.title,
      testArticle.abstract,
      testArticle.section
    );
    
    if (commentary && commentary.length > 0) {
      console.log('✅ Commentary generation successful');
      console.log(`📝 Length: ${commentary.length} characters\n`);
      console.log('Sample output (first 200 chars):');
      console.log(commentary.substring(0, 200) + '...\n');
    } else {
      console.log('❌ Commentary generated but empty');
    }
  } catch (error) {
    console.log(`❌ Commentary generation failed: ${error.message}\n`);
  }
  
  // 4. Check for articles that need commentary
  console.log('🔍 ARTICLES NEEDING COMMENTARY:');
  console.log('─'.repeat(70));
  
  for (const section of SECTIONS) {
    const needingCommentary = await Article.find({ 
      section,
      $or: [
        { aiCommentary: { $exists: false } },
        { aiCommentary: null },
        { aiCommentary: '' }
      ]
    }).limit(3).select('title url publishedDate');
    
    if (needingCommentary.length > 0) {
      console.log(`\n📍 ${section.toUpperCase()} (${needingCommentary.length} articles):`)
      needingCommentary.forEach(article => {
        console.log(`   - "${article.title.substring(0, 50)}..."`);
      });
    }
  }
  
  // 5. Check API sources
  console.log('\n📡 ARTICLE SOURCES:');
  console.log('─'.repeat(70));
  
  const sources = await Article.aggregate([
    { $group: { _id: '$source', count: { $sum: 1 } } }
  ]);
  
  sources.forEach(s => {
    console.log(`${s._id || 'unknown'}: ${s.count} articles`);
  });
  
  console.log('\n═'.repeat(70));
  console.log('✅ Diagnostic complete\n');
  
  process.exit(0);
}

diagnoseThreshold().catch(error => {
  console.error('❌ Diagnostic error:', error);
  process.exit(1);
});
