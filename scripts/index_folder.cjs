const fs = require('fs');
const path = require('path');

// Usage check
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Wrytica PageIndex Indexer
-------------------------
Usage: node scripts/index_folder.cjs [data_path] [output_file]

Arguments:
  data_path    Path to the folder containing catalog.json and trees/ 
               (Default matches the DealForge project data folder)
  output_file  Path where the structured knowledge base will be saved 
               (Default: public/local_knowledge.json)
`);
  process.exit(0);
}

// Configuration
const DEFAULT_PATH = 'F:\\code project\\Kimi_Agent_DealForge AI PRD\\dealforge-ai\\backend\\pageindex_data';
const DEALFORGE_PATH = process.argv[2] || DEFAULT_PATH;
const OUTPUT_FILE = process.argv[3] || path.join(__dirname, '..', 'public', 'local_knowledge.json');

const CATALOG_PATH = path.join(DEALFORGE_PATH, 'catalog.json');

console.log(`Target Data Path: ${DEALFORGE_PATH}`);
console.log(`Output File: ${OUTPUT_FILE}`);

if (!fs.existsSync(CATALOG_PATH)) {
  console.error(`Error: catalog.json not found at ${CATALOG_PATH}`);
  console.log('Ensure the path provided contains a catalog.json file representing the PageIndex data.');
  process.exit(1);
}

// Memory optimization: Cap content per document
const MAX_CONTENT_LENGTH = 150000; 

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Recursive conversion with depth guard and memory awareness
function convertNodes(nodes, parentId = null, depth = 0) {
  if (!nodes || !Array.isArray(nodes) || depth > 20) return [];
  
  return nodes.slice(0, 500).map(node => {
    const id = node.node_id || generateId();
    return {
      id,
      nodeId: id,
      title: (node.title || 'Section').slice(0, 200),
      content: (node.text || '').slice(0, 10000), // Cap per node
      pageNumber: typeof node.start_index === 'number' ? node.start_index + 1 : undefined,
      parentId,
      children: convertNodes(node.children, id, depth + 1)
    };
  });
}

function processAll() {
    console.log("--- Wrytica PageIndex Bridge (Targeted Finance Ingestion) ---");
    
    if (!fs.existsSync(CATALOG_PATH)) {
        console.error("Catalog not found at:", CATALOG_PATH);
        return;
    }

    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    const documents = [];
    
    // Handle both array and object formats
    let entries = [];
    if (Array.isArray(catalog)) {
        entries = catalog;
    } else if (catalog.entries && Array.isArray(catalog.entries)) {
        entries = catalog.entries;
    } else {
        // Flat object format where keys are IDs
        entries = Object.values(catalog);
    }
    
    console.log(`Found ${entries.length} entries in catalog.`);

    const docIds = entries.map(() => generateId());

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const ext = path.extname(entry.filename).toLowerCase();
        
        if (!['.pdf', '.docx', '.xlsx', '.epub', '.pptx'].includes(ext) && !entry.filename.includes('.')) {
            console.log(`[${i+1}/${entries.length}] Skipping ${entry.filename} (unsupported extension)`);
            continue;
        }

        console.log(`[${i+1}/${entries.length}] Processing ${entry.filename}...`);
        
        let pageIndex = [];
        let fullContent = "";
        
        const docId = entry.doc_id || entry.id;
        const treePath = path.join(DEALFORGE_PATH, 'trees', `${docId}_tree.json`);
        if (fs.existsSync(treePath)) {
            try {
                const treeData = JSON.parse(fs.readFileSync(treePath, 'utf8'));
                pageIndex = convertNodes(treeData.nodes || []);
                // Simple content synthesis from nodes
                fullContent = pageIndex.map(n => n.content).join('\n\n').slice(0, MAX_CONTENT_LENGTH);
            } catch (e) {
                console.warn(`Failed to read tree for ${entry.id}`);
            }
        }

        if (!fullContent) {
            fullContent = `Document: ${entry.filename}\n(Imported from DealForge Index)`;
        }

        // Generate chunks for RAG
        const chunks = [];
        if (pageIndex.length) {
            let order = 0;
            const traverse = (nodes) => {
                for (const node of nodes) {
                    const text = (node.content || node.summary || node.title || '').trim();
                    if (text) {
                        chunks.push({
                            id: generateId(),
                            docId: docIds[i],
                            text: text.slice(0, 2000), // Safety cap
                            order: order++,
                            sourceTitle: entry.filename,
                            tags: ['finance', 'imported', ext.slice(1)],
                            nodeId: node.id,
                            pageNumber: node.pageNumber
                        });
                    }
                    if (node.children) traverse(node.children);
                }
            };
            traverse(pageIndex);
        } else {
           chunks.push({
               id: generateId(),
               docId: docIds[i],
               text: fullContent.slice(0, 2000),
               order: 0,
               sourceTitle: entry.filename,
               tags: ['finance', 'imported', ext.slice(1)]
           });
        }

        const doc = {
          id: docIds[i],
          title: entry.filename,
          content: fullContent,
          source: 'Finance Knowledge Base',
          tags: ['finance', 'imported', ext.slice(1)],
          chunks,
          pageIndex: pageIndex.length ? pageIndex : undefined,
          createdAt: Date.now()
        };
        
        documents.push(doc);
        
        if (i % 5 === 0) {
            global.gc && global.gc();
            console.log(`  Progress: ${documents.length} docs | Heap: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(documents, null, 2));
    console.log(`\nSuccess! Indexed ${documents.length} documents to ${OUTPUT_FILE}`);
    console.log(`You can now import this file in the Knowledge Base UI using "Import Indexed Data".`);
}

processAll();
