const nodemailer = require('nodemailer');
const Subscriber = require('../models/Subscriber');
const { v4: uuidv4 } = require('uuid');

class NewsletterService {
  constructor() {
    // Configure email transporter
    this.transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'forexyynewsletter@gmail.com',
        pass: process.env.EMAIL_APP_PASSWORD // App password from Gmail 2FA
      }
    });
    
    this.workingHours = {
      start: 9, // 9 AM
      end: 21,  // 9 PM
      timezone: 'America/New_York'
    };
    
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
    const now = new Date();
    return now.getHours();
  }

  isWorkingHours() {
    const currentHour = this.getCurrentHour();
    return currentHour >= this.workingHours.start && currentHour < this.workingHours.end;
  }

  generateNewsletterTemplate(articles, subscriber) {
    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

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
                    <p style="margin: 8px 0 0 0; opacity: 0.9;">Hi ${subscriber.name}, here's what's happening with expert analysis from ${leadReporter.name}</p>
                </div>
                
                <!-- Date & Info -->
                <div style="background-color: #eff6ff; padding: 16px; border-bottom: 1px solid #dbeafe;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px;">
                        <span style="color: #1e40af; font-weight: 600;">📅 ${currentDate}</span>
                        <span style="color: #2563eb;">Issue #${Math.floor(Date.now() / 1000).toString().slice(-6)}</span>
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

  // Send newsletter to subscriber
  async sendNewsletterToSubscriber(subscriber, articles) {
    try {
      const htmlContent = this.generateNewsletterTemplate(articles, subscriber);
      
      // Generate unique subject line with multiple variations to prevent threading
      const currentTime = new Date();
      const timeStamp = currentTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/New_York'
      });
      
      // Array of dynamic subject line variations (removed AI references)
      const subjectVariations = [
        `📈 ${timeStamp} Market Alert - Breaking Analysis`,
        `🔥 ${timeStamp} Trading Update - Expert Insights`,
        `⚡ ${timeStamp} News Brief - Professional Analysis`,
        `📊 ${timeStamp} Market Pulse - Key Developments`,
        `🎯 ${timeStamp} Investment Watch - Latest Reports`,
        `💡 ${timeStamp} Financial Brief - Smart Analysis`,
        `🚀 ${timeStamp} Market Focus - Breaking Updates`
      ];
      
      // Use time-based selection for consistency but variety
      const subjectIndex = Math.floor(currentTime.getMinutes() / 10) % subjectVariations.length;
      const dynamicSubject = subjectVariations[subjectIndex];
      
      // Generate unique Message-ID to prevent threading
      const uniqueMessageId = `<${uuidv4()}.${Date.now()}@forexyy.com>`;
      
      const mailOptions = {
        from: {
          name: 'Forexyy Newsletter',
          address: process.env.EMAIL_USER || 'forexyynewsletter@gmail.com'
        },
        to: subscriber.email,
        subject: dynamicSubject,
        html: htmlContent,
        headers: {
          // Unique Message-ID prevents email threading
          'Message-ID': uniqueMessageId,
          // Custom headers to ensure emails are treated separately
          'X-Mailer': 'Forexyy-Newsletter-System',
          'X-Newsletter-ID': uuidv4(),
          'X-Send-Time': currentTime.toISOString(),
          // List headers for better email client handling
          'List-ID': 'Forexyy Newsletter <newsletter@forexyy.com>',
          'List-Unsubscribe': `<https://www.forexyy.com/unsubscribe?token=${subscriber.unsubscribeToken}>`,
          // Prevent auto-threading by adding unique references
          'References': uniqueMessageId,
          'In-Reply-To': null // Explicitly set to null to prevent threading
        }
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Update subscriber's last email sent time and add article IDs to sent list
      const articleIds = articles.map(a => a.id);
      if (subscriber._id) {
        await Subscriber.findByIdAndUpdate(subscriber._id, {
          lastEmailSent: new Date(),
          $addToSet: { sentArticleIds: { $each: articleIds } }
        });
      }

      console.log(`✅ Newsletter sent to ${subscriber.email} with subject: ${dynamicSubject}`);
      return { 
        success: true, 
        messageId: result.messageId,
        subject: dynamicSubject,
        uniqueId: uniqueMessageId
      };
    } catch (error) {
      console.error(`❌ Failed to send newsletter to ${subscriber.email}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Get fresh articles for subscriber based on preferences
  async getFreshArticles(subscriber, limit = 3) {
    try {
      // This would integrate with your article fetching system
      // For now, returning sample articles
      const articles = [
        {
          id: uuidv4(),
          title: "Federal Reserve Signals Potential Rate Cuts Amid Economic Uncertainty",
          summary: "The Federal Reserve indicated it may consider cutting interest rates in the coming months as economic indicators show mixed signals about inflation and growth.",
          category: "finance",
          publishedAt: new Date()
        },
        {
          id: uuidv4(),
          title: "Tech Stocks Rally as Investment Continues to Surge",
          summary: "Major technology companies saw significant gains today as investors remain optimistic about technological developments and their profit potential.",
          category: "technology",
          publishedAt: new Date()
        },
        {
          id: uuidv4(),
          title: "Global Markets React to Latest Economic Data",
          summary: "International markets showed mixed reactions to the latest economic indicators from major economies around the world.",
          category: "business",
          publishedAt: new Date()
        }
      ];

      return articles.slice(0, limit);
    } catch (error) {
      console.error('Error fetching fresh articles:', error);
      return [];
    }
  }

  async sendScheduledNewsletter() {
    try {
      // Get all active subscribers
      const subscribers = await Subscriber.find({ isActive: true });
      console.log(`📧 Starting newsletter send to ${subscribers.length} subscribers`);

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
      
      console.log(`📈 Newsletter batch complete: ${successful} sent, ${failed} failed`);
      return { successful, failed, results };
    } catch (error) {
      console.error('❌ Error sending scheduled newsletter:', error);
      return { successful: 0, failed: 0, error: error.message };
    }
  }
}

module.exports = new NewsletterService();
