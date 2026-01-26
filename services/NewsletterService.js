const nodemailer = require('nodemailer');
const Subscriber = require('../models/Subscriber');
const { v4: uuidv4 } = require('uuid');

class NewsletterService {
  constructor() {
    // Configure email transporter
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'forexyynewsletter@gmail.com',
        pass: process.env.EMAIL_APP_PASSWORD // App password from Gmail 2FA
      }
    });

    // Verify connection configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email transporter error:', error);
      } else if (success) {
        // console.log('✅ Email transporter is ready to send emails');
      }
    });

    // Domain-specific reporters
    this.aiReporters = [
      { name: 'James Wilson', title: 'Senior Political Reporter', location: 'Forexyy Newsletter, Washington DC', section: 'politics', expertise: 'Congressional Affairs & Federal Policy' },
      { name: 'Sarah Peterson', title: 'Chief Business Reporter', location: 'Forexyy Newsletter, New York', section: 'business', expertise: 'Corporate Strategy & Market Analysis' },
      { name: 'Robert Chen', title: 'Wall Street Reporter', location: 'Forexyy Newsletter, New York', section: 'finance', expertise: 'Stock Market & Investment Banking' },
      { name: 'David Rodriguez', title: 'Economics Reporter', location: 'Forexyy Newsletter, Chicago', section: 'economics', expertise: 'Economic Policy & Market Trends' },
      { name: 'Michael Chen', title: 'Chief Technology Reporter', location: 'Forexyy Newsletter, San Francisco', section: 'technology', expertise: 'Tech Innovation & Silicon Valley' },
      { name: 'Jennifer Kim', title: 'Science Reporter', location: 'Forexyy Newsletter, Boston', section: 'science', expertise: 'Research & Innovation' },
      { name: 'Alexandra Rivers', title: 'Senior Entertainment Reporter', location: 'Forexyy Newsletter, Los Angeles', section: 'entertainment', expertise: 'Hollywood & Celebrity News' },
      { name: 'Lisa Chen', title: 'Arts & Culture Reporter', location: 'Forexyy Newsletter, New York', section: 'arts', expertise: 'Arts & Cultural Trends' },
      { name: 'Marcus Johnson', title: 'Senior Sports Reporter', location: 'Forexyy Newsletter, Chicago', section: 'sports', expertise: 'Professional Sports & Athletics' },
      { name: 'Dr. Rachel Martinez', title: 'Health & Science Reporter', location: 'Forexyy Newsletter, Boston', section: 'health', expertise: 'Medical Research & Healthcare Policy' },
      { name: 'Christopher Lee', title: 'US Political Reporter', location: 'Forexyy Newsletter, Washington DC', section: 'us', expertise: 'Domestic Policy & National Politics' },
      { name: 'Sophia Abbas', title: 'Foreign Affairs Reporter', location: 'Forexyy Newsletter, International', section: 'world', expertise: 'Diplomatic Relations & World Politics' },
      { name: 'Emma Thompson', title: 'Breaking News Reporter', location: 'Forexyy Newsletter, National', section: 'general', expertise: 'Breaking News & National Events' },
    ];
  }

  // Get domain-specific reporter for newsletter content
  getReporterForSection(section) {
    const normalizedSection = section ? section.toLowerCase() : 'general';
    const sectionReporters = this.aiReporters.filter(r => r.section === normalizedSection);

    if (sectionReporters.length > 0) {
      return sectionReporters[Math.floor(Math.random() * sectionReporters.length)];
    }

    // Fallback to general reporter
    return this.aiReporters.find(r => r.section === 'general') || this.aiReporters[0];
  }

  getCurrentHour() {
    // Get current hour in GMT timezone
    const now = new Date();
    return now.getUTCHours();
  }

  generateNewsletterTemplate(articles, subscriber) {
    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Add unique timestamp and ID to prevent email threading
    const timestamp = new Date().toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const uniqueId = Math.random().toString(36).substring(2, 8);

    const featuredArticle = articles[0];
    const primarySection = subscriber.preferences?.genres?.[0] || 'business';
    const leadReporter = this.getReporterForSection(primarySection);

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Forexyy Newsletter</title>
        <style>
            body { 
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
                background-color: #f5f5f5; 
                margin: 0; 
                padding: 0; 
            }
            .preview-text {
                display: none !important;
                font-size: 1px;
                color: transparent;
                line-height: 1px;
                max-height: 0px;
                max-width: 0px;
                opacity: 0;
                overflow: hidden;
            }
            .email-container { 
                max-width: 600px; 
                margin: 0 auto; 
                background-color: #ffffff; 
                border-radius: 12px; 
                overflow: hidden; 
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); 
            }
            .header-gradient { 
                background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); 
                color: white; 
                padding: 24px; 
            }
            .news-card { 
                border: 1px solid #e5e7eb; 
                border-radius: 8px; 
                margin-bottom: 16px; 
                overflow: hidden; 
                transition: all 0.3s ease; 
            }
            .btn-primary { 
                background-color: #2563eb; 
                color: white; 
                padding: 12px 24px; 
                border-radius: 6px; 
                text-decoration: none; 
                display: inline-block; 
                font-weight: 600; 
                transition: all 0.3s ease; 
            }
            .btn-primary:hover { 
                background-color: #1d4ed8; 
            }
            @media (max-width: 640px) {
                .email-container { 
                    margin: 0 16px; 
                }
                .header-gradient, .content { 
                    padding: 16px; 
                }
            }
        </style>
    </head>
    <body>
        <!-- Preview Text for Email Clients -->
        <div class="preview-text">
            ${featuredArticle ?
        `🔥 ${featuredArticle.title.substring(0, 100)}... Expert analysis inside. Don't miss this breaking update from Forexyy's professional team.` :
        '🔥 Breaking market analysis and expert insights from Forexyy\'s professional team. Critical updates you need to know today.'
      }
            <!-- Hide rest of email from preview -->
            &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847; &#847;
        </div>
        
        <div style="padding: 20px;">
            <div class="email-container">
                <!-- Header -->
                <div class="header-gradient">
                    <div style="display: flex; align-items: center; margin-bottom: 16px;">
                        <div style="background-color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                            <span style="color: #2563eb; font-size: 20px; font-weight: bold;">F</span>
                        </div>
                        <h1 style="margin: 0; font-size: 24px;">Forexyy Newsletter</h1>
                    </div>
                    <h2 style="margin: 0; font-size: 28px; font-weight: bold;">Expert Market Analysis & Insights</h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.9;">Hi ${subscriber.name}, breaking news and analysis from ${leadReporter.name}</p>
                </div>
                
                <!-- Date & Info -->
                <div style="background-color: #eff6ff; padding: 16px; border-bottom: 1px solid #dbeafe;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px;">
                        <span style="color: #1e40af; font-weight: 600;">📅 ${currentDate}</span>
                        <span style="color: #2563eb;">Edition #${uniqueId}</span>
                    </div>
                    <div style="margin: 8px 0 0 0; font-size: 12px; color: #4338ca;">
                        <span>📍 Delivered: ${timestamp}</span>
                        <span style="margin-left: 16px;">🎯 Personalized for ${subscriber.name}</span>
                    </div>
                    <p style="color: #1e3a8a; margin: 8px 0 0 0; font-size: 14px;">Professional analysis and key insights from our expert team covering: ${subscriber.preferences.genres.join(', ')}</p>
                    <!-- Unique content identifier to prevent threading -->
                    <div style="display: none;">${uuidv4()}</div>
                </div>
                
                <!-- Main Content -->
                <div style="padding: 24px;">
                    ${featuredArticle ? `
                    <!-- Featured Story -->
                    <div class="news-card" style="margin-bottom: 24px;">
                        <div style="padding: 20px;">
                            <span style="background-color: #2563eb; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">FEATURED</span>
                            <h3 style="margin: 12px 0; font-size: 22px; font-weight: bold; color: #111827; line-height: 1.3;">${featuredArticle.title}</h3>
                            <p style="color: #6b7280; margin: 12px 0; line-height: 1.6;">${featuredArticle.summary || featuredArticle.abstract}</p>
                            ${featuredArticle.aiCommentary ? `
                            <div style="background-color: #f0f9ff; border-left: 4px solid #2563eb; padding: 12px; margin: 12px 0; border-radius: 4px;">
                                <p style="color: #1e40af; font-style: italic; margin: 0; font-size: 14px;">
                                    <strong>Expert Analysis by ${this.getReporterForSection(featuredArticle.section || primarySection).name}:</strong> ${featuredArticle.aiCommentary.substring(0, 150)}...
                                </p>
                            </div>
                            ` : ''}
                            <div style="margin: 16px 0;">
                                <a href="https://www.forexyy.com/article/${encodeURIComponent(featuredArticle.id)}" class="btn-primary" style="margin-right: 12px;">
                                    Read Full Analysis on Forexyy.com →
                                </a>
                            </div>
                            <div style="font-size: 12px; color: #6b7280; margin-top: 12px;">
                                <span style="font-weight: 600;">${this.getReporterForSection(featuredArticle.section || primarySection).name}</span> • ${this.getReporterForSection(featuredArticle.section || primarySection).title} • ${this.getReporterForSection(featuredArticle.section || primarySection).location}
                            </div>
                        </div>
                    </div>
                    ` : ''}
                    
                    <!-- Additional Articles -->
                    ${articles.slice(1, 4).map(article => `
                    <div class="news-card">
                        <div style="padding: 16px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #111827;">${article.title}</h4>
                            <p style="color: #6b7280; margin: 8px 0; font-size: 14px; line-height: 1.5;">${(article.summary || article.abstract || '').substring(0, 120)}...</p>
                            <div style="margin: 12px 0;">
                                <a href="https://www.forexyy.com/article/${encodeURIComponent(article.id)}" style="color: #2563eb; text-decoration: none; font-weight: 500; font-size: 14px;">
                                    Read Analysis →
                                </a>
                            </div>
                            <div style="font-size: 11px; color: #6b7280;">
                                <span style="font-weight: 600;">${this.getReporterForSection(article.section || primarySection).name}</span> • ${this.getReporterForSection(article.section || primarySection).title}
                            </div>
                        </div>
                    </div>
                    `).join('')}
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 14px; margin: 0 0 12px 0;">
                        <strong>Forexyy Newsletter</strong> • Expert Analysis & Insights • Powered by Professional Journalism
                    </p>
                    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                        You're receiving this because you subscribed to Forexyy Newsletter. 
                        <a href="https://www.forexyy.com/unsubscribe?token=${subscriber.unsubscribeToken}" style="color: #6b7280;">Unsubscribe</a>
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  // Send newsletter to a single subscriber
  async sendNewsletterToSubscriber(subscriber) {
    try {
      // console.log(`📧 Preparing newsletter for ${subscriber.email}`);

      // Get fresh articles for this subscriber
      const articles = await this.getFreshArticles(subscriber);

      if (articles.length === 0) {
        // console.log(`⚠️ No new articles found for ${subscriber.email}, skipping...`);
        // console.log(`📊 Subscriber preferences:`, subscriber.preferences?.genres || 'none');
        // console.log(`📊 Recent sent articles count:`, subscriber.sentArticleIds?.length || 0);
        return { success: false, reason: 'No new articles available' };
      }

      // console.log(`✅ Found ${articles.length} articles for ${subscriber.email}:`, articles.map(a => a.title?.substring(0, 50) + '...'));

      // Generate newsletter HTML
      const newsletterHtml = this.generateNewsletterTemplate(articles, subscriber);

      // Create unique message ID to prevent duplicates and threading
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const messageId = `newsletter-${timestamp}-${randomId}@forexyy.com`;

      // Generate compelling subject with featured headline
      const dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      // Use the featured article headline for urgency and appeal
      const featuredArticle = articles[0];
      let headlinePreview = '';

      if (featuredArticle && featuredArticle.title) {
        // Truncate headline if too long for subject line
        const maxHeadlineLength = 60;
        headlinePreview = featuredArticle.title.length > maxHeadlineLength
          ? featuredArticle.title.substring(0, maxHeadlineLength) + '...'
          : featuredArticle.title;
      }

      // Create compelling subject line with headline and Forexyy branding
      const uniqueSubject = headlinePreview
        ? `� ${headlinePreview} | Forexyy ${dateStr}`
        : `📈 Breaking: Market Analysis & Insights | Forexyy ${dateStr}`;

      const mailOptions = {
        from: `"Forexyy Breaking News" <${process.env.GMAIL_USER}>`,
        to: subscriber.email,
        subject: uniqueSubject,
        html: newsletterHtml,
        headers: {
          'Message-ID': messageId,
          'X-Newsletter-Type': 'scheduled',
          'X-Subscriber-ID': subscriber._id || subscriber.email,
          // Anti-threading headers
          'References': undefined,
          'In-Reply-To': undefined,
          'Thread-Topic': undefined,
          'Thread-Index': undefined,
          // Ensure each email is treated as a new conversation
          'X-No-Threading': 'true',
          'X-Thread-Prevention': messageId,
          // Additional headers to prevent grouping
          'List-Unsubscribe': `<https://forexyy.com/unsubscribe?token=${subscriber.unsubscribeToken}>`,
          'List-ID': `Forexyy Newsletter <newsletter.forexyy.com>`,
          'List-Post': 'NO',
          'List-Archive': 'NO'
        }
      };

      // Send email
      let info;
      try {
        info = await this.transporter.sendMail(mailOptions);
        // console.log(`✅ Newsletter sent to ${subscriber.email}:`, info.messageId);
      } catch (sendError) {
        console.error(`❌ SMTP Error for ${subscriber.email}:`, {
          message: sendError.message,
          code: sendError.code,
          response: sendError.response
        });
        throw sendError;
      }

      // Update subscriber's sent articles list and newsletter history
      try {
        if (subscriber._id) {
          const Subscriber = require('../models/Subscriber');
          const articleIds = articles.map(article => article.id);

          // Generate unique newsletter ID
          const newsletterId = `newsletter_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

          await Subscriber.findByIdAndUpdate(
            subscriber._id,
            {
              $addToSet: {
                sentArticleIds: { $each: articleIds }
              },
              $push: {
                newsletterHistory: {
                  newsletterId: newsletterId,
                  sentAt: new Date(),
                  articlesCount: articles.length,
                  status: 'sent'
                }
              },
              lastNewsletterSent: new Date()
            }
          );

          // console.log(`📝 Updated sent articles and newsletter history for ${subscriber.email}: Newsletter ID ${newsletterId}, ${articleIds.length} articles tracked`);
        }
      } catch (updateError) {
        console.error(`⚠️ Failed to update sent articles for ${subscriber.email}:`, updateError.message);
        // Don't fail the newsletter send if tracking update fails
      }

      return {
        success: true,
        messageId: info.messageId,
        articlesCount: articles.length,
        articles: articles // Include articles in response for tracking
      };

    } catch (error) {
      console.error(`❌ Failed to send newsletter to ${subscriber.email}:`, error);

      // Track failed newsletter attempt
      try {
        if (subscriber._id) {
          const Subscriber = require('../models/Subscriber');
          const newsletterId = `newsletter_failed_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

          await Subscriber.findByIdAndUpdate(
            subscriber._id,
            {
              $push: {
                newsletterHistory: {
                  newsletterId: newsletterId,
                  sentAt: new Date(),
                  articlesCount: 0,
                  status: 'failed',
                  errorMessage: error.message
                }
              }
            }
          );

          // console.log(`📝 Tracked failed newsletter attempt for ${subscriber.email}: Newsletter ID ${newsletterId}`);
        }
      } catch (trackError) {
        console.error(`⚠️ Failed to track error for ${subscriber.email}:`, trackError.message);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get fresh articles for subscriber based on preferences
  async getFreshArticles(subscriber, limit = 3) {
    try {
      // Import database articleService for direct database queries
      const dbArticleService = require('./db/articleService');

      // Get subscriber's preferred categories or use defaults
      const preferredCategories = subscriber.preferences?.genres || ['business', 'politics', 'technology'];

      // Get fresh articles from the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let articles = [];

      // Fetch articles from each preferred category using database service
      for (const category of preferredCategories) {
        try {
          // console.log(`📰 Fetching articles for category: ${category}`);
          const categoryArticles = await dbArticleService.getArticlesBySection(category, 10);

          // Filter out articles already sent to this subscriber (only check last 50 sent articles to allow re-sending older content)
          const newArticles = categoryArticles.filter(article => {
            if (!subscriber.sentArticleIds || !Array.isArray(subscriber.sentArticleIds)) {
              return true;
            }
            // Only check the most recent 50 sent articles to allow re-sending older popular content
            const recentSentIds = subscriber.sentArticleIds.slice(-50);
            return !recentSentIds.includes(article.id || article._id);
          });

          // console.log(`📰 Found ${newArticles.length} new articles in ${category} (filtered out ${categoryArticles.length - newArticles.length} recent articles)`);
          articles = articles.concat(newArticles);

          if (articles.length >= limit * 2) break; // Get extra articles for selection
        } catch (categoryError) {
          // console.log(`⚠️ Could not fetch articles for category ${category}:`, categoryError.message);
        }
      }

      // If we don't have enough articles from preferred categories, get general news
      if (articles.length < limit) {
        try {
          // console.log(`📰 Fetching general articles (current count: ${articles.length})`);
          const generalArticles = await dbArticleService.getAllArticles(10, 0);
          const newGeneralArticles = generalArticles.filter(article => {
            if (!subscriber.sentArticleIds || !Array.isArray(subscriber.sentArticleIds)) {
              return true;
            }
            // Only check the most recent 50 sent articles to allow re-sending older popular content
            const recentSentIds = subscriber.sentArticleIds.slice(-50);
            return !recentSentIds.includes(article.id || article._id);
          });
          // console.log(`📰 Found ${newGeneralArticles.length} new general articles`);
          articles = articles.concat(newGeneralArticles);
        } catch (generalError) {
          // console.log('⚠️ Could not fetch general articles:', generalError.message);
        }
      }

      // Remove duplicates based on article ID
      const uniqueArticles = articles.filter((article, index, self) =>
        index === self.findIndex(a => (a.id || a._id) === (article.id || article._id))
      );

      // console.log(`📰 Found ${uniqueArticles.length} unique fresh articles for ${subscriber.email} (filtered out ${subscriber.sentArticleIds?.length || 0} recent articles)`);

      // Sort by publication date (newest first) and return requested number
      const selectedArticles = uniqueArticles
        .sort((a, b) => new Date(b.publishedDate || b.publishedAt || b.published_date) - new Date(a.publishedDate || a.publishedAt || a.published_date))
        .slice(0, limit);

      return selectedArticles;

    } catch (error) {
      console.error('❌ Error fetching fresh articles:', error);

      // Fallback: return sample articles if real article service fails
      // console.log('🔄 Using fallback sample articles');
      const fallbackArticles = [
        {
          id: `fallback-${Date.now()}-1`,
          title: "Market Analysis: Key Economic Indicators to Watch",
          summary: "Financial experts analyze the latest economic data and what it means for investors and market participants.",
          abstract: "Comprehensive analysis of current market conditions and economic indicators affecting global markets.",
          section: "business",
          publishedDate: new Date().toISOString(),
          source: "Forexyy Analysis Team"
        },
        {
          id: `fallback-${Date.now()}-2`,
          title: "Technology Sector Update: Innovation and Investment Trends",
          summary: "Latest developments in technology markets with insights into emerging trends and investment opportunities.",
          abstract: "Expert analysis of technology sector performance and future outlook for investors.",
          section: "technology",
          publishedDate: new Date().toISOString(),
          source: "Forexyy Analysis Team"
        },
        {
          id: `fallback-${Date.now()}-3`,
          title: "Global Markets Overview: International Trade and Policy",
          summary: "Comprehensive review of international market conditions and policy impacts on global trade.",
          abstract: "Analysis of global economic conditions and their effects on international markets.",
          section: "world",
          publishedDate: new Date().toISOString(),
          source: "Forexyy Analysis Team"
        }
      ];

      return fallbackArticles.slice(0, limit);
    }
  } async sendScheduledNewsletter() {
    try {
      // Get all active subscribers
      const subscribers = await Subscriber.find({ isActive: true });
      // console.log(`📧 Starting newsletter send to ${subscribers.length} subscribers`);

      const results = [];
      for (const subscriber of subscribers) {
        // Get fresh articles for this subscriber
        const articles = await this.getFreshArticles(subscriber, 4);

        if (articles.length > 0) {
          const result = await this.sendNewsletterToSubscriber(subscriber, articles);
          results.push({ subscriber: subscriber.email, ...result });

          // Add small delay between sends to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      // console.log(`📈 Newsletter batch complete: ${successful} sent, ${failed} failed`);
      return { successful, failed, results };
    } catch (error) {
      console.error('❌ Error sending scheduled newsletter:', error);
      return { successful: 0, failed: 0, error: error.message };
    }
  }
}

module.exports = NewsletterService;
