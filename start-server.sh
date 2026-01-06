#!/bin/bash

# Startup Script for Complete Article Flow System
# Run this to start the server with article fetching

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     WEBSTORY BACKEND - Complete Article Flow System      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "🔄 System Features:"
echo "   ✅ Only serves articles WITH commentary"
echo "   ✅ Section Rotation Worker (every 5 min)"
echo "   ✅ 8 Sections: home, world, us, politics, business, technology, health, sports"
echo "   ✅ Processes 3 articles per section per rotation"
echo "   ✅ 4 Groq API keys (400k tokens/day capacity)"
echo ""
echo "📝 Initial Setup Options:"
echo ""
echo "1) Start server (worker runs automatically)"
echo "2) Test article fetcher for a specific section"
echo "3) Check current article counts"
echo "4) View system documentation"
echo "5) Exit"
echo ""
read -p "Choose option (1-5): " choice

case $choice in
  1)
    echo ""
    echo "🚀 Starting server..."
    echo "   Worker will start processing articles automatically"
    echo "   Wait 5-10 minutes for initial articles to be generated"
    echo ""
    node server.js
    ;;
  2)
    echo ""
    read -p "Enter section name (home/world/us/politics/business/technology/health/sports): " section
    read -p "How many articles to process? (default 5): " count
    count=${count:-5}
    echo ""
    echo "🔄 Processing $count articles for section: $section"
    node test-article-fetcher.js $section $count
    ;;
  3)
    echo ""
    echo "📊 Current article counts by section:"
    echo ""
    if command -v mongosh &> /dev/null; then
      mongosh "$MONGODB_URI" --quiet --eval "
        db.articles.aggregate([
          { \$match: { aiCommentary: { \$exists: true, \$ne: null, \$ne: '' } } },
          { \$group: { _id: '\$section', count: { \$sum: 1 } } },
          { \$sort: { _id: 1 } }
        ]).forEach(doc => print(doc._id + ': ' + doc.count + ' articles'))
      "
    else
      echo "⚠️  mongosh not found. Please check MongoDB manually or start the server."
    fi
    echo ""
    read -p "Press Enter to continue..."
    ./start-server.sh
    ;;
  4)
    echo ""
    echo "📖 Opening documentation..."
    if [ -f "../COMPLETE_ARTICLE_FLOW.md" ]; then
      cat ../COMPLETE_ARTICLE_FLOW.md | head -100
      echo ""
      echo "... (see COMPLETE_ARTICLE_FLOW.md for full documentation)"
    else
      echo "❌ Documentation not found"
    fi
    echo ""
    read -p "Press Enter to continue..."
    ./start-server.sh
    ;;
  5)
    echo ""
    echo "👋 Goodbye!"
    exit 0
    ;;
  *)
    echo ""
    echo "❌ Invalid option"
    echo ""
    ./start-server.sh
    ;;
esac
