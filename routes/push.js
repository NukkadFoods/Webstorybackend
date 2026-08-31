const express = require('express');
const webpush = require('web-push');
const router = express.Router();
const Subscription = require('../models/subscription');

// Configure web-push
// Keys will be set via environment variables in production
// VAPID_PUBLIC_KEY="BD5Rj1NOFhH3PuBqEJmuH35gBXmBY-CWyuioeG15rmKjIIWy6GCVh2O-nFrW_5DxY4W1xF7nH34b6iS_2SU3m3Y"
// VAPID_PRIVATE_KEY="F7LkLPwdAjnduFiZkYoxOxsvKqvERd8UFmiFbDGbv5I"
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BD5Rj1NOFhH3PuBqEJmuH35gBXmBY-CWyuioeG15rmKjIIWy6GCVh2O-nFrW_5DxY4W1xF7nH34b6iS_2SU3m3Y';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'F7LkLPwdAjnduFiZkYoxOxsvKqvERd8UFmiFbDGbv5I';

webpush.setVapidDetails(
  'mailto:contact@forexyy.com',
  publicVapidKey,
  privateVapidKey
);

// Route to get the public VAPID key
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: publicVapidKey });
});

// Subscribe route
router.post('/subscribe', async (req, res) => {
  try {
    const subscription = req.body;
    
    // Upsert subscription (update if endpoint exists, insert if new)
    await Subscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      subscription,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    res.status(201).json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('Error saving subscription:', error);
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

// Unsubscribe route
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    await Subscription.deleteOne({ endpoint });
    res.status(200).json({ success: true, message: 'Unsubscribed from push notifications' });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({ success: false, error: 'Failed to unsubscribe' });
  }
});

// Test route to send a push notification (should be protected in production)
router.post('/test-broadcast', async (req, res) => {
  const { secret, title, body, url } = req.body;
  
  // Simple auth for testing
  if (secret !== (process.env.ADMIN_SECRET || 'forexyy_admin_secret')) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    const payload = JSON.stringify({
      title: title || 'Forexyy News Alert',
      body: body || 'Check out the latest news analysis!',
      url: url || 'https://forexyy.com',
      icon: 'https://forexyy.com/forexyy_logo_80.png'
    });
    
    const subscriptions = await Subscription.find({});
    console.log(`Sending push to ${subscriptions.length} subscribers`);
    
    let successCount = 0;
    let failCount = 0;
    
    const sendPromises = subscriptions.map(sub => {
      return webpush.sendNotification(sub, payload)
        .then(() => { successCount++; })
        .catch(err => {
          console.error('Push error for endpoint:', sub.endpoint, err);
          failCount++;
          // Remove dead subscriptions
          if (err.statusCode === 410 || err.statusCode === 404) {
            return Subscription.deleteOne({ endpoint: sub.endpoint });
          }
        });
    });
    
    await Promise.all(sendPromises);
    
    res.status(200).json({ 
      success: true, 
      sent: successCount, 
      failed: failCount 
    });
  } catch (error) {
    console.error('Error broadcasting push:', error);
    res.status(500).json({ success: false, error: 'Failed to send broadcast' });
  }
});

module.exports = router;
