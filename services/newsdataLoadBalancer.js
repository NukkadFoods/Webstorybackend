/**
 * Newsdata.io API Load Balancer
 * Rotates between multiple API keys to handle rate limits
 */

class NewsdataLoadBalancer {
  constructor() {
    this.apiKeys = [
      process.env.ENT_API_KEY_2,  // Valid key 1
      process.env.ENT_API_KEY_3,  // Valid key 2
      process.env.ENT_API_KEY_4,  // Valid key 3
      process.env.ENT_API_KEY_5,  // Valid key 4
      process.env.ENT_API_KEY     // Old limited key last
    ].filter(key => key); // Remove undefined keys
    
    this.currentKeyIndex = 0;
    this.requestCounts = new Array(this.apiKeys.length).fill(0);
    
    console.log(`🔀 Newsdata.io Load Balancer initialized with ${this.apiKeys.length} API keys`);
  }

  /**
   * Get next available API key (round-robin)
   */
  getNextKey() {
    if (this.apiKeys.length === 0) {
      throw new Error('No newsdata.io API keys available');
    }

    const key = this.apiKeys[this.currentKeyIndex];
    const keyNum = this.currentKeyIndex + 1;
    
    this.requestCounts[this.currentKeyIndex]++;
    
    console.log(`🔑 Using Newsdata Key ${keyNum} (${this.requestCounts[this.currentKeyIndex]} requests)`);
    
    // Move to next key for next request
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    
    return key;
  }

  /**
   * Try all API keys until one succeeds
   * @param {Function} apiCallFn - Async function that makes API call with key
   * @returns {Promise} Result from successful API call
   */
  async tryAllKeys(apiCallFn) {
    const maxAttempts = this.apiKeys.length;
    let lastError = null;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const key = this.getNextKey();
      try {
        const result = await apiCallFn(key);
        return result;
      } catch (error) {
        lastError = error;
        console.log(`⚠️ Key ${attempt + 1}/${maxAttempts} failed: ${error.message}. Trying next key...`);
      }
    }
    
    throw new Error(`All ${maxAttempts} API keys failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Get statistics for all keys
   */
  getStats() {
    return this.apiKeys.map((key, index) => ({
      keyNumber: index + 1,
      requestCount: this.requestCounts[index],
      keyPreview: `${key.substring(0, 10)}...`
    }));
  }
}

module.exports = new NewsdataLoadBalancer();
