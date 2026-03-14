import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { 
  Inbox, FileText, Trash, Plus, Layers, FolderUp, HardDrive, 
  RefreshCw, Upload, X, CheckCircle, AlertCircle, GitBranch, 
  Square, CheckSquare, FolderCheck, FolderPlus, LogOut, ShieldCheck, StopCircle
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';
import { generateId, PageIndexNode, KnowledgeDocument } from '../utils';
import { getPdfJs, cleanupCanvas, extractPdfText } from '../services/ocrService';


// Supported file extensions for local folder indexing
const SUPPORTED_EXTENSIONS = [
  '.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx',
  '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.java',
  '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.sql', '.sh', '.bat', '.ps1',
  '.rst', '.adoc', '.tex', '.rtf', '.doc', '.docx', '.pdf',
  '.jpg', '.jpeg', '.png', '.webp'
];


// Skip patterns for folder scanning
const SKIP_PATTERNS = [
  'node_modules', '.git', '.svn', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', 'target', '.idea', '.vscode',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'
];

// --- Configurable Ingestion Limits (loaded from localStorage, editable in Settings) ---
const INGESTION_CONFIG_KEY = 'wrytica_ingestion_config';

export interface IngestionConfig {
  maxFileSizeMB: number;
  maxPdfPages: number;
  batchSize: number;
  memoryThresholdMB: number;
  maxStoredContentLength: number;
}

export const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
  maxFileSizeMB: 20,
  maxPdfPages: 50,
  batchSize: 20,
  memoryThresholdMB: 400,
  maxStoredContentLength: 50000,
};

const loadIngestionConfig = (): IngestionConfig => {
  try {
    const stored = localStorage.getItem(INGESTION_CONFIG_KEY);
    if (stored) return { ...DEFAULT_INGESTION_CONFIG, ...JSON.parse(stored) };
  } catch { /* use defaults */ }
  return { ...DEFAULT_INGESTION_CONFIG };
};

export const saveIngestionConfig = (config: IngestionConfig) => {
  localStorage.setItem(INGESTION_CONFIG_KEY, JSON.stringify(config));
};

const truncateContent = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + `\n\n[Truncated: ${text.length} total chars]`;
};

interface IndexProgress {
  total: number;
  processed: number;
  success: number;
  skipped: number;
  errors: string[];
  currentFile: string;
  startTime: number; // Track when indexing started for speed calculation
}

type PageIndexPreview = {
  title: string;
  nodes: PageIndexNode[];
  summary?: string;
  tags?: string[];
  drivePath?: string;
};

