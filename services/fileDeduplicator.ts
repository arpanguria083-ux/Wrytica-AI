/**
 * File Deduplication Service
 * Prevents reprocessing of identical files using content-based hashing
 */

export interface FileMetadata {
  name: string;
  size: number;
  lastModified: number;
  type: string;
  hash?: string;
}

export class FileDeduplicator {
  private processedFiles = new Map<string, FileMetadata>();
  private hashCache = new Map<string, string>();
  
  /**
   * Generate a content-based hash for file deduplication
   * Uses a fast, non-cryptographic hash suitable for large files
   */
  async generateFileHash(file: File): Promise<string> {
    const cacheKey = `${file.name}-${file.size}-${file.lastModified}`;
    
    // Check cache first
    if (this.hashCache.has(cacheKey)) {
      return this.hashCache.get(cacheKey)!;
    }
    
    try {
      // For small files, read entire content for accurate hashing
      if (file.size <= 1024 * 1024) { // 1MB threshold
        const content = await file.text();
        const hash = this.simpleHash(content);
        this.hashCache.set(cacheKey, hash);
        return hash;
      }
      
      // For large files, use metadata-based hashing with sampling
      const hash = this.metadataHash(file);
      this.hashCache.set(cacheKey, hash);
      return hash;
      
    } catch (error) {
      console.warn(`Failed to generate hash for ${file.name}:`, error);
      // Fallback to metadata-only hash
      return this.metadataHash(file);
    }
  }
  
  /**
   * Simple hash function for small text content
   */
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
  
  /**
   * Metadata-based hash for large files
   */
  private metadataHash(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
  }
  
  /**
   * Check if a file has already been processed
   */
  async isDuplicate(file: File): Promise<boolean> {
    const hash = await this.generateFileHash(file);
    
    // Check if we've processed a file with this hash
    for (const [_, metadata] of this.processedFiles) {
      if (metadata.hash === hash) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Record a file as processed
   */
  async recordProcessedFile(file: File): Promise<void> {
    const hash = await this.generateFileHash(file);
    const metadata: FileMetadata = {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
      hash
    };
    
    this.processedFiles.set(hash, metadata);
    
    // Clean up cache periodically
    if (this.hashCache.size > 1000) {
      this.cleanupCache();
    }
  }
  
  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    // Keep only the most recent 500 entries
    const entries = Array.from(this.hashCache.entries());
    if (entries.length > 500) {
      this.hashCache = new Map(entries.slice(-500));
    }
  }
  
  /**
   * Get statistics about processed files
   */
  getStats(): { totalProcessed: number; duplicatesPrevented: number } {
    return {
      totalProcessed: this.processedFiles.size,
      duplicatesPrevented: this.hashCache.size - this.processedFiles.size
    };
  }
  
  /**
   * Clear all processed file records
   */
  clear(): void {
    this.processedFiles.clear();
    this.hashCache.clear();
  }
  
  /**
   * Export processed file records for persistence
   */
  exportProcessedFiles(): FileMetadata[] {
    return Array.from(this.processedFiles.values());
  }
  
  /**
   * Import processed file records
   */
  importProcessedFiles(records: FileMetadata[]): void {
    this.processedFiles.clear();
    records.forEach(record => {
      if (record.hash) {
        this.processedFiles.set(record.hash, record);
      }
    });
  }
}

// Global instance for shared deduplication across the application
export const globalDeduplicator = new FileDeduplicator();

export default FileDeduplicator;