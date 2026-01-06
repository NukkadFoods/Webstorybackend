const { connectToMongoDB } = require('./config/database');
const Article = require('./models/article');
const articleFetcherService = require('./services/db/articleFetcherService');
const thresholdService = require('./services/db/thresholdService');

const THRESHOLD = 8;
const SECTIONS = ['world', 'us', 'politics', 'business', 'technology', 'health', 'sports', 'entertainment', 'finance'];

async function fillThreshold() {
  console.log('🚀 Starting threshold fill process...\n');
  
  await connectToMongoDB();
  
  let iteration = 1;
  
  while (true) {
    console.log(`\n🔄 Iteration ${iteration}`);
    console.log('━'.repeat(60));
    
    // Check current status
    const status = await thresholdService.checkThreshold();
    
    if (status.isThresholdMet) {
      console.log('\n✅ THRESHOLD MET! All sections have 8+ articles');
      thresholdService.displayStatus();
      process.exit(0);
    }
    
    // Find sections that need articles
    const sectionsNeedingArticles = [];
    for (const section of SECTIONS) {
      const count = await Article.countDocuments({ 
        section,
        aiCommentary: { $exists: true, $ne: null, $ne: '' }
      });
      
      if (count < THRESHOLD) {
        const needed = THRESHOLD - count;
        sectionsNeedingArticles.push({ section, current: count, needed });
        console.log(`📊 ${section}: ${count}/8 (need ${needed} more)`);
      } else {
        console.log(`✅ ${section}: ${count}/8 (threshold met, skipping)`);
      }
    }
    
    if (sectionsNeedingArticles.length === 0) {
      console.log('\n✅ All sections meet threshold!');
      break;
    }
    
    // Sort by current count (ascending) - prioritize sections with fewest articles
    sectionsNeedingArticles.sort((a, b) => a.current - b.current);
    
    console.log(`\n🎯 Priority order (fewest articles first):`);
    sectionsNeedingArticles.forEach(s => console.log(`   ${s.section}: ${s.current}/8`));
    
    // Separate NYT and newsdata.io sections (already sorted by priority)
    const nytSections = ['world', 'us', 'politics', 'business', 'technology', 'health'];
    const newsdataSections = ['entertainment', 'finance', 'sports'];
    
    const nytNeeded = sectionsNeedingArticles.filter(s => nytSections.includes(s.section));
    const newsdataNeeded = sectionsNeedingArticles.filter(s => newsdataSections.includes(s.section));
    
    console.log(`\n🎯 NYT sections needing articles: ${nytNeeded.length}`);
    console.log(`🎯 newsdata.io sections needing articles: ${newsdataNeeded.length}`);
    
    // Alternate between NYT and newsdata.io to avoid rate limits
    const maxIterations = Math.max(nytNeeded.length, newsdataNeeded.length);
    
    for (let i = 0; i < maxIterations; i++) {
      // Process one NYT section
      if (i < nytNeeded.length) {
        const { section, needed, current } = nytNeeded[i];
        // Fetch more articles if section has very few (increases chance of new content)
        const articlesToFetch = current < 3 ? 5 : 2;
        console.log(`\n🔵 [NYT] Processing section: ${section.toUpperCase()} (need ${needed} articles, fetching ${articlesToFetch})`);
        
        try {
          const result = await articleFetcherService.fetchAndProcessSection(section, articlesToFetch);
          
          if (result && result.processedCount > 0) {
            console.log(`✅ Added ${result.processedCount} article(s) to ${section}`);
          } else {
            console.log(`⏭️  No new articles added to ${section} (duplicates or no content)`);
          }
          
          // Longer delay for NYT to avoid rate limits (10 seconds)
          await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
          console.error(`❌ Error processing ${section}:`, error.message);
          // If rate limited, wait even longer before next request
          if (error.message.includes('429')) {
            console.log('⏸️  Rate limited. Waiting 30 seconds...');
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
        }
      }
      
      // Process one newsdata.io section
      if (i < newsdataNeeded.length) {
        const { section, needed, current } = newsdataNeeded[i];
        // Fetch more articles if section has very few (increases chance of new content)
        const articlesToFetch = current < 3 ? 5 : 2;
        console.log(`\n🟢 [newsdata.io] Processing section: ${section.toUpperCase()} (need ${needed} articles, fetching ${articlesToFetch})`);
        
        try {
          const result = await articleFetcherService.fetchAndProcessSection(section, articlesToFetch);
          
          if (result && result.processedCount > 0) {
            console.log(`✅ Added ${result.processedCount} article(s) to ${section}`);
          } else {
            console.log(`⏭️  No new articles added to ${section} (duplicates or no content)`);
          }
          
          // Delay before next iteration
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
          console.error(`❌ Error processing ${section}:`, error.message);
        }
      }
    }
    
    iteration++;
    
    // Delay between iterations
    console.log('\n⏳ Waiting 10 seconds before next iteration...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log('\n✅ Threshold fill complete!');
  thresholdService.displayStatus();
  process.exit(0);
}

fillThreshold().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
