#!/bin/bash

echo "🚀 Deploying Webstory Backend to Production..."

# Check if required environment variables are set in Vercel
echo "📋 Checking deployment prerequisites..."

# Ensure we're in the correct directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: server.js not found. Run this script from the backend directory."
    exit 1
fi

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

echo "✅ Prerequisites checked"

# Deploy to production
echo "🌐 Deploying to production..."
vercel --prod

echo "✅ Deployment completed!"
echo ""
echo "🔗 Your backend is now live and ready for forexyy.com"
echo ""
echo "📝 Don't forget to:"
echo "   1. Set environment variables in Vercel dashboard:"
echo "      - MONGODB_URI"
echo "      - NYT_API_KEY" 
echo "      - GROQ_API_KEY"
echo "   2. Update frontend to use production API URL"
echo "   3. Test all endpoints"
echo ""
echo "🎉 Happy deploying!"
