const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Subscriber = require('../models/Subscriber');
const AllUsers = require('../models/AllUsers');
const NewsletterHistory = require('../models/NewsletterHistory');
const NewsletterService = require('../services/NewsletterService');
const NewsletterScheduler = require('../services/NewsletterScheduler');

const router = express.Router();

// Email validation function
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// POST /api/newsletter/subscribe - Subscribe to newsletter with dual-collection system
router.post('/subscribe', async (req, res) => {
  try {
    const { email, name, preferences = {} } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    // Ensure database connection
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ Database not connected, attempting to connect...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database connection not available');
      }
    }

    // STEP 1: Handle AllUsers collection (permanent record)
    let allUser = await AllUsers.findOne({ email });
    if (allUser) {
      // Update existing user record
      await AllUsers.findByIdAndUpdate(allUser._id, {
        isCurrentlySubscribed: true,
        lastSubscriptionAt: new Date(),
        totalSubscriptions: allUser.totalSubscriptions + 1,
        $push: {
          subscriptionHistory: {
            action: 'subscribe',
            timestamp: new Date(),
            preferences: {
              genres: preferences.genres || ['politics', 'business', 'technology'],
              frequency: preferences.frequency || 'hourly'
            }
          }
        }
      });
      console.log(`✅ Updated AllUsers record for ${email}`);
    } else {
      // Create new user in AllUsers collection
      allUser = new AllUsers({
        email,
        name: name || 'Subscriber',
        firstSubscribedAt: new Date(),
        totalSubscriptions: 1,
        isCurrentlySubscribed: true,
        subscriptionHistory: [{
          action: 'subscribe',
          timestamp: new Date(),
          preferences: {
            genres: preferences.genres || ['politics', 'business', 'technology'],
            frequency: preferences.frequency || 'hourly'
          }
        }]
      });
      await allUser.save();
      console.log(`✅ Created new AllUsers record for ${email}`);
    }

    // STEP 2: Handle Subscribers collection (active subscribers only)
    const existingSubscriber = await Subscriber.findOne({ email });
    let currentSubscriber;
    
    if (existingSubscriber) {
      if (existingSubscriber.isActive) {
        return res.status(400).json({
          success: false,
          message: 'This email is already subscribed to our newsletter'
        });
      } else {
        // Reactivate if previously unsubscribed
        currentSubscriber = await Subscriber.findByIdAndUpdate(existingSubscriber._id, {
          isActive: true,
          subscribedAt: new Date(),
          preferences: {
            genres: preferences.genres || ['politics', 'business', 'technology'],
            frequency: preferences.frequency || 'hourly'
          }
        }, { new: true });
        console.log(`✅ Reactivated subscriber: ${email}`);
      }
    } else {
      // Create new active subscriber
      currentSubscriber = new Subscriber({
        email,
        name: name || 'Subscriber',
        preferences: {
          genres: preferences.genres || ['politics', 'business', 'technology'],
          frequency: preferences.frequency || 'hourly'
        },
        unsubscribeToken: uuidv4(),
        isActive: true
      });
      await currentSubscriber.save();
      console.log(`✅ Created new subscriber: ${email}`);
    }

    // STEP 3: Send welcome email with fresh news
    if (currentSubscriber) {
      try {
        // Get fresh articles for welcome email
        const { getAllArticles } = require('../services/db/articleService');
        let welcomeArticles = await getAllArticles(3, 0);
        
        if (!welcomeArticles || welcomeArticles.length === 0) {
          // Fallback welcome articles
          welcomeArticles = [{
            title: 'Welcome to Forexyy Newsletter!',
            abstract: 'Stay informed with expert analysis and breaking news delivered directly to your inbox every hour.',
            url: 'https://forexyy.com',
            section: 'welcome'
          }];
        }
        
        // Send welcome email
        await NewsletterService.sendNewsletterToSubscriber(currentSubscriber, welcomeArticles);
        console.log(`✅ Welcome email sent to ${email}`);
      } catch (emailError) {
        console.log(`⚠️ Welcome email failed for ${email}:`, emailError.message);
        // Don't fail the subscription if email fails
      }
    }

    res.json({
      success: true,
      message: 'Successfully subscribed to newsletter! You will receive fresh news each hour.',
      subscriber: { 
        email, 
        subscribedAt: new Date(),
        preferences: preferences.genres || ['politics', 'business', 'technology'],
        frequency: preferences.frequency || 'hourly'
      }
    });

  } catch (error) {
    console.error('❌ Newsletter subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to subscribe to newsletter. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/newsletter/unsubscribe - Unsubscribe from newsletter (dual-collection system)
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, token } = req.body;

    if (!email && !token) {
      return res.status(400).json({
        success: false,
        message: 'Email address or unsubscribe token is required'
      });
    }

    // Find subscriber by email or token
    const query = token ? { unsubscribeToken: token } : { email };
    const subscriber = await Subscriber.findOne(query);
    
    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }

    // STEP 1: Update AllUsers collection (keep permanent record)
    await AllUsers.findOneAndUpdate(
      { email: subscriber.email },
      {
        isCurrentlySubscribed: false,
        lastUnsubscribeAt: new Date(),
        $push: {
          subscriptionHistory: {
            action: 'unsubscribe',
            timestamp: new Date()
          }
        }
      }
    );
    console.log(`✅ Updated AllUsers record for unsubscribe: ${subscriber.email}`);

    // STEP 2: Remove from active Subscribers collection
    await Subscriber.findByIdAndDelete(subscriber._id);
    console.log(`✅ Removed from active subscribers: ${subscriber.email}`);

    res.json({
      success: true,
      message: 'Successfully unsubscribed from newsletter'
    });

  } catch (error) {
    console.error('❌ Newsletter unsubscribe error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unsubscribe. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/newsletter/stats - Get newsletter statistics
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await AllUsers.countDocuments();
    const activeSubscribers = await Subscriber.countDocuments({ isActive: true });
    const totalSubscribers = await AllUsers.countDocuments({ isCurrentlySubscribed: true });
    
    res.json({
      totalUsers,
      activeSubscribers,
      totalSubscribers,
      unsubscribed: totalUsers - totalSubscribers
    });
  } catch (error) {
    console.error('❌ Newsletter stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get newsletter statistics'
    });
  }
});

