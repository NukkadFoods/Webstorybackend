/**
 * Story Service - ONLY returns complete articles from DB
 * 
 * CRITICAL: Client NEVER gets incomplete articles
 * Flow: DB (complete articles only) → Client
 * Background: ArticleFetcherService handles NYT → Commentary → DB
 */

const sectionArticleService = require('./db/sectionArticleService');

/**
 * Get top stories for a section
 * ONLY returns articles WITH commentary from DB
 * NO direct NYT fetching - that's handled by ArticleFetcherService
 */
const getTopStories = async (section = 'home') => {
  try {
    console.log(`\n📰 [Story Service] Getting complete articles for: ${section.toUpperCase()}`);
    
    // ✅ ONLY return articles WITH commentary from database
    const completeArticles = await sectionArticleService.getArticlesBySection(
      section,
      20, // limit
      0   // skip
    );

    console.log(`✅ [DB] Returning ${completeArticles.length} COMPLETE articles to client`);
    
    return completeArticles;
    
  } catch (error) {
    console.error('❌ Error fetching complete articles:', error);
    return [];
  }
};

const fetchFullStoryContent = async (storyUrl) => {
  try {
    return {
      content: `
        <p class="mb-6">This story is available from the New York Times. Unfortunately, we can only display a preview here.</p>
        <p class="mb-6">Please click the link below to read the full story:</p>
        <p class="my-6">
          <a href="${storyUrl}" target="_blank" rel="noopener noreferrer" class="bg-blue-700 hover:bg-blue-800 text-white py-2 px-6 rounded-md inline-flex items-center">
            Read Full Story on NYT Website
          </a>
        </p>
      `
    };
  } catch (error) {
    console.error('Error fetching full story content:', error);
    return {
      error: 'Failed to fetch story content',
      content: `
        <p class="mb-6">We encountered an issue retrieving the full story content.</p>
        <p class="mb-6">Please click the link below to read the full story on the New York Times website:</p>
        <p class="my-6">
          <a href="${storyUrl}" target="_blank" rel="noopener noreferrer" class="bg-blue-700 hover:bg-blue-800 text-white py-2 px-6 rounded-md inline-flex items-center">
            Read Full Story on NYT Website
          </a>
        </p>
      `
    };
  }
};

module.exports = {
  getTopStories,
  fetchFullStoryContent
};
