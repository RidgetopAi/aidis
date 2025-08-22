#!/bin/bash
echo "🧹 Killing all AIDIS processes..."
pkill -f "src/server.ts" 2>/dev/null || true
pkill -f "aidis" 2>/dev/null || true  
pkill -f "tsx.*server" 2>/dev/null || true
pkill -9 -f "src/server.ts" 2>/dev/null || true
lsof -ti:8080 | xargs kill -9 2>/dev/null || true
echo "✅ All AIDIS processes terminated"
