const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { PassThrough } = require('stream');

class TTSService {
    constructor() {
        this.scriptPath = path.join(__dirname, '../scripts/tts_stream.py');
        // Use 'python3' from PATH for better portability across systems
        this.pythonPath = process.env.PYTHON_PATH || 'python3';
    }

    /**
     * Spawns a Python process to generate TTS audio and returns a stream.
     * @param {string} text - The text to convert to speech.
     * @param {string} [voice='en-US-AriaNeural'] - The voice to use.
     * @returns {Promise<{stream: import('stream').Readable, process: ChildProcess}>}
     */
    async getTTSStream(text, voice = 'en-US-AriaNeural') {
        if (!text) {
            throw new Error('Text is required for TTS generation');
        }

        // Check if script exists
        if (!fs.existsSync(this.scriptPath)) {
            console.error(`TTS Script not found at: ${this.scriptPath}`);
            throw new Error('TTS script not found');
        }

        return new Promise((resolve, reject) => {
            const outputStream = new PassThrough();
            let hasReceivedData = false;
            let stderrOutput = '';

            const pythonProcess = spawn(this.pythonPath, [
                this.scriptPath,
                '--text', text,
                '--voice', voice
            ]);

            // Collect stderr for error reporting
            pythonProcess.stderr.on('data', (data) => {
                stderrOutput += data.toString();
                console.error(`TTS Python Error: ${data.toString()}`);
            });

            pythonProcess.stdout.on('data', (chunk) => {
                hasReceivedData = true;
                outputStream.write(chunk);
            });

            pythonProcess.stdout.on('end', () => {
                outputStream.end();
            });

            pythonProcess.on('error', (err) => {
                console.error('Failed to start TTS process:', err);
                reject(new Error(`Failed to start Python: ${err.message}`));
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0 && !hasReceivedData) {
                    const errorMsg = stderrOutput || `Process exited with code ${code}`;
                    reject(new Error(`TTS generation failed: ${errorMsg}`));
                }
            });

            // Give the process a moment to start and potentially fail
            setTimeout(() => {
                if (!pythonProcess.killed) {
                    resolve({ stream: outputStream, process: pythonProcess });
                }
            }, 100);
        });
    }

    /**
     * Legacy method for backwards compatibility
     * @deprecated Use getTTSStream instead
     */
    getTxStream(text, voice = 'en-US-AriaNeural') {
        if (!text) {
            throw new Error('Text is required for TTS generation');
        }

        if (!fs.existsSync(this.scriptPath)) {
            console.error(`TTS Script not found at: ${this.scriptPath}`);
            throw new Error('TTS Service configuration error');
        }

        const pythonProcess = spawn(this.pythonPath, [
            this.scriptPath,
            '--text', text,
            '--voice', voice
        ]);

        pythonProcess.stderr.on('data', (data) => {
            console.error(`TTS Python Error: ${data.toString()}`);
        });

        pythonProcess.on('error', (err) => {
            console.error('Failed to start TTS process:', err);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.warn(`TTS process exited with code ${code}`);
            }
        });

        return pythonProcess.stdout;
    }
}

module.exports = new TTSService();
