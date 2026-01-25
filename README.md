# Webstory Backend API

A high-performance Express.js backend API for the Webstory news platform, optimized for Vercel serverless deployment.

## 🚀 Features

- **Multi-tier Caching System** - 83% cache hit rate with node-cache
- **MongoDB Atlas Integration** - Optimized connections and indexing
- **AI Commentary Generation** - Groq AI integration for expert article analysis
- **Smart Article Finder** - UUID and ObjectId support for seamless frontend integration
- **Rate Limiting** - Built-in request throttling and abuse prevention
- **News API Integration** - Real-time news fetching from multiple sources
- **Serverless Ready** - Optimized for Vercel deployment

## 📁 Project Structure

```
webstorybackend/
├── config/
│   └── database.js          # MongoDB connection configuration
├── middleware/
│   └── cacheMiddleware.js   # Multi-tier caching system
├── models/
│   └── article.js           # MongoDB article schema
├── routes/
│   ├── articles.js          # Article CRUD operations
│   ├── commentary.js        # AI commentary generation
│   ├── debug.js            # Debug and seeding endpoints
│   ├── news.js             # News fetching endpoints
│   └── search.js           # Article search functionality
├── services/
│   ├── db/
│   │   ├── articleService.js # Database operations
│   │   └── connection.js     # DB connection management
│   ├── cache.js            # Cache service implementation
│   ├── cronService.js      # Background job scheduling
│   ├── newsService.js      # News API integration
│   └── storyService.js     # Story fetching logic
├── server.js               # Main Express application
├── vercel.json            # Vercel deployment configuration
└── package.json           # Dependencies and scripts
```

## 🛠️ Environment Variables

Create a `.env` file in the root directory:

```env
# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/webstory

# API Keys
GROQ_API_KEY=your_groq_api_key_here
NEWS_API_KEY=your_nyt_api_key_here

# Server Configuration
PORT=3001
NODE_ENV=development

# Cache Configuration
CACHE_TTL=300
HOT_CACHE_TTL=300
SEARCH_CACHE_TTL=600
CATEGORY_CACHE_TTL=900
AI_CACHE_TTL=21600
```

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/NukkadFoods/webstorybackend.git
   cd webstorybackend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3001`

### Production Deployment (Vercel)

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

3. **Set environment variables in Vercel Dashboard**
   - Go to your project settings
   - Add all environment variables from `.env`

## 📊 API Endpoints

### Articles
- `GET /api/articles` - Get all articles with pagination
- `GET /api/articles/:id` - Get article by ID (supports UUID and ObjectId)
- `POST /api/articles` - Create new article
- `POST /api/articles/bulk` - Bulk create articles

### Search
- `GET /api/articles/search?q=query` - Search articles
- `GET /api/articles/category/:category` - Get articles by category

### News Sources
- `GET /api/news/top-stories` - Get top stories
- `GET /api/news/entertainment` - Get entertainment news
- `GET /api/news/wallstreet` - Get Wall Street news

### AI Commentary
- `POST /api/commentary/generate` - Generate AI commentary for articles

### Debug (Development)
- `POST /api/debug/seed` - Seed database with sample articles
- `GET /api/debug/cache-stats` - Get cache performance statistics

## 🔧 Performance Features

### Multi-Tier Caching
- **Hot Cache**: 5 minutes TTL for frequently accessed articles
- **Search Cache**: 10 minutes TTL for search results
- **Category Cache**: 15 minutes TTL for category listings
- **AI Cache**: 6 hours TTL for generated commentary

### Database Optimization
- Indexed fields for fast queries
- Connection pooling for efficient resource usage
- Smart article finder with fallback logic

### Rate Limiting
- 20 requests per minute per IP
- Configurable limits for different endpoints
- Automatic throttling for abuse prevention

## 🛡️ Security Features

- CORS configuration for production domains
- Request validation and sanitization
- Error handling with appropriate HTTP status codes
- Environment-based configuration

## 📈 Monitoring

### Cache Performance
Current performance metrics:
- **Cache Hit Rate**: 83%
- **Average Response Time**: <100ms for cached requests
- **Memory Usage**: Optimized with automatic cleanup

### Error Handling
- Comprehensive error logging
- Graceful degradation for external API failures
- Automatic retry logic for transient failures

## 🔄 Development Workflow

### Adding New Features
1. Create feature branch: `git checkout -b feature/new-feature`
2. Implement changes with tests
3. Update documentation
4. Create pull request

### Testing
```bash
npm test                    # Run test suite
npm run test:coverage      # Run with coverage report
```

### Deployment
```bash
npm run deploy:preview     # Deploy preview version
npm run deploy:prod        # Deploy to production
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Support

For issues and questions:
- Check the [Issues](https://github.com/NukkadFoods/webstorybackend/issues) page
- Review the API documentation
- Check server logs in Vercel Dashboard

---

**Built with ❤️ for high-performance news delivery**
# Deployment trigger Wed Sep  3 08:26:35 IST 2025
