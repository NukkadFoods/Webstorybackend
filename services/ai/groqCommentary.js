const Groq = require('groq-sdk');
const CacheService = require('../cache');

class GroqCommentaryService {
  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    this.cache = CacheService;
    this.promptTemplates = {
      expertise: `You are an expert in {topic}. Provide a brief, insightful commentary on this news article as if you're a knowledgeable Reddit user. Be specific, analytical, and add context that most readers wouldn't know. Keep it under 150 words.

Article: {title}
Content: {description}

Your expert take:`,

      analysis: `As a subject matter expert, provide 2-3 bullet points analyzing this news story. Focus on implications, context, or insider knowledge that adds value. Be conversational but authoritative.

Article: {title}
Summary: {description}

Key insights:`,

      perspective: `Give a balanced perspective on this news story. What are people missing? What's the bigger picture? Write as an informed commentator who helps others understand the deeper implications.

Headline: {title}
Details: {description}

Perspective:`
    };
  }

  async generateCommentary(article, style = 'expertise') {
    try {
      const cacheKey = `commentary:${article._id}:${style}`;
      
      // Check cache first (TTL: 6 hours for AI commentary)
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          commentary: cached,
          source: 'cache',
          generatedAt: new Date(this.cache.getTtl(cacheKey))
        };
      }

      // Determine topic from article section or title
      const topic = this.extractTopic(article);
      
      // Select and customize prompt
      const prompt = this.promptTemplates[style]
        .replace('{topic}', topic)
        .replace('{title}', article.title)
        .replace('{description}', article.description || article.summary || 'No description available');

      // Generate commentary using Groq
      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an expert commentator who provides insightful, Reddit-style analysis on news articles. Your responses should be informative, engaging, and add genuine value to readers understanding of the topic.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'llama3-8b-8192', // Fast and cost-effective
        max_tokens: 200,
        temperature: 0.7,
        top_p: 0.9
      });

      const commentary = completion.choices[0]?.message?.content?.trim();
      
      if (!commentary) {
        throw new Error('No commentary generated');
      }

      // Cache the result (6 hours TTL)
      this.cache.set(cacheKey, commentary, 21600);

      return {
        commentary,
        source: 'ai',
        generatedAt: new Date(),
        model: 'llama3-8b-8192',
        topic
      };

    } catch (error) {
      console.error('Error generating AI commentary:', error);
      
      // Return fallback commentary
      return {
        commentary: this.getFallbackCommentary(article),
        source: 'fallback',
        generatedAt: new Date(),
        error: error.message
      };
    }
  }

  extractTopic(article) {
    // Extract topic from section, categories, or title keywords
    if (article.section) {
      return this.normalizeTopic(article.section);
    }
    
    if (article.category) {
      return this.normalizeTopic(article.category);
    }

    // Extract from title using keyword matching
    const title = article.title.toLowerCase();
    const topicKeywords = {
      'technology': ['tech', 'ai', 'software', 'digital', 'cyber', 'bitcoin', 'crypto'],
      'business': ['economy', 'market', 'finance', 'company', 'stock', 'investment'],
      'politics': ['election', 'government', 'policy', 'congress', 'senate', 'president'],
      'health': ['medical', 'health', 'disease', 'vaccine', 'hospital', 'drug'],
      'science': ['research', 'study', 'climate', 'space', 'energy', 'environment'],
      'sports': ['game', 'team', 'player', 'season', 'championship', 'olympic'],
      'entertainment': ['movie', 'music', 'celebrity', 'hollywood', 'streaming', 'show']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => title.includes(keyword))) {
        return topic;
      }
    }

    return 'general news';
  }

  normalizeTopic(topic) {
    const topicMap = {
      'tech': 'technology',
      'biz': 'business',
      'pol': 'politics',
      'sci': 'science',
      'ent': 'entertainment'
    };
    
    return topicMap[topic.toLowerCase()] || topic.toLowerCase();
  }

  getFallbackCommentary(article) {
    const fallbacks = [
      "This story highlights important developments in the field. The implications could be significant for stakeholders and the broader community.",
      "Key factors to consider include the timing, context, and potential ripple effects of this news on related sectors.",
      "This development builds on recent trends and could signal important changes ahead. Worth monitoring for further updates.",
      "The details here reveal interesting dynamics at play. Context suggests this could have broader implications worth understanding.",
      "This news intersects with several ongoing trends and could influence future developments in meaningful ways."
    ];
    
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  async batchGenerateCommentary(articles, style = 'expertise') {
    const results = await Promise.allSettled(
      articles.map(article => this.generateCommentary(article, style))
    );

    return results.map((result, index) => ({
      articleId: articles[index]._id,
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  }

  getCacheStats() {
    return {
      aiCache: this.cache.getStats()
    };
  }
}

module.exports = new GroqCommentaryService();
