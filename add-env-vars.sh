#!/bin/bash

# 🔧 Add Environment Variables to Vercel TestBackend Project
echo "🔧 Adding environment variables to testbackend project..."

# Note: You'll need to replace these values with your actual credentials
echo "⚠️  Please replace the placeholder values with your actual credentials:"

# MongoDB URI
echo "📦 Adding MONGODB_URI..."
echo "Please enter your MongoDB URI (format: mongodb+srv://username:password@cluster.mongodb.net/database):"
read -r MONGODB_URI
npx vercel env add MONGODB_URI production <<< "$MONGODB_URI"

# Redis URL  
echo "📦 Adding REDIS_URL..."
echo "Please enter your Redis URL (format: redis://default:password@host:port):"
read -r REDIS_URL
npx vercel env add REDIS_URL production <<< "$REDIS_URL"

# Groq API Key
echo "🤖 Adding GROQ_API_KEY..."
echo "Please enter your Groq API key:"
read -r GROQ_API_KEY
npx vercel env add GROQ_API_KEY production <<< "$GROQ_API_KEY"

# NYT API Key (optional)
echo "📰 Adding NYT_API_KEY (optional - press Enter to skip)..."
echo "Please enter your NYT API key or press Enter to skip:"
read -r NYT_API_KEY
if [ -n "$NYT_API_KEY" ]; then
    npx vercel env add NYT_API_KEY production <<< "$NYT_API_KEY"
fi

# Node Environment
echo "🌍 Adding NODE_ENV..."
npx vercel env add NODE_ENV production <<< "production"

echo "✅ Environment variables added successfully!"
echo "🚀 Now redeploy to apply the changes:"
echo "   npx vercel --prod"
