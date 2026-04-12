/**
 * Non-blocking File Processor
 * Processes files with aggressive yielding to prevent browser hang
 */

import { documentProcessorAPI } from './backendApi';
import { extractPdfTextWithOffloading } from './ocrService';
import { KnowledgeBaseService } from './knowledgeBaseService';
import { KnowledgeChunk, KnowledgeDocument, generateId } from '../utils';

export interface ProcessingOptions {
  backendAvailable: boolean;
  maxFileSizeMB: number;
  maxPdfPages: number;
  batchSize: number;
  pdfExtractionMode?: 'standard' | 'deep';
  onProgress: (progress: {
    current: number;
    total: number;
    currentFile: string;
    status: 'processing' | 'saving' | 'complete' | 'error';
  }) => void;
  onComplete: (results: {
    success: number;
    skipped: number;
    errors: string[];
    documents: KnowledgeDocument[];
  }) => void;
  onCancel: () => boolean; // Returns true if should cancel
}

/**
 * Process files one at a time with aggressive yielding
 * This prevents the browser from detecting the tab as "hung"
 */
export async function processFilesNonBlocking(
  files: File[],
  source: string,
  tags: string[],
  options: ProcessingOptions
): Promise<void> {
  const {
    backendAvailable,
    maxFileSizeMB,
    maxPdfPages,
    batchSize,
    pdfExtractionMode = 'standard',
    onProgress,
    onComplete,
    onCancel
  } = options;

  const MAX_FILE_SIZE = maxFileSizeMB * 1024 * 1024;
  const documents: KnowledgeDocument[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let skipCount = 0;

  console.log(`[NonBlockingProcessor] Starting processing of ${files.length} files`);
  console.log(`[NonBlockingProcessor] Backend available: ${backendAvailable}`);

  // Process files one at a time with yielding
  for (let i = 0; i < files.length; i++) {
    // Check for cancellation
    if (onCancel()) {
      console.log('[NonBlockingProcessor] Processing cancelled');
      break;
    }

    const file = files[i];
    const fileName = file.name;
    const lowerName = fileName.toLowerCase();

    // Report progress
    onProgress({
      current: i + 1,
      total: files.length,
      currentFile: fileName,
      status: 'processing'
    });

    console.log(`[NonBlockingProcessor] [${i + 1}/${files.length}] Processing: ${fileName}`);

    try {
      const shouldUseBackend = backendAvailable;
      const normalizedTags = tags.length ? tags : ['local-folder'];
      const extractionMode = lowerName.endsWith('.pdf') ? pdfExtractionMode : 'standard';

      let doc: KnowledgeDocument;

      if (shouldUseBackend) {
        console.log(`[NonBlockingProcessor] Using backend for ${fileName} (${(file.size/1024/1024).toFixed(1)}MB)`);
        try {
          if (typeof global !== 'undefined' && global.gc) global.gc();
          const processed = await documentProcessorAPI.processDocument(file, undefined, extractionMode);
          const docId = generateId();
          const chunks: KnowledgeChunk[] = processed.chunks.map((chunk, order) => ({
            id: generateId(),
            docId,
            text: chunk.text,
            order,
            sourceTitle: fileName,
            sourcePath: source,
            tags: normalizedTags,
            pageNumber: chunk.page_number,
            summary: chunk.section || undefined,
          }));
          const content = chunks.map(chunk => chunk.text).join('\n\n').substring(0, 50000);
          if (!content.trim()) {
            console.log(`[NonBlockingProcessor] Empty content, skipping: ${fileName}`);
            skipCount++;
            continue;
          }
          doc = {
            id: docId,
            title: fileName,
            content,
            source: `Local: ${source}`,
            tags: normalizedTags,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            chunks,
            drivePath: source,
          };
          console.log(`[NonBlockingProcessor] Backend processed ${processed.total_chunks} chunks`);
        } catch (backendError) {
          console.error(`[NonBlockingProcessor] Backend failed for ${fileName}:`, backendError);
          errors.push(`${fileName}: Backend processing failed`);
          skipCount++;
          continue;
        }
      } else {
        console.log(`[NonBlockingProcessor] Using client-side for ${fileName}`);
        const text = await processClientSide(file, lowerName, maxPdfPages);
        if (!text || text.trim().length === 0) {
          console.log(`[NonBlockingProcessor] Empty content, skipping: ${fileName}`);
          skipCount++;
          continue;
        }
        const storedContent = text.length > 50000
          ? `${text.substring(0, 50000)}\n\n[Truncated: ${text.length} total chars]`
          : text;
        doc = KnowledgeBaseService.createIngestedDocument({
          title: fileName,
          content: storedContent,
          chunkSourceContent: text,
          source: `Local: ${source}`,
          tags: normalizedTags,
          drivePath: source,
        });
      }

      documents.push(doc);
      successCount++;

      console.log(`[NonBlockingProcessor] Success: ${fileName}`);

    } catch (error: any) {
      console.error(`[NonBlockingProcessor] Error processing ${fileName}:`, error);
      errors.push(`${fileName}: ${error.message}`);
      skipCount++;
    }

    // AGGRESSIVE YIELDING: Always yield after each file
    if (i < files.length - 1) {
      await yieldToMainThread(200); // 200ms delay between files
    }

    // Heartbeat every 5 files
    if ((i + 1) % 5 === 0) {
      console.log(`[NonBlockingProcessor] Heartbeat: ${i + 1}/${files.length} files processed`);
      await yieldToMainThread(300); // Extra delay every 5 files
    }
  }

  // Report completion
  onComplete({
    success: successCount,
    skipped: skipCount,
    errors,
    documents
  });

  console.log(`[NonBlockingProcessor] Complete: ${successCount} success, ${skipCount} skipped, ${errors.length} errors`);
}

/**
 * Process file on client side
 */
async function processClientSide(
  file: File,
  lowerName: string,
  maxPdfPages: number
): Promise<string> {
  if (lowerName.endsWith('.pdf')) {
    const result = await extractPdfTextWithOffloading(file, {
      maxPages: maxPdfPages > 0 ? maxPdfPages : undefined,
    });
    return result.text;
  } else {
    return await file.text();
  }
}

/**
 * Yield control to main thread to prevent blocking
 */
function yieldToMainThread(ms: number = 0): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default processFilesNonBlocking;
