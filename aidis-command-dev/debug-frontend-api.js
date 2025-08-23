#!/usr/bin/env node

/**
 * Zero Tasks Debug Agent - Test frontend API call directly
 */

const puppeteer = require('puppeteer');

async function debugFrontendDashboard() {
  let browser;
  try {
    console.log('🔧 Testing frontend dashboard API calls...');
    
    browser = await puppeteer.launch({ 
      headless: false, // Show browser for debugging
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1200, height: 800 }
    });
    
    const page = await browser.newPage();
    
    // Enable console logging
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warn' || msg.text().includes('Dashboard') || msg.text().includes('API')) {
        console.log(`🖥️  [${type.toUpperCase()}] ${msg.text()}`);
      }
    });
    
    // Enable network request monitoring
    page.on('response', response => {
      if (response.url().includes('/dashboard/stats')) {
        console.log(`📊 Dashboard API Response: ${response.status()}`);
        response.text().then(text => {
          console.log('📊 Response body:', text);
        });
      }
    });
    
    console.log('🌐 Loading frontend at http://localhost:3001...');
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle2' });
    
    // Wait for potential login redirect or dashboard load
    await page.waitForTimeout(3000);
    
    // Check if we're on login page and need to authenticate
    const currentUrl = page.url();
    console.log(`🔍 Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/login')) {
      console.log('🔑 Login required, attempting to authenticate...');
      
      await page.type('input[name="username"]', 'admin');
      await page.type('input[name="password"]', 'admin123!');
      await page.click('button[type="submit"]');
      
      // Wait for redirect
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      console.log(`✅ Authenticated, now at: ${page.url()}`);
    }
    
    // Navigate to dashboard if not there already
    if (!page.url().includes('/dashboard')) {
      console.log('📊 Navigating to dashboard...');
      await page.goto('http://localhost:3001/dashboard', { waitUntil: 'networkidle2' });
    }
    
    // Wait for dashboard to load and make API calls
    console.log('⏳ Waiting for dashboard to load...');
    await page.waitForTimeout(5000);
    
    // Check what task count is displayed in the DOM
    const taskCount = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid], .ant-statistic-content-value');
      for (let element of elements) {
        if (element.textContent && element.closest('.ant-statistic')) {
          const parent = element.closest('.ant-statistic');
          const title = parent.querySelector('.ant-statistic-title');
          if (title && title.textContent.includes('Task')) {
            return {
              title: title.textContent,
              value: element.textContent
            };
          }
        }
      }
      return null;
    });
    
    console.log('🎯 Task count in UI:', taskCount);
    
    // Give time to see the results
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugFrontendDashboard();
