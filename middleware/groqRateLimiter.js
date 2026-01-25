/**
 * 🎯 Advanced Groq API Rate Limiter
 * Implements token budgeting with queue management to prevent 429 errors
 */

class GroqRateLimiter {
  constructor(options = {}) {
    this.tokensPerMinute = options.tokensPerMinute || 5500; // Stay under 6000 limit
    this.availableTokens = this.tokensPerMinute;
    this.queue = [];
    this.metrics = {
      requestsCompleted: 0,
      requestsQueued: 0,
      tokensUsed: 0,
      errors: 0,
      avgWaitTime: 0
    };
    
    // Reset tokens every minute
    this.refillInterval = setInterval(() => {
      this.availableTokens = this.tokensPerMinute;
      this.processQueue();
      console.log(`🔄 Token bucket refilled: ${this.tokensPerMinute} tokens available`);
    }, 60000);

    // Process queue every 5 seconds
    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 5000);

    console.log(`🎯 Groq Rate Limiter initialized with ${this.tokensPerMinute} tokens/minute`);
  }

  /**
   * Estimate tokens needed for a request
   */
  estimateTokens(text, type = 'completion') {
    if (!text) return 50; // Default minimum
    
    const baseTokens = Math.ceil(text.length / 4); // Rough estimation: 4 chars per token
    
    // Add overhead based on request type
    const overhead = {
      'completion': 50,    // Response generation overhead
      'analysis': 30,      // Analysis requests
      'summary': 40        // Summary requests
    };
    
    return baseTokens + (overhead[type] || 50);
  }

  /**
   * Execute a Groq API request with rate limiting
   */
  async executeRequest(requestFunction, options = {}) {
    const {
      estimatedTokens = 200,
      priority = 'normal',
      timeout = 30000,
      retryCount = 0
    } = options;

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    // Check if we have enough tokens immediately
    if (this.availableTokens >= estimatedTokens) {
      return this.executeImmediate(requestFunction, estimatedTokens, requestId, startTime);
    }

    // Queue the request if no immediate tokens available
    return this.queueRequest(requestFunction, estimatedTokens, priority, timeout, requestId, startTime);
  }

  /**
   * Execute request immediately when tokens are available
   */
  async executeImmediate(requestFunction, estimatedTokens, requestId, startTime) {
    try {
      this.availableTokens -= estimatedTokens;
      this.metrics.tokensUsed += estimatedTokens;
      
      console.log(`🚀 Executing immediate request ${requestId}, tokens remaining: ${this.availableTokens}`);
      
      const result = await requestFunction();
      
      this.metrics.requestsCompleted++;
      const duration = Date.now() - startTime;
      this.updateAvgWaitTime(duration);
      
      return {
        success: true,
        data: result,
        requestId,
        tokensUsed: estimatedTokens,
        waitTime: duration
      };
    } catch (error) {
      this.metrics.errors++;
      
      // Return tokens if request failed
      this.availableTokens += estimatedTokens;
      this.metrics.tokensUsed -= estimatedTokens;
      
      console.error(`❌ Request ${requestId} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Queue request for later execution
   */
  async queueRequest(requestFunction, estimatedTokens, priority, timeout, requestId, startTime) {
    return new Promise((resolve, reject) => {
      const queueEntry = {
        requestFunction,
        estimatedTokens,
        priority,
        requestId,
        startTime,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.removeFromQueue(requestId);
          reject(new Error(`Request ${requestId} timed out in queue`));
        }, timeout)
      };

      // Insert based on priority
      if (priority === 'high') {
        this.queue.unshift(queueEntry);
      } else {
        this.queue.push(queueEntry);
      }

      this.metrics.requestsQueued++;
      console.log(`⏳ Queued request ${requestId}, queue length: ${this.queue.length}`);
    });
  }

  /**
   * Process queued requests
   */
  async processQueue() {
    if (this.queue.length === 0) return;

    console.log(`🔄 Processing queue: ${this.queue.length} requests waiting`);

    while (this.queue.length > 0 && this.availableTokens > 0) {
      const queueEntry = this.queue[0];
      
      if (this.availableTokens >= queueEntry.estimatedTokens) {
        // Remove from queue
        this.queue.shift();
        clearTimeout(queueEntry.timeout);

        try {
          const result = await this.executeImmediate(
            queueEntry.requestFunction,
            queueEntry.estimatedTokens,
            queueEntry.requestId,
            queueEntry.startTime
          );
          queueEntry.resolve(result);
        } catch (error) {
          queueEntry.reject(error);
        }
      } else {
        // Not enough tokens for the next request
        break;
      }
    }
  }

  /**
   * Remove request from queue by ID
   */
  removeFromQueue(requestId) {
    const index = this.queue.findIndex(entry => entry.requestId === requestId);
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
      clearTimeout(removed.timeout);
      console.log(`🗑️ Removed request ${requestId} from queue`);
    }
  }

  /**
   * Update average wait time metric
   */
  updateAvgWaitTime(duration) {
    this.metrics.avgWaitTime = (this.metrics.avgWaitTime + duration) / 2;
  }

  /**
   * Get current status and metrics
   */
  getStatus() {
    const queuedTokens = this.queue.reduce((sum, entry) => sum + entry.estimatedTokens, 0);
    
    return {
      availableTokens: this.availableTokens,
      queueLength: this.queue.length,
      queuedTokens,
      utilizationRate: ((this.tokensPerMinute - this.availableTokens) / this.tokensPerMinute * 100).toFixed(2) + '%',
      metrics: this.metrics,
      status: this.availableTokens > 1000 ? 'healthy' : 'limited'
    };
  }

  /**
   * Get stats (alias for getStatus for compatibility)
   */
  getStats() {
    return this.getStatus();
  }

  /**
   * Check if we can handle a request of given size
   */
  canHandle(estimatedTokens) {
    return this.availableTokens >= estimatedTokens || this.queue.length < 10;
  }

  /**
   * Clear the queue (emergency)
   */
  clearQueue() {
    this.queue.forEach(entry => {
      clearTimeout(entry.timeout);
      entry.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    console.log('🧹 Queue cleared');
  }

  /**
   * Cleanup intervals
   */
  destroy() {
    if (this.refillInterval) {
      clearInterval(this.refillInterval);
    }
    if (this.processInterval) {
      clearInterval(this.processInterval);
    }
    this.clearQueue();
    console.log('🔥 Groq Rate Limiter destroyed');
  }
}

// Create singleton instance
const groqRateLimiter = new GroqRateLimiter({
  tokensPerMinute: 5500 // Stay safely under 6000 limit
});

/**
 * Middleware for automatic Groq request wrapping
 */
const groqRateLimit = (options = {}) => {
  return async (req, res, next) => {
    // Add rate limiter to request object
    req.groqRateLimiter = groqRateLimiter;
    
    // Add helper function for making Groq requests
    req.executeGroqRequest = async (requestFunction, requestOptions = {}) => {
      const text = requestOptions.text || req.body?.text || '';
      const estimatedTokens = groqRateLimiter.estimateTokens(text, requestOptions.type);
      
      return groqRateLimiter.executeRequest(requestFunction, {
        estimatedTokens,
        priority: requestOptions.priority || 'normal',
        timeout: requestOptions.timeout || 30000
      });
    };
    
    next();
  };
};

/**
 * Express route for monitoring rate limiter status
 */
const createStatusRoute = () => {
  return (req, res) => {
    res.json({
      rateLimiter: groqRateLimiter.getStatus(),
      timestamp: new Date().toISOString()
    });
  };
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down Groq Rate Limiter...');
  groqRateLimiter.destroy();
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down Groq Rate Limiter...');
  groqRateLimiter.destroy();
});

module.exports = {
  groqRateLimiter,
  groqRateLimit,
  createStatusRoute
};
