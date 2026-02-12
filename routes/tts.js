const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ttsService = require('../services/ttsService');
const Article = require('../models/article');

// Config
const DEFAULT_VOICE = 'en-US-AriaNeural';

// ============ AUDIO CACHE ============
// Use /tmp for serverless environments (Vercel), local path for development/Render
const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const CACHE_DIR = isServerless
    ? '/tmp/audio-cache'
    : path.join(__dirname, '../cache/audio');
const audioMetadataCache = new Map(); // hash -> { size, duration, path, createdAt }

// Ensure cache directory exists (wrapped in try-catch for serverless safety)
try {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        console.log('[TTS] Created audio cache directory:', CACHE_DIR);
    }
} catch (err) {
    console.warn('[TTS] Could not create cache directory:', err.message);
    // Continue without file caching - in-memory cache will still work
}

// Generate hash for text
function getTextHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

// Get estimated duration from word count (rough estimate: 130 words/min)
function estimateDuration(text) {
    const wordCount = text.split(/\s+/).length;
    return (wordCount / 130) * 60; // seconds
}

/**
 * @route POST /api/tts/prepare
 * @desc Generate audio, cache it, and return metadata (size, duration, audioId)
 * @access Public
 */
router.post('/prepare', async (req, res) => {
    try {
        const { text, voice, title } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const script = constructNewsScriptFromText(text, title);
        const hash = getTextHash(script);
        const audioPath = path.join(CACHE_DIR, `${hash}.mp3`);

        console.log(`[TTS] Prepare request, hash: ${hash}`);

        // Check if already cached
        if (audioMetadataCache.has(hash) && fs.existsSync(audioPath)) {
            const metadata = audioMetadataCache.get(hash);
            console.log(`[TTS] Cache hit for ${hash}, size: ${metadata.size}`);
            return res.json({
                audioId: hash,
                size: metadata.size,
                duration: metadata.duration,
                cached: true
            });
        }

        // Generate audio
        console.log(`[TTS] Generating audio for ${hash}...`);
        const { stream } = await ttsService.getTTSStream(script, voice || DEFAULT_VOICE);

        // Collect all chunks into a buffer
        const chunks = [];

        await new Promise((resolve, reject) => {
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', resolve);
            stream.on('error', reject);
        });

        const audioBuffer = Buffer.concat(chunks);

        if (audioBuffer.length === 0) {
            throw new Error('Empty audio generated');
        }

        // Save to file
        fs.writeFileSync(audioPath, audioBuffer);

        // Estimate duration (accurate duration requires parsing the MP3)
        const duration = estimateDuration(script);

        // Cache metadata
        const metadata = {
            size: audioBuffer.length,
            duration: duration,
            path: audioPath,
            createdAt: Date.now()
        };
        audioMetadataCache.set(hash, metadata);

        console.log(`[TTS] Audio cached: ${hash}, size: ${audioBuffer.length}, duration: ~${duration.toFixed(1)}s`);

        res.json({
            audioId: hash,
            size: audioBuffer.length,
            duration: duration,
            cached: false
        });

    } catch (error) {
        console.error('[TTS] Prepare error:', error);
        res.status(500).json({ error: 'Failed to prepare audio', details: error.message });
    }
});

/**
 * @route GET /api/tts/audio/:audioId
 * @desc Serve cached audio with Range request support (HTTP 206)
 * @access Public
 */
router.get('/audio/:audioId', (req, res) => {
    try {
        const { audioId } = req.params;
        const audioPath = path.join(CACHE_DIR, `${audioId}.mp3`);

        // Check if file exists
        if (!fs.existsSync(audioPath)) {
            console.log(`[TTS] Audio not found: ${audioId}`);
            return res.status(404).json({ error: 'Audio not found. Call /prepare first.' });
        }

        const stat = fs.statSync(audioPath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            // Parse Range header: "bytes=start-end"
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            console.log(`[TTS] Range request: ${start}-${end}/${fileSize}`);

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
            });

            const stream = fs.createReadStream(audioPath, { start, end });
            stream.pipe(res);

        } else {
            // No range header - send entire file
            console.log(`[TTS] Full file request: ${fileSize} bytes`);

            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'audio/mpeg',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=86400'
            });

            fs.createReadStream(audioPath).pipe(res);
        }

    } catch (error) {
        console.error('[TTS] Audio serve error:', error);
        res.status(500).json({ error: 'Failed to serve audio' });
    }
});

