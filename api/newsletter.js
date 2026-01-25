// Newsletter API endpoint for Vercel
const cors = require('cors');

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'https://forexyy.com',
      'https://www.forexyy.com',
      'http://forexyy.com',
      'http://www.forexyy.com'
    ];
    
    if (allowedOrigins.includes(origin) || origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    // Enhanced check for any forexyy.com domain variations
    if (origin) {
      const domain = origin.replace(/^https?:\/\//, '');
      if (domain === 'forexyy.com' || 
          domain === 'www.forexyy.com' ||
          domain.endsWith('.forexyy.com')) {
        return callback(null, true);
      }
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};

module.exports = (req, res) => {
  // Set CORS headers manually
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    const { email } = req.body || {};
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    return res.status(200).json({ 
      message: 'Subscription successful',
      email: email,
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      message: 'Newsletter API endpoint',
      endpoints: {
        subscribe: 'POST /api/newsletter/subscribe',
        unsubscribe: 'POST /api/newsletter/unsubscribe'
      }
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
};
