/**
 * Batched File Processing Service
 * Processes files in small batches to manage memory and prevent browser hangs
 */

import { ProcessedDocument, documentProcessorAPI } from './backendApi';
import { KnowledgeBaseService } from './knowledgeBaseService';
import { KnowledgeChunk, KnowledgeDocument, generateId } from '../utils';
import { FileDeduplicator } from './fileDeduplicator';
import { extractPdfTextWithOffloading } from './ocrService';

export interface BatchedProcessingOptions {
  files: File[];
  source: string;
  tags: string[];
  backendAvailable: boolean;
  pdfExtractionMode?: 'standard' | 'deep';
  batchSize: number; // Number of files per batch
  delayBetweenBatches: number; // ms delay between batches
  delayBetweenFiles: number; // ms delay between files
  maxStoredContentLength: number;
  enableDeduplication?: boolean; // Enable file-level duplicate detection
  deduplicator?: FileDeduplicator; // Custom deduplicator instance
  onProgress: (progress: {
    currentBatch: number;
    totalBatches: number;
    filesInBatch: number;
    totalFiles: number;
    currentFile: string;
    status: 'processing' | 'saving' | 'complete' | 'error' | 'duplicate';
    duplicatesSkipped?: number;
  }) => void;
  onBatchComplete: (batchResults: {
    batchNumber: number;
    success: number;
    failed: number;
    skipped: number;
    duplicates: number;
    documents: KnowledgeDocument[];
  }) => void | Promise<void>;
  onComplete: (results: {
    totalSuccess: number;
    totalFailed: number;
    totalSkipped: number;
    totalDuplicates: number;
  }) => void | Promise<void>;
  onCancel: () => boolean;
}

const CLIENT_TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx',
  '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.java',
  '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.sql', '.sh', '.bat', '.ps1',
  '.rst', '.adoc', '.tex', '.rtf'
]);

function getFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.substring(index).toLowerCase() : '';
}

function canClientExtract(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return ext === '.pdf' || CLIENT_TEXT_EXTENSIONS.has(ext);
}

/**
 * Process files in small batches with aggressive memory management
 */
