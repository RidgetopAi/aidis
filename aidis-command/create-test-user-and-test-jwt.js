#!/usr/bin/env node

const bcrypt = require('bcrypt');
const { Client } = require('pg');

// Database configuration (matching backend config)
const dbConfig = {
  user: process.env.DATABASE_USER || 'ridgetop',
  host: process.env.DATABASE_HOST || 'localhost',
  database: process.env.DATABASE_NAME || 'aidis_development',
  password: process.env.DATABASE_PASSWORD || 'bandy',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
};

console.log('🔧 Setting up test user for WebSocket authentication testing...\n');

async function createTestUser() {
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check if test user already exists
    const userCheck = await client.query(
      'SELECT id FROM admin_users WHERE username = $1',
      ['testuser']
    );

    if (userCheck.rows.length > 0) {
      console.log('ℹ️  Test user already exists, cleaning up...');
      // Clean up existing user
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userCheck.rows[0].id]);
      await client.query('DELETE FROM admin_users WHERE username = $1', ['testuser']);
    }

    // Create test user with known password
    const passwordHash = await bcrypt.hash('testpass123', 12);
    
    const result = await client.query(`
      INSERT INTO admin_users (username, email, password_hash, role, is_active) 
      VALUES ($1, $2, $3, $4, true) 
      RETURNING id, username, email, role
    `, ['testuser', 'test@example.com', passwordHash, 'admin']);

    const user = result.rows[0];
    console.log('✅ Test user created:', user);

    return user;

  } catch (error) {
    console.error('❌ Database error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

async function testLogin() {
  console.log('\n🔐 Testing login with created user...');
  
  const response = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'testuser',
      password: 'testpass123'
    })
  });

  if (response.ok) {
    const data = await response.json();
    console.log('✅ Login successful');
    console.log('   🎫 JWT Token:', data.token.substring(0, 50) + '...');
    return data.token;
  } else {
    const error = await response.text();
    console.log('❌ Login failed:', error);
    throw new Error('Login failed');
  }
}

async function testWebSocketWithRealToken(token) {
  console.log('\n🔌 Testing WebSocket with real JWT token...');
  
  const WebSocket = require('ws');
  const wsUrl = `ws://localhost:5000/ws?token=${encodeURIComponent(token)}`;
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let resolved = false;
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected successfully with real token!');
      ws.send(JSON.stringify({ type: 'ping' }));
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📨 Received message:', message);
      
      if (message.type === 'pong') {
        console.log('✅ WebSocket ping/pong successful - Authentication is working!');
        ws.close();
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`ℹ️  WebSocket closed: ${code} ${reason}`);
      if (!resolved) {
        resolved = true;
        resolve(code === 1000); // Normal closure
      }
    });
    
    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) {
        console.log('⏱️  WebSocket test timed out');
        ws.close();
        resolved = true;
        resolve(false);
      }
    }, 10000);
  });
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test user...');
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    
    // Get user ID first
    const userResult = await client.query('SELECT id FROM admin_users WHERE username = $1', ['testuser']);
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;
      
      // Clean up sessions first (foreign key constraint)
      await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
      
      // Delete user
      await client.query('DELETE FROM admin_users WHERE id = $1', [userId]);
      
      console.log('✅ Test user cleaned up');
    }
  } catch (error) {
    console.error('⚠️  Cleanup warning:', error.message);
  } finally {
    await client.end();
  }
}

async function main() {
  try {
    console.log('🚀 Starting comprehensive WebSocket authentication test...\n');
    
    // Create test user
    await createTestUser();
    
    // Login to get real JWT token
    const token = await testLogin();
    
    // Test WebSocket with real token
    const wsResult = await testWebSocketWithRealToken(token);
    
    if (wsResult) {
      console.log('\n🎉 SUCCESS: WebSocket authentication is working correctly!');
      console.log('   - Real JWT tokens from login API work with WebSocket');
      console.log('   - Token key mismatch issue is FIXED');
      console.log('   - JWT payload format is correct (userId field)');
      console.log('   - JWT secrets are consistent between services');
    } else {
      console.log('\n❌ WebSocket authentication is still failing');
      console.log('   - Check backend logs for detailed error information');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Always cleanup
    await cleanup();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Interrupted, cleaning up...');
  await cleanup();
  process.exit(0);
});

// Run the test
main();
