const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Get MongoDB URI from environment variables
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  MONGODB_URI_EXISTS: !!process.env.MONGODB_URI,
  ENV_PATH: path.resolve(__dirname, '../.env')
});

const MONGODB_URI = process.env.MONGODB_URI;

// Connection options with optimized pooling
const options = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4
};

// Create a connection instance
let connection = null;

/**
 * Connect to MongoDB
 * @returns {Promise} Mongoose connection
 */
const connectToMongoDB = async () => {
  if (!connection) {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env file');
    }

    try {
      // First verify if we can resolve the hostname
      const url = new URL(MONGODB_URI);
      console.log('Attempting to connect to MongoDB at:', url.hostname);
      
      connection = await mongoose.connect(MONGODB_URI, options);
      console.log('Successfully connected to MongoDB Atlas');
      
      // Handle connection events
      mongoose.connection.on('error', (error) => {
        console.error('MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
        // Try to reconnect
        setTimeout(connectToMongoDB, 5000);
      });

      return connection;
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        console.error('DNS resolution failed. Could not resolve MongoDB Atlas hostname.');
        console.error('Please check your internet connection and DNS settings.');
      } else {
        console.error('Error connecting to MongoDB:', error);
      }
      // In production, we might want to exit if MongoDB connection fails
      if (process.env.NODE_ENV === 'production') {
        console.error('Critical: Failed to connect to MongoDB in production');
        process.exit(1);
      } else {
        console.warn('Warning: MongoDB connection failed, some features may not work');
        // Return a mock connection for development
        return {
          connection: null,
          models: {},
          readyState: 0
        };
      }
    }
  }
  return connection;
};

/**
 * Get the connection status
 * @returns {boolean} Connection status
 */
const isConnected = () => {
  return mongoose.connection.readyState === 1;
};

/**
 * Disconnect from MongoDB
 */
const disconnectFromMongoDB = async () => {
  if (connection) {
    await mongoose.disconnect();
    connection = null;
    console.log('Disconnected from MongoDB');
  }
};

module.exports = {
  connectToMongoDB,
  disconnectFromMongoDB,
  isConnected,
  getConnection: () => connection,
};
