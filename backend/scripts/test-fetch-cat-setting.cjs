/**
 * Test script to fetch a single CAT setting configuration
 * Useful for debugging and seeing the structure of a setting
 * 
 * Usage: node scripts/test-fetch-cat-setting.js [settingKey]
 * Example: node scripts/test-fetch-cat-setting.js EUonQOL_CAT_setting_FA
 */

const axios = require('axios');

const CAT_API_URL = process.env.CAT_API_URL || 'https://cat.eortc.org/api';
const CAT_API_KEY = process.env.CAT_API_KEY || '3c76147c-7bc1-48d3-a054-f2fb8eb635d3';
const SETTING_KEY = process.argv[2] || 'EUonQOL_CAT_setting_FA';

console.log('🔍 Test CAT Setting Fetch');
console.log('=========================\n');
console.log(`Setting Key: ${SETTING_KEY}`);
console.log(`API URL: ${CAT_API_URL}\n`);

async function testFetch() {
  try {
    console.log('📡 Creating session...');
    
    const response = await axios.get(
      `${CAT_API_URL}/runner/createSession/${SETTING_KEY}`,
      {
        headers: { 
          'api-key': CAT_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    console.log(`✅ Response Status: ${response.status}\n`);
    
    const session = response.data.session || response.data;
    
    console.log('📋 Session Overview:');
    console.log(`   Study: ${session.study || 'N/A'}`);
    console.log(`   Token: ${session.token || 'N/A'}`);
    console.log(`   Created At: ${session.createdAt || 'N/A'}`);
    console.log(`   Dimension Order: ${JSON.stringify(session.dimensionOrder || [])}\n`);
    
    // Extract configuration
    const setting = {
      name: SETTING_KEY,
      dimensionOrder: session.dimensionOrder || [],
      dimensions: {}
    };
    
    if (session.progress && session.progress.dimensions) {
      console.log(`📊 Dimensions Found: ${session.progress.dimensions.length}\n`);
      
      session.progress.dimensions.forEach((dim, index) => {
        console.log(`   ${index + 1}. ${dim.name} (${dim.instrument})`);
        console.log(`      - Items Available: ${dim.itemKeys?.length || 0}`);
        console.log(`      - Estimation Method: ${dim.setting?.estimationMethod || 'N/A'}`);
        console.log(`      - Selection Method: ${dim.setting?.itemSelectionMethod || 'N/A'}`);
        
        if (dim.setting) {
          setting.dimensions[dim.name] = dim.setting;
        }
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('COMPLETE API CONFIGURATION (copy this to cat-settings-config.json):');
    console.log('='.repeat(80));
    console.log(JSON.stringify(setting, null, 2));
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ Error fetching setting:');
    
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    } else if (error.request) {
      console.error('   No response received from API');
      console.error('   Check your network connection and API URL');
    } else {
      console.error('   ', error.message);
    }
    
    process.exit(1);
  }
}

testFetch();
