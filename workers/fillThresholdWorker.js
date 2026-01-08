/**
 * Fill Threshold Worker
 * Background process that continuously fills article threshold
 * Runs alongside the API server on Render
 */

const Article = require('../models/article');
const articleFetcherService = require('../services/db/articleFetcherService');
const thresholdService = require('../services/db/thresholdService');

const THRESHOLD = 8;
const SECTIONS = ['world', 'us', 'politics', 'business', 'technology', 'health', 'sports', 'entertainment', 'finance'];
const MAX_RETRIES = 5;
const RETRY_DELAY = 10000; // 10 seconds

async function fillThresholdWorker() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 Background Fill-Threshold Worker Started           ║');
  console.log('║     Running alongside API server on Render                ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  let iteration = 1;
  let retries = 0;
  
  while (true) {
    try {
      console.log(`\n🔄 Worker Iteration ${iteration}`);
      console.log('━'.repeat(60));
      
      // Check current status
      const status = await thresholdService.checkThreshold();
      
      if (status.thresholdMet) {
        console.log('✅ Threshold met for all sections!');
        thresholdService.displayStatus();
        console.log('🔄 Will continue refreshing articles every 30 seconds...\n');
        
        // Continue refreshing even after threshold
        await new Promise(resolve => setTimeout(resolve, 30000));
        iteration++;
        continue;
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
          console.log(`✅ ${section}: ${count}/8 (threshold met)`);
        }
      }
      
      if (sectionsNeedingArticles.length === 0) {
        console.log('\n✅ All sections meet threshold!');
        console.log('🔄 Will continue refreshing every 30 seconds...\n');
        await new Promise(resolve => setTimeout(resolve, 30000));
        iteration++;
        continue;
      }
      
      // Sort by current count (ascending) - prioritize sections with fewest articles
      sectionsNeedingArticles.sort((a, b) => a.current - b.current);
      
      console.log(`\n🎯 Priority order (fewest articles first):`);
      sectionsNeedingArticles.forEach(s => console.log(`   ${s.section}: ${s.current}/8`));
      
      // Separate NYT and newsdata.io sections
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
          const articlesToFetch = current < 3 ? 5 : 2;
          console.log(`\n🔵 [NYT] Processing section: ${section.toUpperCase()} (need ${needed} articles, fetching ${articlesToFetch})`);
          
          try {
            const result = await articleFetcherService.fetchAndProcessSection(section, articlesToFetch);
            
            if (result && result > 0) {
              console.log(`✅ Added ${result} article(s) to ${section}`);
            } else {
              console.log(`⏭️  No new articles added to ${section} (duplicates or no content)`);
            }
            
            // Delay for NYT to avoid rate limits (10 seconds)
            await new Promise(resolve => setTimeout(resolve, 10000));
          } catch (error) {
            console.error(`❌ Error processing ${section}:`, error.message);
            if (error.message.includes('429')) {
              console.log('⏸️  Rate limited. Waiting 30 seconds...');
              await new Promise(resolve => setTimeout(resolve, 30000));
            }
          }
        }
        
        // Process one newsdata.io section
        if (i < newsdataNeeded.length) {
          const { section, needed, current } = newsdataNeeded[i];
          const articlesToFetch = current < 3 ? 5 : 2;
          console.log(`\n🟢 [newsdata.io] Processing section: ${section.toUpperCase()} (need ${needed} articles, fetching ${articlesToFetch})`);
          
          try {
            const result = await articleFetcherService.fetchAndProcessSection(section, articlesToFetch);
            
            if (result && result > 0) {
              console.log(`✅ Added ${result} article(s) to ${section}`);
            } else {
              console.log(`⏭️  No new articles added to ${section} (duplicates or no content)`);
            }
            
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
      retries = 0; // Reset retries on successful iteration
      
    } catch (iterationError) {
      console.error(`❌ Error in iteration ${iteration}:`, iterationError.message);
      retries++;
      
      if (retries >= MAX_RETRIES) {
        console.error('❌ Max retries reached. Worker will restart via Render.');
        process.exit(1);
      }
      
      console.log(`⏳ Recovering... (attempt ${retries}/${MAX_RETRIES})`);
      console.log('   Waiting 30 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
}

module.exports = { fillThresholdWorker };
