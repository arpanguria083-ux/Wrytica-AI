/**
 * Local Folder Indexer Script with LLM-Powered PageIndex
 * 
 * Usage: node scripts/index_local_folder.js "D:/MyDocuments" [output_file] [options]
 * 
 * Features:
 * - Recursively scans subdirectories
 * - Supports multiple file types (.txt, .md, .json, .csv, .ts, .tsx, .js, .jsx, .py, .html, .css)
 * - Extracts text content from files
 * - Generates structured output for Knowledge Base import
 * - Optional LLM-powered PageIndex summarization (like VectifyAI)
 * 
 * Options:
 *   --llm=<provider>    Enable LLM summarization: gemini, ollama, lmstudio
 *   --api-key=<key>    API key for Gemini
 *   --model=<model>    Model name (default varies by provider)
 *   --url=<url>        Base URL for local LLM (ollama/lmstudio)
 *   --no-pageindex     Skip PageIndex generation (faster)
 *   --sections-only    Use heuristic section detection only (no LLM)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Supported file extensions
const SUPPORTED_EXTENSIONS = [
  '.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', 
  '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.log'
];

// Files to skip
const SKIP_PATTERNS = [
  'node_modules', '.git', '.DS_Store', 'Thumbs.db',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
];

// LLM Configuration
let llmConfig = null;

/**
 * Load LLM config from file or environment
 * Looks for: .wrytica-config.json in project root, then environment variables
 */
function loadLLMConfig() {
  const configPath = path.join(process.cwd(), '.wrytica-config.json');
  
  // Try to load from config file
  if (fs.existsSync(configPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log('Loaded config from .wrytica-config.json');
      return configData;
    } catch (e) {
      console.log(`  Warning: Failed to parse config file: ${e.message}`);
    }
  }
  
  // Try environment variables
  const envConfig = {
    provider: process.env.WRYTICA_PROVIDER || 'gemini',
    apiKey: process.env.WRYTICA_API_KEY || process.env.GEMINI_API_KEY || '',
    model: process.env.WRYTICA_MODEL || '',
    baseUrl: process.env.WRYTICA_BASE_URL || 'http://localhost:11434'
  };
  
  if (envConfig.provider && (envConfig.apiKey || envConfig.provider === 'ollama' || envConfig.provider === 'lmstudio')) {
    console.log('Loaded config from environment variables');
    return envConfig;
  }
  
  return null;
}

/**
 * Save LLM config to file for future use
 */
function saveLLMConfig(config, provider) {
  const configPath = path.join(process.cwd(), '.wrytica-config.json');
  const configData = {
    provider: provider,
    apiKey: config.apiKey || '',
    model: config.model || '',
    baseUrl: config.baseUrl || (provider === 'ollama' ? 'http://localhost:11434' : 
                                  provider === 'lmstudio' ? 'http://localhost:1234' : '')
  };
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');
    console.log(`Config saved to ${configPath}`);
  } catch (e) {
    console.log(`  Warning: Could not save config: ${e.message}`);
  }
}

/**
 * Make HTTP request to LLM endpoint
 */
function makeLLMRequest(url, payload, apiKey = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
      }
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * Call LLM to generate section summaries
 */
