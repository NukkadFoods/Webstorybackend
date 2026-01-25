#!/bin/bash

# 🚀 Deploy to TestBackend Vercel Project
echo "🚀 Deploying optimized backend to testbackend project..."

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: Please run this script from the backend directory"
    exit 1
fi

# Install dependencies if needed
echo "📦 Installing dependencies..."
npm install

# Set Vercel project name to testbackend
echo "🎯 Setting Vercel project to testbackend..."
npx vercel link --project=testbackend --confirm

# Deploy to preview environment first
echo "🔍 Deploying to preview environment..."
npx vercel --env MONGODB_URI=$MONGODB_URI --env REDIS_URL=$REDIS_URL --env GROQ_API_KEY=$GROQ_API_KEY --env NYT_API_KEY=$NYT_API_KEY

echo "✅ Preview deployment complete!"
echo "🔗 Check the preview URL and test all functionality"
echo "🚀 If everything works, run: npx vercel --prod"

# Optional: Deploy to production immediately
read -p "🤔 Deploy to production now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Deploying to production..."
    npx vercel --prod
    echo "🎉 Production deployment complete!"
fi
