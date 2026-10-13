/**
 * Check Groq API Keys Status
 * Tests all 6 Groq API keys to see if limits have refreshed
 */

require('dotenv').config();
const fetch = require('node-fetch');

function getApiKeys() {
  if (process.env.GROQ_API_KEYS) {
    return process.env.GROQ_API_KEYS.split(',').map((k, i) => ({
      name: `GROQ_KEY_${i + 1}`,
      key: k.trim()
    })).filter(item => item.key);
  }
  const names = [
    'GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3',
    'GROQ_API_KEY_4', 'GROQ_API_KEY_5', 'GROQ_API_KEY_6', 'GROQ_API_KEY_7',
    'GROQ_API_KEY_8', 'GROQ_API_KEY_9', 'GROQ_API_KEY_10', 'GROQ_API_KEY_11', 'GROQ_API_KEY_12'
  ];
  return names.filter(n => process.env[n]).map(n => ({ name: n, key: process.env[n].trim() }));
}

const API_KEYS = getApiKeys();
const targetModel = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

async function checkGroqKey(name, key) {
  try {
    console.log(`\n🔑 Testing ${name}...`);

    if (!key) {
      console.log(`   ❌ Key not configured`);
      return { name, status: 'not_configured' };
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: 'user', content: 'Say "test" in one word.' }
        ],
        max_tokens: 10,
        temperature: 0
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`   ✅ Key is ACTIVE and working`);
      console.log(`   📊 Response received successfully`);
      console.log(`   🎯 Model: ${data.model || 'llama-3.3-70b-versatile'}`);
      console.log(`   📝 Usage: ${data.usage?.total_tokens || 'N/A'} tokens`);
      return {
        name,
        status: 'active',
        working: true,
        tokensUsed: data.usage?.total_tokens || 0
      };
    } else if (response.status === 429) {
      const errorData = data.error || {};
      console.log(`   ⚠️  Key hit RATE LIMIT`);
      console.log(`   📊 Status: ${response.status} - ${errorData.type}`);
      console.log(`   💬 Message: ${errorData.message}`);

      // Parse usage from error message
      const match = errorData.message?.match(/Used (\d+)/);
      const used = match ? parseInt(match[1]) : 'Unknown';

      console.log(`   📈 Tokens Used: ${used}`);

      return {
        name,
        status: 'rate_limited',
        working: false,
        tokensUsed: used,
        message: errorData.message
      };
    } else {
      console.log(`   ❌ Key ERROR`);
      console.log(`   📊 Status: ${response.status}`);
      console.log(`   💬 Message: ${data.error?.message || 'Unknown error'}`);
      return {
        name,
        status: 'error',
        working: false,
        message: data.error?.message
      };
    }

  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
    return {
      name,
      status: 'error',
      working: false,
      message: error.message
    };
  }
}

async function checkAllKeys() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         GROQ API KEYS STATUS CHECK                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n📅 Checking all 6 Groq API keys...');
  console.log('💡 Rate limits reset at midnight UTC (5:30 AM IST)');

  const results = [];

  for (const { name, key } of API_KEYS) {
    const result = await checkGroqKey(name, key);
    results.push(result);

    // Wait 1 second between checks
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                     SUMMARY                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const working = results.filter(r => r.working).length;
  const rateLimited = results.filter(r => r.status === 'rate_limited').length;
  const errors = results.filter(r => r.status === 'error' && r.status !== 'rate_limited').length;

  console.log(`✅ Active Keys: ${working}/6`);
  console.log(`⚠️  Rate Limited: ${rateLimited}/6`);
  console.log(`❌ Error/Not Configured: ${errors}/6`);

  console.log('\n📊 Detailed Status:');
  results.forEach(result => {
    const icon = result.working ? '✅' : result.status === 'rate_limited' ? '⚠️' : '❌';
    const status = result.working ? 'ACTIVE' : result.status.toUpperCase().replace('_', ' ');
    console.log(`   ${icon} ${result.name.padEnd(20)} - ${status}`);
    if (result.tokensUsed && result.tokensUsed !== 'Unknown') {
      console.log(`      └─ Tokens used: ${result.tokensUsed}`);
    }
  });

  console.log('\n💡 Recommendations:');
  if (working === 6) {
    console.log('   🎉 All keys active! System ready to process articles.');
    console.log('   🚀 You can start the server: node server.js');
  } else if (working > 0) {
    console.log(`   ⚡ ${working} key(s) available - system can run but with reduced capacity`);
    console.log(`   ⏰ Wait for midnight UTC for ${rateLimited} rate-limited key(s) to reset`);
  } else {
    console.log('   ⏰ All keys exhausted - wait for midnight UTC reset');
    console.log('   🕐 Reset time: Midnight UTC = 5:30 AM IST');
  }

  // Calculate time until midnight UTC
  const now = new Date();
  const midnightUTC = new Date(now);
  midnightUTC.setUTCHours(24, 0, 0, 0);
  const hoursUntilReset = Math.floor((midnightUTC - now) / (1000 * 60 * 60));
  const minutesUntilReset = Math.floor(((midnightUTC - now) % (1000 * 60 * 60)) / (1000 * 60));

  console.log(`\n⏰ Time until reset: ${hoursUntilReset}h ${minutesUntilReset}m`);
  console.log(`   Current time: ${now.toISOString()}`);
  console.log(`   Reset time: ${midnightUTC.toISOString()}\n`);
}

checkAllKeys().then(() => process.exit(0));
