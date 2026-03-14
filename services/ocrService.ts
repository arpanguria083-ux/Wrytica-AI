import { createWorker, RecognizeResult } from 'tesseract.js';
import { LLMConfig } from '../utils';
import { VisionService } from './visionService';

// Configuration for memory-constrained environments (8-16GB RAM laptops)
export const MAX_PDF_PAGES = 30; // Hard limit to prevent unbounded memory usage
export const PDF_RENDER_SCALE = 1.0; // Reduced from 1.5 - OCR doesn't need high resolution
export const OCR_JPEG_QUALITY = 0.6; // Reduced from 0.8 to shrink base64 strings

// Dynamic import for pdfjs-dist to enable lazy loading
// NOTE: This must be used by all PDF processing to avoid main-thread fallback
let pdfjsPromise: Promise<any> | null = null;

export const getPdfJs = async () => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf');
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      return pdfjs;
    })();
  }
  return pdfjsPromise;
};

// Helper to clean up canvas and free memory
export const cleanupCanvas = (canvas: HTMLCanvasElement | null) => {
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
  }
};

// Lightweight PDF text extraction using ONLY pdf.js getTextContent()
// No Tesseract/OCR - fast and memory-efficient for bulk ingestion
export const extractPdfText = async (
  source: File | ArrayBuffer,
  options?: { maxPages?: number; onProgress?: (page: number, total: number) => void }
): Promise<{ text: string; pages: number; extractedPages: number }> => {
  const maxPages = options?.maxPages ?? 50;
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
      
      if (typeof page.cleanup === 'function') page.cleanup();
      options?.onProgress?.(i, pagesToProcess);
      
      // Yield to UI/GC every 5 pages
      if (i % 5 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  } finally {
    doc.destroy();
  }
  
  let text = textParts.join('\n\n').trim();
  if (pagesToProcess < totalPages) {
    text += `\n\n[Note: ${totalPages - pagesToProcess} pages skipped due to page limit (${maxPages})]`;
  }
  
  return { text, pages: totalPages, extractedPages: pagesToProcess };
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
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await getPdfJs();
  const document = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  // Apply page limit to prevent unbounded memory usage
  const totalPages = document.numPages;
  const pagesToProcess = Math.min(totalPages, MAX_PDF_PAGES);
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
        // Use reduced scale for OCR to save RAM
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
        if (!canvas) {
          canvas = window.document.createElement('canvas');
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          
          // Use reduced JPEG quality to shrink base64 strings
          const imgUrl = canvas.toDataURL('image/jpeg', OCR_JPEG_QUALITY);
          const result: RecognizeResult = await worker.recognize(imgUrl);
          combined += `${result.data.text.trim()}\n\n`;
          
          // Explicit canvas cleanup after each page
          cleanupCanvas(canvas);
        }
      }
      
      onProgress?.({ fileName: file.name, stage: 'ocr', progress: i / pagesToProcess });
      
      // Yield to allow GC between pages on large documents
      if (i % 5 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  } finally {
    // Explicit cleanup
    cleanupCanvas(canvas);
    canvas = null;
  }
  
  const text = combined.trim();
  onProgress?.({ fileName: file.name, stage: 'done', progress: 1 });
  return {
    fileName: file.name,
    text: skippedPages > 0 ? `${text}\n
[Note: ${skippedPages} pages skipped due to page limit]` : text,
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

export const OCRService = {
  // Process all files - groups PDFs together for batch OCR with single worker
  async ocrFiles(fileList: File[], onProgress?: (progress: OcrProgress) => void) {
    const results: OcrResult[] = [];
    
    // Separate PDFs from non-PDFs
    const pdfFiles = getPdfFiles(fileList);
    const pdfFileSet = new Set(pdfFiles);
    const nonPdfFiles = fileList.filter(f => !pdfFileSet.has(f));
    
    // Create ONE worker for all PDFs
    const worker = await createWorker();
    
    try {
      await worker.loadLanguage('eng');
      await worker.initialize('eng');

      // Process all PDFs with single worker (much more memory efficient)
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
        // Yield to allow GC between PDFs
        await new Promise(r => setTimeout(r, 0));
      }
    } finally {
      await worker.terminate();
    }
    
    // Process non-PDF files (text files don't need OCR)
    for (const file of nonPdfFiles) {
      try {
        const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
        
        if (isImage) {
          const imgWorker = await createWorker();
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
    
    // Create ONE worker for the entire batch
    const worker = await createWorker();
    
    try {
      await worker.loadLanguage('eng');
      await worker.initialize('eng');

      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        try {
          const result = await readPdfText(file, worker, (p) => {
            // Adjust progress to account for position in batch
            onProgress?.({
              ...p,
              progress: (i / pdfFiles.length) + (p.progress / pdfFiles.length)
            });
          });
          results.push(result);
        } catch (error: any) {
          console.error(`[OCR Error] Failed to process ${file.name}:`, error?.message || error);
          onProgress?.({ fileName: file.name, stage: 'error', progress: 0 });
          results.push({
            fileName: file.name,
            text: '',
            mimeType: file.type
          });
        }
        // Yield to allow GC between files
        await new Promise(r => setTimeout(r, 0));
      }
    } finally {
      await worker.terminate();
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
          const arrayBuffer = await file.arrayBuffer();
          const pdfjs = await getPdfJs();
          const document = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          const pageCount = Math.min(document.numPages, 10); 
          
          for (let i = 1; i <= pageCount; i++) {
            onProgress?.({ fileName: file.name, stage: 'ocr', progress: (i - 1) / pageCount });
            const page = await document.getPage(i);
            const viewport = page.getViewport({ scale: 1.2 }); // Reduced scale
            const canvas = window.document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: ctx, viewport }).promise;
              const imgUrl = canvas.toDataURL('image/jpeg', 0.6); // Lower quality to save memory
              
              const pageText = await VisionService.answerWithImages(
                config, 
                `Please transcribe all readable text from this document page. Output only the transcribed text, nothing else.`, 
                [imgUrl], 
                language
              );
              text += (text ? '\n\n' : '') + pageText;
              
              // Cleanup
              canvas.width = 0;
              canvas.height = 0;
            }
          }
          
          onProgress?.({ fileName: file.name, stage: 'ocr', progress: 1 });
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

