#!/usr/bin/env node

/**
 * Zero Tasks Debug Agent - Manual verification script
 */

const { execSync } = require('child_process');

async function verifyDashboardFix() {
  console.log('🎯 Zero Tasks Debug Agent - Manual Verification');
  console.log('===============================================');
  console.log();
  
  try {
    // Test 1: Verify backend is returning correct data
    console.log('🔧 Step 1: Testing backend API directly...');
    
    const loginResponse = execSync(`curl -s -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123!"}' http://localhost:5001/api/auth/login`, { encoding: 'utf8' });
    const loginData = JSON.parse(loginResponse);
    
    if (!loginData.token) {
      throw new Error('Failed to get auth token');
    }
    
    const dashboardResponse = execSync(`curl -s -H "Authorization: Bearer ${loginData.token}" http://localhost:5001/api/dashboard/stats`, { encoding: 'utf8' });
    const dashboardData = JSON.parse(dashboardResponse);
    
    console.log('📊 Backend Response:');
    console.log(`   Total Tasks: ${dashboardData.data.totalTasks}`);
    console.log(`   Active Tasks: ${dashboardData.data.activeTasks}`);
    console.log(`   Contexts: ${dashboardData.data.contexts}`);
    console.log();
    
    if (dashboardData.data.activeTasks === 3) {
      console.log('✅ Backend API: WORKING (returns 3 tasks)');
    } else {
      console.log(`❌ Backend API: FAILED (returns ${dashboardData.data.activeTasks} tasks)`);
      return false;
    }
    
    // Step 2: Check frontend status
    console.log('🌐 Step 2: Checking frontend status...');
    
    try {
      const frontendResponse = execSync('curl -s http://localhost:3001/', { encoding: 'utf8' });
      if (frontendResponse.includes('<title>')) {
        console.log('✅ Frontend: RUNNING (http://localhost:3001)');
      } else {
        console.log('❌ Frontend: NOT RESPONDING');
        return false;
      }
    } catch (error) {
      console.log('❌ Frontend: NOT RUNNING');
      return false;
    }
    
    console.log();
    console.log('🎯 MANUAL VERIFICATION REQUIRED:');
    console.log('=================================');
    console.log();
    console.log('1. Open browser to: http://localhost:3001');
    console.log('2. Login with: admin / admin123!');
    console.log('3. Check dashboard "Active Tasks" count');
    console.log('4. Expected: 3 tasks');
    console.log('5. If you see 3, the fix is SUCCESSFUL! 🎉');
    console.log('6. If you still see 0, check browser console for errors');
    console.log();
    console.log('💡 Browser Console Debug:');
    console.log('   - Press F12 to open DevTools');
    console.log('   - Go to Console tab');
    console.log('   - Look for "📊 Oracle Phase 2 Dashboard - API Response"');
    console.log('   - This will show the raw API data received by frontend');
    console.log();
    
    return true;
    
  } catch (error) {
    console.error('❌ Verification Error:', error.message);
    return false;
  }
}

verifyDashboardFix().then(success => {
  if (success) {
    console.log('🏆 Verification setup complete - please manually test the browser');
  } else {
    console.log('💥 Verification failed - check the errors above');
  }
});
