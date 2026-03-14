const fs = require('fs');
const path = require('path');

const DEALFORGE_PATH = 'F:\\code project\\Kimi_Agent_DealForge AI PRD\\dealforge-ai\\backend\\pageindex_data';
const CATALOG_PATH = path.join(DEALFORGE_PATH, 'catalog.json');

async function main() {
    console.log('--- Memory Debugger ---');
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const docIds = Object.keys(catalog);
    
    for (let i = 0; i < Math.min(5, docIds.length); i++) {
        const entry = catalog[docIds[i]];
        console.log(`[${i}] ${entry.filename}`);
        console.log('  Mem before read:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
        
        if (entry.tree_path && fs.existsSync(entry.tree_path)) {
            const content = fs.readFileSync(entry.tree_path, 'utf8');
            console.log('  Tree size:', content.length);
            const tree = JSON.parse(content);
            console.log('  Tree nodes:', (tree.nodes || []).length);
            console.log('  Mem after parse:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
        }
        console.log('---');
    }
}

main().catch(console.error);
