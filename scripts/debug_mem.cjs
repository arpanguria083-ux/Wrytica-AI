const fs = require('fs');

const CATALOG_PATH = 'F:\\code project\\Kimi_Agent_DealForge AI PRD\\dealforge-ai\\backend\\pageindex_data\\catalog.json';

try {
    console.log('Reading catalog...');
    const content = fs.readFileSync(CATALOG_PATH, 'utf8');
    console.log('Catalog size:', content.length);
    const catalog = JSON.parse(content);
    const keys = Object.keys(catalog);
    console.log('Keys count:', keys.length);
    for (let i = 0; i < Math.min(5, keys.length); i++) {
        console.log(`Key ${i}:`, catalog[keys[i]].filename);
    }
    console.log('Test complete.');
} catch (err) {
    console.error('Error:', err);
}
