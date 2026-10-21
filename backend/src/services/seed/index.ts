import { importAnswers } from './importAnswers';
import { importCatSettings } from './importCatSettings';
import { importKitVersionCat } from './importKitVersionCat';
import { importKitVersionSocioDemo } from './importKitVersionSocioDemo';
import { importKitVersionStatic } from './importKitVersionStatic';
import { seedQuestionGroupMapping } from './seedQuestionGroupMapping';

async function runAllSeeds() {
  console.log('🌱 Starting complete database seeding from Excel files...\n');

  try {
    // Phase 1: Foundation data (order matters for FK dependencies)
    console.log('=== Phase 1: Foundation Data ===\n');
    // await seedCountries();
    // await seedPatientGroups();
    // await seedUsers();

    // Phase 2: Answer catalog and CAT settings
    console.log('\n=== Phase 2: Answer Catalog & CAT Settings ===\n');
    await importAnswers();

    // Phase 3: Kit versions and questions
    console.log('\n=== Phase 3: Questions Import ===\n');
    await importKitVersionStatic('EUonQoL v1.0'); // created_by will be null
    await importKitVersionCat('EUonQoL v1.0');
    await importKitVersionSocioDemo('EUonQoL v1.0');

    // Phase 4: Question-Group mappings
    console.log('\n=== Phase 4: Question-Group Mappings ===\n');
    await seedQuestionGroupMapping('EUonQoL v1.0');

    console.log('\n✨ All seeding completed successfully!');
  } catch (error) {
    console.error('\n💥 Seeding failed:', error);
    process.exit(1);
  }
}

async function runSeed(seedName: string) {
  console.log(`🌱 Running ${seedName} seeder...\n`);

  try {
    switch (seedName) {
      // case 'countries':
      //   await seedCountries();
      //   break;
      // case 'groups':
      //   await seedPatientGroups();
      //   break;
      // case 'users':
      //   await seedUsers();
      //   break;
      case 'answers':
        await importAnswers();
        break;
      case 'cat-settings':
      case 'catsettings':
        await importCatSettings();
        break;
      case 'static':
        await importKitVersionStatic('EUonQoL v1.0');
        break;
      case 'cat':
      case 'dynamic':
        await importKitVersionCat('EUonQoL v1.0');
        break;
      case 'socio-demo':
      case 'sociodemo':
        await importKitVersionSocioDemo('EUonQoL v1.0');
        break;
      case 'mappings':
        await seedQuestionGroupMapping('EUonQoL v1.0');
        break;
      default:
        console.error(`❌ Unknown seeder: ${seedName}`);
        console.log(
          'Available seeders: countries, groups, users, answers, cat-settings, static, cat, socio-demo, mappings'
        );
        process.exit(1);
    }

    console.log('\n✨ Seeding completed successfully!');
  } catch (error) {
    console.error('\n💥 Seeding failed:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // No arguments: run all seeds
  runAllSeeds();
} else if (args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: npm run seed [seeder-name]

Available seeders:
  countries     - Seed EU countries from Excel Languages sheet
  groups        - Seed patient groups
  users         - Seed default users
  answers       - Import answer catalog from Excel Answers sheet
  cat-settings  - Import CAT settings from Excel CatSettings sheet
  static        - Import static questions from Excel
  cat/dynamic   - Import CAT questions from Excel
  socio-demo    - Import socio-demo questions from Excel
  mappings      - Map questions to patient groups

Examples:
  npm run seed              # Run all seeders in correct order
  npm run seed countries    # Run only countries seeder
  npm run seed cat-settings # Import CAT settings
  npm run seed socio-demo   # Import socio-demo questions
  npm run seed answers      # Import answer catalog
  npm run seed static       # Import static questions
  `);
} else {
  // Run specific seeder
  runSeed(args[0]);
}
