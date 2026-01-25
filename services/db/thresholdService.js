/**
 * Threshold Service - Manages article count thresholds per section
 * Ensures each section has minimum articles before caching starts
 */

const Article = require('../../models/article');

const SECTIONS = [
  'world', 'us', 'politics', 'business', 
  'technology', 'health', 'sports', 'entertainment', 'finance'
];

const THRESHOLD_PER_SECTION = 8; // Minimum articles per section before caching

class ThresholdService {
  constructor() {
    this.thresholdMet = false;
    this.sectionCounts = {};
  }

  /**
   * Check if threshold is met for all sections
   * @returns {Promise<boolean>}
   */
  async checkThreshold() {
    try {
      const counts = await Article.aggregate([
        {
          $match: {
            aiCommentary: { $exists: true, $ne: null, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$section',
            count: { $sum: 1 }
          }
        }
      ]);

      // Build section counts map
      this.sectionCounts = {};
      counts.forEach(item => {
        this.sectionCounts[item._id] = item.count;
      });

      // Check if all sections have minimum articles
      let allMet = true;
      const status = [];

      for (const section of SECTIONS) {
        const count = this.sectionCounts[section] || 0;
        const met = count >= THRESHOLD_PER_SECTION;
        
        status.push({
          section,
          count,
          threshold: THRESHOLD_PER_SECTION,
          met
        });

        if (!met) {
          allMet = false;
        }
      }

      this.thresholdMet = allMet;

      return {
        thresholdMet: allMet,
        sections: status,
        total: counts.reduce((sum, item) => sum + item.count, 0)
      };

    } catch (error) {
      console.error('❌ Threshold check error:', error.message);
      return {
        thresholdMet: false,
        sections: [],
        total: 0
      };
    }
  }

  /**
   * Check if specific section has met threshold
   * @param {string} section 
   * @returns {boolean}
   */
  hasSectionMetThreshold(section) {
    const count = this.sectionCounts[section] || 0;
    return count >= THRESHOLD_PER_SECTION;
  }

  /**
   * Get sections that need more articles
   * @returns {Array<{section: string, needed: number}>}
   */
  getSectionsNeedingArticles() {
    const needed = [];
    
    for (const section of SECTIONS) {
      const count = this.sectionCounts[section] || 0;
      if (count < THRESHOLD_PER_SECTION) {
        needed.push({
          section,
          current: count,
          needed: THRESHOLD_PER_SECTION - count
        });
      }
    }

    return needed;
  }

  /**
   * Display threshold status
   */
  async displayStatus() {
    const status = await this.checkThreshold();

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║           SECTION THRESHOLD STATUS                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log(`Total Articles: ${status.total}`);
    console.log(`Threshold Per Section: ${THRESHOLD_PER_SECTION}`);
    console.log(`Overall Status: ${status.thresholdMet ? '✅ THRESHOLD MET' : '⏳ BUILDING DATABASE'}\n`);

    status.sections.forEach(s => {
      const icon = s.met ? '✅' : '⏳';
      const progress = `${s.count}/${s.threshold}`;
      console.log(`${icon} ${s.section.padEnd(15)} ${progress.padEnd(8)} ${s.met ? 'Ready' : `Need ${s.threshold - s.count} more`}`);
    });

    if (!status.thresholdMet) {
      console.log('\n⏳ Caching DISABLED - Building article database first');
      console.log('💡 Redis caching will start after all sections reach threshold\n');
    } else {
      console.log('\n✅ All sections ready - Caching ENABLED\n');
    }

    return status;
  }
}

module.exports = new ThresholdService();
