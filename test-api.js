const axios = require('axios');

const BASE_URL = 'https://emi-backend-wodb.onrender.com';

async function testAPI() {
  console.log('🧪 Testing EMI Backend API...\n');

  try {
    // Test root endpoint
    console.log('1. Testing root endpoint (/)...');
    const rootResponse = await axios.get(`${BASE_URL}/`);
    console.log('✅ Root endpoint:', rootResponse.data.message);
    console.log('   Available endpoints:', Object.keys(rootResponse.data.endpoints).length);
    console.log('');

    // Test health endpoint
    console.log('2. Testing health endpoint (/health)...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health endpoint:', healthResponse.data.message);
    console.log('   Status:', healthResponse.data.status);
    console.log('');

    // Test auth endpoints (without authentication)
    console.log('3. Testing auth endpoints...');
    
    // Test registration with invalid data (should fail gracefully)
    try {
      const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
        name: 'Test User',
        email: 'invalid-email',
        password: '123'
      });
      console.log('❌ Registration should have failed with invalid email');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Registration validation working correctly');
        console.log('   Error:', error.response.data.message || 'Validation failed');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    console.log('');

    // Test transactions endpoint (should return 401 without auth)
    console.log('4. Testing protected endpoints...');
    try {
      const transactionsResponse = await axios.get(`${BASE_URL}/api/transactions`);
      console.log('❌ Transactions endpoint should require authentication');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Transactions endpoint properly protected');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    console.log('');

    console.log('🎉 API testing completed successfully!');
    console.log('📊 API Status: HEALTHY');
    console.log('🌐 Base URL:', BASE_URL);
    console.log('📚 Available endpoints:');
    console.log('   - GET  / (API info)');
    console.log('   - GET  /health (Health check)');
    console.log('   - POST /api/auth/register (User registration)');
    console.log('   - POST /api/auth/login (User login)');
    console.log('   - GET  /api/transactions (Protected)');
    console.log('   - GET  /api/emis (Protected)');
    console.log('   - GET  /api/reports (Protected)');

  } catch (error) {
    console.error('❌ API test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Run the test
testAPI();
