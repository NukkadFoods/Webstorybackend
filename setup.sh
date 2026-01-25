#!/bin/bash

# 🚀 Webstory Backend Setup Script
# This script sets up the backend repository for development and deployment

echo "🚀 Setting up Webstory Backend..."

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ Error: server.js not found. Please run this script from the backend root directory."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "🔧 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your actual values:"
    echo "   - MONGODB_URI"
    echo "   - GROQ_API_KEY" 
    echo "   - NEWS_API_KEY"
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📡 Vercel CLI not found. Installing..."
    npm install -g vercel
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your actual environment variables"
echo "2. Start development server: npm run dev"
echo "3. Deploy to Vercel: npm run deploy"
echo ""
echo "🔗 Useful commands:"
echo "  npm run dev          - Start development server"
echo "  npm run deploy       - Deploy to production"
echo "  npm run deploy:preview - Deploy preview version"
echo ""
echo "📚 Documentation: See README.md for detailed information"
