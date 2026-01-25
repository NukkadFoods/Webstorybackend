/**
 * 🤖 Background Commentary Worker
 * Generates AI commentary for articles in the background to improve performance
 */

const { optimizedGroqCall } = require('../middleware/optimizationManager');
const { getAllArticles } = require('../services/db/articleService');

class CommentaryWorker {
  constructor() {
    this.isRunning = false;
    this.queue = [];
    this.processedToday = 0;
    this.maxDailyCommentaries = 100; // Limit to prevent excessive API usage
    this.workerInterval = null;
    
    console.log('🤖 Commentary Worker initialized');
  }

  /**
   * Start the background worker
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Commentary worker already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting background commentary worker...');

    // Process queue every 30 seconds
    this.workerInterval = setInterval(async () => {
      await this.processQueue();
    }, 30000);

    // Reset daily counter at midnight
    this.setupDailyReset();
  }

  /**
   * Stop the background worker
   */
  stop() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Commentary worker stopped');
  }

  /**
   * Add articles to commentary generation queue
   */
  async addArticlesToQueue(articles) {
    for (const article of articles) {
      if (!article.commentary && !this.isInQueue(article._id)) {
        const priority = this.calculatePriority(article);
        this.queue.push({
          articleId: article._id,
          title: article.title,
          content: article.abstract || article.content || '',
          category: article.section,
          priority,
          addedAt: Date.now()
        });
      }
    }

    // Sort queue by priority (higher priority first)
    this.queue.sort((a, b) => b.priority - a.priority);
    
    console.log(`📝 Added articles to commentary queue. Queue size: ${this.queue.length}`);
  }

  /**
   * Calculate article priority for commentary generation
   */
  calculatePriority(article) {
    let priority = 5; // Base priority

    // Recent articles get higher priority
    const ageHours = (Date.now() - new Date(article.createdAt || article.publishedAt)) / (1000 * 60 * 60);
    if (ageHours < 6) priority += 3;
    else if (ageHours < 24) priority += 2;
    else if (ageHours < 48) priority += 1;

    // Popular categories get higher priority
    const highPriorityCategories = ['politics', 'business', 'technology', 'health'];
    if (highPriorityCategories.includes(article.section)) priority += 2;

    // Articles with engagement get higher priority
    if (article.views && article.views > 100) priority += 1;
    if (article.shares && article.shares > 10) priority += 1;

    return Math.min(priority, 10); // Cap at 10
  }

  /**
   * Check if article is already in queue
   */
  isInQueue(articleId) {
    return this.queue.some(item => item.articleId.toString() === articleId.toString());
  }

  /**
   * Process the commentary generation queue
   */
  async processQueue() {
    if (this.queue.length === 0) {
      return;
    }

    if (this.processedToday >= this.maxDailyCommentaries) {
      console.log(`📊 Daily commentary limit reached: ${this.processedToday}/${this.maxDailyCommentaries}`);
      return;
    }

    // Process highest priority item
    const item = this.queue.shift();
    
    try {
      console.log(`🤖 Generating commentary for: "${item.title.substring(0, 50)}..."`);
      
      const commentary = await this.generateCommentary(item);
      
      if (commentary) {
        await this.saveCommentary(item.articleId, commentary);
        this.processedToday++;
        console.log(`✅ Commentary generated and saved for: "${item.title.substring(0, 30)}..."`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to generate commentary for "${item.title.substring(0, 30)}...":`, error.message);
      
      // Re-add to queue with lower priority if it's a temporary error
      if (error.message.includes('Rate limit') || error.message.includes('timeout')) {
        item.priority = Math.max(1, item.priority - 1);
        this.queue.push(item);
        this.queue.sort((a, b) => b.priority - a.priority);
      }
    }
  }

  /**
   * Generate AI commentary for an article
   */
  async generateCommentary(item) {
    const prompt = `As an expert analyst, provide a brief but insightful commentary (2-3 paragraphs) on the following ${item.category || 'news'} article:

Title: ${item.title}
Content: ${item.content}

Focus on:
1. Key implications and potential impacts
2. Expert analysis of the situation
3. Historical context or similar cases if relevant
4. Potential future developments

Keep the tone professional and analytical. Provide only the commentary without any prefacing text.`;

    try {
      const completion = await optimizedGroqCall(async () => {
        const Groq = require('groq-sdk');
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        return await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are an expert news analyst who provides insightful commentary on current events. Your analysis should be professional, balanced, and informative."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          model: "llama-3.1-8b-instant",
          temperature: 0.7,
          max_tokens: 500
        });
      }, 'background'); // Low priority for background processing

      return completion.choices[0]?.message?.content?.trim() || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Save generated commentary to database
   */
  async saveCommentary(articleId, commentary) {
    try {
      const { updateArticleById } = require('../services/db/articleService');
      await updateArticleById(articleId, { commentary });
    } catch (error) {
      console.error('Failed to save commentary to database:', error.message);
      throw error;
    }
  }

  /**
   * Setup daily reset for processed counter
   */
  setupDailyReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow - now;
    
    setTimeout(() => {
      this.processedToday = 0;
      console.log('🔄 Daily commentary counter reset');
      
      // Set up recurring daily reset
      setInterval(() => {
        this.processedToday = 0;
        console.log('🔄 Daily commentary counter reset');
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      queueLength: this.queue.length,
      processedToday: this.processedToday,
      maxDailyCommentaries: this.maxDailyCommentaries,
      queuePriorities: this.queue.map(item => ({
        title: item.title.substring(0, 30) + '...',
        priority: item.priority
      })).slice(0, 5) // Top 5 items
    };
  }

  /**
   * Auto-populate queue with articles that need commentary
   */
  async populateQueue() {
    try {
      console.log('🔍 Looking for articles that need commentary...');
      
      const articles = await getAllArticles(50, 0); // Get recent articles
      const articlesNeedingCommentary = articles.filter(article => !article.commentary);
      
      if (articlesNeedingCommentary.length > 0) {
        await this.addArticlesToQueue(articlesNeedingCommentary);
        console.log(`📝 Found ${articlesNeedingCommentary.length} articles needing commentary`);
      }
    } catch (error) {
      console.error('Failed to populate commentary queue:', error.message);
    }
  }
}

// Create singleton instance
const commentaryWorker = new CommentaryWorker();

module.exports = commentaryWorker;
