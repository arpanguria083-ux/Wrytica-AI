/**
 * Backend API Service for Document Processing
 * 
 * Connects React frontend to Python FastAPI backend
 * Handles large file processing outside browser memory constraints
 */

import { KnowledgeDocument } from '../utils';
import { getBackendApiBaseUrl } from './runtimeConfig';

const API_BASE_URL = getBackendApiBaseUrl();
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

export interface ProcessedDocument {
  document_id: string;
  filename: string;
  total_pages?: number;
  total_chunks: number;
  chunks: Array<{
    id: string;
    text: string;
    page_number?: number;
    section?: string;
    word_count: number;
  }>;
  embeddings?: number[][];
  processing_time_ms: number;
  file_size_bytes: number;
}

export interface HealthStatus {
  status: string;
  version: string;
  features: {
    pdf_processing: boolean;
    office_processing: boolean;
    embeddings: boolean;
    ocr: boolean;
    ocr_fast?: boolean;
    ocr_balanced?: boolean;
    deep_extract?: boolean;
    deep_extract_gpu?: boolean;
    deep_extract_cpu?: boolean;
    mineru_version?: string | null;
    deep_extract_compute_reason?: string | null;
  };
}

export interface DeepExtractResult {
  document_id: string;
  filename: string;
  markdown: string;
  total_pages?: number;
  processing_mode: 'gpu' | 'cpu' | 'mps' | 'fallback_pdfplumber';
  processing_time_ms: number;
  file_size_bytes: number;
  layout_elements: {
    text_blocks: number;
    tables: number;
    formulas: number;
    images: number;
    figures: number;
  };
}

export interface ProcessingProgress {
  stage: 'uploading' | 'parsing' | 'chunking' | 'embedding' | 'complete';
  progress: number; // 0-100
  message: string;
}

