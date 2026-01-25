/**
 * Fill Threshold Worker - Section Rotation
 * Background process that rotates through all 9 sections
 * Processes one section every 3 minutes to keep articles fresh
 * Runs alongside the API server on Render
 */

const Article = require('../models/article');
const articleFetcherService = require('../services/db/articleFetcherService');
const thresholdService = require('../services/db/thresholdService');

const THRESHOLD = 8;
const SECTIONS = ['world', 'us', 'politics', 'business', 'technology', 'health', 'sports', 'entertainment', 'finance'];
const MAX_RETRIES = 5;
const RETRY_DELAY = 10000; // 10 seconds
const SECTION_ROTATION_INTERVAL = 3 * 60 * 1000; // 3 minutes in milliseconds

async function fillThresholdWorker() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     🚀 Background Article Rotation Worker Started         ║');
  console.log('║     Rotates through all 9 sections every 3 minutes        ║');
  console.log('║     Processes 15-20 articles per section for freshness    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  let currentSectionIndex = 0;
  let iteration = 1;
  let retries = 0;
  
  while (true) {
    try {
      console.log(`\n🔄 Worker Iteration ${iteration}`);
      console.log('━'.repeat(60));
      
      // Check current status
      const status = await thresholdService.checkThreshold();
      
      console.log('📊 Current Threshold Status:');
      status.sections.forEach(s => {
        const icon = s.met ? '✅' : '📊';
        console.log(`   ${icon} ${s.section}: ${s.count}/8`);
      });
      
      if (!status.thresholdMet) {
        console.log('\n⏳ Threshold not yet met. Filling missing sections...');
      } else {
        console.log('\n✅ Threshold already met! Rotating through sections for freshness...');
      }
      
      // Rotate through all sections (one every 3 minutes)
      const section = SECTIONS[currentSectionIndex];
      console.log(`\n🔄 [${currentSectionIndex + 1}/9] Processing section: ${section.toUpperCase()}`);
      
      try {
        // Fetch 15-20 articles per section to ensure freshness
        const articlesToFetch = 15;
        console.log(`🔵 Fetching ${articlesToFetch} articles for ${section}...`);
        
        const result = await articleFetcherService.fetchAndProcessSection(section, articlesToFetch);
        
        if (result && result > 0) {
          console.log(`✅ Added ${result} fresh article(s) to ${section}`);
        } else {
          console.log(`ℹ️  No new articles to add to ${section} (all duplicates or limit reached)`);
        }
        
        retries = 0; // Reset retries on successful iteration
        
      } catch (error) {
        console.error(`❌ Error processing ${section}:`, error.message);
        if (error.message.includes('429')) {
          console.log('⏸️  Rate limited. Waiting 30 seconds...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      
      // Move to next section
      currentSectionIndex = (currentSectionIndex + 1) % SECTIONS.length;
      
      // Log when completing a full rotation
      if (currentSectionIndex === 0) {
        console.log('\n🔁 ✅ Completed full rotation through all 9 sections!');
        console.log('   Starting new rotation...');
      }
      
      iteration++;
      
      // Wait 3 minutes (180 seconds) before processing next section
      console.log(`\n⏳ Waiting 3 minutes before next section (${SECTIONS[currentSectionIndex].toUpperCase()})...`);
      await new Promise(resolve => setTimeout(resolve, SECTION_ROTATION_INTERVAL));
      
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
