import { LLMConfig } from '../utils';
import { VisionService } from './visionService';
import { documentProcessorAPI } from './backendApi';

type RecognizeResult = {
  data: {
    text: string;
  };
};

const createOcrWorker = async () => {
  const tesseract = await import('tesseract.js');
  return tesseract.createWorker();
};

// ADVANCED MEMORY OFFLOADING: Web Workers + IndexedDB
class IndexedDBOffloader {
  private dbName = 'wrytica_memory_offload';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('pdf_cache')) {
          db.createObjectStore('pdf_cache', { keyPath: 'id' });
        }
      };
    });
  }

  async storePdfText(fileHash: string, text: string, metadata: any): Promise<void> {
    await this.init();
    const transaction = this.db!.transaction(['pdf_cache'], 'readwrite');
    const store = transaction.objectStore('pdf_cache');
    await store.put({
      id: fileHash,
      text,
      metadata,
      size: new Blob([text]).size,
      timestamp: Date.now()
    });
  }

  async getPdfText(fileHash: string): Promise<{ text: string; metadata: any } | null> {
    await this.init();
    const transaction = this.db!.transaction(['pdf_cache'], 'readonly');
    const store = transaction.objectStore('pdf_cache');
    const result = await store.get(fileHash) as any;
    return result ? { text: result.text, metadata: result.metadata } : null;
  }

  private async generateFileHash(file: File): Promise<string> {
    const buffer = await file.slice(0, 1024).arrayBuffer();
    const view = new Uint8Array(buffer);
    let hash = 0;
    for (let i = 0; i < view.length; i++) {
      hash = ((hash << 5) - hash + view[i]) & 0xffffffff;
    }
    return `${file.name}_${file.size}_${hash}`;
  }
}

class WebWorkerManager {
  private pdfWorker: Worker | null = null;
  private workerReady = false;

