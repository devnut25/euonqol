/**
 * Script to fetch all CAT settings from the CAT API
 * and update cat-settings-config.json with complete api_configuration
 * 
 * Usage: node scripts/fetch-all-cat-settings.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CAT_API_URL = process.env.CAT_API_URL || 'https://cat.eortc.org/api';
const CAT_API_KEY = process.env.CAT_API_KEY || '3c76147c-7bc1-48d3-a054-f2fb8eb635d3';
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'cat-settings-config.json');

console.log('🔧 CAT Settings Configuration Fetcher');
console.log('=====================================\n');

/**
 * Fetch a single CAT setting configuration from the API
 */
async function fetchCatSettingConfig(settingKey) {
  try {
    console.log(`📡 Fetching: ${settingKey}...`);
    
    const response = await axios.get(
      `${CAT_API_URL}/runner/createSession/${settingKey}`,
      {
        headers: { 'api-key': CAT_API_KEY },
        timeout: 30000
      }
    );
    
    const session = response.data.session || response.data;
    
    // Build setting configuration from session
    const setting = {
      name: settingKey,
      dimensionOrder: session.dimensionOrder || [],
      dimensions: {}
    };
    
    // Extract configuration from each dimension
    if (session.progress && session.progress.dimensions) {
      session.progress.dimensions.forEach(dim => {
        if (dim.setting) {
          setting.dimensions[dim.name] = dim.setting;
        }
      });
    }
    
    console.log(`   ✅ Retrieved (${Object.keys(setting.dimensions).length} dimension(s))`);
    return setting;
    
  } catch (error) {
    if (error.response) {
      console.error(`   ❌ API Error ${error.response.status}: ${error.response.data?.error || error.message}`);
    } else if (error.request) {
      console.error(`   ❌ No response from API: ${error.message}`);
    } else {
      console.error(`   ❌ Error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Read existing configuration
    if (!fs.existsSync(CONFIG_FILE)) {
      console.error(`❌ Configuration file not found: ${CONFIG_FILE}`);
      process.exit(1);
    }
    
    const fileContent = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(fileContent);
    
    if (!config.settings || !Array.isArray(config.settings)) {
      console.error('❌ Invalid configuration structure');
      process.exit(1);
    }
    
    console.log(`📄 Loaded ${config.settings.length} settings from configuration file\n`);
    
    // Filter settings that need api_configuration
    const settingsToFetch = config.settings.filter(s => !s.api_configuration);
    const settingsAlreadyConfigured = config.settings.filter(s => s.api_configuration);
    
    console.log(`   - Already configured: ${settingsAlreadyConfigured.length}`);
    console.log(`   - To fetch: ${settingsToFetch.length}\n`);
    
    if (settingsToFetch.length === 0) {
      console.log('✅ All settings already have api_configuration!');
      return;
    }
    
    // Ask for confirmation
    console.log('This will fetch configurations from CAT API for:');
    settingsToFetch.forEach(s => console.log(`   - ${s.name} (id: ${s.id})`));
    console.log('');
    
    // Fetch configurations
    let successCount = 0;
    let failCount = 0;
    
    for (const setting of settingsToFetch) {
      const apiConfig = await fetchCatSettingConfig(setting.setting_key);
      
      if (apiConfig) {
        // Find and update the setting in config
        const settingIndex = config.settings.findIndex(s => s.id === setting.id);
        if (settingIndex !== -1) {
          config.settings[settingIndex].api_configuration = apiConfig;
          successCount++;
        }
      } else {
        failCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n📊 Summary:');
    console.log(`   - Successfully fetched: ${successCount}`);
    console.log(`   - Failed: ${failCount}`);
    console.log(`   - Already configured: ${settingsAlreadyConfigured.length}`);
    console.log(`   - Total: ${config.settings.length}\n`);
    
    if (successCount > 0) {
      // Backup original file
      const backupFile = CONFIG_FILE.replace('.json', `.backup.${Date.now()}.json`);
      fs.writeFileSync(backupFile, fileContent, 'utf-8');
      console.log(`💾 Backup created: ${path.basename(backupFile)}`);
      
      // Write updated configuration
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`✅ Updated configuration file: ${path.basename(CONFIG_FILE)}`);
      console.log('\n✨ Success! You can now run the seeding script to import settings to database.');
    } else {
      console.log('⚠️  No changes made to configuration file.');
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run
main();
