#!/usr/bin/env node

/**
 * Zero Tasks Debug Agent - Generate JWT and test with curl
 */

const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');

try {
  // Generate JWT token
  const secret = process.env.JWT_SECRET || 'aidis-dev-secret-2024';
  const token = jwt.sign({ 
    userId: 'admin', 
    username: 'admin', 
    role: 'admin' 
  }, secret, { expiresIn: '1h' });

  console.log('🔧 Testing Dashboard API...');
  console.log('🎯 Current Project: AIDIS COMMAND');
  console.log('🔑 Generated JWT token');

  // Use curl to test the API
  const curlCommand = `curl -s -H "Authorization: Bearer ${token}" http://localhost:5001/api/dashboard/stats`;
  
  console.log('\n📊 Dashboard API Response:');
  const response = execSync(curlCommand, { encoding: 'utf8' });
  
  try {
    const result = JSON.parse(response);
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.data) {
      const data = result.data;
      console.log('\n🔍 Task Analysis:');
      console.log(`Total Tasks: ${data.totalTasks}`);
      console.log(`Active Tasks: ${data.activeTasks}`);
      console.log(`Contexts: ${data.contexts}`);
      
      if (data.totalTasks === 0) {
        console.log('\n❌ PROBLEM CONFIRMED: Dashboard showing 0 tasks');
        console.log('💡 The project filtering is working but returning 0 tasks');
        console.log('🔍 Need to check if tasks exist for current project ID');
      } else {
        console.log(`\n✅ Found ${data.totalTasks} tasks! Dashboard should show data.`);
      }
    }
  } catch (parseError) {
    console.log('Raw response:', response);
  }

} catch (error) {
  console.error('❌ Error:', error.message);
}
