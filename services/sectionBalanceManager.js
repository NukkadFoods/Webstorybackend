/**
 * Section Balance Manager
 * 
 * Ensures each news section has a minimum number of articles with commentary.
 * Prioritizes sections that are below the threshold.
 */

const Article = require('../models/article');
const { addToQueue } = require('../workers/commentaryQueue');

const SECTIONS = [
  'home',
  'world', 
  'us',
  'politics',
  'business',
  'technology',
  'health',
  'science',
  'sports',
  'arts',
  'opinion'
];

const MIN_ARTICLES_PER_SECTION = 5; // Each section should have at least 5 articles with commentary

class SectionBalanceManager {
  constructor() {
    this.isBalancing = false;
    this.lastBalance = null;
  }

  /**
   * Get section statistics
   */
  async getSectionStats() {
    const stats = [];
    
    for (const section of SECTIONS) {
      const total = await Article.countDocuments({ section });
      const withCommentary = await Article.countDocuments({ 
        section,
        aiCommentary: { $exists: true, $ne: null, $ne: '' }
      });
      const withoutCommentary = total - withCommentary;
      
      stats.push({
        section,
        total,
        withCommentary,
        withoutCommentary,
        needsAttention: withCommentary < MIN_ARTICLES_PER_SECTION,
        priority: this.calculatePriority(withCommentary, total)
      });
    }
    
    // Sort by priority (sections needing most attention first)
    stats.sort((a, b) => b.priority - a.priority);
    
    return stats;
  }

  /**
   * Calculate priority score (higher = needs more attention)
   */
  calculatePriority(withCommentary, total) {
    if (total === 0) return 0;
    
    // Priority based on:
    // 1. How far below minimum threshold
    // 2. Percentage without commentary
    const belowThreshold = Math.max(0, MIN_ARTICLES_PER_SECTION - withCommentary);
    const percentWithout = (total - withCommentary) / total;
    
    return (belowThreshold * 10) + (percentWithout * 100);
  }

  /**
   * Balance articles across sections
   * Ensures each section has minimum articles with commentary
   */
  async balanceSections() {
    if (this.isBalancing) {
      console.log('⏭️  Section balancing already in progress');
      return { skipped: true };
    }

    try {
      this.isBalancing = true;
      const startTime = Date.now();
      
      console.log('\n⚖️  Starting section balance check...');
      
      const stats = await this.getSectionStats();
      
      // Show current state
      console.log('\n📊 Section Statistics:');
      console.log('─'.repeat(80));
      console.log('Section          Total  With Commentary  Without  Status');
      console.log('─'.repeat(80));
      
      stats.forEach(s => {
        const status = s.needsAttention ? '⚠️  NEEDS ATTENTION' : '✅ OK';
        console.log(
          `${s.section.padEnd(15)} ${String(s.total).padStart(5)}  ` +
          `${String(s.withCommentary).padStart(15)}  ` +
          `${String(s.withoutCommentary).padStart(7)}  ${status}`
        );
      });
      console.log('─'.repeat(80));
      
      // Find sections needing attention
      const sectionsNeedingWork = stats.filter(s => s.needsAttention);
      
      if (sectionsNeedingWork.length === 0) {
        console.log('\n✅ All sections have sufficient articles with commentary!');
        return {
          success: true,
          balanced: true,
          message: 'All sections above minimum threshold'
        };
      }
      
      console.log(`\n🔧 ${sectionsNeedingWork.length} sections need attention\n`);
      
      let queued = 0;
      const results = [];
      
      for (const sectionStat of sectionsNeedingWork) {
        const needed = MIN_ARTICLES_PER_SECTION - sectionStat.withCommentary;
        
        console.log(`📝 Section: ${sectionStat.section} (needs ${needed} more articles)`);
        
        // Find articles without commentary in this section
        const articlesWithoutCommentary = await Article.find({
          section: sectionStat.section,
          $or: [
            { aiCommentary: { $exists: false } },
            { aiCommentary: null },
            { aiCommentary: '' }
          ]
        })
          .sort({ publishedDate: -1 }) // Newest first
          .limit(needed)
          .lean();
        
        if (articlesWithoutCommentary.length === 0) {
          console.log(`  ⚠️  No articles found without commentary (need to fetch from API)`);
          results.push({
            section: sectionStat.section,
            queued: 0,
            message: 'No articles available to queue'
          });
          continue;
        }
        
        console.log(`  📦 Found ${articlesWithoutCommentary.length} articles to queue`);
        
        // Queue articles with section-appropriate priority
        for (const article of articlesWithoutCommentary) {
          try {
            await addToQueue(article, {
              priority: 5, // Medium priority for background balancing
              delay: queued * 5000 // 5s delay between articles
            });
            queued++;
            
            if (queued <= 2) {
              console.log(`    ✅ Queued: ${article.title.substring(0, 50)}...`);
            }
          } catch (error) {
            console.error(`    ❌ Failed to queue article: ${error.message}`);
          }
        }
        
        results.push({
          section: sectionStat.section,
          queued: articlesWithoutCommentary.length,
          needed
        });
        
        console.log('');
      }
      
      const duration = Date.now() - startTime;
      this.lastBalance = new Date();
      
      console.log('✅ Section balancing complete!');
      console.log(`📊 Queued ${queued} articles across ${sectionsNeedingWork.length} sections`);
      console.log(`⏱️  Duration: ${duration}ms\n`);
      
      return {
        success: true,
        balanced: false,
        queued,
        sectionsBalanced: sectionsNeedingWork.length,
        results,
        duration: `${duration}ms`,
        timestamp: this.lastBalance
      };
      
    } catch (error) {
      console.error('❌ Section balancing failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    } finally {
      this.isBalancing = false;
    }
  }

  /**
   * Get balancing status
   */
  getStatus() {
    return {
      isBalancing: this.isBalancing,
      lastBalance: this.lastBalance,
      minArticlesPerSection: MIN_ARTICLES_PER_SECTION,
      sections: SECTIONS
    };
  }
}

module.exports = new SectionBalanceManager();