export const KnowledgeBase: React.FC = () => {
  const { 
    knowledgeBase: kbContext, 
    addKnowledgeDocument, 
    addKnowledgeDocumentsBatch,
    removeKnowledgeDocument, 
    updateKnowledgeDocument,

    workspaceHandle,
    connectWorkspace,
    disconnectWorkspace,
    storageMode,
    setBulkIngestionInProgress
  } = useAppContext();

  const knowledgeBase = kbContext || [];
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [tags, setTags] = useState('');
  const [drivePath, setDrivePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  
  // Local folder indexing state
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const isCancelledRef = useRef(false); // Use ref for cancellation flag in async functions
  const [estimatedChunks, setEstimatedChunks] = useState<number | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  // Folder upload progress state (separate from indexProgress used by handleIndexLocalFolder)
  const [folderUploadProgress, setFolderUploadProgress] = useState<{ processed: number; total: number; currentFile: string; bytes: number; startTime: number } | null>(null);

  const parsedTags = tags.split(',').map(tag => tag.trim()).filter(Boolean);
  const [pageIndexPreview, setPageIndexPreview] = useState<PageIndexPreview | null>(null);
  const [pageIndexFileName, setPageIndexFileName] = useState('');
  const [pageIndexDrivePath, setPageIndexDrivePath] = useState('');
  const [pageIndexError, setPageIndexError] = useState('');
  const [pageImages, setPageImages] = useState<string[]>([]);
  
  // Batch tree creation state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isCreatingTree, setIsCreatingTree] = useState(false);
  const [treeProgress, setTreeProgress] = useState<{ current: number; total: number; docTitle: string } | null>(null);

  const handleAddDocument = async () => {
    if (!title.trim() || (!content.trim() && pageImages.length === 0)) return;

    setLoading(true);
    try {
      const doc = KnowledgeBaseService.createDocument({
        title: title.trim(),
        content: content.trim(),
        source: source.trim() || undefined,
        tags: parsedTags,
        drivePath: drivePath.trim() || undefined,
        pageImages: pageImages.length ? pageImages : undefined
      });
      addKnowledgeDocument(doc);
      setTitle('');
      setContent('');
      setSource('');
      setTags('');
      setDrivePath('');
      setPageImages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setContent(prev => prev ? `${prev}\n\n${reader.result}` : reader.result as string);
      }
    };
    reader.readAsText(file);
  };

  const handlePdfOrImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const images: string[] = [];
        // Use shared getPdfJs to ensure workerSrc is properly configured
        const pdfjs = await getPdfJs();
        const pdf = await pdfjs.getDocument(await file.arrayBuffer()).promise;
        const pageCount = Math.min(pdf.numPages, 5);
        let canvas: HTMLCanvasElement | null = null;
        
        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.2 });
          
          // Create fresh canvas for each page to avoid dimension mismatch issues
          const pageCanvas = document.createElement('canvas');
          const ctx = pageCanvas.getContext('2d');
          if (!ctx) continue;
          
          pageCanvas.width = viewport.width;
          pageCanvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          images.push(pageCanvas.toDataURL('image/jpeg', 0.7));
          
          // Cleanup canvas immediately after capturing to free memory
          cleanupCanvas(pageCanvas);
        }
        
        setPageImages(images);
        setStatus(`Captured ${images.length} page images for vision RAG.`);
      } else if (file.type.startsWith('image/')) {
        const imgUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
          r.readAsDataURL(file);
        });
        setPageImages([imgUrl]);
        setStatus('Captured 1 image for vision RAG.');
      }
    } catch (err) {
      console.error('Error processing file:', err);
      setStatus(`Error: ${err instanceof Error ? err.message : 'Failed to process file'}`);
    }
  };

  const [ingestionConfig] = useState(loadIngestionConfig);
  const MAX_FILE_SIZE = ingestionConfig.maxFileSizeMB * 1024 * 1024;

  // Memory check helper - returns true if should abort
  const checkMemoryThreshold = (currentBytes: number): boolean => {
    const currentMB = currentBytes / (1024 * 1024);
    if (currentMB > ingestionConfig.memoryThresholdMB) {
      setStatus(`Memory limit reached (${currentMB.toFixed(1)}MB). Stopping indexing.`);
      isAbortedRef.current = true;
      return true;
    }
    return false;
  };

  // Estimate processing time based on file count
  const estimateProcessingTime = (fileCount: number): string => {
    // Average ~50ms per file for reading + chunking + batch add
    const msPerFile = 50;
    const totalMs = fileCount * msPerFile;
    const seconds = Math.ceil(totalMs / 1000);
    if (seconds < 60) return `~${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  };

  // Estimate chunk count based on total content size
  const estimateChunkCount = (totalBytes: number): number => {
    // Average ~600 bytes effective per chunk (800 chars - 200 overlap)
    const bytesPerChunk = 600;
    return Math.ceil(totalBytes / bytesPerChunk);
  };

  const handleFolderUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    let totalChunksCreated = 0;
    isAbortedRef.current = false;
    processedBytesRef.current = 0;
    
    try {
      // Expanded allowed extensions - includes PDFs
      const allowedExtensions = ['.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.sql', '.sh', '.bat', '.ps1', '.pdf', '.rst', '.adoc', '.tex', '.rtf'];
      const estimatedTime = estimateProcessingTime(files.length);
      const estimatedChunkCount = estimateChunkCount(Array.from(files).reduce((acc, f) => acc + f.size, 0));
      setEstimatedChunks(estimatedChunkCount);
      setStatus(`Found ${files.length} files (~${estimatedChunkCount} chunks). ETA: ${estimatedTime}`);
      
      // Initialize folder upload progress tracking with start time
      setFolderUploadProgress({
        processed: 0,
        total: files.length,
        currentFile: 'Starting...',
        bytes: 0,
        startTime: Date.now()
      });
      
      const batchSize = ingestionConfig.batchSize;
      const pendingDocs: KnowledgeDocument[] = [];
      
      for (let i = 0; i < files.length; i++) {
        // FIX #3: Check memory threshold before processing each file
        // Also check for user cancellation
        if (checkMemoryThreshold(processedBytesRef.current) || isCancelledRef.current) {
          if (isCancelledRef.current) setStatus(`⚠️ Indexing cancelled by user.`);
          break;
        }
        
        const file = files[i];
        const lowerName = file.name.toLowerCase();
        // Check by extension only - MIME type is unreliable for folder uploads
        const isAllowed = allowedExtensions.some(ext => lowerName.endsWith(ext));
        
        if (!isAllowed) {
          skipCount++;
          continue;
        }
        
        try {
          // Skip files that are too large
          if (file.size > MAX_FILE_SIZE) {
            skipCount++;
            continue;
          }
          
          let text: string;
          const isPdf = lowerName.endsWith('.pdf');
          
          if (isPdf) {
            try {
              const result = await extractPdfText(file, {
                maxPages: Math.min(ingestionConfig.maxPdfPages, 10), // CRITICAL: Limit pages to prevent memory explosion
                onProgress: (page, total) => {
                  setFolderUploadProgress(prev => prev ? {
                    ...prev,
                    currentFile: `${file.name} (page ${page}/${total})`
                  } : null);
                }
              });
              text = result.text;
            } catch (pdfErr) {
              console.error(`PDF extraction failed for ${file.name}:`, pdfErr);
              errorCount++;
              continue;
            }
          } else {
            text = await file.text();
          }
          
          if (text.trim().length === 0) {
            skipCount++;
            continue;
          }
          
          processedBytesRef.current += file.size;
          
          const doc = KnowledgeBaseService.createDocument({
            title: file.webkitRelativePath || file.name,
            content: text,
            source: 'Bulk Folder Import',
            tags: parsedTags.length ? parsedTags : ['bulk-import'],
            drivePath: '',
          });
          // Truncate stored content AFTER chunking so chunks cover full text
          doc.content = truncateContent(text, ingestionConfig.maxStoredContentLength);
          
          pendingDocs.push(doc);
          totalChunksCreated += doc.chunks?.length || 0;
          successCount++;
          
          // Show per-file progress in both status and progress state
          setStatus(`Processing ${file.name} (${successCount}/${files.length})...`);
          setFolderUploadProgress(prev => prev ? {
            ...prev,
            currentFile: file.name,
            processed: successCount,
            bytes: processedBytesRef.current,
            startTime: prev.startTime || Date.now()
          } : null);
          
          // FIX #1: Batch add documents instead of individual calls
          if (pendingDocs.length >= batchSize) {
            await addKnowledgeDocumentsBatch([...pendingDocs]);
            const processed = successCount;
            const remaining = files.length - i - 1;
            const eta = estimateProcessingTime(remaining);
            setStatus(`Indexed ${processed}/${files.length} (~${totalChunksCreated} chunks). ETA: ${eta}`);
            setFolderUploadProgress(prev => prev ? {
              ...prev,
              processed,
              bytes: processedBytesRef.current,
              currentFile: `Batch complete. ETA: ${eta}`
            } : null);
            pendingDocs.length = 0; // Clear batch
            // CRITICAL: Yield to UI and allow garbage collection
            await new Promise(r => setTimeout(r, 50)); // More time for GC
          }
        } catch (err) {
          console.error(`Failed to read file ${file.name}`, err);
          errorCount++;
        }
      }
      
      // Add remaining documents in final batch
      if (pendingDocs.length > 0) {
        await addKnowledgeDocumentsBatch(pendingDocs);
      }
      
      if (isCancelledRef.current) {
        setEstimatedChunks(null);
        setFolderUploadProgress(null);
      } else if (isAbortedRef.current) {
        setStatus(`⚠️ Indexing stopped: ${successCount} docs added, ${skipCount} skipped. Memory limit (400MB) reached.`);
      } else {
        const actualTime = estimateProcessingTime(successCount);
        setStatus(`✅ Bulk upload complete: ${successCount} documents indexed (~${totalChunksCreated} chunks) in ${actualTime}. ${skipCount} files skipped.`);
      }
      setFolderUploadProgress(null);
    } finally {
      setLoading(false);
      processedBytesRef.current = 0;
      isAbortedRef.current = false;
      isCancelledRef.current = false;
      setEstimatedChunks(null);
      setFolderUploadProgress(null);
      event.target.value = '';
    }
  };

  const normalizePageIndexNodes = (items: any[]): PageIndexNode[] => {
    if (!items || !items.length) return [];
    return items.map((item: any) => {
      const node: PageIndexNode = {
        id: item.id || generateId(),
        title: item.title || item.heading || 'Untitled section',
        summary: item.summary || item.description,
        content: item.content || item.text,
        pageNumber: item.pageNumber || item.page,
        tags: Array.isArray(item.tags) ? item.tags : [],
        children: []
      };
      const childSources = item.children || item.sections || item.subsections;
      if (Array.isArray(childSources) && childSources.length) {
        node.children = normalizePageIndexNodes(childSources);
      }
      return node;
    });
  };

  const resetPageIndexImport = () => {
    setPageIndexPreview(null);
    setPageIndexFileName('');
    setPageIndexDrivePath('');
    setPageIndexError('');
  };

  const handlePageIndexFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPageIndexError('');
    setPageIndexFileName(file.name);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const nodes = normalizePageIndexNodes(data.nodes || data.tree || data.sections || []);
      if (!nodes.length) {
        throw new Error('PageIndex export contained no nodes.');
      }
      setPageIndexPreview({
        title: data.title || data.documentTitle || file.name.replace(/\.[^/.]+$/, ''),
        nodes,
        summary: data.summary || data.description,
        tags: Array.isArray(data.tags) ? data.tags : [],
        drivePath: data.drivePath || ''
      });
      setPageIndexDrivePath(data.drivePath || '');
    } catch (error) {
      console.error('Failed to import PageIndex JSON', error);
      setPageIndexPreview(null);
      setPageIndexDrivePath('');
      setPageIndexError('Unable to parse PageIndex JSON. Please provide a valid export.');
    } finally {
      event.target.value = '';
    }
  };

  const handleAddPageIndexDoc = () => {
    if (!pageIndexPreview) return;
    setLoading(true);
    try {
      const docContent = pageIndexPreview.summary || pageIndexPreview.nodes.map(node => node.content || node.summary || node.title).join('\n\n');
      const doc = KnowledgeBaseService.createDocument({
        title: pageIndexPreview.title,
        content: docContent,
        source: pageIndexFileName || 'PageIndex import',
        tags: pageIndexPreview.tags || [],
        drivePath: pageIndexDrivePath.trim() || undefined,
        pageIndex: pageIndexPreview.nodes
      });
      addKnowledgeDocument(doc);
      resetPageIndexImport();
    } finally {
      setLoading(false);
    }
  };

  // Check if a path should be skipped
  const shouldSkipPath = (path: string): boolean => {
    const parts = path.toLowerCase().split(/[\\/]/);
    return SKIP_PATTERNS.some(pattern => parts.includes(pattern.toLowerCase()));
  };


  // Check if file extension is supported
  const isSupportedFile = (fileName: string): boolean => {
    const lower = fileName.toLowerCase();
    return SUPPORTED_EXTENSIONS.some(ext => lower.endsWith(ext));
  };

  // Recursively get all files from a directory handle (File System Access API)
  const getAllFilesRecursively = async (
    dirHandle: FileSystemDirectoryHandle,
    basePath: string = '',
    onProgress?: (foundCount: number, currentDir: string) => void
  ): Promise<FileSystemFileHandle[]> => {
    const files: FileSystemFileHandle[] = [];

    
    try {
      // @ts-ignore - values() is not in TypeScript types but exists in browsers
      for await (const entry of dirHandle.values()) {
        const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;
        
        if (shouldSkipPath(currentPath)) continue;
        
        if (entry.kind === 'file') {
          if (isSupportedFile(entry.name)) {
            files.push(entry);
            if (onProgress && files.length % 10 === 0) onProgress(files.length, basePath || dirHandle.name);
          }
        } else if (entry.kind === 'directory') {
          if (onProgress) onProgress(files.length, currentPath);
          // Yield to UI periodically during recursion
          await new Promise(r => setTimeout(r, 0));
          const subFiles = await getAllFilesRecursively(entry, currentPath, onProgress);
          files.push(...subFiles);
        }
      }

    } catch (err) {
      console.error('Error reading directory:', err);
    }
    
    return files;
  };

  // Use refs for async state to avoid closure issues
  const processedBytesRef = useRef(0);
  const isAbortedRef = useRef(false);

  // Index local folder using File System Access API
  const handleIndexLocalFolder = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      setStatus('Your browser does not support folder picking. Use the CLI script instead.');
      return;
    }

    if (isIndexing) return;

    // Reset cancel flag
    isCancelledRef.current = false;

    try {
      const dirHandle = await (window as any).showDirectoryPicker();

      setIsIndexing(true);
      const startTime = Date.now();
      setIndexProgress({
        total: 0,
        processed: 0,
        success: 0,
        skipped: 0,
        errors: [],
        currentFile: 'Scanning folder...',
        startTime
      });

      const files = await getAllFilesRecursively(dirHandle, '', (count, dir) => {
        setIndexProgress(prev => prev ? { 
          ...prev, 
          currentFile: `Scanning: ${dir} (${count} files found...)`,
          startTime // Preserve startTime
        } : null);
      });
      const total = files.length;

      // Reset memory tracking
      processedBytesRef.current = 0;

      let successCount = 0;
      let skipCount = 0;
      const errors: string[] = [];

      const textFiles: { handle: FileSystemFileHandle; file: File }[] = [];
      
      for (const fileHandle of files) {
        try {
          const file = await fileHandle.getFile();
          const fileName = fileHandle.name.toLowerCase();
          
          if (file.size > MAX_FILE_SIZE) {
            skipCount++;
            continue;
          }

          // Skip images only - PDFs are now handled via extractPdfText
          if (/\.(jpg|jpeg|png|webp)$/.test(fileName)) {
            skipCount++;
            continue;
          }

          textFiles.push({ handle: fileHandle, file });
          processedBytesRef.current += file.size;
        } catch (err) {
          skipCount++;
        }
      }

      // Estimate processing time based on text file count (after textFiles is populated)
      const textFileCount = textFiles.length;
      const totalBytes = textFiles.reduce((acc, tf) => acc + tf.file.size, 0);
      const estimatedChunkCount = estimateChunkCount(totalBytes);
      const estimatedTime = estimateProcessingTime(textFileCount);
      setEstimatedChunks(estimatedChunkCount);
      setIndexProgress(prev => prev ? { 
        ...prev, 
        total: textFileCount,
        currentFile: `Found ${textFileCount} files (~${estimatedChunkCount} chunks). ETA: ${estimatedTime}`,
        startTime // Preserve startTime
      } : null);

      // Process text files (no OCR needed - fast)
      // FIX #6: Use streaming batch processing instead of holding all files
      setIndexProgress(prev => prev ? {
        ...prev,
        currentFile: 'Processing files in batches...',
        startTime // Preserve startTime
      } : null);
      isAbortedRef.current = false;
      processedBytesRef.current = 0;

      const newDocuments: KnowledgeDocument[] = [];
      const batchSize = ingestionConfig.batchSize;
      
      // FIX #6: Process files with memory monitoring and early termination
      const processFile = async (file: File): Promise<KnowledgeDocument | null> => {
        const fileName = file.name;
        const lowerName = fileName.toLowerCase();
        
        setIndexProgress(prev => prev ? {
          ...prev,
          currentFile: fileName,
          startTime
        } : null);

        try {
          let text: string;
          
          if (lowerName.endsWith('.pdf')) {
            const result = await extractPdfText(file, {
              maxPages: Math.min(ingestionConfig.maxPdfPages, 10), // CRITICAL: Limit pages to prevent memory explosion
              onProgress: (page, total) => {
                setIndexProgress(prev => prev ? {
                  ...prev,
                  currentFile: `${fileName} (page ${page}/${total})`,
                  startTime: prev.startTime
                } : null);
              }
            });
            text = result.text;
          } else {
            text = await file.text();
          }
          
          if (text.trim().length === 0) {
            return null;
          }

          const doc = KnowledgeBaseService.createDocument({
            title: fileName,
            content: text,
            source: `Local: ${dirHandle.name}`,
            tags: parsedTags.length ? parsedTags : ['local-folder'],
            drivePath: dirHandle.name,
          });
          // Truncate stored content AFTER chunking so chunks cover full text
          doc.content = truncateContent(text, ingestionConfig.maxStoredContentLength);

          return doc;
        } catch (err: any) {
          errors.push(`${fileName}: ${err.message}`);
          return null;
        }
      };

      // FIX #6: Stream process with memory monitoring
      for (let i = 0; i < textFiles.length; i++) {
        // FIX #3: Check memory threshold and cancellation
        if (checkMemoryThreshold(processedBytesRef.current) || isCancelledRef.current) {
          setIndexProgress(prev => prev ? {
            ...prev,
            currentFile: 'Memory limit reached - stopping'
          } : null);
          break;
        }
        
        const { file } = textFiles[i];
        processedBytesRef.current += file.size;
        
        setIndexProgress(prev => prev ? {
          ...prev,
          processed: i + 1,
          currentFile: file.name,
          startTime // Preserve startTime
        } : null);

        const doc = await processFile(file);
        if (doc) {
          newDocuments.push(doc);
          successCount++;
        } else {
          skipCount++;
        }

        // Periodically update with batches
        if (newDocuments.length >= batchSize) {
          await addKnowledgeDocumentsBatch([...newDocuments]);
          const processed = i + 1;
          const remaining = textFiles.length - processed;
          const eta = estimateProcessingTime(remaining);
          setIndexProgress(prev => prev ? {
            ...prev,
            processed,
            currentFile: `Indexed ${processed}/${textFiles.length}. ETA: ${eta}`,
            startTime: prev.startTime // Preserve startTime
          } : null);
          newDocuments.length = 0;
          await new Promise(r => setTimeout(r, 0)); // Yield to UI
        }
      }

      // Add remaining documents
      if (newDocuments.length > 0) {
        await addKnowledgeDocumentsBatch(newDocuments);
      }

      setIndexProgress({
        total,
        processed: total,
        success: successCount,
        skipped: skipCount,
        errors: errors.slice(0, 10),
        currentFile: 'Complete',
        startTime
      });

      const totalTime = estimateProcessingTime(successCount);
      const finalChunkEstimate = Math.ceil(totalBytes / 600);
      setEstimatedChunks(null);
      if (skipCount > 0 && textFiles.length > 0) {
        setStatus(`✅ Indexed ${successCount} files (~${finalChunkEstimate} chunks) in ${totalTime}. ${skipCount} files skipped.`);
      } else if (textFiles.length === 0 && skipCount > 0) {
        setStatus(`⚠️ No indexable files found. ${skipCount} files skipped.`);
      } else {
        setStatus(`✅ Indexed ${successCount} files (~${finalChunkEstimate} chunks) from local folder in ${totalTime}.`);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setStatus(`Error: ${err.message}`);
      }
    } finally {
      setIsIndexing(false);
      isCancelledRef.current = false;
    }
  }, [addKnowledgeDocument, addKnowledgeDocumentsBatch, parsedTags]);

  // Cancel indexing function - also resets bulk ingestion flag to re-enable vector indexing
  const cancelIndexing = useCallback(() => {
    isCancelledRef.current = true;
    isAbortedRef.current = true;
    setIsIndexing(false);
    setFolderUploadProgress(null);
    setStatus('⚠️ Indexing cancelled. Cleaning up...');
    setBulkIngestionInProgress(false); // Re-enable vector operations for normal usage
    setTimeout(() => setStatus(''), 2000);
  }, [setBulkIngestionInProgress]);

  // Keyboard shortcut to cancel indexing (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isIndexing || folderUploadProgress !== null)) {
        e.preventDefault();
        cancelIndexing();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isIndexing, folderUploadProgress, cancelIndexing]);

  // Helper to format bytes to MB
  const formatBytesToMB = (bytes: number): string => {
    return (bytes / (1024 * 1024)).toFixed(1);
  };

  // Calculate files per second speed
  const calculateSpeed = (processed: number, startTime: number): string => {
    if (startTime === 0) return '0 files/s';
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    if (elapsed < 1) return '~1 file/s';
    const speed = processed / elapsed;
    if (speed >= 1) return `${speed.toFixed(1)} files/s`;
    return `${(speed * 60).toFixed(0)} files/min`;
  };

  // Bridge PageIndex Folder mapping (catalog.json + trees/ folder)
  const handleBridgePageIndexFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      setStatus('Your browser does not support folder picking. Use the CLI script instead.');
      return;
    }

    setLoading(true);
    setStatus('Selecting PageIndex folder...');

    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      let catalogHandle;
      try {
        catalogHandle = await dirHandle.getFileHandle('catalog.json');
      } catch (e) {
        throw new Error('catalog.json not found in the selected folder. Ensure you select the root PageIndex data directory.');
      }

      const catalogFile = await catalogHandle.getFile();
      const catalogContent = await catalogFile.text();
      const catalog = JSON.parse(catalogContent);

      // Handle both array and object formats for the catalog
      let entries = [];
      if (Array.isArray(catalog)) {
        entries = catalog;
      } else if (catalog.entries && Array.isArray(catalog.entries)) {
        entries = catalog.entries;
      } else {
        // Flat object format where keys are IDs (common in PageIndex exports)
        entries = Object.values(catalog);
      }

      setStatus(`Found ${entries.length} document entries. Checking trees folder...`);

      let treesHandle;
      try {
        treesHandle = await dirHandle.getDirectoryHandle('trees');
      } catch (e) {
        throw new Error('trees/ folder not found. The bridge requires a "trees" subdirectory containing the PageIndex JSON files.');
      }

      const newDocs: KnowledgeDocument[] = [];
      let successCount = 0;

      for (const entry of entries) {
        const docId = entry.doc_id || entry.id;
        if (!docId) continue;

        try {
          const treeFileName = `${docId}_tree.json`;
          const treeFileHandle = await treesHandle.getFileHandle(treeFileName);
          const treeFile = await treeFileHandle.getFile();
          const treeText = await treeFile.text();
          const treeData = JSON.parse(treeText);

          // Convert nodes using existing normalization logic
          const nodes = normalizePageIndexNodes(treeData.nodes || treeData.tree || treeData.sections || (Array.isArray(treeData) ? treeData : [treeData]));
          if (nodes.length === 0) continue;

          // Basic content reconstruction for search
          const docContent = entry.summary || nodes.map(node => node.content || node.summary || node.title).join('\n\n');

          const doc = KnowledgeBaseService.createDocument({
            title: entry.filename || entry.title || `Document ${docId}`,
            content: docContent.substring(0, 150000),
            source: 'PageIndex Bridge',
            tags: ['bridge', 'imported', entry.type || 'document'],
            drivePath: entry.file_path || '',
            pageIndex: nodes
          });

          newDocs.push(doc);
          successCount++;
          
          if (successCount % 5 === 0) {
            setStatus(`Bridged ${successCount} documents...`);
          }
        } catch (e) {
          // File might not exist or be unreadable - skip silently or log
          console.warn(`Skipping document ${docId}:`, e);
        }
      }

      if (newDocs.length > 0) {
        await addKnowledgeDocumentsBatch(newDocs);
        setStatus(`Successfully bridged ${successCount} structured documents with PageIndex data.`);
      } else {
        setStatus('No matching PageIndex tree files found to import.');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Bridge failed:', err);
        setStatus(`Bridge failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Import indexed data from CLI script output (JSON file) or existing knowledge_base.json
  const handleImportIndexedData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    setStatus('Importing indexed data...');
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const docs = Array.isArray(data) ? data : (data.documents || []);
      if (!docs.length) {
        throw new Error('No documents found in file');
      }

      let successCount = 0;
      for (const docData of docs) {
        // Normalize PageIndex nodes if they exist in the imported data
        const normalizedPageIndex = docData.pageIndex ? normalizePageIndexNodes(docData.pageIndex) : undefined;
        
        // Convert CLI format to app format - preserve pageIndex if present
        const doc = KnowledgeBaseService.createDocument({
          title: docData.title || 'Untitled',
          content: docData.content || '',
          source: docData.source || 'CLI Import',
          tags: docData.tags || ['cli-import'],
          drivePath: docData.drivePath || docData.folderPath,
          pageIndex: normalizedPageIndex, // Preserve PageIndex structure!
        });
        addKnowledgeDocument(doc);
        successCount++;
      }

      setStatus(`Successfully imported ${successCount} documents with PageIndex data.`);
    } catch (err: any) {
      setStatus(`Import failed: ${err.message}`);
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  // Clear indexing progress
  const clearIndexProgress = () => {
    setIndexProgress(null);
    setStatus('');
  };

  // Toggle document selection for batch tree creation
  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // Select/Deselect all documents
  const toggleSelectAll = () => {
    if (selectedDocIds.size === knowledgeBase.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(knowledgeBase.map(doc => doc.id)));
    }
  };

  // Simple heuristic to create tree nodes from document content
  // This creates a hierarchical structure based on headings and paragraphs
  const createPageIndexTree = (docTitle: string, content: string): PageIndexNode[] => {
    const nodes: PageIndexNode[] = [];
    const lines = content.split('\n');
    
    // Create root node
    const rootId = generateId();
    const rootNode: PageIndexNode = {
      id: rootId,
      title: docTitle,
      summary: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
      content: content.substring(0, 500),
      children: []
    };
    
    // Try to find sections based on markdown headers or common patterns
    const sectionPatterns = [
      /^#+\s+(.+)$/,           // Markdown headers
      /^(\d+\.\s+.+)$/,       // Numbered sections like "1. Introduction"
      /^([A-Z][A-Z\s]+):$/,    // Uppercase labels like "INTRODUCTION:"
      /^([A-Z][a-z]+\s+[A-Z])/ // Title case patterns
    ];
    
    let currentSection: PageIndexNode | null = null;
    let currentContent: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentContent.length > 0) {
          currentContent.push(trimmed);
        }
        continue;
      }
      
      let isHeader = false;
      for (const pattern of sectionPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          // Save previous section if exists
          if (currentSection && currentContent.length > 0) {
            currentSection.content = currentContent.join('\n').trim();
            currentSection.summary = currentContent.join(' ').substring(0, 150);
            rootNode.children!.push(currentSection);
          }
          
          // Create new section
          currentSection = {
            id: generateId(),
            title: match[1] || trimmed,
            summary: '',
            content: '',
            children: []
          };
          currentContent = [];
          isHeader = true;
          break;
        }
      }
      
      if (!isHeader) {
        currentContent.push(trimmed);
      }
    }
    
    // Save last section
    if (currentSection && currentContent.length > 0) {
      currentSection.content = currentContent.join('\n').trim();
      currentSection.summary = currentContent.join(' ').substring(0, 150);
      rootNode.children!.push(currentSection);
    }
    
    // If no sections found, create chunks from content
    if (rootNode.children!.length === 0) {
      const chunkSize = 1000;
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.substring(i, i + chunkSize);
        rootNode.children!.push({
          id: generateId(),
          title: `Section ${Math.floor(i / chunkSize) + 1}`,
          summary: chunk.substring(0, 100),
          content: chunk
        });
      }
    }
    
    nodes.push(rootNode);
    return nodes;
  };

  // Batch create PageIndex trees for selected documents
  const handleBatchCreateTree = async () => {
    if (selectedDocIds.size === 0) {
      setStatus('Please select at least one document');
      return;
    }

    const selectedDocs = knowledgeBase.filter(doc => selectedDocIds.has(doc.id));
    setIsCreatingTree(true);
    setTreeProgress({ current: 0, total: selectedDocs.length, docTitle: '' });

    let successCount = 0;

    for (let i = 0; i < selectedDocs.length; i++) {
      const doc = selectedDocs[i];
      setTreeProgress({
        current: i + 1,
        total: selectedDocs.length,
        docTitle: doc.title
      });

      try {
        if (!doc.content && (!doc.pageImages || doc.pageImages.length === 0)) continue;
        
        // Create tree structure from content
        const treeNodes = createPageIndexTree(doc.title, doc.content || 'Image-based document');

        // Update document with PageIndex using context function
        updateKnowledgeDocument({
          ...doc,
          pageIndex: treeNodes,
          updatedAt: Date.now()
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to create tree for ${doc.title}:`, err);
      }

      // Allow UI to update
      await new Promise(r => setTimeout(r, 20));
    }

    setTreeProgress(null);
    setIsCreatingTree(false);
    setSelectedDocIds(new Set());
    setStatus(`Successfully created PageIndex trees for ${successCount} documents.`);
  };


  const documentListElement = useMemo(() => {
    return (
      <div className="space-y-4">
        {knowledgeBase.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
            <FileText size={32} className="mx-auto mb-2" />
            <p className="text-sm">No knowledge base entries yet. Add documents to power RAG-enabled chat and memo drafts.</p>
          </div>
        ) : (
          <>
            {/* Batch Actions Bar */}
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {selectedDocIds.size === knowledgeBase.length ? (
                  <CheckSquare size={16} className="text-primary-500" />
                ) : (
                  <Square size={16} className="text-slate-400" />
                )}
                <span className="text-slate-700 dark:text-slate-300">
                  {selectedDocIds.size === knowledgeBase.length ? 'Deselect All' : 'Select All'}
                </span>
              </button>
              
              <div className="h-6 w-px bg-slate-300 dark:bg-slate-600" />
              
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {selectedDocIds.size} selected
              </span>
              
              <button
                onClick={handleBatchCreateTree}
                disabled={selectedDocIds.size === 0 || isCreatingTree}
                className="flex items-center space-x-2 px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GitBranch size={14} />
                <span>{isCreatingTree ? 'Creating...' : 'Create PageIndex Tree'}</span>
              </button>
              
              {treeProgress && (
                <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>{treeProgress.current}/{treeProgress.total}</span>
                  <span className="truncate max-w-[150px]">{treeProgress.docTitle}</span>
                </div>
              )}
            </div>
            
            <div className="grid gap-4">
            {knowledgeBase.map((doc) => (
              <div key={doc.id} className={`bg-white dark:bg-dark-surface rounded-2xl border shadow-sm p-4 flex flex-col gap-3 transition-all ${
                selectedDocIds.has(doc.id) 
                  ? 'border-violet-500 dark:border-violet-400 ring-2 ring-violet-100 dark:ring-violet-900/30' 
                  : 'border-slate-200 dark:border-dark-border'
              }`}>
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleDocSelection(doc.id)}
                      className="mt-1 flex-shrink-0"
                    >
                      {selectedDocIds.has(doc.id) ? (
                        <CheckSquare size={20} className="text-violet-500" />
                      ) : (
                        <Square size={20} className="text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{doc.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{doc.source || doc.drivePath || 'Uploaded document'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeKnowledgeDocument(doc.id)}
                    className="text-red-500 hover:text-red-700 text-sm flex items-center space-x-1"
                  >
                    <Trash size={14} />
                    <span>Remove</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  {doc.tags?.map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{tag}</span>
                  ))}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3">{doc.content}</p>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{(doc.chunks?.length || 0)} chunks indexed</span>
                  <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                </div>
                {doc.pageIndex && doc.pageIndex.length > 0 && (
                  <div className="space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
                      <Layers size={14} className="text-slate-400" />
                      <span>{doc.pageIndex.length} PageIndex nodes</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {doc.pageIndex.slice(0, 3).map(node => (
                        <span key={node.id} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px]">
                          {node.title} {node.pageNumber ? `(Pg ${node.pageNumber})` : ''}
                        </span>
                      ))}
                      {doc.pageIndex.length > 3 && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-500">
                          +{doc.pageIndex.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {doc.pageImages && doc.pageImages.length > 0 && (
                  <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-900 dark:text-white">Vision pages cached: {doc.pageImages.length}</span>
                  </div>
                )}
              </div>
            ))}
            </div>
          </>
        )}
      </div>
    );
  }, [knowledgeBase, removeKnowledgeDocument, selectedDocIds, isCreatingTree, treeProgress]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {workspaceHandle && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-800 rounded-lg">
              <FolderCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Hybrid Mode Active</p>
              <p className="text-xs text-indigo-700 dark:text-indigo-300">Syncing to: {workspaceHandle.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-indigo-500 dark:text-indigo-400 uppercase tracking-wider font-bold">
            <ShieldCheck className="w-3 h-3" />
            Native Local Workspace
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Knowledge Base</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Upload documents or paste drive paths for memo/RAG context.</p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={workspaceHandle ? disconnectWorkspace : connectWorkspace}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              workspaceHandle 
                ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20" 
                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-900/20"
            }`}
          >
            {workspaceHandle ? (
              <><LogOut size={16} /> Disconnect Folder</>
            ) : (
              <><FolderPlus size={16} /> Connect Local Folder</>
            )}
          </button>
          
          {status && <span className="text-xs text-green-600 dark:text-green-400">{status}</span>}
          <button
            onClick={handleAddDocument}
            disabled={loading || !title.trim() || (!content.trim() && pageImages.length === 0)}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg shadow-md hover:bg-primary-700 disabled:opacity-50"
          >
            <Plus size={16} />
            <span>Add to KB</span>
          </button>
        </div>
      </div>


      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Source / URL</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Drive / Folder Link</span>
            <input
              value={drivePath}
              onChange={(e) => setDrivePath(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold">Tags (comma-separated)</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </label>
        </div>

        <label className="space-y-1 text-sm">
          <span className="font-semibold">Content</span>
          <textarea
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste text or upload a file below..."
            className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex items-center space-x-3 text-sm border border-slate-200 dark:border-slate-800 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors">
            <Inbox size={16} className="text-primary-500" />
            <div className="flex-1">
              <span className="block font-semibold text-slate-900 dark:text-white">Upload text file</span>
              <span className="block text-[10px] text-slate-500">.txt, .md</span>
            </div>
            <input type="file" accept=".txt,.md" onChange={handleFile} className="hidden" />
          </label>
          <label className="flex items-center space-x-3 text-sm border border-slate-200 dark:border-slate-800 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors relative">
            <FolderUp size={16} className="text-secondary-500" />
            <div className="flex-1">
              <span className="block font-semibold text-slate-900 dark:text-white">Upload Folder (Bulk)</span>
              <span className="block text-[10px] text-slate-500">Auto-indexes text files in folder</span>
            </div>
            {/* @ts-ignore - webkitdirectory is non-standard but widely supported */}
            <input type="file" webkitdirectory="" directory="" multiple onChange={handleFolderUpload} className="hidden" disabled={loading && folderUploadProgress !== null} />
            
            {/* Show progress bar inline when folder upload is active */}
            {folderUploadProgress && (
              <div className="absolute left-0 right-0 -bottom-2 bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700 rounded-b-lg p-2 shadow-lg z-10">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600 dark:text-slate-300">
                      {folderUploadProgress.processed} / {folderUploadProgress.total} files
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      {calculateSpeed(folderUploadProgress.processed, folderUploadProgress.startTime)}
                    </span>
                  </div>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {formatBytesToMB(folderUploadProgress.bytes)} MB
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${folderUploadProgress.total ? (folderUploadProgress.processed / folderUploadProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                    {folderUploadProgress.currentFile}
                  </p>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">
                    Press ESC to cancel
                  </span>
                </div>
              </div>
            )}
          </label>
          <label className="flex items-center space-x-3 text-sm border border-slate-200 dark:border-slate-800 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors">
            <Inbox size={16} className="text-primary-500" />
            <div className="flex-1">
              <span className="block font-semibold text-slate-900 dark:text-white">Upload PDF/Image</span>
              <span className="block text-[10px] text-slate-500">For vision RAG (First 5 pages)</span>
            </div>
            <input type="file" accept=".pdf,image/*" onChange={handlePdfOrImage} className="hidden" />
          </label>
        </div>

        {/* Local Folder Indexing Section */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleIndexLocalFolder}
              disabled={isIndexing}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <HardDrive size={16} />
              <span>{isIndexing ? 'Indexing...' : 'Index Local Folder'}</span>
            </button>
            
            {isIndexing && (
              <button
                onClick={cancelIndexing}
                className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                title="Cancel indexing"
              >
                <StopCircle size={16} />
                <span>Cancel</span>
              </button>
            )}
            
            <button
              onClick={handleBridgePageIndexFolder}
              disabled={loading || isIndexing}
              className="flex items-center space-x-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors text-sm"
              title="Import folder with catalog.json and trees/ folder"
            >
              <GitBranch size={16} />
              <span>Bridge PageIndex Folder</span>
            </button>

            <label className="flex items-center space-x-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors text-sm">
              <Upload size={16} className="text-slate-500" />
              <span>Import CLI Output</span>
              <input type="file" accept=".json" onChange={handleImportIndexedData} className="hidden" />
            </label>

            {indexProgress && (
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600 dark:text-slate-300">
                      {indexProgress.processed} / {indexProgress.total} files
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      {calculateSpeed(indexProgress.processed, indexProgress.startTime)}
                    </span>
                  </div>
                  <span className="text-green-600 dark:text-green-400">
                    {indexProgress.success} indexed
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${indexProgress.total ? (indexProgress.processed / indexProgress.total) * 100 : 0}%` }}
                  />
                </div>
                {indexProgress.currentFile && (
                  <p className="text-[10px] text-slate-400 mt-1 truncate">
                    {indexProgress.currentFile}
                  </p>
                )}
              </div>
            )}

            {indexProgress && indexProgress.processed === indexProgress.total && (
              <button
                onClick={clearIndexProgress}
                className="flex items-center space-x-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <X size={14} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {indexProgress && indexProgress.errors.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 mb-2">
                <AlertCircle size={14} />
                <span>Errors ({indexProgress.errors.length}):</span>
              </div>
              <ul className="text-[10px] text-red-500 dark:text-red-300 space-y-1">
                {indexProgress.errors.map((err, i) => (
                  <li key={i} className="truncate">{err}</li>
                ))}
              </ul>
            </div>
          )}

          {indexProgress && indexProgress.success > 0 && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <CheckCircle size={14} />
                <span>Successfully indexed {indexProgress.success} documents!</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Import PageIndex export</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Drop a VectifyAI PageIndex JSON to register structured nodes for reasoning.</p>
          </div>
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-dark-border text-xs font-semibold cursor-pointer hover:border-primary-500">
            <span>Upload JSON</span>
            <input type="file" accept=".json" onChange={handlePageIndexFile} className="hidden" />
          </label>
        </div>
        {pageIndexFileName && <p className="text-[11px] text-slate-400">Selected file: {pageIndexFileName}</p>}
        {pageIndexError && <p className="text-[11px] text-red-500">{pageIndexError}</p>}
        {pageIndexPreview ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1 text-xs text-slate-500">
                <p className="font-semibold text-slate-900 dark:text-white">Title</p>
                <p className="text-slate-700 dark:text-slate-200">{pageIndexPreview.title}</p>
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                <p className="font-semibold text-slate-900 dark:text-white">Nodes indexed</p>
                <p className="text-slate-700 dark:text-slate-200">{pageIndexPreview.nodes.length}</p>
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                <p className="font-semibold text-slate-900 dark:text-white">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {(pageIndexPreview.tags || []).length ? (
                    pageIndexPreview.tags!.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px]">{tag}</span>
                    ))
                  ) : (
                    <span className="text-slate-400">No tags provided</span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-900 dark:text-white">Drive / Folder Link</span>
                <input
                  value={pageIndexDrivePath}
                  onChange={(e) => setPageIndexDrivePath(e.target.value)}
                  placeholder="Optional shared folder"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-900 text-xs focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </label>
              <div className="space-y-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-900 dark:text-white">Top nodes</span>
                <div className="flex flex-wrap gap-2">
                  {pageIndexPreview.nodes.slice(0, 4).map(node => (
                    <span key={node.id} className="px-3 py-1 rounded-2xl bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-dark-border">
                      {node.title} {node.pageNumber ? `(Pg ${node.pageNumber})` : ''}
                    </span>
                  ))}
                </div>
                {pageIndexPreview.nodes.length > 4 && (
                  <p className="text-[11px] text-slate-400">+{pageIndexPreview.nodes.length - 4} more nodes</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleAddPageIndexDoc}
                disabled={loading}
                className="px-5 py-2.5 rounded-2xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Add structured doc
              </button>
              <button
                onClick={resetPageIndexImport}
                className="px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-dark-border text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-400"
              >
                Clear import
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload a PageIndex JSON export to preserve the tree structure, page numbers, and summaries for smarter retrieval.
          </p>
        )}
      </div>

      {documentListElement}
    </div>
  );
};
