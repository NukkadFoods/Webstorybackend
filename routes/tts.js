const express = require('express');
const router = express.Router();
const ttsService = require('../services/ttsService');
const Article = require('../models/article');

// Config
const DEFAULT_VOICE = 'en-US-AriaNeural';

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