export async function processFilesBatched(options: BatchedProcessingOptions): Promise<void> {
  const {
    files,
    source,
    tags,
    backendAvailable,
    pdfExtractionMode = 'standard',
    batchSize = 3,
    delayBetweenBatches = 1500,
    delayBetweenFiles = 200,
    maxStoredContentLength = 50000,
    enableDeduplication = true,
    deduplicator = new FileDeduplicator(),
    onProgress,
    onBatchComplete,
    onComplete,
    onCancel
  } = options;

  const totalBatches = Math.ceil(files.length / batchSize);
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalDuplicates = 0;

  console.log(`[BatchedProcessor] Starting batched processing: ${files.length} files in ${totalBatches} batches`);
  console.log(`[BatchedProcessor] Batch size: ${batchSize}, Delays: ${delayBetweenFiles}ms (files), ${delayBetweenBatches}ms (batches)`);

  const processClientSideFile = async (file: File): Promise<KnowledgeDocument | null> => {
    if (!canClientExtract(file.name)) {
      console.warn(`[BatchedProcessor] Client extraction unsupported for extension: ${file.name}`);
      return null;
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const text = isPdf
      ? (await extractPdfTextWithOffloading(file, { maxPages: 10 })).text
      : await file.text();

    if (!text || text.trim().length === 0) {
      return null;
    }

    const truncatedContent = text.length > maxStoredContentLength
      ? `${text.substring(0, maxStoredContentLength)}\n\n[Truncated: ${text.length} total chars]`
      : text;

    return KnowledgeBaseService.createIngestedDocument({
      title: file.name,
      content: truncatedContent,
      chunkSourceContent: text,
      source: `Local: ${source}`,
      tags: tags.length ? tags : ['local-folder'],
      drivePath: source,
    });
  };

  // Process in batches
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    // Check for cancellation
    if (onCancel()) {
      console.log('[BatchedProcessor] Processing cancelled');
      break;
    }

    const startIdx = batchNum * batchSize;
    const endIdx = Math.min(startIdx + batchSize, files.length);
    const batchFiles = files.slice(startIdx, endIdx);

    console.log(`[BatchedProcessor] Processing batch ${batchNum + 1}/${totalBatches} (${batchFiles.length} files)`);

    const batchDocuments: KnowledgeDocument[] = [];
    let batchSuccess = 0;
    let batchFailed = 0;
    let batchSkipped = 0;
    let batchDuplicates = 0;

    // Process each file in the batch
    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      const fileIndex = startIdx + i;

      // Check for cancellation
      if (onCancel()) {
        console.log('[BatchedProcessor] Cancelled during batch');
        break;
      }

      // Report progress
      onProgress({
        currentBatch: batchNum + 1,
        totalBatches,
        filesInBatch: i + 1,
        totalFiles: files.length,
        currentFile: file.name,
        status: 'processing'
      });

      try {
        // Check for duplicates before processing
        if (enableDeduplication) {
          const isDuplicate = await deduplicator.isDuplicate(file);
          if (isDuplicate) {
            console.log(`[BatchedProcessor] ⚠️ Duplicate detected, skipping: ${file.name}`);
            batchDuplicates++;
            totalDuplicates++;
            
            // Report duplicate status
            onProgress({
              currentBatch: batchNum + 1,
              totalBatches,
              filesInBatch: i + 1,
              totalFiles: files.length,
              currentFile: `${file.name} (duplicate)`,
              status: 'duplicate',
              duplicatesSkipped: totalDuplicates
            });
            
            continue;
          }
        }
        
        const shouldUseBackend = backendAvailable;
        const extractionMode =
          file.name.toLowerCase().endsWith('.pdf') ? pdfExtractionMode : 'standard';

        if (shouldUseBackend) {
          console.log(`[BatchedProcessor] [${fileIndex + 1}/${files.length}] Backend: ${file.name}`);
          try {
            const processed = await documentProcessorAPI.processDocument(file, undefined, extractionMode);
            const doc = buildDocumentFromBackend(processed, source, tags, maxStoredContentLength);
            batchDocuments.push(doc);
            console.log(`[BatchedProcessor] Backend processed ${processed.total_chunks} chunks`);
          } catch (backendError) {
            console.warn(`[BatchedProcessor] Backend failed for ${file.name}; attempting client fallback`, backendError);
            try {
              const fallbackDoc = await processClientSideFile(file);
              if (fallbackDoc) {
                batchDocuments.push(fallbackDoc);
                console.log(`[BatchedProcessor] Fallback succeeded for ${file.name}`);
              } else {
                console.warn(`[BatchedProcessor] Fallback produced no content for ${file.name}`);
                batchSkipped++;
                totalSkipped++;
                continue;
              }
            } catch (fallbackError) {
              console.error(`[BatchedProcessor] Fallback failed for ${file.name}:`, fallbackError);
              batchFailed++;
              totalFailed++;
              continue;
            }
          }
        } else {
          console.log(`[BatchedProcessor] [${fileIndex + 1}/${files.length}] Client-side: ${file.name}`);
          const doc = await processClientSideFile(file);
          if (!doc) {
            console.log(`[BatchedProcessor] Empty content, skipping: ${file.name}`);
            batchSkipped++;
            totalSkipped++;
            continue;
          }
          batchDocuments.push(doc);
        }
        
        // Record successfully processed file to prevent future duplicates
        if (enableDeduplication) {
          await deduplicator.recordProcessedFile(file);
        }
        
        batchSuccess++;
        totalSuccess++;

        console.log(`[BatchedProcessor] ✅ Success: ${file.name}`);
      } catch (error: any) {
        console.error(`[BatchedProcessor] ❌ Error on ${file.name}:`, error);
        batchFailed++;
        totalFailed++;
      }

      // @ts-ignore
      batchFiles[i] = null;

      // Yield every file so main thread can process events (prevents RESULT_CODE_HUNG)
      await new Promise(r => setTimeout(r, 0));
      if (i < batchFiles.length - 1) {
        await new Promise(r => setTimeout(r, Math.max(delayBetweenFiles, 100)));
      }
    }

    // Report batch completion
    await onBatchComplete({
      batchNumber: batchNum + 1,
      success: batchSuccess,
      failed: batchFailed,
      skipped: batchSkipped,
      duplicates: batchDuplicates,
      documents: batchDocuments
    });

    // AGGRESSIVE: Force memory cleanup between batches
    if (batchNum < totalBatches - 1) {
      console.log(`[BatchedProcessor] 💾 Batch ${batchNum + 1} complete. Waiting ${delayBetweenBatches}ms before next batch...`);

      // Report saving status
      onProgress({
        currentBatch: batchNum + 1,
        totalBatches,
        filesInBatch: batchFiles.length,
        totalFiles: files.length,
        currentFile: `Waiting before batch ${batchNum + 2}...`,
        status: 'saving'
      });

      await new Promise(r => setTimeout(r, delayBetweenBatches));

      // Force garbage collection hint
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
    }
  }

  // Final completion
  await onComplete({
    totalSuccess,
    totalFailed,
    totalSkipped,
    totalDuplicates
  });

  console.log(`[BatchedProcessor] Complete: ${totalSuccess} success, ${totalFailed} failed, ${totalSkipped} skipped`);
}

function buildDocumentFromBackend(processed: ProcessedDocument, source: string, tags: string[], maxStoredContentLength: number): KnowledgeDocument {
  const docId = generateId();
  const normalizedTags = tags.length ? tags : ['local-folder'];
  const chunks: KnowledgeChunk[] = processed.chunks.map((chunk, order) => ({
    id: generateId(),
    docId,
    text: chunk.text,
    order,
    sourceTitle: processed.filename,
    sourcePath: source,
    tags: normalizedTags,
    pageNumber: chunk.page_number,
    summary: chunk.section || undefined,
  }));

  const content = chunks.map(chunk => chunk.text).join('\n\n').substring(0, maxStoredContentLength);

  return {
    id: docId,
    title: processed.filename,
    content,
    source: `Local: ${source}`,
    tags: normalizedTags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    chunks,
    drivePath: source,
  };
}

export default processFilesBatched;