async function generateLLMSummaries(content, sections, config) {
  if (!config || sections.length === 0) {
    return sections.map(s => s.summary || s.content?.substring(0, 150) || '');
  }
  
  // Build prompt with sections
  const sectionList = sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
  
  const systemPrompt = `You are a document indexing assistant. Given a document with sections, generate a brief 1-2 sentence summary for each section that captures its key topic and purpose. Return a JSON array of summaries, one per section in order.`;
  
  const userPrompt = `Document content (truncated):
${content.substring(0, 8000)}

Sections to summarize:
${sectionList}

Return a JSON array with ${sections.length} summaries, e.g.: ["Summary of section 1", "Summary of section 2", ...]`;

  try {
    let response;
    
    if (config.provider === 'gemini') {
      const response = await makeLLMRequest(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model || 'gemini-2.0-flash'}:generateContent?key=${config.apiKey}`,
        {
          contents: [{ parts: [{ text: userPrompt }) }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        }
      );
      
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      return JSON.parse(text);
      
    } else if (config.provider === 'ollama' || config.provider === 'lmstudio') {
      const response = await makeLLMRequest(
        `${config.baseUrl}/api/chat`,
        {
          model: config.model || 'llama3',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          stream: false
        }
      );
      
      const text = response.message?.content || '[]';
      // Try to extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return sections.map(s => s.summary || '');
    }
  } catch (error) {
    console.log(`  LLM call failed: ${error.message}. Using heuristic summaries.`);
  }
  
  // Fallback to heuristic summaries
  return sections.map(s => s.summary || s.content?.substring(0, 150) || '');
}

function shouldSkip(filename) {
  return SKIP_PATTERNS.some(pattern => 
    filename.includes(pattern) || filename.startsWith('.')
  );
}

function isSupportedFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const typeMap = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.ts': 'text/typescript',
    '.tsx': 'text/tsx',
    '.js': 'text/javascript',
    '.jsx': 'text/jsx',
    '.py': 'text/python',
    '.html': 'text/html',
    '.css': 'text/css',
    '.xml': 'text/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.log': 'text/log'
  };
  return typeMap[ext] || 'text/plain';
}

function scanDirectory(dirPath, depth = 0, maxDepth = 10) {
  const results = [];
  
  if (depth > maxDepth) {
    console.log(`  Skipping (max depth reached): ${dirPath}`);
    return results;
  }
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(dirPath, fullPath);
      
      if (shouldSkip(entry.name)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subResults = scanDirectory(fullPath, depth + 1, maxDepth);
        results.push(...subResults);
      } else if (entry.isFile() && isSupportedFile(entry.name)) {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > 5 * 1024 * 1024) {
            console.log(`  Skipping (too large): ${relativePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            continue;
          }
          
          let content = fs.readFileSync(fullPath, 'utf-8');
          
          if (!content.trim()) {
            continue;
          }
          
          if (content.length > 500 * 1024) {
            content = content.substring(0, 500 * 1024) + '\n\n[... content truncated ...]';
          }
          
          results.push({
            path: relativePath,
            name: entry.name,
            type: getFileType(entry.name),
            content: content,
            size: stats.size
          });
          
        } catch (err) {
          console.log(`  Error reading ${relativePath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dirPath}: ${err.message}`);
  }
  
  return results;
}

// Generate PageIndex tree structure from document content
async function generatePageIndex(content, docTitle, createPageIndex = true, useLLM = false) {
  if (!createPageIndex) return undefined;
  
  const nodes = [];
  const lines = content.split('\n');
  
  // Section detection patterns
  const sectionPatterns = [
    /^#+\s+(.+)$/,           // Markdown headers
    /^(\d+\.\s+.+)$/,        // Numbered sections
    /^([A-Z][A-Z\s]+):$/,    // Uppercase labels
    /^([A-Z][a-z]+\s+[A-Z])/, // Title case patterns
    /^={3,}$/,                // Markdown H1 underline
    /^-{3,}$/,                // Markdown H2 underline
  ];
  
  let currentSection = null;
  let currentContent = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentContent.length > 0) currentContent.push('');
      continue;
    }
    
    let isHeader = false;
    let headerText = '';
    
    for (const pattern of sectionPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        isHeader = true;
        headerText = match[1] || trimmed;
        break;
      }
    }
    
    if (isHeader) {
      if (currentSection && currentContent.length > 0) {
        const sectionText = currentContent.join('\n').trim();
        currentSection.content = sectionText;
        currentSection.summary = sectionText.substring(0, 200);
        nodes.push(currentSection);
      }
      
      currentSection = {
        id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: headerText,
        summary: '',
        content: '',
        children: [],
        tags: []
      };
      currentContent = [];
    } else {
      currentContent.push(trimmed);
    }
  }
  
  if (currentSection && currentContent.length > 0) {
    const sectionText = currentContent.join('\n').trim();
    currentSection.content = sectionText;
    currentSection.summary = sectionText.substring(0, 200);
    nodes.push(currentSection);
  }
  
  if (nodes.length === 0 && content.trim()) {
    const chunkSize = 2000;
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.substring(i, Math.min(i + chunkSize, content.length));
      nodes.push({
        id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: `Section ${Math.floor(i / chunkSize) + 1}`,
        summary: chunk.substring(0, 100),
        content: chunk,
        children: [],
        tags: ['auto-generated']
      });
    }
  }
  
  // Use LLM to generate better summaries if enabled
  if (useLLM && nodes.length > 0 && llmConfig) {
    console.log(`  Generating LLM summaries for ${nodes.length} sections...`);
    const summaries = await generateLLMSummaries(content, nodes, llmConfig);
    nodes.forEach((node, i) => {
      if (summaries[i]) {
        node.summary = summaries[i];
      }
    });
  }
  
  const rootNode = {
    id: `root-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: docTitle,
    summary: content.substring(0, 300),
    content: content.substring(0, 1000),
    children: nodes,
    tags: ['document-root']
  };
  
  return [rootNode];
}

async function generateKnowledgeBaseExport(files, folderPath, options = {}) {
  const { createPageIndex = true, useLLM = false } = options;
  const documents = [];
  const folderName = path.basename(folderPath) || folderPath;
  
  for (const file of files) {
    const title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    
    const pathParts = file.path.split(path.sep);
    const tags = pathParts.slice(0, -1);
    tags.push(file.type.split('/')[1]);
    
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let pageIndex = undefined;
    if (createPageIndex && file.content && file.content.trim()) {
      try {
        pageIndex = await generatePageIndex(file.content, title, createPageIndex, useLLM);
      } catch (e) {
        console.log(`  Warning: Failed to generate PageIndex for ${file.name}: ${e.message}`);
      }
    }
    
    let chunks = [];
    const contentText = pageIndex 
      ? pageIndex.flatMap(n => [n.content, ...(n.children?.map(c => c.content) || [])]).filter(Boolean).join('\n\n')
      : file.content;
    
    const chunkSize = 800;
    let order = 0;
    for (let i = 0; i < contentText.length; i += chunkSize - 200) {
      const chunkText = contentText.substring(i, Math.min(i + chunkSize, contentText.length));
      if (chunkText.trim()) {
        chunks.push({
          id: `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          docId: docId,
          text: chunkText,
          order: order++,
          sourceTitle: title,
          tags: [...new Set(tags)]
        });
      }
    }
    
    documents.push({
      id: docId,
      title: title,
      content: file.content,
      source: `Local: ${file.path}`,
      tags: [...new Set(tags)],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      drivePath: folderPath,
      chunks: chunks,
      pageIndex: pageIndex,
      metadata: {
        originalPath: file.path,
        fileType: file.type,
        fileSize: file.size
      }
    });
  }
  
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    source: 'Local Folder Indexer with LLM-Powered PageIndex',
    folderPath: folderPath,
    folderName: folderName,
    totalFiles: files.length,
    totalDocuments: documents.length,
    hasPageIndex: true,
    hasLLMSummaries: useLLM,
    documents: documents
  };
}

