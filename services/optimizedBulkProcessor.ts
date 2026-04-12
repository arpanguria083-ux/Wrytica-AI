import { generateId, KnowledgeDocument, KnowledgeChunk } from '../utils';

// Optimized chunk deduplication using Bloom filter approach
class ChunkDeduplicator {
  private seen = new Set<string>();
  private bloomFilter = new Uint8Array(1024); // Simple bloom filter
  
  private hashSignature(signature: string): number {
    let hash = 0;
    for (let i = 0; i < signature.length; i++) {
      hash = (hash * 31 + signature.charCodeAt(i)) >>> 0;
    }
    return hash % this.bloomFilter.length;
  }
  
  mightExist(signature: string): boolean {
    const hash = this.hashSignature(signature);
    return this.bloomFilter[hash] === 1;
  }
  
  add(signature: string): void {
    const hash = this.hashSignature(signature);
    this.bloomFilter[hash] = 1;
    this.seen.add(signature);
  }
  
  has(signature: string): boolean {
    return this.seen.has(signature);
  }
}

// Memory-efficient document batch processor
export class OptimizedBulkProcessor {
  private deduplicator = new ChunkDeduplicator();
  private batchSize = 50; // Increased from 20
  private memoryThreshold = 300 * 1024 * 1024; // 300MB
  private processedBytes = 0;
  
  // Optimized deduplication with early exit
  deduplicateChunks(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
    const unique: KnowledgeChunk[] = [];
    
    for (const chunk of chunks) {
      const signature = chunk.text.toLowerCase().trim();
      
      // Quick bloom filter check
      if (!this.deduplicator.mightExist(signature)) {
        this.deduplicator.add(signature);
        unique.push({ ...chunk, order: unique.length });
        continue;
      }
      
      // Full check only if bloom filter says it might exist
      if (!this.deduplicator.has(signature)) {
        this.deduplicator.add(signature);
        unique.push({ ...chunk, order: unique.length });
      }
    }
    
    return unique;
  }
  
  // Batch processing with memory management
  async processBatch(files: File[], onProgress?: (progress: any) => void): Promise<KnowledgeDocument[]> {
    const documents: KnowledgeDocument[] = [];
    const startTime = Date.now();
    
    for (let i = 0; i < files.length; i += this.batchSize) {
      const batch = Array.from(files).slice(i, i + this.batchSize);
      
      // Check memory threshold before batch
      if (this.processedBytes > this.memoryThreshold) {
        console.warn('Memory threshold reached, pausing for GC');
        await this.forceGarbageCollection();
        this.processedBytes = 0; // Reset counter
      }
      
      const batchDocs = await this.processFileBatch(batch, i, files.length);
      documents.push(...batchDocs);
      
      // Progress update
      onProgress?.({
        processed: Math.min(i + this.batchSize, files.length),
        total: files.length,
        currentFile: `Batch ${Math.floor(i / this.batchSize) + 1}`,
        speed: (i + this.batchSize) / ((Date.now() - startTime) / 1000)
      });
      
      // Yield to event loop
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    return documents;
  }
  
  private async processFileBatch(files: File[], batchIndex: number, totalFiles: number): Promise<KnowledgeDocument[]> {
    const documents: KnowledgeDocument[] = [];
    
    for (const file of files) {
      try {
        const doc = await this.processSingleFile(file);
        if (doc) {
          documents.push(doc);
          this.processedBytes += file.size;
        }
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
      }
    }
    
    return documents;
  }
  
  private async processSingleFile(file: File): Promise<KnowledgeDocument | null> {
    // Skip large files early
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      console.warn(`Skipping large file: ${file.name}`);
      return null;
    }
    
    let text: string;
    
    if (file.name.toLowerCase().endsWith('.pdf')) {
      // Limit PDF processing to 5 pages max
      text = await this.extractPdfTextOptimized(file);
    } else {
      text = await file.text();
    }
    
    if (!text.trim()) return null;
    
    // Create document with optimized chunking
    return this.createOptimizedDocument(file, text);
  }
  
  private async extractPdfTextOptimized(file: File): Promise<string> {
    // Use existing OCR service with strict limits
    const { extractPdfText } = await import('../services/ocrService');
    const result = await extractPdfText(file, {
      maxPages: 5, // Strict 5-page limit
      onProgress: () => {} // No progress updates for better performance
    });
    return result.text;
  }
  
  private createOptimizedDocument(file: File, text: string): KnowledgeDocument {
    // Limit content length early
    const maxLength = 25000; // Reduced from 50000
    const truncatedText = text.length > maxLength ? 
      text.substring(0, maxLength) + `\n\n[Truncated: ${text.length} total chars]` : 
      text;
    
    // Create chunks with optimized size
    const chunks = this.createOptimizedChunks(truncatedText, file.name);
    
    return {
      id: generateId(),
      title: file.name,
      content: truncatedText,
      source: 'Bulk Import',
      tags: ['bulk-import'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chunks
    };
  }
  
  private createOptimizedChunks(text: string, fileName: string): KnowledgeChunk[] {
    const chunks: KnowledgeChunk[] = [];
    const chunkSize = 600; // Reduced from 800
    const overlap = 150;   // Reduced from 200
    
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunkText = text.substring(i, i + chunkSize);
      if (chunkText.trim()) {
        chunks.push({
          id: generateId(),
          docId: '', // Will be set by caller
          text: chunkText,
          order: chunks.length,
          sourceTitle: fileName,
          tags: ['bulk-import']
        });
      }
    }
    
    return this.deduplicateChunks(chunks);
  }
  
  private async forceGarbageCollection(): Promise<void> {
    // Multiple GC attempts with delays
    for (let i = 0; i < 3; i++) {
      if (typeof global !== 'undefined' && global.gc) {
        global.gc();
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Optimized storage service with larger batches
export class OptimizedStorageService {
  private static readonly LARGE_BATCH_SIZE = 1000; // Increased from 500
  
  static async bulkPutOptimized<T>(storeName: string, items: T[]): Promise<void> {
    // Import dynamically to avoid circular dependencies
    const { StorageService } = await import('./storageService');
    
    // Use larger batches for better performance
    const batchSize = this.LARGE_BATCH_SIZE;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      await StorageService.bulkPut(storeName, chunk);
      
      // Less frequent yielding for better throughput
      if (i % (batchSize * 2) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }
}

// Vector store optimization with deferred rebuilding
export class OptimizedVectorService {
  private static rebuildQueue: KnowledgeDocument[] = [];
  private static rebuildTimer: NodeJS.Timeout | null = null;
  
  static scheduleRebuild(documents: KnowledgeDocument[]): void {
    // Add to queue instead of immediate rebuild
    this.rebuildQueue.push(...documents);
    
    // Debounce rebuild with longer delay
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
    }
    
    this.rebuildTimer = setTimeout(() => {
      this.executeRebuild();
    }, 5000); // 5 second delay instead of 3
  }
  
  private static async executeRebuild(): Promise<void> {
    if (this.rebuildQueue.length === 0) return;
    
    const { VectorStoreService } = await import('./vectorStoreService');
    
    try {
      await VectorStoreService.rebuild(this.rebuildQueue);
      this.rebuildQueue = [];
    } catch (error) {
      console.error('Vector rebuild failed:', error);
    }
  }
  
  static cancelPendingRebuild(): void {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = null;
    }
    this.rebuildQueue = [];
  }
}
