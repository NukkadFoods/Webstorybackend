const axios = require('axios');

/**
 * Text-to-Speech Service using ElevenLabs API
 * Converts article text into AI-generated voice commentary
 */
class TextToSpeechService {
  constructor() {
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    
    // Predefined AI anchor voices for different genres
    this.anchorVoices = {
      politics: {
        voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam (serious, authoritative)
        name: 'Lena Cross',
        style: 'serious, urgent, deep tone'
      },
      technology: {
        voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella (energetic, clear)
        name: 'Kai Volt', 
        style: 'fast, energetic, futuristic'
      },
      sports: {
        voiceId: 'VR6AewLTigWG4xSOukaG', // Josh (dynamic, passionate)
        name: 'Rex Ball',
        style: 'loud, passionate, dynamic'
      },
      entertainment: {
        voiceId: 'jsCqWAovK2LkecY7zXl4', // Freya (upbeat, friendly)
        name: 'Zoe Glam',
        style: 'playful, gossipy, upbeat'
      },
      business: {
        voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam (professional)
        name: 'Marcus Stone',
        style: 'confident, professional, analytical'
      }
    };
  }

  /**
   * Generate AI commentary script for an article
   * @param {Object} article - Article object with title, abstract, section
   * @returns {Promise<string>} Generated script
   */
  async generateCommentaryScript(article) {
    try {
      const prompt = `
Act as a charismatic news anchor with 20 years of experience. Write a 30-second broadcast script for the following headline:

Title: "${article.title}"
Summary: "${article.abstract}"
Section: "${article.section}"

Include:
- A strong, attention-grabbing opening line
- 1-2 sentence summary of the key facts
- One surprising insight or expert perspective
- End with a thought-provoking question for the audience

Tone: Engaging, authoritative, slightly dramatic — perfect for a news commentary.
Keep it conversational and under 150 words.
`;

      // Use Groq API for script generation (you'll need to add this)
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: 'You are an expert news broadcaster and script writer.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating script:', error.message);
      // Fallback script
      return `Breaking news: ${article.title}. ${article.abstract} What does this mean for you? Let's discuss.`;
    }
  }

  /**
   * Convert text to speech using ElevenLabs
   * @param {string} text - Text to convert
   * @param {string} section - Article section to determine voice
   * @returns {Promise<Buffer>} Audio buffer
   */
  async textToSpeech(text, section = 'general') {
    try {
      if (!this.elevenLabsApiKey) {
        throw new Error('ElevenLabs API key not configured');
      }

      // Map article section to anchor voice
      const sectionMap = {
        'politics': 'politics',
        'us': 'politics', 
        'world': 'politics',
        'technology': 'technology',
        'tech': 'technology',
        'sports': 'sports',
        'entertainment': 'entertainment',
        'arts': 'entertainment',
        'business': 'business',
        'economy': 'business'
      };

      const genre = sectionMap[section.toLowerCase()] || 'politics';
      const voice = this.anchorVoices[genre];

      console.log(`🎙️ Using ${voice.name} (${voice.style}) for ${section} article`);

      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${voice.voiceId}`,
        {
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.elevenLabsApiKey
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error in text-to-speech:', error.message);
      throw error;
    }
  }

  /**
   * Generate full audio commentary for an article
   * @param {Object} article - Article object
   * @returns {Promise<{script: string, audioBuffer: Buffer, anchor: Object}>}
   */
  async generateAudioCommentary(article) {
    try {
      console.log(`🎬 Generating audio commentary for: ${article.title.substring(0, 50)}...`);
      
      // Step 1: Generate script
      const script = await this.generateCommentaryScript(article);
      console.log(`📝 Generated script (${script.length} chars)`);

      // Step 2: Convert to speech
      const audioBuffer = await this.textToSpeech(script, article.section);
      console.log(`🔊 Generated audio (${audioBuffer.length} bytes)`);

      // Step 3: Get anchor info
      const sectionMap = {
        'politics': 'politics', 'us': 'politics', 'world': 'politics',
        'technology': 'technology', 'tech': 'technology',
        'sports': 'sports', 'entertainment': 'entertainment', 'arts': 'entertainment',
        'business': 'business', 'economy': 'business'
      };
      const genre = sectionMap[article.section?.toLowerCase()] || 'politics';
      const anchor = this.anchorVoices[genre];

      return {
        script,
        audioBuffer,
        anchor: {
          name: anchor.name,
          style: anchor.style,
          genre
        },
        duration: Math.ceil(script.length / 12), // Rough estimate: 12 chars per second
        articleId: article.id || article._id
      };
    } catch (error) {
      console.error('Error generating audio commentary:', error);
      throw error;
    }
  }

  /**
   * Get available anchor voices
   * @returns {Object} Available anchors by genre
   */
  getAvailableAnchors() {
    return Object.entries(this.anchorVoices).map(([genre, voice]) => ({
      genre,
      name: voice.name,
      style: voice.style
    }));
  }
}

module.exports = new TextToSpeechService();