  async initWorker(): Promise<void> {
    if (this.workerReady && this.pdfWorker) return;
    
    const workerCode = `
      // Web Worker PDF extraction (runs off main thread)
      // Note: pdfjs-dist v4+ uses ESM workers — this path falls back gracefully to main thread
      let pdfjs = null;

      self.onmessage = async function(e) {
        const { type, data, id } = e.data;
        try {
          if (type === 'init') {
            pdfjs = self.pdfjsLib;
            self.postMessage({ type: 'ready', id });
          } else if (type === 'extractText') {
            if (!pdfjs) throw new Error('PDF.js not initialized');
            const { arrayBuffer, maxPages } = data;
            const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            const totalPages = doc.numPages;
            const pagesToProcess = Math.min(totalPages, maxPages || 3);
            const textParts = [];
            
            for (let i = 1; i <= pagesToProcess; i++) {
              const page = await doc.getPage(i);
              const content = await page.getTextContent();
              const pageText = content.items.map(item => item.str).join(' ').trim();
              if (pageText.length > 0) textParts.push(pageText);
              page.cleanup();
              if (i % 2 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            doc.destroy();
            self.postMessage({
              type: 'result',
              data: {
                text: textParts.join('\\n\\n').trim(),
                pages: totalPages,
                extractedPages: pagesToProcess
              },
              id
            });
          }
        } catch (error) {
          self.postMessage({ type: 'error', error: error.message, id });
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    this.pdfWorker = new Worker(workerUrl);
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker init timeout')), 5000);
      this.pdfWorker!.onmessage = (e) => {
        if (e.data.type === 'ready') {
          clearTimeout(timeout);
          this.workerReady = true;
          resolve(true);
        }
      };
      this.pdfWorker!.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
      this.pdfWorker!.postMessage({ type: 'init', id: 'init' });
    });
  }

  async extractPdfText(file: File, maxPages: number = 3): Promise<{
    text: string;
    pages: number;
    extractedPages: number;
  }> {
    await this.initWorker();
    if (!this.pdfWorker || !this.workerReady) {
      throw new Error('PDF worker not available');
    }

    const arrayBuffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('PDF processing timeout')), 30000);
      const messageId = Date.now().toString();
      
      this.pdfWorker!.onmessage = (e) => {
        if (e.data.id === messageId) {
          clearTimeout(timeout);
          if (e.data.type === 'result') {
            resolve(e.data.data);
          } else if (e.data.type === 'error') {
            reject(new Error(e.data.error));
          }
        }
      };
      
      this.pdfWorker!.postMessage({
        type: 'extractText',
        data: { arrayBuffer, maxPages },
        id: messageId
      });
    });
  }

  terminate(): void {
    if (this.pdfWorker) {
      this.pdfWorker.terminate();
      this.pdfWorker = null;
      this.workerReady = false;
    }
  }
}

// Global instances
const indexedDBOffloader = new IndexedDBOffloader();
const webWorkerManager = new WebWorkerManager();

// Memory Offloading Service
export class MemoryOffloadingService {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await indexedDBOffloader.init();
    await webWorkerManager.initWorker();
    this.initialized = true;
    console.log('[Memory Offloading] Service initialized');
  }

  // Main method: Extract PDF text with memory offloading
  async extractPdfText(file: File, options?: { maxPages?: number }): Promise<{
    text: string;
    pages: number;
    extractedPages: number;
  }> {
    await this.init();
    console.log(`[Memory Offloading] Processing: ${file.name}`);
    
    // Use Web Worker for processing (separate memory space)
    const result = await webWorkerManager.extractPdfText(file, options?.maxPages);
    
    return result;
  }

  terminate(): void {
    webWorkerManager.terminate();
    this.initialized = false;
  }
}

export const memoryOffloadingService = new MemoryOffloadingService();

// Configuration for memory-constrained environments
export const MAX_PDF_PAGES = 200; // Match settings limit (up to 200 pages)
export const PDF_RENDER_SCALE = 0.8;
export const OCR_JPEG_QUALITY = 0.4;
export const MAX_IMAGE_SIZE = 1024 * 768;
export const MEMORY_CLEANUP_INTERVAL = 2;

// Dynamic import for pdfjs-dist to enable lazy loading
// NOTE: This must be used by all PDF processing to avoid main-thread fallback
let pdfjsPromise: Promise<any> | null = null;

export const getPdfJs = async () => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs';
      return pdfjs;
    })();
  }
  return pdfjsPromise;
};

// Helper to clean up canvas and free memory - AGGRESSIVE VERSION
export const cleanupCanvas = (canvas: HTMLCanvasElement | null) => {
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Clear all context data
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Reset context state
      if (typeof (ctx as any).reset === 'function') {
        (ctx as any).reset();
      }
    }
    // Force garbage collection in browser
    canvas.width = 0;
    canvas.height = 0;
    // Remove any references and detach from DOM
    if (canvas.remove) canvas.remove();
    // Clear any event listeners
    if (typeof (canvas as any).cloneNode === 'function' && typeof (canvas as any).replaceWith === 'function') {
      canvas.replaceWith(canvas.cloneNode(false));
    }
  }
};

// Lightweight PDF text extraction using ONLY pdf.js getTextContent()
// No Tesseract/OCR - fast and memory-efficient for bulk ingestion
export const extractPdfText = async (
  source: File | ArrayBuffer,
  options?: { maxPages?: number; onProgress?: (page: number, total: number) => void }
): Promise<{ text: string; pages: number; extractedPages: number }> => {
  const maxPages = Math.min(options?.maxPages ?? 100, MAX_PDF_PAGES); // Increased default from 50 to 100
  const pdfjs = await getPdfJs();
  
  const data = source instanceof File ? await source.arrayBuffer() : source;
  const doc = await pdfjs.getDocument({ data }).promise;
  const totalPages = doc.numPages;
  const pagesToProcess = Math.min(totalPages, maxPages);
  
  const textParts: string[] = [];
  
  try {
    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();
      
      if (pageText.length > 0) {
        textParts.push(pageText);
      }
      
      // AGGRESSIVE: Cleanup page immediately
      if (typeof page.cleanup === 'function') page.cleanup();
      
      options?.onProgress?.(i, pagesToProcess);
      
      // AGGRESSIVE: Yield to UI/GC every 2 pages instead of 5
      if (i % MEMORY_CLEANUP_INTERVAL === 0) {
        await new Promise(r => setTimeout(r, 50)); // Longer delay for GC
        // Force garbage collection if available
        if (typeof global !== 'undefined' && global.gc) global.gc();
      }
    }
  } finally {
    // CRITICAL: Always destroy document
    doc.destroy();
  }
  
  let text = textParts.join('\n\n').trim();
  if (pagesToProcess < totalPages) {
    text += `\n\n[Note: ${totalPages - pagesToProcess} pages skipped due to page limit (${maxPages})]`;
  }
  
  return { text, pages: totalPages, extractedPages: pagesToProcess };
};

export const extractPdfTextWithOffloading = async (
  file: File,
  options?: { maxPages?: number; onProgress?: (page: number, total: number) => void }
): Promise<{ text: string; pages: number; extractedPages: number }> => {
  try {
    return await memoryOffloadingService.extractPdfText(file, { maxPages: options?.maxPages });
  } catch (error) {
    console.warn('[Memory Offloading] Falling back to direct PDF extraction:', error);
    return await extractPdfText(file, options);
  }
};

export interface OcrProgress {
  fileName: string;
  stage: 'loading' | 'ocr' | 'done' | 'error';
  progress: number;
}

export interface OcrResult {
  fileName: string;
  text: string;
  mimeType: string;
  pages?: number;
}

const readPdfText = async (file: File, worker: any, onProgress?: (progress: OcrProgress) => void): Promise<OcrResult> => {
  onProgress?.({ fileName: file.name, stage: 'loading', progress: 0 });
  
  // CRITICAL: Check file size first to prevent OOM
  if (file.size > 5 * 1024 * 1024) { // 5MB limit
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum 5MB allowed.`);
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await getPdfJs();
  const document = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  // Apply STRICT page limit to prevent unbounded memory usage
  const totalPages = document.numPages;
  const pagesToProcess = Math.min(totalPages, MAX_PDF_PAGES); // Use global limit
  const skippedPages = totalPages - pagesToProcess;
  
