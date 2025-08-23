#!/usr/bin/env node

// Quick fix for database configuration mismatch
// Issue: Backend connecting to aidis_development (163 old contexts)
// Fix: Should connect to aidis_ui_dev (114 current contexts)

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'backend', '.env');

console.log('🔧 AIDIS Database Configuration Fix');
console.log('=====================================');
console.log('Problem: Backend using wrong database');
console.log('Current: aidis_development (163 old contexts)');
console.log('Expected: aidis_ui_dev (114 current contexts)');
console.log('');

try {
  // Read current .env
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('✅ Found existing .env file');
  } else {
    console.log('⚠️ No .env file found, creating new one');
  }

  // Update or add DATABASE_NAME
  const lines = envContent.split('\n');
  let updated = false;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('DATABASE_NAME=')) {
      const oldValue = lines[i];
      lines[i] = 'DATABASE_NAME=aidis_ui_dev';
      console.log(`✅ Updated: ${oldValue} → ${lines[i]}`);
      updated = true;
      break;
    }
  }

  if (!updated) {
    lines.push('DATABASE_NAME=aidis_ui_dev');
    console.log('✅ Added: DATABASE_NAME=aidis_ui_dev');
  }

  // Write back to .env
  fs.writeFileSync(envPath, lines.join('\n'));
  console.log('✅ Configuration updated successfully');
  console.log('');
  console.log('🔄 Next steps:');
  console.log('1. Restart backend: npm run dev:backend');
  console.log('2. Test API: should now return 114 contexts from aidis_ui_dev');
  console.log('3. Check UI: should show current data instead of 7-day-old data');

} catch (error) {
  console.error('❌ Error fixing configuration:', error);
  process.exit(1);
}
