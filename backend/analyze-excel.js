import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function analyzeExcelFile(filePath, fileName) {
  console.log('\n' + '='.repeat(80));
  console.log(`ANALYZING: ${fileName}`);
  console.log('='.repeat(80) + '\n');

  const workbook = XLSX.readFile(filePath);
  
  console.log(`📋 Sheet Names: ${workbook.SheetNames.join(', ')}\n`);
  
  workbook.SheetNames.forEach((sheetName, index) => {
    console.log('-'.repeat(80));
    console.log(`Sheet ${index + 1}: "${sheetName}"`);
    console.log('-'.repeat(80));
    
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    
    if (jsonData.length === 0) {
      console.log('⚠️  Empty sheet\n');
      return;
    }
    
    // Get column names from first row
    const columns = Object.keys(jsonData[0]);
    console.log(`\n📊 Columns (${columns.length}):`);
    columns.forEach((col, i) => {
      console.log(`  ${i + 1}. ${col}`);
    });
    
    // Show sample data
    const sampleSize = Math.min(3, jsonData.length);
    console.log(`\n📝 Sample Data (${sampleSize} of ${jsonData.length} rows):\n`);
    
    for (let i = 0; i < sampleSize; i++) {
      console.log(`--- Row ${i + 1} ---`);
      const row = jsonData[i];
      columns.forEach(col => {
        const value = row[col];
        const displayValue = typeof value === 'string' && value.length > 100 
          ? value.substring(0, 100) + '...' 
          : value;
        console.log(`  ${col}: ${displayValue}`);
      });
      console.log('');
    }
    
    // Check for specific patterns
    const hasLanguageColumn = columns.some(col => 
      col.toLowerCase().includes('language') || 
      col.toLowerCase().includes('lang') ||
      col.toLowerCase().includes('locale')
    );
    const hasCountryColumn = columns.some(col => 
      col.toLowerCase().includes('country') ||
      col.toLowerCase().includes('nation')
    );
    const hasAnswerProfile = columns.some(col => 
      col.toLowerCase().includes('answer_profile') ||
      col.toLowerCase().includes('answerprofile')
    );
    
    console.log('🔍 Pattern Detection:');
    if (hasLanguageColumn) console.log('  ✓ Contains language-related column');
    if (hasCountryColumn) console.log('  ✓ Contains country-related column');
    if (hasAnswerProfile) console.log('  ✓ Contains answer_profile reference');
    
    // Check for answer_profile values in data
    const answerProfileValues = new Set();
    jsonData.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        if (key.toLowerCase().includes('answer_profile') || 
            key.toLowerCase().includes('answerprofile')) {
          if (value) answerProfileValues.add(value);
        }
      });
    });
    
    if (answerProfileValues.size > 0) {
      console.log(`  📌 Answer Profile Values Found: ${[...answerProfileValues].join(', ')}`);
    }
    
    console.log('\n');
  });
}

// Analyze both files
const staticFile = path.join(__dirname, 'data', 'QuestionsTemplate_Static.xlsx');
const dynamicFile = path.join(__dirname, 'data', 'QuestionsTemplate_Dynamic.xlsx');

analyzeExcelFile(staticFile, 'QuestionsTemplate_Static.xlsx');
analyzeExcelFile(dynamicFile, 'QuestionsTemplate_Dynamic.xlsx');

console.log('='.repeat(80));
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
