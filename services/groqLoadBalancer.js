/**
 * Groq API Load Balancer
 * 
 * Distributes API requests across multiple Groq API keys to:
 * - Avoid rate limits (100k tokens/day per key)
 * - Increase total daily capacity
 * - Automatic failover when a key hits limits
 */

const { Groq } = require('groq-sdk');

class GroqLoadBalancer {
  constructor(apiKeys) {
    // Initialize multiple Groq clients
    this.clients = apiKeys.map((key, index) => ({
      id: index + 1,
      key: key.substring(0, 20) + '...', // Hide full key in logs
      client: new Groq({ apiKey: key }),
      tokensUsed: 0,
      dailyLimit: 100000,
      isAvailable: true,
      lastError: null,
      resetTime: this.getNextMidnightUTC()
    }));

    this.currentIndex = 0;
    // console.log(`🔀 Groq Load Balancer initialized with ${this.clients.length} API keys`);

    // Reset counters at midnight UTC
    this.scheduleReset();
  }

  /**
   * Get next available client using round-robin
   */
  getClient() {
    const startIndex = this.currentIndex;

    // Try all clients in round-robin fashion
    do {
      const client = this.clients[this.currentIndex];

      // Move to next client for next request (round-robin)
      this.currentIndex = (this.currentIndex + 1) % this.clients.length;

      // Check if client is available
      if (client.isAvailable && client.tokensUsed < client.dailyLimit - 5000) {
        return client;
      }

      if (!client.isAvailable) {
        // console.log(`⏭️  Key ${client.id} unavailable (${client.lastError}), trying next...`);
      } else {
        // console.log(`⏭️  Key ${client.id} near limit (${client.tokensUsed}/${client.dailyLimit}), trying next...`);
      }

    } while (this.currentIndex !== startIndex);

    // All clients exhausted - return first one and let it fail with proper error
    // console.warn('⚠️  All API keys at capacity or unavailable!');
    return this.clients[0];
  }

  /**
   * Generate chat completion with automatic failover across all configured keys
   */
  async createChatCompletion(params) {
    let lastError = null;
    const maxAttempts = this.clients.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const client = this.getClient();
      if (!client || !client.isAvailable) {
        continue;
      }

      try {
        const response = await client.client.chat.completions.create(params);

        // Track token usage
        const tokensUsed = response.usage?.total_tokens || 600;
        client.tokensUsed += tokensUsed;

        return response;

      } catch (error) {
        console.error(`❌ Key ${client.id} failed (${error.status || error.message}):`, error.message);
        client.isAvailable = false;
        client.lastError = error.message;
        lastError = error;

        const availableKeys = this.clients.filter(c => c.isAvailable).length;
        if (availableKeys === 0) {
          console.warn('⚠️ All Groq API keys have been exhausted or failed');
          break;
        }
      }
    }

    throw lastError || new Error('All Groq API keys failed or unavailable');
  }

  /**
   * Get load balancer statistics
   */
  getStats() {
    const totalTokens = this.clients.reduce((sum, c) => sum + c.tokensUsed, 0);
    const totalLimit = this.clients.reduce((sum, c) => sum + c.dailyLimit, 0);
    const availableKeys = this.clients.filter(c => c.isAvailable).length;

    return {
      totalKeys: this.clients.length,
      availableKeys,
      totalTokensUsed: totalTokens,
      totalDailyLimit: totalLimit,
      remainingTokens: totalLimit - totalTokens,
      percentUsed: ((totalTokens / totalLimit) * 100).toFixed(1),
      keys: this.clients.map(c => ({
        id: c.id,
        tokensUsed: c.tokensUsed,
        dailyLimit: c.dailyLimit,
        isAvailable: c.isAvailable,
        percentUsed: ((c.tokensUsed / c.dailyLimit) * 100).toFixed(1),
        lastError: c.lastError
      })),
      resetTime: this.clients[0].resetTime
    };
  }

  /**
   * Get next midnight UTC
   */
  getNextMidnightUTC() {
    const now = new Date();
    const midnight = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0
    ));
    return midnight;
  }

  /**
   * Schedule daily reset at midnight UTC
   */
  scheduleReset() {
    const now = new Date();
    const midnight = this.getNextMidnightUTC();
    const msUntilMidnight = midnight - now;

    // console.log(`🕐 Token counters will reset at ${midnight.toISOString()}`);

    setTimeout(() => {
      this.resetCounters();
      this.scheduleReset(); // Schedule next reset
    }, msUntilMidnight);
  }

  /**
   * Reset all token counters
   */
  resetCounters() {
    // console.log('🔄 Resetting token counters (new day)...');
    this.clients.forEach(client => {
      client.tokensUsed = 0;
      client.isAvailable = true;
      client.lastError = null;
      client.resetTime = this.getNextMidnightUTC();
    });
    // console.log('✅ All API keys reset and available');
  }
}

// Initialize with multiple API keys
const apiKeys = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
  process.env.GROQ_API_KEY_6
].filter(key => key && key.trim() !== '');

if (apiKeys.length === 0) {
  console.error('❌ No Groq API keys found in environment variables');
  module.exports = null;
} else {
  const loadBalancer = new GroqLoadBalancer(apiKeys);
  module.exports = loadBalancer;
}
