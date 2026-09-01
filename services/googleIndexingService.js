/**
 * Dynamic Google Indexing Service
 * Automatically notifies Google Indexing API (URL_UPDATED) whenever new articles are published or updated
 */
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

class GoogleIndexingService {
  constructor() {
    this.token = null;
    this.tokenExpiry = 0;
    this.rateLimitDelay = 250; // ms between requests
    this.isProcessing = false;
    this.queue = [];
  }

  base64UrlEncode(str) {
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  getCredentials() {
    // 1. Check environment variable (Base64 encoded JSON)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
      try {
        const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
        return JSON.parse(decoded);
      } catch (e) {
        console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_BASE64:', e.message);
      }
    }

    // 2. Check direct JSON environment variable
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      } catch (e) {
        console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', e.message);
      }
    }

    // 3. Check local file paths
    const localPaths = [
      '/Users/ajaytiwari/Downloads/deploymate-507121-02865c36d808.json',
      './config/google-service-account.json',
      '../config/google-service-account.json'
    ];

    for (const p of localPaths) {
      try {
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch (e) {
        // Continue to next path
      }
    }

    return null;
  }

  getAccessToken() {
    return new Promise((resolve) => {
      const now = Math.floor(Date.now() / 1000);
      if (this.token && this.tokenExpiry > now + 60) {
        return resolve(this.token);
      }

      const serviceAccount = this.getCredentials();
      if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
        return resolve(null);
      }

      try {
        const header = { alg: 'RS256', typ: 'JWT' };
        const claimSet = {
          iss: serviceAccount.client_email,
          scope: 'https://www.googleapis.com/auth/indexing',
          aud: 'https://oauth2.googleapis.com/token',
          exp: now + 3600,
          iat: now
        };

        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedClaimSet = this.base64UrlEncode(JSON.stringify(claimSet));
        const signInput = `${encodedHeader}.${encodedClaimSet}`;

        const signer = crypto.createSign('RSA-SHA256');
        signer.update(signInput);
        const signature = this.base64UrlEncode(signer.sign(serviceAccount.private_key));
        const jwt = `${signInput}.${signature}`;

        const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

        const req = https.request('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (json.access_token) {
                this.token = json.access_token;
                this.tokenExpiry = now + (json.expires_in || 3600);
                resolve(this.token);
              } else {
                resolve(null);
              }
            } catch (e) {
              resolve(null);
            }
          });
        });

        req.on('error', () => resolve(null));
        req.write(postData);
        req.end();
      } catch (err) {
        resolve(null);
      }
    });
  }

  generateArticleUrl(article) {
    if (!article) return null;
    let slug = '';
    if (article.url) {
      slug = article.url.split('/').pop().replace(/\.html?$/, '');
    }
    if (!slug && article.title) {
      slug = article.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 80);
    }
    return slug ? `https://forexyy.com/article/${slug}` : null;
  }

  async publishUrl(url) {
    const token = await this.getAccessToken();
    if (!token) return { success: false, reason: 'No Google credentials found' };

    return new Promise((resolve) => {
      const postData = JSON.stringify({
        url: url,
        type: 'URL_UPDATED'
      });

      const req = https.request({
        hostname: 'indexing.googleapis.com',
        path: '/v3/urlNotifications:publish',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.urlNotificationMetadata) {
              resolve({ success: true, url: url });
            } else {
              resolve({ success: false, error: json.error?.message || body });
            }
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
        });
      });

      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.write(postData);
      req.end();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const url = this.queue.shift();
      try {
        const result = await this.publishUrl(url);
        if (result.success) {
          console.log(`🚀 [Dynamic Indexing] Submitted to Googlebot: ${url}`);
        } else if (result.error && !result.error.includes('Quota exceeded')) {
          console.log(`ℹ️ [Dynamic Indexing] ${url}: ${result.error}`);
        }
      } catch (err) {
        // Fail silently to never block main app flow
      }

      await new Promise(r => setTimeout(r, this.rateLimitDelay));
    }

    this.isProcessing = false;
  }

  /**
   * Queue articles for dynamic indexing
   * @param {Array<Object>|Object} articles - Single article or list of articles
   */
  queueArticlesForIndexing(articles) {
    const list = Array.isArray(articles) ? articles : [articles];
    for (const art of list) {
      const url = this.generateArticleUrl(art);
      if (url && !this.queue.includes(url)) {
        this.queue.push(url);
      }
    }

    // Trigger async processing
    this.processQueue().catch(() => {});
  }
}

module.exports = new GoogleIndexingService();