  let combined = '';
  let canvas: HTMLCanvasElement | null = null;
  
  try {
    for (let i = 1; i <= pagesToProcess; i++) {
      onProgress?.({ fileName: file.name, stage: 'ocr', progress: (i - 1) / pagesToProcess });
      
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ').trim();
      
      if (pageText.length > 50) {
        combined += `${pageText}\n\n`;
      } else {
        // AGGRESSIVE: Use reduced scale for OCR to save RAM
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
        if (!canvas) {
          canvas = window.document.createElement('canvas');
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          
          // AGGRESSIVE: Use very low JPEG quality
          const imgUrl = canvas.toDataURL('image/jpeg', OCR_JPEG_QUALITY);
          const result: RecognizeResult = await worker.recognize(imgUrl);
          combined += `${result.data.text.trim()}\n\n`;
          
          // AGGRESSIVE: Explicit canvas cleanup after each page
          cleanupCanvas(canvas);
        }
      }
      
      // AGGRESSIVE: Cleanup page immediately
      if (typeof page.cleanup === 'function') page.cleanup();
      
      onProgress?.({ fileName: file.name, stage: 'ocr', progress: i / pagesToProcess });
      
      // AGGRESSIVE: Yield to allow GC between pages on large documents
      if (i % MEMORY_CLEANUP_INTERVAL === 0) {
        await new Promise(r => setTimeout(r, 100)); // Longer delay
        // Force garbage collection if available
        if (typeof global !== 'undefined' && global.gc) global.gc();
      }
    }
  } finally {
    // CRITICAL: Explicit cleanup
    cleanupCanvas(canvas);
    canvas = null;
    // Always destroy document
    document.destroy();
  }
  
  const text = combined.trim();
  onProgress?.({ fileName: file.name, stage: 'done', progress: 1 });
  return {
    fileName: file.name,
    text: skippedPages > 0 ? `${text}\n[Note: ${skippedPages} pages skipped due to page limit]` : text,
    mimeType: file.type,
    pages: totalPages
  };
};

