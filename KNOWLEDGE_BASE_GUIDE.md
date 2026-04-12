# Knowledge Base - User Guide

## Overview
The Knowledge Base is your central repository for storing documents, research materials, and contextual information that powers Wrytica's AI capabilities. It supports text documents, PDFs, images, and structured PageIndex data.

## Quick Start

### 1. Adding Individual Documents
1. **Enter Title** - Give your document a descriptive name
2. **Add Content** - Paste text or upload files:
   - **Text files**: Click "Upload text file" (.txt, .md)
   - **PDFs/Images**: Click "Upload PDF or image"
   - **Direct input**: Type or paste into the Content field
3. **Optional Metadata**:
   - Source/URL: Where the content came from
   - Drive Path: File system location
   - Tags: Comma-separated keywords
4. **Click "Add to KB"** - Saves to memory and syncs to connected folder

### 2. Bulk Operations

#### Index Local Folder
- Click "Index Local Folder"
- Select a folder containing text files, PDFs, or documents
- System will automatically process all supported files
- Progress bar shows real-time status

#### Bridge PageIndex Folder
- For structured document collections with `catalog.json` and `trees/` folder
- Preserves hierarchical organization and page numbers

#### Import CLI Output
- Use with Python backend processing for large collections
- Export JSON from backend script, then import here

## Interface Elements

### Main Controls
- **Connect Local Folder**: Enables hybrid storage (browser + local files)
- **Add to KB**: Primary document creation button (requires title + content)
- **Status Indicators**: Real-time feedback on operations

### Input Fields
- **Title** (Required): Document identifier
- **Content** (Required): Main text content or uploaded files
- **Source**: Origin URL or reference
- **Drive Path**: File system location
- **Tags**: Organizational keywords

### Advanced Features
- **PageIndex Support**: Import structured document hierarchies
- **Vision RAG**: Process images and PDF pages for visual content
- **Bulk Processing**: Handle large collections efficiently

## Best Practices

### For Small Collections (<50 files)
1. Use individual document addition
2. Add relevant tags for organization
3. Connect local folder for persistence

### For Large Collections (50+ files)
1. Use "Index Local Folder" for browser processing
2. Or use Python backend + "Import CLI Output" for heavy workloads
3. Enable hybrid storage for reliability

### Performance Tips
- Keep individual documents under 15,000 characters
- Use tags for easy retrieval
- Regularly backup with connected folder
- Clear memory periodically if not using hybrid storage

## Troubleshooting

### Common Issues
- **Button disabled**: Ensure title and content are filled
- **Sync errors**: Reconnect local folder if permissions change
- **Memory limits**: Use backend processing for large collections
- **File type issues**: Supported formats: .txt, .md, .pdf, images

### Error Messages
- **"Enter a title to enable Add to KB"**: Title field is empty
- **"Add content or upload a PDF/image"**: Content field is empty
- **Workspace sync errors**: Folder permissions need renewal

## Keyboard Shortcuts
- **Escape**: Cancel ongoing indexing operations
- **Enter**: Submit forms (where applicable)

## Storage Options

### Browser-Only (Standard)
- Documents stored in browser memory
- Lost when browser data is cleared
- Good for temporary research

### Hybrid Storage (Recommended)
- Connects to local folder
- Persists documents to disk
- Enables cross-session access
- Automatic backups

## Integration Features
- **Chat Memory**: Conversations can be saved to Knowledge Base
- **Citation Support**: Reference documents in generated content
- **Search & Retrieval**: Powered by PageIndex and vector search
- **Export Options**: JSON export for external use

---

*Need more help? Check the browser console for detailed operation logs and error messages.*