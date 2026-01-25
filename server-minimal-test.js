// Minimal server for testing
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    console.log('CORS request from origin:', origin);
    
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

app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight OPTIONS requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).send();
});

// Simple test routes
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'webstory-backend',
    version: '1.0.0',
    message: 'Minimal server working!'
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Webstory Backend API - Minimal Version',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health'
    }
  });
});

// Only start server if not in Vercel environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`🚀 Minimal server running on port ${port}`);
  });
} else {
  console.log('🚀 Minimal serverless function ready');
}

// Export the Express API for Vercel
module.exports = app;
