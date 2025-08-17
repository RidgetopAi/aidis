#!/usr/bin/env node

const jwt = require('jsonwebtoken');

// Test JWT_SECRET consistency
console.log('🔍 Debugging JWT Secret Consistency...\n');

// Default secrets used in the application
const DEFAULT_SECRET = 'aidis-secret-key-change-in-production';
const ENV_SECRET = process.env.JWT_SECRET;

console.log('📋 JWT Secret Configuration:');
console.log(`   Default Secret: ${DEFAULT_SECRET}`);
console.log(`   ENV JWT_SECRET: ${ENV_SECRET || '(not set)'}`);
console.log(`   Actual Secret Used: ${ENV_SECRET || DEFAULT_SECRET}`);

const actualSecret = ENV_SECRET || DEFAULT_SECRET;

// Create a test token
const testPayload = {
  userId: 'test-user-123',
  username: 'testuser',
  email: 'test@example.com',
  role: 'admin',
  tokenId: 'test-token-id'
};

console.log('\n🔧 Creating Test JWT Token:');
const token = jwt.sign(testPayload, actualSecret, { expiresIn: '1h' });
console.log(`   Token: ${token.substring(0, 50)}...`);

// Verify the token with the same secret
console.log('\n✅ Verifying with Same Secret:');
try {
  const decoded = jwt.verify(token, actualSecret);
  console.log('   ✅ Token verified successfully');
  console.log('   📄 Decoded payload:', JSON.stringify(decoded, null, 2));
} catch (error) {
  console.log('   ❌ Token verification failed:', error.message);
}

// Try verifying with default secret (in case env differs)
console.log('\n🔍 Verifying with Default Secret:');
try {
  const decoded = jwt.verify(token, DEFAULT_SECRET);
  console.log('   ✅ Token verified with default secret');
} catch (error) {
  console.log('   ❌ Token verification with default secret failed:', error.message);
}

// Try creating token with default secret and verify with env secret
if (ENV_SECRET && ENV_SECRET !== DEFAULT_SECRET) {
  console.log('\n🔄 Cross-verification Test:');
  const tokenWithDefault = jwt.sign(testPayload, DEFAULT_SECRET, { expiresIn: '1h' });
  
  console.log('   Token created with default secret, verifying with ENV secret:');
  try {
    const decoded = jwt.verify(tokenWithDefault, ENV_SECRET);
    console.log('   ✅ Cross-verification successful');
  } catch (error) {
    console.log('   ❌ Cross-verification failed:', error.message);
  }
}

console.log('\n💡 Recommendations:');
if (!ENV_SECRET) {
  console.log('   - Set JWT_SECRET in your .env file to ensure consistency');
} else if (ENV_SECRET === DEFAULT_SECRET) {
  console.log('   - JWT_SECRET is set to the default value (good for development)');
} else {
  console.log('   - JWT_SECRET is set to a custom value (good for production)');
}
