try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch (e) {}

function getGroqKeys() {
    let keys = [];
    if (process.env.GROQ_API_KEYS) {
        keys = process.env.GROQ_API_KEYS.split(',').map((k, i) => ({
            name: `GROQ_KEY_${i + 1}`,
            key: k.trim()
        })).filter(item => item.key);
    } else {
        const names = [
            'GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3',
            'GROQ_API_KEY_4', 'GROQ_API_KEY_5', 'GROQ_API_KEY_6', 'GROQ_API_KEY_7',
            'GROQ_API_KEY_8', 'GROQ_API_KEY_9', 'GROQ_API_KEY_10', 'GROQ_API_KEY_11', 'GROQ_API_KEY_12'
        ];
        names.forEach(name => {
            if (process.env[name]) {
                keys.push({ name, key: process.env[name].trim() });
            }
        });
    }
    return keys;
}

const targetModel = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

async function testGroqKey(name, apiKey) {
    if (!apiKey) return { name, status: 'MISSING' };

    const start = Date.now();
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: targetModel,
                messages: [{ role: 'user', content: 'Say OK' }],
                max_tokens: 5
            })
        });

        const data = await res.json();
        const latency = Date.now() - start;

        if (res.ok && data.choices) {
            return { name, status: 'OK', latency };
        } else {
            return { name, status: 'ERROR', error: data.error?.message || 'Unknown' };
        }
    } catch (err) {
        return { name, status: 'ERROR', error: err.message };
    }
}

async function main() {
    console.log(`🔍 Testing Groq API Keys with model: ${targetModel}...\n`);

    const groqKeys = getGroqKeys();
    if (groqKeys.length === 0) {
        console.log('⚠️ No Groq API keys found in environment.');
        return;
    }

    let okCount = 0;

    for (const { name, key } of groqKeys) {
        const result = await testGroqKey(name, key);

        if (result.status === 'OK') {
            console.log('✅ ' + name + ' - OK (' + result.latency + 'ms)');
            okCount++;
        } else if (result.status === 'MISSING') {
            console.log('⚠️  ' + name + ' - Not configured');
        } else {
            console.log('❌ ' + name + ' - ' + (result.error || 'Failed').substring(0, 60));
        }
    }

    console.log(`\n${okCount}/${groqKeys.length} Groq API keys working`);
}

main();
