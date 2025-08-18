const axios = require('axios');

async function debugDecisionsAPI() {
  console.log('🔧 Debugging Decisions API...');

  try {
    // First, login
    console.log('1. Logging in...');
    const loginResponse = await axios.post('http://localhost:5001/api/auth/login', {
      username: 'admin',
      password: 'admin123!'
    });

    if (!loginResponse.data.success) {
      console.error('❌ Login failed:', loginResponse.data);
      return;
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');

    // Create axios instance with auth
    const api = axios.create({
      baseURL: 'http://localhost:5001/api',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Test decisions search
    console.log('\n2. Testing decisions search...');
    try {
      const searchResponse = await api.get('/decisions?limit=20&offset=0');
      console.log('✅ Search Response:', JSON.stringify(searchResponse.data, null, 2));
    } catch (err) {
      console.log('❌ Search Error:', err.response?.data || err.message);
      console.log('Search Error details:', err.response?.status, err.response?.statusText);
    }

    // Test decisions stats
    console.log('\n3. Testing decisions stats...');
    try {
      const statsResponse = await api.get('/decisions/stats');
      console.log('✅ Stats Response:', JSON.stringify(statsResponse.data, null, 2));
    } catch (err) {
      console.log('❌ Stats Error:', err.response?.data || err.message);
      console.log('Stats Error details:', err.response?.status, err.response?.statusText);
    }

    // Check the backend routes
    console.log('\n4. Testing backend route structure...');
    try {
      const healthResponse = await api.get('/health');
      console.log('✅ Backend is responding');
    } catch (err) {
      console.log('❌ Backend health check failed:', err.message);
    }

  } catch (error) {
    console.error('❌ Overall error:', error.message);
  }
}

debugDecisionsAPI();
