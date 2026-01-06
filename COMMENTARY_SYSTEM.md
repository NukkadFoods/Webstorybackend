# 🚀 AI Commentary System - Production Architecture

## Overview
Queue-based, event-driven AI commentary generation using BullMQ + Redis + Groq API.

## Architecture Components

### 1. **Redis** (`config/redis.js`)
- Single connection pool shared across cache and queues
- Survives server restarts
- Auto-reconnection with exponential backoff

### 2. **Cache Service** (`services/cache/index.js`)
- Redis-backed caching with `getOrSet` pattern
- Configurable TTL strategies (commentary: 24h, articles: 5min)
- Pattern-based invalidation

### 3. **AI Service** (`services/aiService.js`)
- Pure Groq API logic (no caching, no queues)
- Clean error handling with typed errors
- Fallback commentary generator

### 4. **Commentary Queue & Worker** (`workers/commentaryQueue.js`)
- **Native Rate Limiting**: 10 jobs/60 seconds (BullMQ)
- **Automatic Retries**: 3 attempts with exponential backoff (5s → 10s → 20s)
- **Priority Queue**: Recent articles get priority (1-10 scale)
- **Cache-first**: Checks cache before calling Groq API
- **DB Optimization**: Checks if article already has commentary before queuing
- **Persistent**: Survives server restarts

## API Endpoints

### Generate Commentary (Queue-based)
```bash
POST /api/articles/:id/generate-commentary
```
**Response (202 Accepted)**:
```json
{
  "status": "queued",
  "message": "AI is generating commentary in the background.",
  "articleId": "...",
  "jobId": "...",
  "estimatedWaitTime": "10-30 seconds"
}
```

### Check Commentary Status (Polling)
```bash
GET /api/articles/:id/commentary-status
```
**Response**:
```json
{
  "ready": true,
  "commentary": "...",
  "generatedAt": "2026-01-05T...",
  "source": "ai"
}
```

### Queue Statistics
```bash
GET /api/articles/queue/stats
```
**Response**:
```json
{
  "counts": {
    "waiting": 5,
    "active": 2,
    "completed": 147,
    "failed": 3,
    "delayed": 0
  },
  "health": "healthy",
  "upcomingJobs": [...]
}
```

## How It Works

### 1. **User Requests Commentary**
```javascript
POST /api/articles/:id/generate-commentary
```
- Checks if commentary exists in DB → return immediately
- Checks if in cache → save to DB and return
- Otherwise → add to queue → return 202 Accepted

### 2. **BullMQ Worker Processes Job**
```javascript
worker.process('generate-commentary', async (job) => {
  // 1. Check cache (prevents duplicate API calls)
  const commentary = await cache.getOrSet(key, () => groqAPI());
  
  // 2. Save to database
  await Article.update({ aiCommentary: commentary });
  
  return commentary;
})
```

### 3. **Frontend Polls for Status**
```javascript
// Poll every 3 seconds
const interval = setInterval(async () => {
  const { ready, commentary } = await fetch(`/api/articles/${id}/commentary-status`);
  if (ready) {
    setCommentary(commentary);
    clearInterval(interval);
  }
}, 3000);
```

## Configuration

### Environment Variables
```bash
# Redis
REDIS_URL=redis://localhost:6379
# OR
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=yourpassword

# Groq AI
GROQ_API_KEY=your_groq_api_key
```

### Rate Limiting
In `workers/commentaryQueue.js`:
```javascript
limiter: {
  max: 10,        // Jobs per window
  duration: 60000 // Window duration (ms)
}
```

### Retry Strategy
```javascript
defaultJobOptions: {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000
  }
}
```

## Monitoring

### Queue Dashboard
```bash
GET /api/articles/queue/stats
```

### Cache Stats
```bash
GET /api/articles/cache/stats
```

### Health Check
```bash
GET /api/articles/health-check
```

## Graceful Shutdown
The system handles SIGTERM/SIGINT signals:
```javascript
process.on('SIGTERM', async () => {
  await commentaryQueue.close();
  await worker.close();
  await redis.quit();
  await mongoose.disconnect();
});
```

## Advantages Over Old System

| Feature | Old System | New System |
|---------|-----------|------------|
| Queue Persistence | ❌ In-memory (lost on restart) | ✅ Redis (survives restarts) |
| Rate Limiting | ❌ Custom token bucket | ✅ BullMQ native limiter |
| Caching | ❌ node-cache (in-memory) | ✅ Redis (shared, persistent) |
| Error Recovery | ❌ Manual retry logic | ✅ Automatic exponential backoff |
| Duplicate Prevention | ❌ Race conditions | ✅ Cache-first + DB check |
| Monitoring | ❌ Scattered logs | ✅ Centralized queue stats |
| Scalability | ❌ Single instance only | ✅ Multi-instance ready |

## Testing

### 1. Start Redis
```bash
redis-server
```

### 2. Start Backend
```bash
cd backend
npm install
node server.js
```

### 3. Test Commentary Generation
```bash
# Queue a job
curl -X POST http://localhost:3001/api/articles/YOUR_ARTICLE_ID/generate-commentary

# Check status
curl http://localhost:3001/api/articles/YOUR_ARTICLE_ID/commentary-status

# Check queue
curl http://localhost:3001/api/articles/queue/stats
```

## Production Deployment

### Vercel/Serverless
- Use Redis Cloud (upstash.com or redis.com)
- Set `REDIS_URL` environment variable
- Worker runs in same process (serverless-compatible)

### Docker
```dockerfile
# backend/Dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  backend:
    build: ./backend
    environment:
      - REDIS_URL=redis://redis:6379
      - GROQ_API_KEY=${GROQ_API_KEY}
    ports:
      - "3001:3001"
    depends_on:
      - redis
```

## Troubleshooting

### "Worker not processing jobs"
- Check Redis connection: `redis-cli ping`
- Check worker logs for errors
- Verify rate limit not exceeded

### "Commentary not saving to DB"
- Check MongoDB connection
- Verify article ID exists
- Check worker logs

### "Rate limit errors"
- Reduce `limiter.max` in commentaryQueue.js
- Increase `limiter.duration`
- Check Groq API quota

## Future Enhancements

1. **WebSocket Push**: Real-time commentary delivery instead of polling
2. **Batch Processing**: Process 5 articles in parallel within rate limits
3. **Dead Letter Queue**: Alert on permanently failed jobs
4. **A/B Testing**: Test different prompt styles
5. **Analytics**: Track commentary generation time, success rate, user engagement
