# 🔧 Environment Variables for TestBackend Deployment

## Required Environment Variables:

### 1. MongoDB Connection
```bash
MONGODB_URI=mongodb+srv://username:password@your-cluster.mongodb.net/webstory?retryWrites=true&w=majority
```

### 2. Redis Cloud Connection
```bash
REDIS_URL=redis://default:password@your-redis-host.redis-cloud.com:port
```

### 3. Groq API Key
```bash
GROQ_API_KEY=your_groq_api_key_here
```

### 4. NYT API Key (if using)
```bash
NYT_API_KEY=your_nyt_api_key_here
```

### 5. Environment Setting
```bash
NODE_ENV=production
```

## 🚀 Deployment Commands:

### Option 1: Manual Deployment
```bash
cd /Users/mahendrabahubali/Webstory/backend

# Link to testbackend project
npx vercel link

# Deploy to preview
npx vercel

# Deploy to production (after testing)
npx vercel --prod
```

### Option 2: Using Deploy Script
```bash
cd /Users/mahendrabahubali/Webstory/backend
./deploy-test.sh
```

## 📋 Pre-Deployment Checklist:

✅ All environment variables set in Vercel dashboard
✅ Redis Cloud connection string updated
✅ MongoDB connection working
✅ Groq API key valid
✅ All dependencies in package.json
✅ vercel.json configuration correct

## 🧪 Testing Endpoints After Deployment:

1. **Health Check**: `https://testbackend.vercel.app/api/health`
2. **System Status**: `https://testbackend.vercel.app/api/system-status`
3. **Articles**: `https://testbackend.vercel.app/api/articles`
4. **Commentary**: `https://testbackend.vercel.app/api/generate-commentary`

## 🔍 Monitoring After Deployment:

- Check Vercel dashboard for function logs
- Monitor Redis Cloud dashboard for connections
- Watch system status endpoint for health metrics
- Test rate limiting with multiple requests
