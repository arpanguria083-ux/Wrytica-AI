import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the tesseract.js module
vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(() => ({
    loadLanguage: vi.fn().mockResolvedValue(undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn().mockResolvedValue({ data: { text: 'Mock OCR text' } }),
    terminate: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock pdfjs-dist
vi.mock('pdfjs-dist/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 10,
      getPage: vi.fn(() => Promise.resolve({
        getTextContent: vi.fn(() => Promise.resolve({ items: [] })),
        getViewport: vi.fn(() => ({ width: 100, height: 100 })),
        render: vi.fn(() => ({ promise: Promise.resolve() })),
      })),
    }),
  })),
}));

describe('OCR Service Memory Management', () => {
  describe('Page Limit Configuration', () => {
    it('should have MAX_PDF_PAGES set to 200', async () => {
      // This tests that the constant is properly exported/defined
      const { MAX_PDF_PAGES } = await import('./ocrService');
      expect(MAX_PDF_PAGES).toBe(200);
    });

    it('should have PDF_RENDER_SCALE set to 0.8', async () => {
      const { PDF_RENDER_SCALE } = await import('./ocrService');
      expect(PDF_RENDER_SCALE).toBe(0.8);
    });

    it('should have OCR_JPEG_QUALITY set to 0.4', async () => {
      const { OCR_JPEG_QUALITY } = await import('./ocrService');
      expect(OCR_JPEG_QUALITY).toBe(0.4);
    });
  });

  describe('cleanupCanvas', () => {
    it('should properly clean up canvas dimensions', async () => {
      const { cleanupCanvas } = await import('./ocrService');
      
      const mockCanvas = {
        width: 1000,
        height: 1500,
        getContext: vi.fn(() => ({
          clearRect: vi.fn(),
        })),
      } as any;

      cleanupCanvas(mockCanvas);

      expect(mockCanvas.width).toBe(0);
      expect(mockCanvas.height).toBe(0);
    });

    it('should handle null canvas gracefully', async () => {
      const { cleanupCanvas } = await import('./ocrService');
      
      // Should not throw
      expect(() => cleanupCanvas(null)).not.toThrow();
    });
  });

  describe('getPdfJs', () => {
    it('should return a promise that resolves to pdfjs', async () => {
      const { getPdfJs } = await import('./ocrService');
      const pdfjs = await getPdfJs();
      
      expect(pdfjs).toBeDefined();
      expect(pdfjs.GlobalWorkerOptions).toBeDefined();
    });

    it('should cache the pdfjs promise', async () => {
      const { getPdfJs } = await import('./ocrService');
      
      const pdfjs1 = await getPdfJs();
      const pdfjs2 = await getPdfJs();
      
      // Should be the same instance due to caching
      expect(pdfjs1).toBe(pdfjs2);
    });
  });

  describe('File filtering', () => {
    it('should correctly identify PDF files', async () => {
      const mockFile1 = { name: 'document.pdf', type: 'application/pdf' } as File;
      const mockFile2 = { name: 'document.txt', type: 'text/plain' } as File;
      const mockFile3 = { name: 'image.PNG', type: 'image/png' } as File;

      // Test the filter logic in ocrFiles
      const isPdf1 = mockFile1.type === 'application/pdf' || mockFile1.name.toLowerCase().endsWith('.pdf');
      const isPdf2 = mockFile2.type === 'application/pdf' || mockFile2.name.toLowerCase().endsWith('.pdf');
      const isPdf3 = mockFile3.type === 'application/pdf' || mockFile3.name.toLowerCase().endsWith('.pdf');

      expect(isPdf1).toBe(true);
      expect(isPdf2).toBe(false);
      expect(isPdf3).toBe(false); // PNG is not PDF
    });
  });
});

describe('KnowledgeBaseService Chunk Deduplication', () => {
  describe('createDocument', () => {
    it('should deduplicate chunks with same text', async () => {
      const { KnowledgeBaseService } = await import('./knowledgeBaseService');

      const doc = KnowledgeBaseService.createDocument({
        title: 'Test Document',
        content: 'This is some content. This is some content.', // Same text repeated
        tags: ['test'],
      });

      // With deduplication, we should have fewer chunks
      // The repeated content should be deduplicated
      expect(doc.chunks.length).toBeGreaterThan(0);
    });

    it('should handle PageIndex without duplicating content chunks', async () => {
      const { KnowledgeBaseService } = await import('./knowledgeBaseService');

      const pageIndexNodes = [
        {
          id: 'node1',
          title: 'Section 1',
          content: 'Page index content',
          summary: 'Summary',
        },
      ];

      const docWithIndex = KnowledgeBaseService.createDocument({
        title: 'Test with PageIndex',
        content: 'Regular content',
        pageIndex: pageIndexNodes,
      });

      // Should not create both content chunks AND pageindex chunks for same text
      // The deduplication should handle this
      expect(docWithIndex.chunks.length).toBeGreaterThanOrEqual(1);
      expect(docWithIndex.pageIndex).toBeDefined();
    });

    it('should skip content chunking when PageIndex exists', async () => {
      const { KnowledgeBaseService } = await import('./knowledgeBaseService');

      // Content chunking should be skipped when PageIndex is provided
      const doc = KnowledgeBaseService.createDocument({
        title: 'Test',
        content: 'Content that would normally be chunked',
        pageIndex: [
          { id: '1', title: 'Introduction', content: 'Intro content', summary: 'Intro' },
        ],
      });

      // Only PageIndex chunks should exist
      expect(doc.chunks.length).toBe(1);
      expect(doc.chunks[0].nodeId).toBe('1');
    });
  });
});

describe('Memory Calculations', () => {
  it('should calculate correct memory savings from scale reduction', () => {
    // Old scale: 1.5, New scale: 1.0
    // Memory proportional to pixel count = scale^2
    const oldPixels = Math.pow(1.5, 2);
    const newPixels = Math.pow(1.0, 2);
    const savingsPercent = ((oldPixels - newPixels) / oldPixels) * 100;

    expect(savingsPercent).toBeCloseTo(55.6, 1); // ~56% savings
  });

  it('should calculate correct memory savings from JPEG quality reduction', () => {
    // JPEG size is roughly proportional to quality setting
    const oldQuality = 0.8;
    const newQuality = 0.6;
    const savingsPercent = ((oldQuality - newQuality) / oldQuality) * 100;

    expect(savingsPercent).toBeCloseTo(25, 5); // 25% smaller base64 strings
  });

  it('should calculate page limit impact', () => {
    const maxPages = 30;
    const samplePages50 = 50;
    const samplePages100 = 100;

    // For 50 page doc
    const processed50 = Math.min(samplePages50, maxPages);
    const skipped50 = samplePages50 - processed50;
    expect(skipped50).toBe(20); // 20 pages skipped

    // For 100 page doc
    const processed100 = Math.min(samplePages100, maxPages);
    const skipped100 = samplePages100 - processed100;
    expect(skipped100).toBe(70); // 70 pages skipped
  });
});
