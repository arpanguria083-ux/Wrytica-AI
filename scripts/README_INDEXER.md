# Local Folder Indexer for Wrytica Knowledge Base

A Node.js script that scans local folders and generates a JSON file that can be imported into the Wrytica Knowledge Base for RAG-powered chat and document analysis.

## Quick Start

```bash
# Index a folder and generate default output file
node scripts/index_local_folder.cjs "D:/MyDocuments"

# Index with custom output filename
node scripts/index_local_folder.cjs "D:/Projects/MyApp" "my_knowledge.json"
```

## Features

- **Recursive scanning** - Scans all subdirectories up to 10 levels deep
- **Smart file filtering** - Automatically skips:
  - `node_modules`, `.git`, and other common non-content folders
  - Empty files and files larger than 5MB
  - Binary files and unsupported formats
- **Multiple file types supported**:
  - Text: `.txt`, `.log`
  - Markdown: `.md`
  - Code: `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.java`, `.c`, `.cpp`, `.go`, `.rs`, `.sql`, `.sh`
  - Data: `.json`, `.csv`, `.xml`, `.yaml`, `.yml`
  - Web: `.html`, `.css`
- **Content processing**:
  - Truncates files larger than 500KB
  - Preserves folder structure as tags
  - Generates unique document IDs

## Usage

### Basic Usage

```bash
# Index a Windows folder
node scripts/index_local_folder.cjs "D:/Documents"

# Index a Unix/Linux/macOS folder
node scripts/index_local_folder.cjs "/home/user/documents"

# Index with relative path
node scripts/index_local_folder.cjs "./my_docs"
```

### Custom Output

```bash
# Specify custom output filename
node scripts/index_local_folder.cjs "D:/Projects" "project_knowledge.json"

# Save to specific location
node scripts/index_local_folder.cjs "D:/Docs" "C:/output/knowledge.json"
```

## Integration with Wrytica

### Method 1: Auto-load on Startup (Recommended)

1. Run the indexer to generate `local_knowledge.json`:
   ```bash
   node scripts/index_local_folder.cjs "D:/YourFolder"
   ```

2. Copy the output file to the `public` folder:
   ```bash
   copy local_knowledge.json public/
   ```

3. The app will automatically load the file on startup

### Method 2: Manual Import

1. Generate a JSON file with the indexer
2. Open Wrytica Knowledge Base page
3. Use the "Import PageIndex export" feature to upload the JSON

## Output Format

The script generates a JSON file with this structure:

```json
{
  "version": "1.0",
  "exportedAt": "2024-01-15T10:30:00.000Z",
  "source": "Local Folder Indexer",
  "folderPath": "D:/MyDocuments",
  "folderName": "MyDocuments",
  "totalFiles": 42,
  "totalDocuments": 42,
  "documents": [
    {
      "id": "doc-1705312200000-abc123",
      "title": "Getting Started Guide",
      "content": "...",
      "source": "Local: getting-started.md",
      "tags": ["docs", "markdown"],
      "createdAt": 1705312200000,
      "updatedAt": 1705312200000,
      "drivePath": "D:/MyDocuments",
      "metadata": {
        "originalPath": "docs/getting-started.md",
        "fileType": "text/markdown",
        "fileSize": 4567
      }
    }
  ]
}
```

## Troubleshooting

### "Folder not found" error
- On Windows, use forward slashes or escaped backslashes: `D:/Folder` or `D:\\Folder`
- Ensure the folder exists and you have read permissions

### "No supported files found"
- Check that your folder contains supported file types
- Verify files are not in excluded folders (node_modules, .git, etc.)

### Files not appearing in Knowledge Base
- Ensure output file is in the `public` folder
- Check browser console for loading errors
- Verify JSON is valid (run through a JSON validator)

## Command Line Options

| Argument | Description | Default |
|----------|-------------|---------|
| `folder_path` | Path to folder to index | Required |
| `output_file` | Output JSON filename | `local_knowledge.json` |

## Use Cases

### 1. Index Project Documentation
```bash
node scripts/index_local_folder.cjs "D:/MyProject/docs" "project_docs.json"
```

### 2. Index Codebase for Context
```bash
node scripts/index_local_folder.cjs "D:/MyProject/src" "codebase.json"
```

### 3. Index Multiple Folders
```bash
# Run separately for each folder, then merge JSON files
node scripts/index_local_folder.cjs "D:/Folder1" "combined.json"
# Manually merge the documents arrays from multiple JSON files
```

## Requirements

- Node.js 14.0 or higher
- Read access to the folder being indexed
- Write access to the output location

## Technical Notes

- Maximum recursion depth: 10 levels
- Maximum file size: 5MB (skipped with warning)
- Maximum content per file: 500KB (truncated with notice)
- Supported encodings: UTF-8 only