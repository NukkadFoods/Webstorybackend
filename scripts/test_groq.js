require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const groqKeys = [
    { name: 'GROQ_API_KEY', key: process.env.GROQ_API_KEY },
    { name: 'GROQ_API_KEY_2', key: process.env.GROQ_API_KEY_2 },
    { name: 'GROQ_API_KEY_3', key: process.env.GROQ_API_KEY_3 },
    { name: 'GROQ_API_KEY_4', key: process.env.GROQ_API_KEY_4 }
];

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
                model: 'llama-3.1-8b-instant',
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
    console.log('🔍 Testing Groq API Keys...\n');

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

    console.log('\n' + okCount + '/4 Groq API keys working');
}

main();
