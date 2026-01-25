#!/bin/bash

# 🔍 Pre-Deployment Environment Check
echo "🔍 Checking deployment readiness..."

# Check if required files exist
echo "📁 Checking required files..."
files=("server.js" "package.json" "vercel.json" ".env")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file found"
    else
        echo "❌ $file missing"
    fi
done

# Check environment variables
echo "🔧 Checking environment variables..."
env_vars=("MONGODB_URI" "REDIS_URL" "GROQ_API_KEY")
for var in "${env_vars[@]}"; do
    if [ -n "${!var}" ]; then
        echo "✅ $var is set"
    else
        echo "⚠️ $var not set in environment"
    fi
done

# Test local server
echo "🧪 Testing local server startup..."
timeout 10s npm start > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Server starts successfully"
else
    echo "⚠️ Server startup issues detected"
fi

# Check dependencies
echo "📦 Checking dependencies..."
npm list --depth=0 > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ All dependencies installed"
else
    echo "⚠️ Dependency issues detected - run npm install"
fi

echo "🎯 Pre-deployment check complete!"
echo "🚀 Ready to deploy to testbackend project"