const readImageText = async (file: File, worker: any, onProgress?: (progress: OcrProgress) => void): Promise<OcrResult> => {
  onProgress?.({ fileName: file.name, stage: 'ocr', progress: 0.5 });
  const result: RecognizeResult = await worker.recognize(file);
  onProgress?.({ fileName: file.name, stage: 'done', progress: 1 });
  return {
    fileName: file.name,
    text: result.data.text.trim(),
    mimeType: file.type
  };
};

// Filter files to only include PDFs that need OCR
const getPdfFiles = (fileList: File[]): File[] => {
  return fileList.filter(file => 
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
};

const readPdfTextViaBackend = async (file: File, onProgress?: (progress: OcrProgress) => void): Promise<OcrResult> => {
  onProgress?.({ fileName: file.name, stage: 'loading', progress: 0 });
  const processed = await documentProcessorAPI.processDocument(file);
  const text = processed.chunks.map(chunk => chunk.text).join('\n\n').trim();
  onProgress?.({ fileName: file.name, stage: 'done', progress: 1 });
  return {
    fileName: file.name,
    text,
    mimeType: file.type,
    pages: processed.total_pages
  };
};

export const OCRService = {
  // Process all files - groups PDFs together for batch OCR with single worker
  async ocrFiles(fileList: File[], onProgress?: (progress: OcrProgress) => void) {
    const results: OcrResult[] = [];
    
    // Separate PDFs from non-PDFs
    const pdfFiles = getPdfFiles(fileList);
    const pdfFileSet = new Set(pdfFiles);
    const nonPdfFiles = fileList.filter(f => !pdfFileSet.has(f));
    
    const backendAvailable = await documentProcessorAPI.isBackendAvailable();

    if (backendAvailable) {
      for (const file of pdfFiles) {
        try {
          results.push(await readPdfTextViaBackend(file, onProgress));
        } catch (error: any) {
          console.error(`[OCR Error] Backend PDF processing failed for ${file.name}:`, error?.message || error);
          onProgress?.({ fileName: file.name, stage: 'error', progress: 0 });
          results.push({
            fileName: file.name,
            text: '',
            mimeType: file.type
          });
        }
        await new Promise(r => setTimeout(r, 0));
      }
    } else {
    const worker = await createOcrWorker();
      try {
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        for (const file of pdfFiles) {
          try {
            results.push(await readPdfText(file, worker, onProgress));
          } catch (error: any) {
            console.error(`[OCR Error] Failed to process ${file.name}:`, error?.message || error);
            onProgress?.({ fileName: file.name, stage: 'error', progress: 0 });
            results.push({
              fileName: file.name,
              text: '',
              mimeType: file.type
            });
          }
          await new Promise(r => setTimeout(r, 0));
        }
      } finally {
        try {
          await worker.terminate();
        } catch (terminateError) {
          console.warn('[OCR Warning] Failed to terminate worker:', terminateError);
        }
      }
    }
    
    // Process non-PDF files (text files don't need OCR)
    for (const file of nonPdfFiles) {
      try {
        const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
        
        if (isImage) {
          const imgWorker = await createOcrWorker();
          try {
            await imgWorker.loadLanguage('eng');
            await imgWorker.initialize('eng');
            results.push(await readImageText(file, imgWorker, onProgress));
          } finally {
            await imgWorker.terminate();
          }
        } else {
          const fallbackText = await file.text();
          results.push({
            fileName: file.name,
            text: fallbackText,
            mimeType: file.type
          });
        }
      } catch (error: any) {
        console.error(`[Error] Failed to process ${file.name}:`, error?.message || error);
        results.push({
          fileName: file.name,
          text: '',
          mimeType: file.type
        });
      }
    }
    
    return results;
  },

  // Batch OCR specifically optimized for folder indexing
  // Pass all PDFs at once to reuse a single worker across the entire indexing session
  async ocrFilesBatch(pdfFiles: File[], onProgress?: (progress: OcrProgress) => void): Promise<OcrResult[]> {
    const results: OcrResult[] = [];
    
    if (pdfFiles.length === 0) return results;
    
    const backendAvailable = await documentProcessorAPI.isBackendAvailable();

    if (backendAvailable) {
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        try {
          onProgress?.({ fileName: file.name, stage: 'loading', progress: i / pdfFiles.length });
          results.push(await readPdfTextViaBackend(file, onProgress));
        } catch (error: any) {
          console.error(`[OCR Error] Failed to process ${file.name}:`, error?.message || error);
          onProgress?.({ fileName: file.name, stage: 'error', progress: 0 });
          results.push({ fileName: file.name, text: '', mimeType: file.type });
        }
        await new Promise(r => setTimeout(r, 0));
      }
    } else {
      const worker = await createOcrWorker();
      try {
        await worker.loadLanguage('eng');
        await worker.initialize('eng');

        for (let i = 0; i < pdfFiles.length; i++) {
          const file = pdfFiles[i];
          try {
            const result = await readPdfText(file, worker, (p) => {
              onProgress?.({ ...p, progress: (i / pdfFiles.length) + (p.progress / pdfFiles.length) });
            });
            results.push(result);
          } catch (error: any) {
            console.error(`[OCR Error] Failed to process ${file.name}:`, error?.message || error);
            onProgress?.({ fileName: file.name, stage: 'error', progress: 0 });
            results.push({ fileName: file.name, text: '', mimeType: file.type });
          }
          await new Promise(r => setTimeout(r, 0));
        }
      } finally {
        await worker.terminate();
      }
    }
    
    return results;
  },

  async ocrWithVision(fileList: File[], config: LLMConfig, language: string, onProgress?: (progress: OcrProgress) => void) {
    const results: OcrResult[] = [];
    for (const file of fileList) {
      try {
        onProgress?.({ fileName: file.name, stage: 'loading', progress: 0 });
        
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        let text = '';
        
        if (isPdf) {
          let usedBackend = false;
          if (await documentProcessorAPI.isBackendAvailable()) {
            try {
              const backendResult = await readPdfTextViaBackend(file, onProgress);
              if (backendResult.text.trim().length > 0) {
                text = backendResult.text;
                usedBackend = true;
              }
            } catch (backendError) {
              console.warn(`[Vision OCR] Backend PDF extraction failed for ${file.name}, falling back to vision`, backendError);
            }
          }

          if (!usedBackend) {
            const arrayBuffer = await file.arrayBuffer();
            const pdfjs = await getPdfJs();
            const document = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            const pageCount = Math.min(document.numPages, 10);

            for (let i = 1; i <= pageCount; i++) {
              onProgress?.({ fileName: file.name, stage: 'ocr', progress: (i - 1) / pageCount });
              const page = await document.getPage(i);
              const viewport = page.getViewport({ scale: 1.2 });
              const canvas = window.document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (ctx) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                const imgUrl = canvas.toDataURL('image/jpeg', 0.6);

                const pageText = await VisionService.answerWithImages(
                  config,
                  `Please transcribe all readable text from this document page. Output only the transcribed text, nothing else.`,
                  [imgUrl],
                  language
                );
                text += (text ? '\n\n' : '') + pageText;
                canvas.width = 0;
                canvas.height = 0;
              }
            }
            onProgress?.({ fileName: file.name, stage: 'ocr', progress: 1 });
          }
        } else {
          onProgress?.({ fileName: file.name, stage: 'ocr', progress: 0.5 });
          text = await VisionService.extractText(file, config, language);
        }
        
        onProgress?.({ fileName: file.name, stage: 'done', progress: 1 });
        results.push({
          fileName: file.name,
          text,
          mimeType: file.type
        });
      } catch (error: any) {
        console.error(`[Vision OCR Error] Failed to process ${file.name}:`, error?.message || error);
        onProgress?.({ fileName: file.name, stage: 'error', progress: 0 });
        results.push({
          fileName: file.name,
          text: '',
          mimeType: file.type
        });
      }
    }
    return results;
  }
};
