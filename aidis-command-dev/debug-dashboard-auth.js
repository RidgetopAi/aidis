#!/usr/bin/env node

/**
 * Zero Tasks Debug Agent - Authenticate and test dashboard API
 */

const { execSync } = require('child_process');

async function testDashboardWithAuth() {
  try {
    console.log('🔧 Testing Dashboard API with proper authentication...');

    // First, test the login endpoint to get a real JWT token
    const loginResponse = execSync(`curl -s -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123!"}' http://localhost:5001/api/auth/login`, { encoding: 'utf8' });
    
    console.log('🔑 Login Response:');
    console.log(loginResponse);
    
    let token;
    try {
      const loginData = JSON.parse(loginResponse);
      if (loginData.token) {
        token = loginData.token;
        console.log('✅ Successfully obtained JWT token');
      } else {
        console.log('❌ Login failed:', loginData.error);
        return;
      }
    } catch (e) {
      console.log('❌ Could not parse login response', e);
      return;
    }

    // Now test the dashboard API with the real token
    console.log('\n📊 Testing Dashboard API with authenticated token...');
    
    const dashboardResponse = execSync(`curl -s -H "Authorization: Bearer ${token}" http://localhost:5001/api/dashboard/stats`, { encoding: 'utf8' });
    
    console.log('📊 Dashboard API Response:');
    const result = JSON.parse(dashboardResponse);
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.data) {
      const data = result.data;
      console.log('\n🔍 Task Analysis:');
      console.log(`Total Tasks: ${data.totalTasks}`);
      console.log(`Active Tasks: ${data.activeTasks}`);
      console.log(`Contexts: ${data.contexts}`);
      
      if (data.totalTasks === 0) {
        console.log('\n❌ CONFIRMED: Dashboard API returning 0 tasks');
        console.log('💡 This confirms the frontend is not the issue - it\'s the backend data query');
        
        // Let's check what project ID the backend is using
        console.log('\n🔍 Next step: Check backend project context and database query');
        
      } else {
        console.log(`\n✅ Found ${data.totalTasks} tasks! Dashboard should show data.`);
        console.log('💡 If frontend shows 0, it\'s a frontend issue, not backend.');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDashboardWithAuth();
