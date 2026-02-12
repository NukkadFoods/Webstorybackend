/**
 * 🚀 Commentary Queue & Worker - BullMQ Production Setup
 * Features:
 * - Native rate limiting (10 jobs/60s)
 * - Redis persistence (survives restarts)
 * - Automatic retries with exponential backoff
 * - Priority queuing
 * - Cache-first strategy to save API calls
 * - Dead letter queue for failed jobs
 */

const { Queue, Worker } = require('bullmq');
const redisLoadBalancer = require('../config/redisLoadBalancer');
const { generateGroqCommentary, getFallbackCommentary } = require('../services/aiService');
const cacheService = require('../services/cache');

// Skip BullMQ entirely when Redis is disabled OR on Vercel (serverless)
const REDIS_DISABLED = process.env.REDIS_DISABLED === 'true';
const IS_VERCEL = !!process.env.VERCEL;

let connection = null;
if (!REDIS_DISABLED && !IS_VERCEL) {
    redisLoadBalancer.initialize();
    connection = redisLoadBalancer.getRawConnection();
} else {
    if (IS_VERCEL) {
        console.log('⏭️ BullMQ SKIPPED - Vercel serverless (workers disabled)');
    } else {
        console.log('⏭️ BullMQ SKIPPED - Redis disabled');
    }
}

// ============================================================================
// QUEUE DEFINITION (Skip if Redis disabled)
// ============================================================================

let commentaryQueue = null;

if (!REDIS_DISABLED && connection) {
  commentaryQueue = new Queue('ai-commentary', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        count: 100,
        age: 24 * 3600
      },
      removeOnFail: {
        count: 500,
        age: 7 * 24 * 3600
      },
    },
  });

  commentaryQueue.on('error', (error) => {
    console.error('❌ Queue Error:', error.message);
  });

  commentaryQueue.on('waiting', (job) => {
    console.log(`⏳ Job ${job.id} is waiting`);
  });

  console.log('✅ Commentary Queue initialized');
} else {
  console.log('⏭️ Commentary Queue SKIPPED (Redis disabled)');
}

// ============================================================================
// WORKER DEFINITION (Skip if Redis disabled)
// ============================================================================

let worker = null;

