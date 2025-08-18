#!/bin/bash

echo "🔍 DEBUGGING AIDIS COMMAND API ENDPOINTS"
echo "========================================="

BASE_URL="http://localhost:5000"
API_URL="$BASE_URL/api"

echo ""
echo "1️⃣ Testing backend health..."
curl -s -w "Status: %{http_code}\n" "$BASE_URL/health" || echo "❌ Backend not responding"

echo ""
echo "2️⃣ Testing login endpoint with correct password..."
LOGIN_RESPONSE=$(curl -s -w "\nStatus: %{http_code}\n" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123!"}' \
  "$API_URL/auth/login")

echo "$LOGIN_RESPONSE"

# Extract token from response (if successful)
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo ""
    echo "✅ Login successful! Token obtained: ${TOKEN:0:20}..."
    
    echo ""
    echo "3️⃣ Testing contexts endpoint WITHOUT token..."
    curl -s -w "Status: %{http_code}\n" "$API_URL/contexts"
    
    echo ""
    echo "4️⃣ Testing contexts endpoint WITH token..."
    curl -s -w "Status: %{http_code}\n" \
      -H "Authorization: Bearer $TOKEN" \
      "$API_URL/contexts"
    
    echo ""
    echo "5️⃣ Testing contexts stats endpoint WITH token..."
    curl -s -w "Status: %{http_code}\n" \
      -H "Authorization: Bearer $TOKEN" \
      "$API_URL/contexts/stats"
    
    echo ""
    echo "6️⃣ Testing session validation..."
    curl -s -w "Status: %{http_code}\n" \
      -H "Authorization: Bearer $TOKEN" \
      "$API_URL/auth/me"
      
else
    echo "❌ Login failed - cannot test authenticated endpoints"
    
    echo ""
    echo "3️⃣ Testing contexts endpoint WITHOUT token (should get 401)..."
    curl -s -w "Status: %{http_code}\n" "$API_URL/contexts"
fi

echo ""
echo "7️⃣ Checking database connection..."
curl -s -w "Status: %{http_code}\n" "$BASE_URL/db-status" || echo "No db-status endpoint"

echo ""
echo "✅ API debugging complete!"
