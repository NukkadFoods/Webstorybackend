/**
 * 🤖 AI Service - Pure Groq API Logic with Load Balancing
 * No caching, no queues - just clean AI generation
 */

const groqLoadBalancer = require('./groqLoadBalancer');

if (!groqLoadBalancer) {
  console.error('❌ Groq Load Balancer not initialized - check API keys');
}

/**
 * Generate AI commentary for a news article
 * Uses Forexyy's 3-section format: Key Points → Impact Analysis → Future Outlook
 * @param {string} title - Article title
 * @param {string} content - Article content/abstract
 * @param {string} category - Article category (politics, business, etc.)
 * @returns {Promise<string>} Generated commentary in structured HTML format
 */
const generateGroqCommentary = async (title, content, category = 'news') => {
  if (!groqLoadBalancer) {
    throw new Error('Groq API not available - missing API keys');
  }

  const prompt = `You are Forexyy News Analyst. Analyze this ${category} article and provide EXACTLY 3 sections of analysis.

Article Title: "${title}"
Article Summary: "${content.substring(0, 500)}..."

OUTPUT FORMAT (FOLLOW EXACTLY):

Key Points
Write 2-3 complete sentences explaining what happened in this article. Focus on the main events, decisions, or developments. Be specific and factual.

Impact Analysis
Write 2-3 complete sentences analyzing the impact and implications of these events. Discuss economic, political, social, or strategic effects. Explain why this matters.

Future Outlook
Write 2-3 complete sentences predicting what comes next. Discuss potential developments, challenges, opportunities, or reactions. Provide forward-looking insights.

CRITICAL RULES:
1. Output ALL THREE sections - never skip any section
2. Each section must have 2-3 COMPLETE sentences (not just one)
3. Section headers must be exactly: "Key Points", "Impact Analysis", "Future Outlook"
4. No numbering, no bullet points, no bold formatting
5. Write in professional analyst tone
6. Do NOT add any text before "Key Points" or after "Future Outlook"`;

  try {
    const completion = await groqLoadBalancer.createChatCompletion({
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert news analyst. You MUST provide exactly 3 sections of analysis: Key Points (what happened), Impact Analysis (why it matters), and Future Outlook (what comes next). Each section MUST have 2-3 complete sentences. NEVER skip any section.' 
        },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.5, // Lower temperature for more consistent formatting
      max_tokens: 600, // Increased to ensure space for all 3 sections
    });

    const commentary = completion.choices[0]?.message?.content?.trim();
    
    if (!commentary) {
      throw new Error('Empty response from Groq API');
    }

    return commentary;

  } catch (error) {
    console.error('❌ Groq API Error:', error.message);
    
    // Check for rate limit errors on all keys
    if (error.message.includes('RATE_LIMIT_ALL_KEYS')) {
      throw new Error('RATE_LIMIT_ALL_KEYS: All API keys have exhausted their daily limits');
    }
    
    // Check for rate limit errors
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      throw new Error('RATE_LIMIT: Groq API rate limit exceeded');
    }
    
    // Check for authentication errors
    if (error.message.includes('401') || error.message.includes('authentication')) {
      throw new Error('AUTH_ERROR: Invalid Groq API key');
    }
    
    // Generic error
    throw new Error(`GROQ_ERROR: ${error.message}`);
  }
};

/**
 * Batch generate commentaries for multiple articles
 * NOTE: This should be used carefully to respect rate limits
 * @param {Array} articles - Array of article objects
 * @returns {Promise<Array>} Array of results
 */
const batchGenerateCommentary = async (articles) => {
  const results = await Promise.allSettled(
    articles.map(article => 
      generateGroqCommentary(
        article.title, 
        article.content || article.abstract || article.summary || '',
        article.section || article.category
      )
    )
  );

  return results.map((result, index) => ({
    articleId: articles[index]._id || articles[index].id,
    title: articles[index].title,
    success: result.status === 'fulfilled',
    commentary: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason.message : null
  }));
};

/**
 * Get fallback commentary when AI generation fails
 * Uses the same 3-section Forexyy format
 * @param {Object} article - Article object
 * @returns {string} Fallback commentary in 3-section format
 */
const getFallbackCommentary = (article) => {
  const category = article.section || article.category || 'news';
  const title = article.title || 'Article';
  
  return `Key Points
This ${category} development represents a significant moment in current events. The situation has drawn attention from experts and stakeholders across multiple sectors, highlighting its importance in the broader context.

Impact Analysis
The immediate implications of this development could affect policy decisions, market dynamics, and public discourse. Similar situations in the past have shown that early responses often set the tone for longer-term outcomes and strategic positioning.

Future Outlook
As this situation continues to evolve, multiple factors will influence the trajectory. Stakeholders will be monitoring developments closely, and additional information is expected to provide clarity on potential paths forward and their broader significance.`;
};

module.exports = {
  generateGroqCommentary,
  batchGenerateCommentary,
  getFallbackCommentary
};