if (!REDIS_DISABLED && connection) {
  worker = new Worker('ai-commentary', async (job) => {
    const { articleId, title, content, section, priority, article } = job.data;

    console.log(`⚙️ Processing Job ${job.id} (Priority: ${priority || 'normal'}): "${title.substring(0, 50)}..."`);

    try {
      const commentaryCacheKey = `commentary:${articleId}`;

      const commentary = await cacheService.getOrSet(commentaryCacheKey, async () => {
        console.log(`🤖 Generating AI commentary for article ${articleId}...`);
        return await generateGroqCommentary(title, content || '', section || 'news');
      }, 'commentary');

      const fullArticle = article ? {
        _id: article._id || articleId,
        title: article.title || title,
        headline: article.headline || article.title || title,
        abstract: article.abstract || article.summary || article.lead_paragraph || '',
        url: article.url || '',
        imageUrl: article.imageUrl || (article.multimedia && article.multimedia[0] && article.multimedia[0].url) || '',
        byline: article.byline || '',
        section: article.section || section || 'news',
        publishedDate: article.publishedDate || article.published_date || new Date(),
        aiCommentary: commentary,
        _cachedAt: new Date(),
        _commentarySource: 'ai'
      } : {
        _id: articleId,
        title: title,
        headline: title,
        abstract: content ? content.substring(0, 200) : '',
        url: '',
        imageUrl: '',
        byline: '',
        section: section || 'news',
        publishedDate: new Date(),
        aiCommentary: commentary,
        _cachedAt: new Date(),
        _commentarySource: 'ai'
      };

      const articleCacheKey = `article:${articleId}`;
      await cacheService.set(articleCacheKey, JSON.stringify(fullArticle), 1800);
      console.log(`💾 Cached full article: ${articleCacheKey} (TTL: 1800s)`);

      if (!articleId.startsWith('temp-')) {
        const { updateArticleById } = require('../services/db/articleService');
        try {
          await updateArticleById(articleId, {
            aiCommentary: commentary,
            commentaryGeneratedAt: new Date()
          });
        } catch (dbError) {
          console.log(`⚠️ Database update skipped for ${articleId}:`, dbError.message);
        }
      }

      console.log(`✅ Commentary saved for article ${articleId}`);

      return {
        success: true,
        articleId,
        commentary: commentary.substring(0, 100) + '...',
        source: 'ai',
        cachedAt: new Date()
      };

    } catch (error) {
      console.error(`❌ Job ${job.id} Error:`, error.message);

      if (error.message.includes('RATE_LIMIT')) {
        throw new Error('Rate limit hit - will retry');
      }

      if (job.attemptsMade >= job.opts.attempts - 1) {
        console.log(`💾 Saving fallback commentary for article ${articleId} after ${job.attemptsMade} attempts`);

        const fallback = getFallbackCommentary({ title, section });

        if (!articleId.startsWith('temp-')) {
          const { updateArticleById } = require('../services/db/articleService');
          try {
            await updateArticleById(articleId, {
              aiCommentary: fallback,
              commentaryGeneratedAt: new Date(),
              commentarySource: 'fallback'
            });
          } catch (dbError) {
            console.log(`⚠️ Database fallback update skipped for ${articleId}`);
          }
        }

        await cacheService.set(`commentary:${articleId}`, fallback, 'commentary');

        return {
          success: false,
          articleId,
          commentary: fallback.substring(0, 100) + '...',
          source: 'fallback',
          error: error.message
        };
      }

      throw error;
    }
  }, {
    connection,
    limiter: {
      max: 10,
      duration: 60000
    },
    concurrency: 2,
    // Reduce Redis polling when queue is empty (saves ~90% of idle requests)
    drainDelay: 30000,        // Wait 30s before checking again when queue is empty
    lockDuration: 60000,      // Lock jobs for 60s (prevents duplicate processing)
    stalledInterval: 60000,   // Check for stalled jobs every 60s (not every 5s)
  });

  worker.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed successfully:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed permanently after ${job.attemptsMade} attempts:`, err.message);
  });

  worker.on('error', (error) => {
    console.error('❌ Worker Error:', error.message);
  });

  worker.on('active', (job) => {
    console.log(`🔄 Job ${job.id} is now active`);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} has stalled`);
  });

  console.log('✅ Commentary Worker initialized');
} else {
  console.log('⏭️ Commentary Worker SKIPPED (Redis disabled)');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Add single article to commentary generation queue
 * @param {Object} article - Article object with _id (or id), title, content, section
 * @param {Object} options - Job options (priority, delay, etc.)
 * @returns {Promise<Job>} BullMQ Job object
 */
const addToQueue = async (article, options = {}) => {
  // Skip if Redis/BullMQ disabled
  if (REDIS_DISABLED || !commentaryQueue) {
    console.log('⏭️ Queue disabled, skipping article:', article.title?.substring(0, 40));
    return null;
  }

  const articleId = article._id || article.id;

  if (!articleId) {
    console.log(`⚠️ Article missing ID, skipping: ${article.title?.substring(0, 40)}...`);
    return null;
  }

  // Check if already in database
  const Article = require('../models/article');
  let existing;

  try {
    existing = await Article.findById(articleId).select('aiCommentary');

    if (existing && existing.aiCommentary) {
      console.log(`⚡ Article ${articleId} already has commentary, skipping queue`);
      return null;
    }
  } catch (err) {
    console.log(`📝 Article ${articleId} not in DB yet, will generate commentary`);
  }

  // Check cache before queuing
  const cacheKey = `commentary:${articleId}`;
  const cached = await cacheService.get(cacheKey);

  if (cached) {
    console.log(`⚡ Commentary found in cache for article ${articleId}, skipping queue`);
    if (existing && !existing.aiCommentary) {
      const { updateArticleById } = require('../services/db/articleService');
      await updateArticleById(articleId, { aiCommentary: cached });
    }
    return null;
  }

  const priority = options.priority || calculatePriority(article);

  // Use articleId as jobId for idempotency - prevents duplicate jobs for same article
  const jobId = `commentary-${articleId.toString()}`;

  const job = await commentaryQueue.add('generate-commentary', {
    articleId: articleId.toString(),
    title: article.title,
    content: article.content || article.abstract || article.summary || '',
    section: article.section || article.category || 'news',
    priority,
    article: article
  }, {
    jobId,  // Idempotency key - BullMQ ignores duplicate jobIds
    priority,
    delay: options.delay || 0,
    ...options
  });

  console.log(`📝 Added article "${article.title.substring(0, 40)}..." to queue (Job ID: ${jobId}, Priority: ${priority})`);

  return job;
};

/**
 * Batch add multiple articles to queue with staggered delays
 * @param {Array} articles - Array of article objects
 * @param {Object} options - Batch options (priority, baseDelay)
 * @returns {Promise<Array>} Array of added jobs
 */
const addBatchToQueue = async (articles, options = {}) => {
  const { priority = 5, baseDelay = 30000 } = options; // 30s delay between articles by default
  
  const jobs = await Promise.all(
    articles.map((article, index) => 
      addToQueue(article, {
        priority, // Use specified priority (lower for background jobs)
        delay: index * baseDelay // Stagger by 30s each
      })
    )
  );
  
  const addedCount = jobs.filter(j => j !== null).length;
  console.log(`📝 Added ${addedCount}/${articles.length} articles to queue (staggered with ${baseDelay/1000}s delays)`);
  
  return jobs.filter(j => j !== null);
};

/**
 * Calculate priority for an article (lower number = higher priority)
 * @param {Object} article - Article object
 * @returns {number} Priority (1-10, lower is higher priority)
 */
const calculatePriority = (article) => {
  let priority = 5; // Default priority

  // Recent articles get higher priority
  const ageHours = (Date.now() - new Date(article.createdAt || article.publishedDate || Date.now())) / (1000 * 60 * 60);
  if (ageHours < 6) priority = 1;        // Very high priority for articles < 6 hours old
  else if (ageHours < 24) priority = 2;  // High priority for articles < 24 hours old
  else if (ageHours < 48) priority = 3;  // Medium-high priority for articles < 48 hours old

  // Important categories
  const highPriorityCategories = ['politics', 'us', 'world', 'business'];
  if (highPriorityCategories.includes((article.section || '').toLowerCase())) {
    priority = Math.max(1, priority - 1); // Boost priority
  }

  return Math.min(Math.max(priority, 1), 10); // Clamp between 1-10
};

/**
 * Get queue statistics and health metrics
 */
const getQueueStats = async () => {
  if (REDIS_DISABLED || !commentaryQueue) {
    return { disabled: true, message: 'BullMQ disabled (Redis unavailable)' };
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    commentaryQueue.getWaitingCount(),
    commentaryQueue.getActiveCount(),
    commentaryQueue.getCompletedCount(),
    commentaryQueue.getFailedCount(),
    commentaryQueue.getDelayedCount()
  ]);

  const jobs = await commentaryQueue.getJobs(['waiting', 'active'], 0, 5);

  return {
    counts: { waiting, active, completed, failed, delayed },
    health: waiting < 50 ? 'healthy' : 'warning',
    upcomingJobs: jobs.map(j => ({
      id: j.id,
      title: j.data.title.substring(0, 40) + '...',
      priority: j.opts.priority,
      attempts: j.attemptsMade
    }))
  };
};

/**
 * Pause the queue (for maintenance)
 */
const pauseQueue = async () => {
  if (!commentaryQueue) return;
  await commentaryQueue.pause();
  console.log('⏸️ Queue paused');
};

/**
 * Resume the queue
 */
const resumeQueue = async () => {
  if (!commentaryQueue) return;
  await commentaryQueue.resume();
  console.log('▶️ Queue resumed');
};

/**
 * Clean up old jobs
 */
const cleanQueue = async () => {
  if (!commentaryQueue) return;
  await commentaryQueue.clean(24 * 3600 * 1000, 100, 'completed');
  await commentaryQueue.clean(7 * 24 * 3600 * 1000, 500, 'failed');
  console.log('🧹 Queue cleaned');
};

/**
 * Graceful shutdown
 */
const shutdown = async () => {
  console.log('🛑 Shutting down commentary queue and worker...');
  if (worker) await worker.close();
  if (commentaryQueue) await commentaryQueue.close();
  console.log('✅ Commentary queue and worker shut down successfully');
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  commentaryQueue,
  worker,
  addToQueue,
  addBatchToQueue,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  shutdown
};