/**
 * @route GET /api/tts/metadata/:audioId
 * @desc Get metadata for cached audio (size, duration)
 * @access Public
 */
router.get('/metadata/:audioId', (req, res) => {
    try {
        const { audioId } = req.params;

        if (audioMetadataCache.has(audioId)) {
            const metadata = audioMetadataCache.get(audioId);
            return res.json({
                audioId,
                size: metadata.size,
                duration: metadata.duration
            });
        }

        // Try to get from file
        const audioPath = path.join(CACHE_DIR, `${audioId}.mp3`);
        if (fs.existsSync(audioPath)) {
            const stat = fs.statSync(audioPath);
            return res.json({
                audioId,
                size: stat.size,
                duration: null // Unknown without metadata
            });
        }

        res.status(404).json({ error: 'Audio not found' });

    } catch (error) {
        console.error('[TTS] Metadata error:', error);
        res.status(500).json({ error: 'Failed to get metadata' });
    }
});

/**
 * @route POST /api/tts/speak
 * @desc Stream TTS audio from provided text (no DB lookup needed)
 * @access Public
 */
router.post('/speak', async (req, res) => {
    try {
        const { text, voice, title } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text is required' });
        }

        // Construct news anchor script from the provided text
        const script = constructNewsScriptFromText(text, title);
        console.log(`[TTS] Speak request: ${script.length} chars`);

        try {
            const { stream, process: ttsProcess } = await ttsService.getTTSStream(script, voice || DEFAULT_VOICE);

            // Set headers for streaming audio
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache');

            // Pipe audio chunks directly to response (instant playback)
            stream.pipe(res);

            stream.on('error', (err) => {
                console.error('[TTS] Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Audio streaming failed' });
                } else {
                    res.end();
                }
            });

            // Clean up on client disconnect
            req.on('close', () => {
                if (ttsProcess && !ttsProcess.killed) {
                    ttsProcess.kill();
                }
            });

        } catch (ttsError) {
            console.error('[TTS] Generation error:', ttsError.message);
            return res.status(500).json({ error: 'TTS generation failed', details: ttsError.message });
        }

    } catch (error) {
        console.error('[TTS] Speak route error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

/**
 * Helper: Constructs news script from raw text
 */
function constructNewsScriptFromText(text, title) {
    // Clean markdown formatting
    const cleanText = text
        .replace(/#{1,6}\s?/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/- /g, '')
        .replace(/\n\n/g, '. ');

    let script = '';
    if (title) {
        script += `${title}. `;
    }
    script += cleanText;
    script += " That wraps up this report.";

    return script;
}

/**
 * @route GET /api/tts/stream/:articleId
 * @desc Stream AI commentary as audio
 * @access Public
 */
router.get('/stream/:articleId', async (req, res) => {
    try {
        const { articleId } = req.params;
        const { voice } = req.query;

        console.log(`[TTS] Request received for article: ${articleId}`);

        // Fetch article to get the commentary
        let article;
        const decodedId = decodeURIComponent(articleId);

        // 1. Try custom 'id' field first (most common case from frontend)
        article = await Article.findOne({ id: decodedId });

        // 2. If not found, try MongoDB _id
        if (!article) {
            try {
                article = await Article.findById(articleId);
            } catch (e) {
                // Invalid ObjectId format, continue to next lookup
                console.log(`[TTS] ObjectId lookup failed for: ${articleId}`);
            }
        }

        // 3. Try finding by URL
        if (!article) {
            article = await Article.findOne({ url: decodedId });
        }

        // 4. Last resort: title search
        if (!article) {
            article = await Article.findOne({ title: { $regex: decodedId, $options: 'i' } });
        }

        if (!article) {
            console.log(`[TTS] Article not found: ${articleId}`);
            return res.status(404).json({ error: 'Article not found' });
        }

        // Check if commentary exists
        if (!article.aiCommentary && !article.abstract) {
            console.log(`[TTS] No content for article: ${articleId}`);
            return res.status(404).json({ error: 'No content available for speech' });
        }

        // Construct the "News Anchor" script
        const script = constructNewsScript(article);
        console.log(`[TTS] Generated script (${script.length} chars) for: ${article.title}`);

        try {
            // Use the new async method with better error handling
            const { stream, process: ttsProcess } = await ttsService.getTTSStream(script, voice || DEFAULT_VOICE);

            // Set headers for streaming audio
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache');

            // Pipe audio to response
            stream.pipe(res);

            // Handle stream errors
            stream.on('error', (err) => {
                console.error('[TTS] Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Audio streaming failed' });
                } else {
                    res.end();
                }
            });

            // Clean up on client disconnect
            req.on('close', () => {
                if (ttsProcess && !ttsProcess.killed) {
                    ttsProcess.kill();
                }
            });

        } catch (ttsError) {
            console.error('[TTS] TTS generation error:', ttsError.message);
            return res.status(500).json({
                error: 'TTS generation failed',
                details: ttsError.message
            });
        }

    } catch (error) {
        console.error('[TTS] Route Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Server error processing TTS request' });
        }
    }
});