// POST /api/newsletter/send-test - Send test newsletter (manual trigger)
router.post('/send-test', async (req, res) => {
  try {
    await NewsletterScheduler.sendTestNewsletter();
    
    res.json({
      success: true,
      message: 'Test newsletter triggered successfully'
    });
  } catch (error) {
    console.error('❌ Test newsletter error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test newsletter',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/newsletter/status - Get newsletter scheduler status and last newsletter info
router.get('/status', async (req, res) => {
  try {
    const status = await NewsletterScheduler.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ Error getting newsletter status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/newsletter/history - Get newsletter sending history
router.get('/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const limit = parseInt(req.query.limit) || 50;
    
    const history = await NewsletterScheduler.getNewsletterHistory(days);
    const stats = await NewsletterHistory.getSchedulingStats();
    
    res.json({
      success: true,
      data: {
        history: history.slice(0, limit),
        stats: stats,
        totalRecords: history.length
      }
    });
  } catch (error) {
    console.error('❌ Error getting newsletter history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/newsletter/next-schedule - Get information about the next scheduled newsletter
router.get('/next-schedule', async (req, res) => {
  try {
    const nextScheduledTime = NewsletterScheduler.getNextScheduledTime();
    const newsletterService = new NewsletterService();
    
    res.json({
      success: true,
      data: {
        nextScheduledTime: nextScheduledTime,
        isWorkingHours: newsletterService.isWorkingHours(),
        currentTime: new Date(),
        timeUntilNext: nextScheduledTime.getTime() - Date.now(),
        workingHours: {
          start: '10:10 PM IST',
          end: '10:10 PM IST',
          timezone: 'Asia/Kolkata'
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting next schedule:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/newsletter/recent-articles - Get articles sent in recent newsletters
router.get('/recent-articles', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    
    const recentNewsletters = await NewsletterHistory.getRecentArticles(hours);
    const allArticles = recentNewsletters.flatMap(nl => nl.articlesSent);
    
    // Group articles by ID and count sends
    const articleCounts = allArticles.reduce((acc, article) => {
      if (!acc[article.articleId]) {
        acc[article.articleId] = {
          ...article,
          totalSends: 0
        };
      }
      acc[article.articleId].totalSends += article.sentToCount || 1;
      return acc;
    }, {});
    
    const sortedArticles = Object.values(articleCounts)
      .sort((a, b) => b.totalSends - a.totalSends);
    
    res.json({
      success: true,
      data: {
        articles: sortedArticles,
        timeRange: `Last ${hours} hours`,
        totalUniqueArticles: sortedArticles.length,
        totalSends: sortedArticles.reduce((sum, article) => sum + article.totalSends, 0)
      }
    });
  } catch (error) {
    console.error('❌ Error getting recent articles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/newsletter/subscriber-history - Get detailed newsletter history for all subscribers
router.get('/subscriber-history', async (req, res) => {
  try {
    const { email, limit = 10 } = req.query;
    
    let query = { isActive: true };
    if (email) {
      query.email = email;
    }
    
    const subscribers = await Subscriber.find(query)
      .select('email name newsletterHistory lastNewsletterSent')
      .lean();
    
    const subscribersWithHistory = subscribers.map(subscriber => ({
      email: subscriber.email,
      name: subscriber.name,
      lastNewsletterSent: subscriber.lastNewsletterSent,
      totalNewsletters: subscriber.newsletterHistory?.length || 0,
      recentNewsletters: (subscriber.newsletterHistory || [])
        .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
        .slice(0, parseInt(limit))
    }));
    
    res.json({
      success: true,
      data: {
        subscribers: subscribersWithHistory,
        totalSubscribers: subscribersWithHistory.length
      }
    });
  } catch (error) {
    console.error('❌ Error getting subscriber history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/newsletter/subscriber-details/:email - Get detailed history for a specific subscriber
router.get('/subscriber-details/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { limit = 20 } = req.query;
    
    const subscriber = await Subscriber.findOne({ email: email.toLowerCase() })
      .select('email name newsletterHistory sentArticleIds lastNewsletterSent subscribedAt preferences')
      .lean();
    
    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: 'Subscriber not found'
      });
    }
    
    const sortedHistory = (subscriber.newsletterHistory || [])
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      .slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        email: subscriber.email,
        name: subscriber.name,
        subscribedAt: subscriber.subscribedAt,
        lastNewsletterSent: subscriber.lastNewsletterSent,
        preferences: subscriber.preferences,
        totalArticlesSent: subscriber.sentArticleIds?.length || 0,
        totalNewsletters: subscriber.newsletterHistory?.length || 0,
        recentNewsletters: sortedHistory,
        successRate: subscriber.newsletterHistory?.length > 0 
          ? ((subscriber.newsletterHistory.filter(n => n.status === 'sent').length / subscriber.newsletterHistory.length) * 100).toFixed(1) + '%'
          : 'N/A'
      }
    });
  } catch (error) {
    console.error('❌ Error getting subscriber details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
