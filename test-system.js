/**
 * System Component Testing Script
 * Tests all components before starting the server
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (message) console.log(`   ${message}`);
  
  results.tests.push({ name, passed, message });
  if (passed) results.passed++;
  else results.failed++;
}

async function testMongoDBConnection() {
  console.log('\n📦 Testing MongoDB Connection...');
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI not found in .env');
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    logTest('MongoDB Connection', true, 'Connected successfully');
    
    // Test Article model
    const Article = require('./models/article');
    const count = await Article.countDocuments({});
    logTest('Article Model', true, `${count} articles in database`);
    
    // Test articles with commentary
    const withCommentary = await Article.countDocuments({
      aiCommentary: { $exists: true, $ne: null, $ne: '' }
    });
    logTest('Articles with Commentary', true, `${withCommentary}/${count} articles have commentary`);
    
    return true;
  } catch (error) {
    logTest('MongoDB Connection', false, error.message);
    return false;
  }
}

async function testRedisConnection() {
  console.log('\n🔴 Testing Redis Connection...');
  try {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL not found in .env');
    }
    
    const CacheService = require('./services/cache');
    
    // Test SET operation
    const testKey = 'test:system:check';
    const testValue = JSON.stringify({ test: true, timestamp: Date.now() });
    await CacheService.set(testKey, testValue, 60);
    logTest('Redis SET', true, 'Successfully wrote to cache');
    
    // Test GET operation
    const retrieved = await CacheService.get(testKey);
    if (retrieved) {
      const parsed = typeof retrieved === 'string' ? JSON.parse(retrieved) : retrieved;
      if (parsed.test === true) {
        logTest('Redis GET', true, 'Successfully read from cache');
      } else {
        throw new Error('Retrieved value does not match');
      }
    } else {
      throw new Error('Failed to retrieve value');
    }
    
    // Test DELETE operation
    await CacheService.del(testKey);
    const deleted = await CacheService.get(testKey);
    if (!deleted) {
      logTest('Redis DELETE', true, 'Successfully deleted from cache');
    } else {
      throw new Error('Key still exists after delete');
    }
    
    return true;
  } catch (error) {
    logTest('Redis Connection', false, error.message);
    return false;
  }
}

async function testGroqAPIKeys() {
  console.log('\n🤖 Testing Groq API Keys...');
  try {
    const keys = [
      process.env.GROQ_API_KEY,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY_4
    ];
    
    let activeKeys = 0;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] && keys[i].trim() !== '') {
        activeKeys++;
        logTest(`Groq API Key ${i + 1}`, true, 'Configured');
      } else {
        logTest(`Groq API Key ${i + 1}`, false, 'Missing or empty');
      }
    }
    
    if (activeKeys === 0) {
      throw new Error('No Groq API keys configured');
    }
    
    // Test load balancer
    const groqLoadBalancer = require('./services/groqLoadBalancer');
    logTest('Groq Load Balancer', true, `${activeKeys} keys available`);
    
    return true;
  } catch (error) {
    logTest('Groq API Keys', false, error.message);
    return false;
  }
}

async function testExternalAPIs() {
  console.log('\n🌐 Testing External API Keys...');
  
  // Test NYT API
  if (process.env.NYT_API_KEY) {
    logTest('NYT API Key', true, 'Configured');
  } else {
    logTest('NYT API Key', false, 'Missing');
  }
  
  // Test newsdata.io API
  if (process.env.ENT_API_KEY) {
    logTest('newsdata.io API Key', true, 'Configured');
  } else {
    logTest('newsdata.io API Key', false, 'Missing');
  }
}

async function testThresholdService() {
  console.log('\n🎯 Testing Threshold Service...');
  try {
    const thresholdService = require('./services/db/thresholdService');
    const status = await thresholdService.checkThreshold();
    
    logTest('Threshold Service', true, `Total: ${status.total} articles`);
    
    // Don't fail if threshold not met - that's expected for fresh DB
    const thresholdMessage = status.thresholdMet ? 
      'All sections ready for caching' : 
      `Building database (need ${status.sections.filter(s => !s.met).length} sections)`;
    logTest('Threshold Status', true, thresholdMessage);
    
    // Show section details
    console.log('\n   Section Details:');
    status.sections.forEach(s => {
      const icon = s.met ? '✅' : '⏳';
      console.log(`   ${icon} ${s.section.padEnd(15)} ${s.count}/${s.threshold}`);
    });
    
    return true;
  } catch (error) {
    logTest('Threshold Service', false, error.message);
    return false;
  }
}

async function testArticleFetcherService() {
  console.log('\n📰 Testing Article Fetcher Service...');
  try {
    const ArticleFetcherService = require('./services/db/articleFetcherService');
    logTest('Article Fetcher Service', true, 'Loaded successfully');
    
    // Check if it has the required methods
    if (typeof ArticleFetcherService.fetchAndProcessSection === 'function') {
      logTest('Fetch Method', true, 'fetchAndProcessSection available');
    } else {
      throw new Error('fetchAndProcessSection method not found');
    }
    
    return true;
  } catch (error) {
    logTest('Article Fetcher Service', false, error.message);
    return false;
  }
}

async function testSectionRotationWorker() {
  console.log('\n🔄 Testing Section Rotation Worker...');
  try {
    const SectionRotationWorker = require('./workers/sectionRotationWorker');
    logTest('Section Rotation Worker', true, 'Loaded successfully');
    
    // Verify it's a class instance
    if (SectionRotationWorker.start && SectionRotationWorker.stop) {
      logTest('Worker Methods', true, 'start() and stop() available');
    } else {
      throw new Error('Worker methods not found');
    }
    
    return true;
  } catch (error) {
    logTest('Section Rotation Worker', false, error.message);
    return false;
  }
}

async function testRedisBatchService() {
  console.log('\n💾 Testing Redis Batch Service...');
  try {
    const RedisBatchService = require('./services/db/redisBatchService');
    logTest('Redis Batch Service', true, 'Loaded successfully');
    
    // Verify methods
    if (RedisBatchService.start && RedisBatchService.stop) {
      logTest('Batch Service Methods', true, 'start() and stop() available');
    } else {
      throw new Error('Batch service methods not found');
    }
    
    return true;
  } catch (error) {
    logTest('Redis Batch Service', false, error.message);
    return false;
  }
}

async function testDatabaseSchema() {
  console.log('\n🗄️  Testing Database Schema...');
  try {
    const Article = require('./models/article');
    
    // Get sample article
    const sample = await Article.findOne({ 
      aiCommentary: { $exists: true, $ne: null, $ne: '' } 
    });
    
    if (!sample) {
      logTest('Schema Validation', true, 'No articles yet (expected for fresh DB)');
      return true;
    }
    
    // Check required fields
    const requiredFields = ['id', 'title', 'url', 'section', 'aiCommentary'];
    const missingFields = [];
    
    for (const field of requiredFields) {
      if (!sample[field]) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length === 0) {
      logTest('Schema Validation', true, 'All required fields present');
    } else {
      logTest('Schema Validation', false, `Missing: ${missingFields.join(', ')}`);
    }
    
    // Check sections
    const sections = await Article.distinct('section');
    const allowedSections = ['home', 'world', 'us', 'politics', 'business', 'technology', 'health', 'sports', 'entertainment', 'finance'];
    const unauthorizedSections = sections.filter(s => !allowedSections.includes(s));
    
    if (unauthorizedSections.length === 0) {
      logTest('Section Validation', true, `${sections.length} authorized sections`);
    } else {
      logTest('Section Validation', false, `Unauthorized: ${unauthorizedSections.join(', ')}`);
    }
    
    return true;
  } catch (error) {
    logTest('Database Schema', false, error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          SYSTEM COMPONENT TEST SUITE                     ║');
  console.log('║          Testing all components before startup           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  // Run all tests
  await testMongoDBConnection();
  await testRedisConnection();
  await testGroqAPIKeys();
  await testExternalAPIs();
  await testThresholdService();
  await testArticleFetcherService();
  await testSectionRotationWorker();
  await testRedisBatchService();
  await testDatabaseSchema();
  
  // Print summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUMMARY                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📊 Total:  ${results.tests.length}\n`);
  
  if (results.failed === 0) {
    console.log('🎉 ALL TESTS PASSED! System is ready to start.\n');
    console.log('▶️  Start the server: node server.js\n');
    process.exit(0);
  } else {
    console.log('⚠️  SOME TESTS FAILED. Please fix the issues before starting.\n');
    console.log('Failed tests:');
    results.tests
      .filter(t => !t.passed)
      .forEach(t => console.log(`   ❌ ${t.name}: ${t.message}`));
    console.log();
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('❌ Test suite error:', error);
  process.exit(1);
});