/**
 * Helper: Constructs a natural-sounding news script from the article data
 */
function constructNewsScript(article) {
    // 1. Clean up Markdown from commentary
    // Removes ##, **, etc. to make it readable text
    const cleanCommentary = (text) => {
        if (!text) return "";
        return text
            .replace(/#{1,6}\s?/g, '') // Remove headers
            .replace(/\*\*/g, '')      // Remove bold
            .replace(/\*/g, '')        // Remove italics/bullets
            .replace(/- /g, '')        // Remove list hyphens
            .replace(/\n\n/g, '. ');   // Replace double newlines with pauses
    };

    const sectionName = article.section ? article.section.charAt(0).toUpperCase() + article.section.slice(1) : 'News';

    // 2. Build the Script
    let script = `Here is the latest update from the ${sectionName} desk. `;
    script += `${article.title}. `; // Read Headline

    if (article.aiCommentary) {
        // If we have AI commentary, structure it nicely
        script += `Here is our detailed analysis. `;
        script += cleanCommentary(article.aiCommentary);
    } else if (article.abstract) {
        // Fallback to abstract
        script += article.abstract;
    }

    script += " That wraps up this report. Check back later for more updates. ";

    return script;
}



/**
 * @route GET /api/tts/test
 * @desc Test the TTS stream with static text
 */
router.get('/test', async (req, res) => {
    const text = "This is a test broadcast of the AI News Anchor system. If you can hear this, the streaming architecture is fully operational.";

    try {
        const { stream } = await ttsService.getTTSStream(text);
        res.setHeader('Content-Type', 'audio/mpeg');
        stream.pipe(res);
    } catch (error) {
        console.error('[TTS] Test endpoint error:', error.message);
        res.status(500).json({
            error: 'TTS test failed',
            details: error.message
        });
    }
});

/**
 * @route GET /api/tts/health
 * @desc Check TTS service health
 */
router.get('/health', async (req, res) => {
    try {
        // Quick test with minimal text
        const { stream } = await ttsService.getTTSStream('Test');

        // Consume the stream to verify it works
        let byteCount = 0;
        stream.on('data', (chunk) => { byteCount += chunk.length; });
        stream.on('end', () => {
            res.json({
                status: 'healthy',
                audioBytes: byteCount,
                message: 'TTS service is operational'
            });
        });
        stream.on('error', (err) => {
            res.status(500).json({
                status: 'unhealthy',
                error: err.message
            });
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

module.exports = router;
