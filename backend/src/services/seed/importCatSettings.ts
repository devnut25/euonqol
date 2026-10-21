import { PrismaClient } from '../../generated/app';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface CatSettingConfig {
  id: number;
  name: string;
  description: string;
  setting_key: string;
  api_configuration: any | null;
}

interface CatSettingsData {
  settings: CatSettingConfig[];
}

/**
 * Import CAT settings from JSON configuration file
 * 
 * JSON structure:
 * - File: cat-settings-config.json
 * - Contains: id, name, description, setting_key, api_configuration
 * 
 * The api_configuration field contains the complete CAT setting object
 * as defined in the CAT API documentation (backend/docs/api.yaml)
 */
export async function importCatSettings() {
  console.log('⚙️  Importing CAT settings from JSON configuration...');
  
  try {
    // Read JSON configuration file
    const filePath = path.join(process.cwd(), 'data', 'cat-settings-config.json');
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Configuration file not found: ${filePath}`);
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data: CatSettingsData = JSON.parse(fileContent);
    
    if (!data.settings || !Array.isArray(data.settings)) {
      throw new Error('Invalid JSON structure: "settings" array not found');
    }
    
    console.log(`📊 Found ${data.settings.length} CAT settings in configuration`);
    
    // Validate data
    const validSettings = data.settings.filter(setting => {
      if (!setting.id || !setting.name || !setting.setting_key) {
        console.warn(`⚠️  Skipping invalid setting: id=${setting.id}, name="${setting.name}"`);
        return false;
      }
      return true;
    });
    
    console.log(`✓ Validated ${validSettings.length} CAT settings`);
    
    // Check for missing configurations
    const missingConfig = validSettings.filter(s => !s.api_configuration);
    if (missingConfig.length > 0) {
      console.warn(`⚠️  ${missingConfig.length} settings have null api_configuration:`);
      missingConfig.forEach(s => console.warn(`   - ${s.name} (id: ${s.id})`));
    }
    
    // Upsert CAT settings
    let createdCount = 0;
    let updatedCount = 0;
    
    for (const setting of validSettings) {
      const existing = await prisma.cat_settings.findUnique({
        where: { id: setting.id },
      });
      
      await prisma.cat_settings.upsert({
        where: { id: setting.id },
        update: {
          name: setting.name,
          description: setting.description,
          setting_key: setting.setting_key,
          api_configuration: setting.api_configuration,
        },
        create: {
          id: setting.id,
          name: setting.name,
          description: setting.description,
          setting_key: setting.setting_key,
          api_configuration: setting.api_configuration,
        },
      });
      
      if (existing) {
        updatedCount++;
      } else {
        createdCount++;
      }
    }
    
    console.log(`✅ CAT settings import completed successfully!`);
    console.log(`   - Created: ${createdCount}`);
    console.log(`   - Updated: ${updatedCount}`);
    console.log(`   - Total: ${validSettings.length}`);
    console.log(`   - With api_configuration: ${validSettings.filter(s => s.api_configuration).length}`);
    console.log(`   - Missing api_configuration: ${missingConfig.length}`);
    
  } catch (error) {
    console.error('❌ Error importing CAT settings:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  importCatSettings()
    .then(() => {
      console.log('\n🎉 CAT settings seeding completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 CAT settings seeding failed:', error);
      process.exit(1);
    });
}
