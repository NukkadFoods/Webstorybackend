const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');
const { optimizedGroqCall, optimizedFetch } = require('../middleware/optimizationManager');

// Initialize GROQ client with error handling
let groq = null;
if (process.env.GROQ_API_KEY) {
  try {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    console.log('✅ Groq API client initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Groq API client:', error);
  }
} else {
  console.warn('⚠️ GROQ_API_KEY not found in environment variables');
}

/**
 * Generate AI commentary for an article
 * POST /api/generate-commentary
 * 🚀 ARCHITECTURE FIX: Returns immediately, queues Groq call in background
 */
router.post('/generate-commentary', async (req, res) => {
  // Declare variables outside try-catch so they're accessible in catch block
  let title, content, category;
  
  try {
    // Check if Groq client is initialized
    if (!groq) {
      console.error('❌ Groq API client not initialized');
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'AI commentary service is temporarily unavailable'
      });
    }

    // Assign values from request body
    title = req.body.title;
    content = req.body.content;
    category = req.body.category;

    if (!title || !content) {
      return res.status(400).json({
        error: 'Title and content are required'
      });
    }

    // Create cache key for this specific commentary request
    const cacheKey = `commentary:${Buffer.from(title + content).toString('base64').substring(0, 32)}`;
    
    // 🚀 CRITICAL: Check cache first - if exists, return immediately
    const cache = require('../services/cache');
    const cachedCommentary = await cache.get(cacheKey);
    
    if (cachedCommentary) {
      console.log(`⚡ Commentary cache hit: ${cacheKey}`);
      return res.json({
        success: true,
        commentary: cachedCommentary,
        cached: true
      });
    }
    
    // 🚀 ARCHITECTURE FIX: Queue the job and return "generating" status immediately
    // User doesn't wait for Groq - gets instant response
    const { addToQueue } = require('../workers/commentaryQueue');
    const article = {
      _id: req.body.articleId || `temp-${Date.now()}`,
      title,
      content,
      section: category
    };
    
    // Add to queue with high priority (user-requested)
    addToQueue(article, { priority: 1 })
      .then(job => console.log(`📝 Queued commentary generation: Job ${job.id}`))
      .catch(err => console.log(`⚠️ Queue error:`, err.message));
    
    // Return immediately with "generating" status
    res.json({
      success: true,
      commentary: null,
      generating: true,
      message: 'Commentary is being generated. Please check back in a few seconds.',
      cacheKey // Frontend can poll this key
    });

  } catch (error) {
    console.error('❌ Error generating commentary:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      statusCode: error.statusCode,
      requestBody: { title, content: content?.substring(0, 100) + '...', category }
    });
    
    // Check if it's a rate limit error
    if (error.message && error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Please try again in a few moments. Our AI service is currently busy.',
        retryAfter: 60
      });
    }
    
    // Check if it's a Groq API error
    if (error.message && (error.message.includes('API key') || error.message.includes('authentication'))) {
      return res.status(500).json({
        error: 'Configuration error',
        message: 'AI service is not properly configured. Please contact support.'
      });
    }
    
    res.status(500).json({
      error: 'Failed to generate commentary',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * 🚀 GET /api/check-commentary - Poll endpoint for commentary status
 * Frontend can use this to check if commentary generation is complete
 */
router.get('/check-commentary/:cacheKey', async (req, res) => {
  try {
    const { cacheKey } = req.params;
    const cache = require('../services/cache');
    
    const commentary = await cache.get(cacheKey);
    
    if (commentary) {
      res.json({
        ready: true,
        commentary: commentary
      });
    } else {
      res.json({
        ready: false,
        message: 'Commentary is still generating...'
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to check commentary status',
      message: error.message
    });
  }
});

module.exports = router;