class DocumentProcessorAPI {
  private baseUrl: string;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private _isAvailable: boolean = false;
  private onHealthChangeCallbacks: Array<(available: boolean) => void> = [];

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    if (typeof window !== 'undefined') {
      this.startHealthChecks();
    }
  }

  /**
   * Check if backend is available
   */
  async isBackendAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('Health check timeout'), 5000);

    try {
      console.log(`[Backend API] Checking backend at ${this.baseUrl}/health...`);
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      const wasAvailable = this._isAvailable;
      this._isAvailable = response.ok;

      console.log(`[Backend API] Backend ${this._isAvailable ? 'DETECTED' : 'NOT DETECTED'} (status: ${response.status})`);

      if (wasAvailable !== this._isAvailable) {
        console.log(`[Backend API] Status changed from ${wasAvailable} to ${this._isAvailable}`);
        this.onHealthChangeCallbacks.forEach(cb => cb(this._isAvailable));
      }

      return this._isAvailable;
    } catch (error) {
      const wasAvailable = this._isAvailable;
      this._isAvailable = false;

      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('[Backend API] Backend check timed out');
      } else {
        console.log('[Backend API] Backend check failed:', error);
      }

      if (wasAvailable !== this._isAvailable) {
        this.onHealthChangeCallbacks.forEach(cb => cb(false));
      }

      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Subscribe to backend availability changes
   */
  onHealthChange(callback: (available: boolean) => void): () => void {
    this.onHealthChangeCallbacks.push(callback);
    return () => {
      const index = this.onHealthChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onHealthChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get current backend availability
   */
  get isAvailable(): boolean {
    return this._isAvailable;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    // Initial check
    this.isBackendAvailable();
    
    // Periodic checks
    this.healthCheckTimer = setInterval(() => {
      this.isBackendAvailable();
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Get detailed health status
   */
  async getHealthStatus(): Promise<HealthStatus | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (!response.ok) return null;
      
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Process a single document
   * Sends file to backend and receives processed chunks with embeddings
   */
  async processDocument(
    file: File,
    onProgress?: (progress: ProcessingProgress) => void,
    extractionMode: 'standard' | 'deep' = 'standard'
  ): Promise<ProcessedDocument> {
    // Check backend availability
    if (!this._isAvailable) {
      throw new Error('Backend not available. Please start the Python backend server.');
    }

    onProgress?.({
      stage: 'uploading',
      progress: 0,
      message: 'Uploading file to backend...'
    });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${this.baseUrl}/api/documents/process?include_embeddings=false&extraction_mode=${extractionMode}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend error: ${response.status} - ${errorText}`);
      }

      onProgress?.({
        stage: 'complete',
        progress: 100,
        message: 'Processing complete'
      });

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deepExtractPdf(file: File): Promise<DeepExtractResult> {
    if (!this._isAvailable) {
      throw new Error('Backend not available. Please start the Python backend server.');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/api/v1/ocr/deep-extract`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deep extract failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Convert ProcessedDocument to KnowledgeDocument format
   */
  convertToKnowledgeDocument(
    processed: ProcessedDocument,
    source: string = 'Backend Import',
    tags: string[] = ['backend-import']
  ): Partial<KnowledgeDocument> {
    // Combine all chunk texts
    const fullText = processed.chunks.map(c => c.text).join('\n\n');
    
    return {
      title: processed.filename,
      content: fullText,
      source,
      tags,
      drivePath: '',
      // Chunks are created by KnowledgeBaseService.createDocument
      // We return the raw text for it to process
    };
  }

  /**
   * Generate embeddings for texts
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this._isAvailable) {
      throw new Error('Backend not available');
    }

    const response = await fetch(`${this.baseUrl}/api/embeddings/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(texts),
    });

    if (!response.ok) {
      throw new Error('Failed to generate embeddings');
    }

    const data = await response.json();
    return data.embeddings;
  }

  /**
   * Determine if a file should use backend processing
   * Based on file size and type
   */
  shouldUseBackend(file: File): boolean {
    // Use backend for large files (>5MB)
    const sizeThreshold = 5 * 1024 * 1024; // 5MB
    
    // Use backend for Office documents (not supported in browser)
    const officeExtensions = ['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt'];
    const hasOfficeExtension = officeExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    return file.size > sizeThreshold || hasOfficeExtension;
  }
}

// Singleton instance
export const documentProcessorAPI = new DocumentProcessorAPI();

/**
 * Hook for backend availability
 * Usage in React components:
 * 
 * const BackendStatusIndicator = () => {
 *   const backendAvailable = useBackendAvailability();
 *   return <div>{backendAvailable ? '✅ Backend Connected' : '❌ Backend Offline'}</div>;
 * };
 */
export function useBackendAvailability(): boolean {
  const [available, setAvailable] = useState(documentProcessorAPI.isAvailable);

  useEffect(() => {
    // Initial check
    documentProcessorAPI.isBackendAvailable().then(setAvailable);
    
    // Subscribe to changes
    const unsubscribe = documentProcessorAPI.onHealthChange(setAvailable);
    
    return unsubscribe;
  }, []);

  return available;
}

// Need to import useState and useEffect at the top
import { useState, useEffect } from 'react';

/**
 * Process file with automatic backend/client-side selection
 * 
 * @param file - File to process
 * @param clientSideProcessor - Function to process client-side (browser)
 * @returns Processed document
 */
export async function processFileWithFallback(
  file: File,
  clientSideProcessor: (file: File) => Promise<Partial<KnowledgeDocument>>,
  extractionMode: 'standard' | 'deep' = 'standard'
): Promise<Partial<KnowledgeDocument>> {
  // Check if we should use backend
  if (documentProcessorAPI.shouldUseBackend(file) && documentProcessorAPI.isAvailable) {
    try {
      console.log(`[Backend] Processing ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      
      const processed = await documentProcessorAPI.processDocument(file, undefined, extractionMode);
      const doc = documentProcessorAPI.convertToKnowledgeDocument(processed);
      
      console.log(`[Backend] Completed: ${processed.total_chunks} chunks in ${processed.processing_time_ms}ms`);
      
      return doc;
    } catch (error) {
      console.warn(`[Backend] Failed, falling back to client-side:`, error);
      // Fall through to client-side
    }
  }
  
  // Use client-side processing
  console.log(`[Client] Processing ${file.name}`);
  return await clientSideProcessor(file);
}

export default documentProcessorAPI;
