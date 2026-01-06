/**
 * Section Rotation Worker
 * 
 * Fetches articles from NYT, generates commentary, saves complete articles to DB
 * Rotates through sections every 5 minutes: processes 3 articles per section
 */

const articleFetcherService = require('../services/db/articleFetcherService');
const sectionArticleService = require('../services/db/sectionArticleService');

class SectionRotationWorker {
  constructor() {
    // 9 sections: 6 from NYT, 3 from newsdata.io
    // Homepage will display 2 articles from each section
    this.sections = [
      'world',        // 1 - NYT
      'us',           // 2 - NYT
      'politics',     // 3 - NYT
      'business',     // 4 - NYT
      'technology',   // 5 - NYT
      'health',       // 6 - NYT
      'sports',       // 7 - newsdata.io (moved from NYT)
      'entertainment',// 8 - newsdata.io
      'finance'       // 9 - newsdata.io
    ];
    
    this.currentSectionIndex = 0;
    this.isRunning = false;
    this.intervalId = null;
    
    console.log(`🔄 Section Rotation Worker initialized with ${this.sections.length} sections`);
    console.log(`   NYT API: world, us, politics, business, technology, health (6 sections)`);
    console.log(`   newsdata.io API: sports, entertainment, finance (3 sections, 5 API keys)`);
    console.log(`   Homepage: displays 2 articles from each section`);
  }

  /**
   * Start the rotation worker
   * Processes 1 article per section every 3 minutes
   * Full rotation: 27 minutes (9 sections × 3 min)
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Section Rotation Worker already running');
      return;
    }

    this.isRunning = true;
    console.log('▶️ Starting Section Rotation Worker (3 min intervals)');
    console.log('   1 article per section, even distribution');

    // Run immediately on start
    this.processNextSection();

    // Then run every 3 minutes
    this.intervalId = setInterval(() => {
      this.processNextSection();
    }, 3 * 60 * 1000); // 3 minutes
  }

  /**
   * Stop the rotation worker
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Section Rotation Worker not running');
      return;
    }

    clearInterval(this.intervalId);
    this.isRunning = false;
    console.log('⏹️ Section Rotation Worker stopped');
  }

  /**
   * Process the next section in rotation
   * Fetches from NYT → Generates commentary → Saves complete articles
   */
  async processNextSection() {
    const section = this.sections[this.currentSectionIndex];
    const rotationProgress = `[${this.currentSectionIndex + 1}/${this.sections.length}]`;
    
    try {
      console.log(`\n🔄 ${rotationProgress} Processing section: ${section.toUpperCase()}`);

      // Fetch from API (NYT or newsdata.io), generate commentary, save complete article
      const processedCount = await articleFetcherService.fetchAndProcessSection(
        section,
        1 // Process 1 article per rotation (9 minutes)
      );

      if (processedCount === 0) {
        console.log(`✅ ${rotationProgress} No new articles to process in ${section}`);
      } else {
        console.log(`✅ ${rotationProgress} Processed ${processedCount} complete articles for ${section}`);
        
        // Quick count for this section
        try {
          const Article = require('../models/article');
          const count = await Article.countDocuments({
            section,
            aiCommentary: { $exists: true, $ne: null, $ne: '' }
          });
          console.log(`📊 ${section} now has ${count} articles with commentary`);
        } catch (statsError) {
          console.log(`⚠️ Could not get section count: ${statsError.message}`);
        }
      }

    } catch (error) {
      console.error(`❌ Error processing section ${section}:`, error.message);
    }

    // Move to next section
    this.currentSectionIndex = (this.currentSectionIndex + 1) % this.sections.length;
    
    // Log when we complete a full rotation
    if (this.currentSectionIndex === 0) {
      console.log('🔁 Completed full rotation through all sections');
      // Show comprehensive section statistics
      try {
        const counts = await sectionArticleService.getSectionCounts();
        console.log('📊 Current distribution:', counts);
        const needingArticles = await sectionArticleService.getSectionsNeedingArticles(10);
        if (needingArticles.length > 0) {
          console.log('⚠️  Priority sections needing articles:', needingArticles);
        }
      } catch (error) {
        console.error('Error getting statistics:', error);
      }
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentSection: this.sections[this.currentSectionIndex],
      currentIndex: this.currentSectionIndex,
      totalSections: this.sections.length,
      sections: this.sections
    };
  }

  /**
   * Manually process a specific section
   */
  async processSection(sectionName) {
    const sectionIndex = this.sections.indexOf(sectionName);
    
    if (sectionIndex === -1) {
      throw new Error(`Invalid section: ${sectionName}. Available: ${this.sections.join(', ')}`);
    }

    const previousIndex = this.currentSectionIndex;
    this.currentSectionIndex = sectionIndex;
    
    await this.processNextSection();
    
    // Don't reset to previous index, let it continue from here
    console.log(`✅ Manually processed section: ${sectionName}`);
  }
}

// Export singleton instance
const worker = new SectionRotationWorker();
module.exports = worker;
