const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Get MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI;

// Connection options optimized for both local and serverless environments
const options = {
  maxPoolSize: 5, // Pool size for better performance
  minPoolSize: 1, // Keep at least 1 connection alive
  serverSelectionTimeoutMS: 30000, // 30 seconds timeout
  socketTimeoutMS: 60000, // 60 seconds socket timeout
  connectTimeoutMS: 30000, // 30 seconds connection timeout
  family: 4,
  autoIndex: false, // Disabled for performance
  retryWrites: true,
  w: 'majority',
  bufferCommands: true // Enable buffering for better reliability
};

/**
 * Connect to MongoDB with proper error handling
 * @returns {Promise} Mongoose connection
 */
const connectToMongoDB = async () => {
  if (!MONGODB_URI) {
    const error = new Error('MONGODB_URI is not defined in environment variables');
    console.error('❌ MongoDB URI not found');
    throw error;
  }

  // Check if already connected
  if (mongoose.connection.readyState === 1) {
    console.log('✅ Using existing MongoDB connection');
    return mongoose.connection;
  }

  // If currently connecting, wait for it to complete
  if (mongoose.connection.readyState === 2) {
    console.log('⏳ MongoDB connection in progress, waiting...');
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout after 15 seconds'));
        }, 15000);
        
        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        mongoose.connection.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      return mongoose.connection;
    } catch (error) {
      console.error('❌ Waiting for connection failed:', error);
      throw error;
    }
  }

  try {
    console.log('🔄 Establishing new MongoDB connection...');
    console.log('📡 Connecting to MongoDB Atlas...');
    
    // Close any existing connection first
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    await mongoose.connect(MONGODB_URI, options);
    
    console.log('✅ Successfully connected to MongoDB Atlas');
    console.log(`📊 Connection state: ${mongoose.connection.readyState}`);
    console.log(`🏢 Database: ${mongoose.connection.name}`);
    console.log(`🌐 Host: ${mongoose.connection.host}:${mongoose.connection.port}`);
    
    // Set up connection monitoring
    mongoose.connection.on('connected', () => {
      console.log('📡 MongoDB connection established');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });
    
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('🔍 Error details:', {
      name: error.name,
      code: error.code,
      message: error.message
    });
    throw error; // Don't fall back to mock, properly throw the error
  }
};

/**
 * Get the connection status
 * @returns {boolean} Connection status
 */
const isConnected = () => {
  return mongoose.connection.readyState === 1;
};

/**
 * Wait for connection to be ready
 * @returns {Promise<boolean>} Connection ready status
 */
const waitForConnection = async (timeout = 10000) => {
  if (isConnected()) return true;
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, timeout);
    
    const checkConnection = () => {
      if (mongoose.connection.readyState === 1) {
        clearTimeout(timeoutId);
        resolve(true);
      } else if (mongoose.connection.readyState === 3) {
        clearTimeout(timeoutId);
        reject(new Error('Connection failed'));
      }
    };
    
    mongoose.connection.on('connected', checkConnection);
    mongoose.connection.on('disconnected', () => {
      clearTimeout(timeoutId);
      reject(new Error('Connection lost'));
    });
    
    // Check immediately in case already connected
    checkConnection();
  });
};

/**
 * Disconnect from MongoDB
 */
const disconnectFromMongoDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
};

module.exports = {
  connectToMongoDB,
  disconnectFromMongoDB,
  isConnected,
  waitForConnection,
  getConnection: () => mongoose.connection
};
