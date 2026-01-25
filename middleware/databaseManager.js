/**
 * 📊 Database Manager - Optimized MongoDB connection with pooling and retry logic
 * Provides connection management, health monitoring, and operation retry wrapper
 */

const mongoose = require('mongoose');

class DatabaseManager {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000; // Start with 1 second
    this.stats = {
      connectionsCreated: 0,
      connectionsFailed: 0,
      reconnects: 0,
      queries: 0,
      queryErrors: 0,
      avgQueryTime: 0
    };
    
    console.log('📊 Database Manager initialized');
  }

  /**
   * Initialize optimized MongoDB connection
   */
  async initialize() {
    if (!process.env.MONGODB_URI) {
      console.warn('⚠️ MONGODB_URI not configured, running without database');
      return null;
    }

    const connectionOptions = {
      // Connection pooling
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      
      // Connection timeouts
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      
      // Reliability
      retryWrites: true,
      retryReads: true,
      
      // Performance
      bufferMaxEntries: 0,
      maxConnecting: 2,
      
      // Compression
      compressors: ['zlib'],
      zlibCompressionLevel: 6
    };

    try {
      console.log('🔄 Connecting to MongoDB with optimized settings...');
      
      this.connection = await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
      this.isConnected = true;
      this.retryCount = 0;
      this.stats.connectionsCreated++;
      
      console.log('✅ MongoDB connected successfully with connection pooling');
      
      // Set up event listeners
      this.setupEventListeners();
      
      return this.connection;
    } catch (error) {
      this.stats.connectionsFailed++;
      console.error('❌ MongoDB connection failed:', error.message);
      
      if (this.retryCount < this.maxRetries) {
        await this.retry();
        return this.initialize();
      }
      
      throw error;
    }
  }

  /**
   * Set up connection event listeners
   */
  setupEventListeners() {
    if (!this.connection) return;

    mongoose.connection.on('connected', () => {
      console.log('📡 MongoDB connected');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      this.isConnected = false;
      this.attemptReconnect();
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
      this.isConnected = true;
      this.stats.reconnects++;
    });
  }

  /**
   * Attempt to reconnect to database
   */
  async attemptReconnect() {
    if (this.isConnected) return;
    
    console.log('🔄 Attempting to reconnect to MongoDB...');
    
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ MongoDB reconnection successful');
    } catch (error) {
      console.error('❌ MongoDB reconnection failed:', error.message);
      setTimeout(() => this.attemptReconnect(), 5000);
    }
  }

  /**
   * Execute database operation with retry logic
   */
  async executeWithRetry(operation, maxRetries = 3) {
    const startTime = Date.now();
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isConnected && attempt === 0) {
          throw new Error('Database not connected');
        }
        
        const result = await operation();
        
        // Update stats
        const duration = Date.now() - startTime;
        this.stats.queries++;
        this.stats.avgQueryTime = ((this.stats.avgQueryTime * (this.stats.queries - 1)) + duration) / this.stats.queries;
        
        return result;
      } catch (error) {
        this.stats.queryErrors++;
        
        console.error(`❌ Database operation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await this.wait(delay);
        
        // Try to reconnect if disconnected
        if (!this.isConnected) {
          try {
            await this.initialize();
          } catch (reconnectError) {
            console.error('❌ Reconnection failed:', reconnectError.message);
          }
        }
      }
    }
  }

  /**
   * Health check for database connection
   */
  async healthCheck() {
    try {
      if (!this.connection) {
        throw new Error('No database connection');
      }
      
      // Simple ping to check connection
      await mongoose.connection.db.admin().ping();
      return { status: 'healthy', connected: this.isConnected };
    } catch (error) {
      return { status: 'unhealthy', error: error.message, connected: false };
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      connectionState: mongoose.connection.readyState,
      connectionStates: {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      }[mongoose.connection.readyState]
    };
  }

  /**
   * Gracefully disconnect from database
   */
  async disconnect() {
    try {
      if (this.connection) {
        await mongoose.connection.close();
        this.isConnected = false;
        console.log('✅ MongoDB connection closed gracefully');
      }
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error);
    }
  }

  /**
   * Utility functions
   */
  async retry() {
    this.retryCount++;
    const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff
    console.log(`⏳ Retrying database connection in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
    await this.wait(delay);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get connection pool status
   */
  getPoolStatus() {
    if (!this.connection) return null;
    
    const db = mongoose.connection.db;
    if (!db) return null;
    
    return {
      maxPoolSize: db.serverConfig?.s?.maxPoolSize || 'unknown',
      currentConnections: db.serverConfig?.s?.pool?.totalConnections || 'unknown',
      availableConnections: db.serverConfig?.s?.pool?.availableConnections || 'unknown'
    };
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Add methods for compatibility with optimization manager
databaseManager.executeWithRetry = async function(operation, maxRetries = 3) {
  const startTime = Date.now();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!this.isConnected && attempt === 0) {
        throw new Error('Database not connected');
      }
      
      const result = await operation();
      
      // Update stats
      const duration = Date.now() - startTime;
      this.stats.queries++;
      this.stats.avgQueryTime = ((this.stats.avgQueryTime * (this.stats.queries - 1)) + duration) / this.stats.queries;
      
      return result;
    } catch (error) {
      this.stats.queryErrors++;
      
      console.error(`❌ Database operation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await this.wait(delay);
      
      // Try to reconnect if disconnected
      if (!this.isConnected) {
        try {
          await this.initialize();
        } catch (reconnectError) {
          console.error('❌ Reconnection failed:', reconnectError.message);
        }
      }
    }
  }
};

databaseManager.wait = function(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

databaseManager.healthCheck = async function() {
  try {
    if (!this.connection) {
      throw new Error('No database connection');
    }
    
    // Simple ping to check connection
    await mongoose.connection.db.admin().ping();
    return { status: 'healthy', connected: this.isConnected };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, connected: false };
  }
};

databaseManager.getStats = function() {
  return {
    ...this.stats,
    isConnected: this.isConnected,
    connectionState: mongoose.connection.readyState,
    connectionStates: {
      0: 'disconnected',
      1: 'connected', 
      2: 'connecting',
      3: 'disconnecting'
    }[mongoose.connection.readyState]
  };
};

module.exports = databaseManager;