function parseArgs(args) {
  const options = {
    createPageIndex: true,
    useLLM: false,
    llmProvider: null,
    apiKey: null,
    model: null,
    baseUrl: null
  };
  
  const positional = [];
  
  for (const arg of args) {
    if (arg.startsWith('--')) {
      if (arg === '--no-pageindex') {
        options.createPageIndex = false;
      } else if (arg === '--sections-only') {
        options.useLLM = false;
      } else if (arg.startsWith('--llm=')) {
        const provider = arg.replace('--llm=', '').toLowerCase();
        if (['gemini', 'ollama', 'lmstudio'].includes(provider)) {
          options.llmProvider = provider;
          options.useLLM = true;
        }
      } else if (arg.startsWith('--api-key=')) {
        options.apiKey = arg.replace('--api-key=', '');
      } else if (arg.startsWith('--model=')) {
        options.model = arg.replace('--model=', '');
      } else if (arg.startsWith('--url=')) {
        options.baseUrl = arg.replace('--url=', '');
      }
    } else {
      positional.push(arg);
    }
  }
  
  return { options, positional };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  
  if (positional.length === 0) {
    console.log('=== Local Folder Indexer for Wrytica Knowledge Base ===\n');
    console.log('Usage: node scripts/index_local_folder.js <folder_path> [output_file] [options]\n');
    console.log('Arguments:');
    console.log('  folder_path   - Path to the folder to index');
    console.log('  output_file   - Optional output file name (default: "local_knowledge.json")\n');
    console.log('Options:');
    console.log('  --llm=<provider>    Enable LLM summarization: gemini, ollama, lmstudio');
    console.log('  --api-key=<key>     API key for Gemini');
    console.log('  --model=<model>     Model name (default varies by provider)');
    console.log('  --url=<url>         Base URL for local LLM (ollama/lmstudio)');
    console.log('  --no-pageindex      Skip PageIndex generation');
    console.log('  --sections-only     Use heuristic only (no LLM)\n');
    console.log('Examples:');
    console.log('  # Heuristic PageIndex (fast, no LLM)');
    console.log('  node scripts/index_local_folder.js "D:/MyDocs"');
    console.log('');
    console.log('  # LLM-powered PageIndex with Gemini');
    console.log('  node scripts/index_local_folder.js "D:/MyDocs" --llm=gemini --api-key=YOUR_API_KEY');
    console.log('');
    console.log('  # LLM-powered PageIndex with local Ollama');
    console.log('  node scripts/index_local_folder.js "D:/MyDocs" --llm=ollama --url=http://localhost:11434');
    console.log('');
    console.log('  # No PageIndex (fastest)');
    console.log('  node scripts/index_local_folder.js "D:/MyDocs" --no-pageindex');
    process.exit(0);
  }
  
  const folderPath = positional[0];
  const outputFile = positional[1] || 'local_knowledge.json';
  
  // Setup LLM config if requested
  if (options.useLLM && options.llmProvider) {
    // First try to load existing config from file or environment
    const existingConfig = loadLLMConfig();
    
    llmConfig = {
      provider: options.llmProvider,
      // Priority: CLI args > existing config > environment
      apiKey: options.apiKey || existingConfig?.apiKey || process.env.WRYTICA_API_KEY || process.env.GEMINI_API_KEY,
      model: options.model || existingConfig?.model || '',
      baseUrl: options.baseUrl || existingConfig?.baseUrl || (options.llmProvider === 'ollama' ? 'http://localhost:11434' : 
                                     options.llmProvider === 'lmstudio' ? 'http://localhost:1234' : null)
    };
    
    console.log(`\nLLM Provider: ${llmConfig.provider}`);
    if (llmConfig.baseUrl) console.log(`LLM URL: ${llmConfig.baseUrl}`);
    if (llmConfig.model) console.log(`Model: ${llmConfig.model}`);
    
    // Save config if it has valid credentials for future use
    if (llmConfig.apiKey || llmConfig.baseUrl) {
      saveLLMConfig(llmConfig, options.llmProvider);
    }
  } else if (!options.useLLM) {
    // Even without --llm flag, check if there's an existing config and use it for better summaries
    const existingConfig = loadLLMConfig();
    if (existingConfig && existingConfig.provider) {
      console.log(`\nNote: Found existing LLM config (${existingConfig.provider}), use --llm=${existingConfig.provider} to enable LLM-powered summaries`);
    }
  }
  
  if (!fs.existsSync(folderPath)) {
    console.error(`Error: Folder not found: ${folderPath}`);
    process.exit(1);
  }
  
  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    console.error(`Error: Not a directory: ${folderPath}`);
    process.exit(1);
  }
  
  console.log(`\n=== Scanning folder: ${folderPath} ===\n`);
  console.log('Scanning files...');
  
  const files = scanDirectory(folderPath);
  
  console.log(`\nFound ${files.length} supported files.\n`);
  
  if (files.length === 0) {
    console.log('No supported files found. Supported types:');
    console.log(SUPPORTED_EXTENSIONS.join(', '));
    process.exit(0);
  }
  
  const modeText = options.useLLM ? 'with LLM-powered PageIndex summaries' : 
                   options.createPageIndex ? 'with heuristic PageIndex' : 'without PageIndex';
  console.log(`Generating Knowledge Base export ${modeText}...`);
  
  const exportData = await generateKnowledgeBaseExport(files, folderPath, {
    createPageIndex: options.createPageIndex,
    useLLM: options.useLLM
  });
  
  fs.writeFileSync(outputFile, JSON.stringify(exportData, null, 2), 'utf-8');
  
  console.log(`\n=== Export Complete ===`);
  console.log(`Output file: ${outputFile}`);
  console.log(`Total documents: ${exportData.totalDocuments}`);
  console.log(`Total files scanned: ${exportData.totalFiles}`);
  console.log(`PageIndex: ${exportData.hasPageIndex ? 'Yes' : 'No'}`);
  if (exportData.hasLLMSummaries) {
    console.log(`LLM Summaries: Enabled (each section has AI-generated summary)`);
  }
  console.log('');
  console.log('To use in Wrytica:');
  console.log('1. Import the JSON via Knowledge Base "Import CLI Output" button');
  console.log('2. PageIndex structure will be preserved and used by Chat Assistant\n');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { scanDirectory, generateKnowledgeBaseExport, generatePageIndex };