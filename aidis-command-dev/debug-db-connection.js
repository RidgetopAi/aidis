const { Pool } = require('pg');
require('dotenv').config();

// Recreate the exact config used by the backend
const dbConfig = {
  user: process.env.DATABASE_USER || 'ridgetop',
  host: process.env.DATABASE_HOST || 'localhost',
  database: process.env.DATABASE_NAME || 'aidis_development',
  password: process.env.DATABASE_PASSWORD || 'bandy',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
};

console.log('🔍 DEBUG: Database Connection Configuration');
console.log('==========================================');
console.log('Config:', dbConfig);

async function testConnection() {
  const pool = new Pool(dbConfig);
  
  try {
    console.log('\n1️⃣ Testing connection...');
    const client = await pool.connect();
    
    console.log('\n2️⃣ Checking current database...');
    const dbResult = await client.query('SELECT current_database(), current_user');
    console.log('Connected to database:', dbResult.rows[0]);
    
    console.log('\n3️⃣ Listing all tables...');
    const tablesResult = await client.query(`
      SELECT table_name, table_schema 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('Tables found:', tablesResult.rows);
    
    console.log('\n4️⃣ Checking for admin_users table...');
    const adminTableResult = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_users'
      )
    `);
    console.log('admin_users table exists:', adminTableResult.rows[0].exists);
    
    if (adminTableResult.rows[0].exists) {
      console.log('\n5️⃣ Checking admin users...');
      const usersResult = await client.query('SELECT username, email, role, is_active FROM admin_users');
      console.log('Users found:', usersResult.rows);
    }
    
    client.release();
    await pool.end();
    console.log('\n✅ Connection test complete!');
    
  } catch (error) {
    console.error('❌ Connection failed:', error);
    await pool.end();
  }
}

testConnection();
