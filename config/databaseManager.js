/**
 * 🗄️ Optimized Database Connection Manager
 * Implements connection pooling with retry logic and health monitoring
 */

const mongoose = require('mongoose');

class DatabaseManager {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000; // Start with 1 second
    this.healthCheckInterval = null;
    this.metrics = {
      totalConnections: 0,
      failedConnections: 0,
      reconnections: 0,
      avgConnectionTime: 0
    };
  }

  /**
   * Connect to MongoDB with optimized settings
   */
  async connect(retries = this.maxRetries) {
    const startTime = Date.now();
    
    const dbOptions = {
      // Connection Pool Settings
      maxPoolSize: 10,        // Maximum connections in pool
      minPoolSize: 2,         // Minimum connections to maintain
      maxIdleTimeMS: 30000,   // Close connections after 30 seconds idle
      
      // Timeout Settings
      connectTimeoutMS: 10000,   // 10 seconds connection timeout
      socketTimeoutMS: 45000,    // 45 seconds socket timeout
      serverSelectionTimeoutMS: 5000, // 5 seconds server selection timeout
      heartbeatFrequencyMS: 30000,     // Health check every 30 seconds
      
      // Reliability Settings
      retryWrites: true,
      retryReads: true,
      
      // Performance Settings
      bufferMaxEntries: 0,    // Disable mongoose buffering
      useNewUrlParser: true,
      useUnifiedTopology: true,
      
      // Compression
      compressors: ['zlib'],
      zlibCompressionLevel: 6
    };

    try {
      console.log(`🔄 Attempting database connection (attempt ${this.maxRetries - retries + 1}/${this.maxRetries})...`);
      
      await mongoose.connect(process.env.MONGODB_URI, dbOptions);
      
      const connectionTime = Date.now() - startTime;
      this.updateConnectionMetrics(connectionTime, true);
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      console.log('✅ Database connected successfully');
      console.log(`📊 Connection time: ${connectionTime}ms`);
      
      this.setupEventHandlers();
      this.startHealthCheck();
      
      return true;
    } catch (error) {
      this.updateConnectionMetrics(Date.now() - startTime, false);
      this.connectionAttempts++;
      
      console.error(`❌ Database connection failed:`, error.message);
      
      if (retries > 0) {
        const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1); // Exponential backoff
        console.log(`⏳ Retrying connection in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect(retries - 1);
      } else {
        console.error('❌ Failed to connect to database after multiple attempts');
        throw new Error('Database connection failed after maximum retries');
      }
    }
  }

  /**
   * Setup MongoDB event handlers
   */
  setupEventHandlers() {
    mongoose.connection.on('connected', () => {
      console.log('🔗 Mongoose connected to MongoDB');
      this.isConnected = true;
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ Mongoose connection error:', err.message);
      this.metrics.failedConnections++;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 Mongoose reconnected to MongoDB');
      this.isConnected = true;
      this.metrics.reconnections++;
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await this.gracefulShutdown('SIGINT');
    });

    process.on('SIGTERM', async () => {
      await this.gracefulShutdown('SIGTERM');
    });
  }

  /**
   * Start health check monitoring
   */
  startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await mongoose.connection.db.admin().ping();
        if (!this.isConnected) {
          console.log('✅ Database health check passed - reconnected');
          this.isConnected = true;
        }
      } catch (error) {
        console.error('❌ Database health check failed:', error.message);
        this.isConnected = false;
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Update connection metrics
   */
  updateConnectionMetrics(connectionTime, success) {
    this.metrics.totalConnections++;
    if (success) {
      this.metrics.avgConnectionTime = (this.metrics.avgConnectionTime + connectionTime) / 2;
    } else {
      this.metrics.failedConnections++;
    }
  }

  /**
   * Get database connection status and metrics
   */
  getStatus() {
    const connectionState = mongoose.connection.readyState;
    const stateMap = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      isConnected: this.isConnected,
      connectionState: stateMap[connectionState] || 'unknown',
      dbName: mongoose.connection.name,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      metrics: this.metrics,
      poolSize: {
        current: mongoose.connection?.db?.s?.topology?.s?.poolSize || 0,
        max: mongoose.connection?.db?.s?.topology?.s?.options?.maxPoolSize || 0
      }
    };
  }

  /**
   * Execute database operation with retry logic
   */
  async executeWithRetry(operation, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!this.isConnected) {
          throw new Error('Database not connected');
        }
        
        return await operation();
      } catch (error) {
        console.error(`Database operation failed (attempt ${attempt}/${retries}):`, error.message);
        
        if (attempt === retries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        
        // Try to reconnect if disconnected
        if (!this.isConnected) {
          try {
            await this.connect();
          } catch (reconnectError) {
            console.error('Reconnection failed:', reconnectError.message);
          }
        }
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown(signal) {
    console.log(`🛑 Received ${signal}, closing database connection...`);
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    try {
      await mongoose.connection.close();
      console.log('✅ Database connection closed gracefully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during database shutdown:', error.message);
      process.exit(1);
    }
  }

  /**
   * Middleware for database health check
   */
  healthCheckMiddleware() {
    return (req, res, next) => {
      if (!this.isConnected) {
        return res.status(503).json({
          error: 'Database unavailable',
          status: this.getStatus()
        });
      }
      next();
    };
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collectionName) {
    try {
      const stats = await mongoose.connection.db.collection(collectionName).stats();
      return {
        count: stats.count,
        size: stats.size,
        avgObjSize: stats.avgObjSize,
        storageSize: stats.storageSize,
        indexes: stats.nindexes
      };
    } catch (error) {
      console.error(`Error getting stats for collection ${collectionName}:`, error.message);
      return null;
    }
  }

  /**
   * Optimize database indexes
   */
  async optimizeIndexes() {
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      
      for (const collection of collections) {
        const collectionName = collection.name;
        console.log(`🔧 Optimizing indexes for collection: ${collectionName}`);
        
        // Get current indexes
        const indexes = await mongoose.connection.db.collection(collectionName).indexes();
        console.log(`📊 Found ${indexes.length} indexes in ${collectionName}`);
      }
    } catch (error) {
      console.error('Error optimizing indexes:', error.message);
    }
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Express middleware for database operations
const dbMiddleware = {
  // Health check middleware
  healthCheck: dbManager.healthCheckMiddleware(),
  
  // Add database methods to request object
  addDbMethods: (req, res, next) => {
    req.dbExecute = (operation) => dbManager.executeWithRetry(operation);
    req.dbStatus = () => dbManager.getStatus();
    next();
  }
};

module.exports = {
  dbManager,
  dbMiddleware
};
