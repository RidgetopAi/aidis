#!/usr/bin/env node

/**
 * Zero Tasks Debug Agent - Test dashboard API response
 */

const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

async function testDashboardAPI() {
  try {
    // Generate JWT token
    const secret = process.env.JWT_SECRET || 'aidis-dev-secret-2024';
    const token = jwt.sign({ 
      userId: 'admin', 
      username: 'admin', 
      role: 'admin' 
    }, secret, { expiresIn: '1h' });

    console.log('🔧 Testing Dashboard API with current project context...');
    console.log('🎯 Project should be: AIDIS COMMAND');

    // Call dashboard API
    const response = await fetch('http://localhost:5001/api/dashboard/stats', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    
    console.log('📊 Dashboard API Response:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      const data = result.data;
      console.log('\n🔍 Task Analysis:');
      console.log(`Total Tasks: ${data.totalTasks}`);
      console.log(`Active Tasks: ${data.activeTasks}`);
      console.log(`Contexts: ${data.contexts}`);
      
      if (data.totalTasks === 0) {
        console.log('\n❌ PROBLEM CONFIRMED: Dashboard showing 0 tasks');
        console.log('💡 This means the project filtering is working but no tasks in current project');
      } else {
        console.log('\n✅ Tasks found! Dashboard should be showing data.');
      }
    }

  } catch (error) {
    console.error('❌ Error testing dashboard API:', error);
  }
}

testDashboardAPI();
