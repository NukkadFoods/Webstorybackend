#!/bin/bash

# Stop Vercel Backend Deployment
# This script helps you stop/delete the backend deployment on Vercel

echo "╔══════════════════════════════════════════════════════════╗"
echo "║         STOP VERCEL BACKEND DEPLOYMENT                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found!"
    echo ""
    echo "Install it with:"
    echo "   npm install -g vercel"
    echo ""
    exit 1
fi

echo "🔍 Checking current Vercel deployments..."
echo ""

# List all deployments
vercel ls

echo ""
echo "Options:"
echo "1) Remove this project from Vercel (recommended)"
echo "2) Delete specific deployment"
echo "3) View deployment details"
echo "4) Cancel"
echo ""
read -p "Choose option (1-4): " choice

case $choice in
  1)
    echo ""
    echo "🗑️  Removing project from Vercel..."
    echo ""
    echo "⚠️  This will:"
    echo "   - Delete ALL deployments of this project"
    echo "   - Remove the project from your Vercel dashboard"
    echo "   - Stop all running instances"
    echo ""
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
      echo ""
      echo "To remove the project, you need to:"
      echo ""
      echo "1. Go to: https://vercel.com/dashboard"
      echo "2. Find your backend project"
      echo "3. Click on the project"
      echo "4. Go to Settings → General"
      echo "5. Scroll to 'Delete Project' section"
      echo "6. Click 'Delete'"
      echo ""
      echo "OR use this command with your project name:"
      echo "   vercel remove <project-name> --yes"
      echo ""
    else
      echo "❌ Cancelled"
    fi
    ;;
  2)
    echo ""
    read -p "Enter deployment URL to delete: " deployment_url
    echo ""
    echo "🗑️  Deleting deployment: $deployment_url"
    vercel rm "$deployment_url" --yes
    echo ""
    echo "✅ Deployment deleted"
    ;;
  3)
    echo ""
    vercel ls --meta
    ;;
  4)
    echo ""
    echo "👋 Cancelled"
    exit 0
    ;;
  *)
    echo ""
    echo "❌ Invalid option"
    ;;
esac

echo ""
echo "💡 Alternative: Pause serverless functions by setting environment variable:"
echo "   DISABLE_API=true in Vercel Dashboard → Settings → Environment Variables"
echo ""
echo "💡 Or rename vercel.json to vercel.json.disabled to prevent deployment:"
echo "   mv backend/vercel.json backend/vercel.json.disabled"
