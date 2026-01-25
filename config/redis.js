/**
 * 🔴 Redis Configuration - Load Balanced Connection Pool
 * Distributes requests across multiple Upstash instances
 */

const redisLoadBalancer = require('./redisLoadBalancer');

// Initialize load balancer on first import
redisLoadBalancer.initialize();

// Export the load balancer (has same API as IORedis)
module.exports = redisLoadBalancer;
