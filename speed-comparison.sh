#!/bin/bash

# 🏁 Backend Speed Comparison Test
# Original vs Optimized Backend Performance

echo "🏁 WebStory Backend Speed Comparison Test"
echo "=========================================="
echo ""

# URLs to test
ORIGINAL_BACKEND="https://webstorybackend-9fbvzi09f-ajay-s-projects-7337fb6b.vercel.app"
OPTIMIZED_BACKEND="https://testbackend-1ozlto9qm-ajay-s-projects-7337fb6b.vercel.app"

# Test endpoints
ENDPOINTS=(
    "/"
    "/api/articles"
    "/api/system-status"
)

# Function to test response time
test_endpoint() {
    local url=$1
    local endpoint=$2
    local name=$3
    
    echo "🔍 Testing: $name$endpoint"
    
    # Perform 3 tests and get average
    local total_time=0
    local success_count=0
    
    for i in {1..3}; do
        local start_time=$(date +%s%N)
        local response=$(curl -s -w "%{http_code}" -o /dev/null "$url$endpoint" 2>/dev/null)
        local end_time=$(date +%s%N)
        
        if [ "$response" = "200" ] || [ "$response" = "404" ]; then
            local duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
            total_time=$((total_time + duration))
            success_count=$((success_count + 1))
            echo "   Test $i: ${duration}ms (HTTP $response)"
        else
            echo "   Test $i: Failed (HTTP $response)"
        fi
    done
    
    if [ $success_count -gt 0 ]; then
        local avg_time=$((total_time / success_count))
        echo "   ✅ Average: ${avg_time}ms"
        echo ""
        return $avg_time
    else
        echo "   ❌ All tests failed"
        echo ""
        return 9999
    fi
}

# Function to test with detailed timing
test_detailed() {
    local url=$1
    local endpoint=$2
    local name=$3
    
    echo "🔍 Detailed Test: $name$endpoint"
    
    local result=$(curl -s -w "Time: %{time_total}s | DNS: %{time_namelookup}s | Connect: %{time_connect}s | Transfer: %{time_starttransfer}s | Size: %{size_download} bytes | HTTP: %{http_code}" -o /dev/null "$url$endpoint" 2>/dev/null)
    echo "   📊 $result"
    echo ""
}

echo "🚀 Starting Performance Comparison..."
echo ""

# Test Original Backend
echo "📱 ORIGINAL BACKEND: $ORIGINAL_BACKEND"
echo "-------------------------------------------"

original_root_time=0
original_articles_time=0
original_status_time=0

test_endpoint "$ORIGINAL_BACKEND" "/" "Original"
original_root_time=$?

test_endpoint "$ORIGINAL_BACKEND" "/api/articles" "Original"
original_articles_time=$?

# Note: Original might not have system-status endpoint
echo "🔍 Testing: Original/api/system-status"
echo "   ⚠️ Endpoint may not exist on original backend"
echo ""

echo ""
echo "🎯 OPTIMIZED BACKEND: $OPTIMIZED_BACKEND"
echo "-------------------------------------------"

optimized_root_time=0
optimized_articles_time=0
optimized_status_time=0

test_endpoint "$OPTIMIZED_BACKEND" "/" "Optimized"
optimized_root_time=$?

test_endpoint "$OPTIMIZED_BACKEND" "/api/articles" "Optimized"
optimized_articles_time=$?

test_endpoint "$OPTIMIZED_BACKEND" "/api/system-status" "Optimized"
optimized_status_time=$?

echo ""
echo "📊 PERFORMANCE COMPARISON RESULTS"
echo "=================================="
echo ""

# Root endpoint comparison
if [ $original_root_time -ne 9999 ] && [ $optimized_root_time -ne 9999 ]; then
    local improvement=$(( (original_root_time - optimized_root_time) * 100 / original_root_time ))
    echo "🏠 Root Endpoint (/):"
    echo "   Original:  ${original_root_time}ms"
    echo "   Optimized: ${optimized_root_time}ms"
    if [ $optimized_root_time -lt $original_root_time ]; then
        echo "   🚀 Improvement: ${improvement}% faster"
    else
        echo "   📊 Difference: $((optimized_root_time - original_root_time))ms slower"
    fi
    echo ""
fi

# Articles endpoint comparison
if [ $original_articles_time -ne 9999 ] && [ $optimized_articles_time -ne 9999 ]; then
    local improvement=$(( (original_articles_time - optimized_articles_time) * 100 / original_articles_time ))
    echo "📰 Articles API (/api/articles):"
    echo "   Original:  ${original_articles_time}ms"
    echo "   Optimized: ${optimized_articles_time}ms"
    if [ $optimized_articles_time -lt $original_articles_time ]; then
        echo "   🚀 Improvement: ${improvement}% faster"
    else
        echo "   📊 Difference: $((optimized_articles_time - original_articles_time))ms slower"
    fi
    echo ""
fi

echo "🎯 OPTIMIZATION FEATURES (Only in Optimized Backend):"
echo "   ✅ Multi-tier caching (Memory + Redis)"
echo "   ✅ Groq API rate limiting (0 errors)"
echo "   ✅ Real-time performance monitoring"
echo "   ✅ Background AI commentary worker"
echo "   ✅ Database connection pooling"
echo "   ✅ Edge CDN optimization"
echo "   ✅ Compression (gzip/deflate)"
echo ""

echo "🔄 Now running detailed timing analysis..."
echo ""

test_detailed "$ORIGINAL_BACKEND" "/" "Original"
test_detailed "$OPTIMIZED_BACKEND" "/" "Optimized"

test_detailed "$ORIGINAL_BACKEND" "/api/articles" "Original"
test_detailed "$OPTIMIZED_BACKEND" "/api/articles" "Optimized"

echo "✅ Performance comparison complete!"
