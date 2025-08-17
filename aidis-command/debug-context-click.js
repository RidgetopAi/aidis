const { chromium } = require('playwright');

async function debugContextClick() {
  console.log('🎭 Starting Playwright debug session...');
  
  const browser = await chromium.launch({ 
    headless: false,  // Show browser
    slowMo: 1000     // Slow down for debugging
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to all network requests
  page.on('request', request => {
    if (request.url().includes('api')) {
      console.log('📤 REQUEST:', request.method(), request.url());
      console.log('📤 HEADERS:', request.headers());
    }
  });

  page.on('response', response => {
    if (response.url().includes('api')) {
      console.log('📥 RESPONSE:', response.status(), response.url());
    }
  });

  // Navigate to dashboard
  console.log('🚀 Going to AIDIS dashboard...');
  await page.goto('http://localhost:3000');
  
  // Wait for login form and login
  console.log('🔐 Logging in...');
  await page.waitForSelector('input[type="text"]');
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123!');
  await page.click('button[type="submit"]');
  
  // Wait for dashboard to load
  await page.waitForSelector('text=Good evening');
  console.log('✅ Dashboard loaded!');
  
  // Take screenshot before clicking
  await page.screenshot({ path: '/home/ridgetop/aidis/debug-images/before-contexts-click.png' });
  console.log('📸 Screenshot taken: before-contexts-click.png');
  
  // Click Contexts in sidebar
  console.log('🔍 Clicking Contexts link...');
  await page.click('text=Contexts');
  
  // Wait a moment for any network calls
  await page.waitForTimeout(2000);
  
  // Take screenshot after clicking
  await page.screenshot({ path: '/home/ridgetop/aidis/debug-images/after-contexts-click.png' });
  console.log('📸 Screenshot taken: after-contexts-click.png');
  
  // Check localStorage for token
  const tokenInfo = await page.evaluate(() => {
    return {
      token: localStorage.getItem('aidis_token'),
      user: localStorage.getItem('aidis_user'),
    };
  });
  
  console.log('🔑 Token info:', tokenInfo);
  
  // Keep browser open for manual inspection
  console.log('🔍 Browser will stay open for 30 seconds for manual inspection...');
  await page.waitForTimeout(30000);
  
  await browser.close();
  console.log('✅ Debug session complete!');
}

debugContextClick().catch(console.error);
