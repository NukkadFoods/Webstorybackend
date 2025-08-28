const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Get MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI;

// Mock DB for when MongoDB is not available
const mockDB = {
  readyState: 0,
  models: {},
  connection: {
    readyState: 0
  }
};

// Connection options optimized for Vercel serverless
const options = {
  maxPoolSize: 1, // Reduced for serverless
  minPoolSize: 0,
  maxConnecting: 1, // Reduced for serverless
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 20000, // Reduced timeout
  connectTimeoutMS: 10000, // Added connection timeout
  family: 4,
  autoIndex: false, // Disabled for performance
  retryWrites: true,
  w: 'majority',
  bufferCommands: false, // Disable buffering for serverless
  bufferMaxEntries: 0 // Disable buffering
};

// Create a connection instance
let connection = null;

/**
 * Connect to MongoDB with serverless-optimized strategy
 * @returns {Promise} Mongoose connection or mock DB
 */
const connectToMongoDB = async () => {
  if (!MONGODB_URI) {
    console.log('MongoDB URI not found, using in-memory storage');
    connection = mockDB;
    return connection;
  }

  // In serverless environment, always check connection state
  if (mongoose.connection.readyState === 1) {
    console.log('Using existing MongoDB connection');
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2) {
    console.log('MongoDB connection is connecting, waiting...');
    // Wait for connection to be established
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
    return mongoose.connection;
  }

  try {
    console.log('Establishing new MongoDB connection...');
    connection = await mongoose.connect(MONGODB_URI, options);
    console.log('Successfully connected to MongoDB Atlas');
    return connection;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    console.log('Failed to connect to MongoDB, using in-memory storage');
    connection = mockDB;
    return connection;
  }
};

/**
 * Get the connection status
 * @returns {boolean} Connection status
 */
const isConnected = () => {
  if (connection === mockDB) return true;
  return mongoose.connection.readyState === 1;
};

/**
 * Disconnect from MongoDB
 */
const disconnectFromMongoDB = async () => {
  if (connection && connection !== mockDB) {
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
