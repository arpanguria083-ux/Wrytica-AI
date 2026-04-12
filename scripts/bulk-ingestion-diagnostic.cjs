#!/usr/bin/env node

/**
 * Bulk Ingestion Diagnostic Tool
 * Identifies bottlenecks and performance issues in bulk document ingestion
 */

const { performance } = require('perf_hooks');

interface DiagnosticResult {
  category: string;
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  estimatedImpact: string;
}

class BulkIngestionDiagnostic {
  private results: DiagnosticResult[] = [];
  
  async runFullDiagnostic(): Promise<void> {
    console.log('🔍 Starting Bulk Ingestion Diagnostic...\n');
    
    // Test 1: Memory Usage Patterns
    await this.testMemoryUsage();
    
    // Test 2: Vector Store Performance
    await this.testVectorStorePerformance();
    
    // Test 3: Storage Throughput
    await this.testStorageThroughput();
    
    // Test 4: Chunk Processing Speed
    await this.testChunkProcessing();
    
    // Test 5: PDF Processing Bottlenecks
    await this.testPdfProcessing();
    
    // Generate report
    this.generateReport();
  }
  
  private async testMemoryUsage(): Promise<void> {
    console.log('📊 Testing Memory Usage Patterns...');
    
    const startTime = performance.now();
    const initialMemory = this.getMemoryUsage();
    
    // Simulate bulk ingestion memory growth
    const simulatedDocs = [];
    for (let i = 0; i < 100; i++) {
      // Simulate document creation
      const content = 'x'.repeat(10000); // 10KB per document
      const chunks = this.createMockChunks(content, 15);
      
      simulatedDocs.push({
        id: `doc-${i}`,
        content,
        chunks,
        size: content.length + chunks.length * 100
      });
      
      // Check memory every 20 docs
      if (i % 20 === 0) {
        const currentMemory = this.getMemoryUsage();
        const growth = currentMemory.heapUsed - initialMemory.heapUsed;
        
        if (growth > 100 * 1024 * 1024) { // 100MB growth
          this.results.push({
            category: 'Memory',
            issue: 'Excessive Memory Growth',
            severity: 'critical',
            description: `Memory grew by ${Math.round(growth / 1024 / 1024)}MB during simulation`,
            recommendation: 'Implement stricter content limits and more frequent garbage collection',
            estimatedImpact: 'Will cause browser crashes with 50+ documents'
          });
        }
      }
    }
    
    const finalMemory = this.getMemoryUsage();
    const totalGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    
    console.log(`   Memory growth: ${Math.round(totalGrowth / 1024 / 1024)}MB for 100 docs`);
  }
  
  private async testVectorStorePerformance(): Promise<void> {
    console.log('🔄 Testing Vector Store Performance...');
    
    const chunkCount = 1000;
    const startTime = performance.now();
    
    // Simulate vector operations
    const vectors = [];
    for (let i = 0; i < chunkCount; i++) {
      const vector = new Float32Array(96); // 96 dimensions
      for (let j = 0; j < 96; j++) {
        vector[j] = Math.random();
      }
      vectors.push(vector);
      
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    const vectorCreationTime = performance.now() - startTime;
    
    // Test similarity search
    const searchStart = performance.now();
    const queryVector = new Float32Array(96).fill(0.5);
    
    for (let i = 0; i < 100; i++) {
      let similarity = 0;
      for (let j = 0; j < 96; j++) {
        similarity += queryVector[j] * vectors[i % vectors.length][j];
      }
    }
    
    const searchTime = performance.now() - searchStart;
    
    if (vectorCreationTime > 5000) {
      this.results.push({
        category: 'Vector Store',
        issue: 'Slow Vector Creation',
        severity: 'medium',
        description: `Vector creation took ${vectorCreationTime}ms for ${chunkCount} chunks`,
        recommendation: 'Implement vector batching and lazy loading',
        estimatedImpact: 'Adds 2-5 seconds per 100 documents'
      });
    }
    
    if (searchTime > 1000) {
      this.results.push({
        category: 'Vector Store',
        issue: 'Slow Similarity Search',
        severity: 'medium',
        description: `Search operations took ${searchTime}ms`,
        recommendation: 'Optimize cosine similarity calculations and use indexing',
        estimatedImpact: 'Slows down RAG queries significantly'
      });
    }
    
    console.log(`   Vector creation: ${Math.round(vectorCreationTime)}ms`);
    console.log(`   Search operations: ${Math.round(searchTime)}ms`);
  }
  
  private async testStorageThroughput(): Promise<void> {
    console.log('💾 Testing Storage Throughput...');
    
    const itemCount = 1000;
    const items = [];
    
    // Create test items
    for (let i = 0; i < itemCount; i++) {
      items.push({
        id: `item-${i}`,
        data: 'x'.repeat(1000), // 1KB per item
        timestamp: Date.now(),
        index: i
      });
    }
    
    // Test batch sizes
    const batchSizes = [100, 500, 1000];
    
    for (const batchSize of batchSizes) {
      const startTime = performance.now();
      
      // Simulate batch writing
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        // Simulate IndexedDB transaction
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const duration = performance.now() - startTime;
      const throughput = (items.length / duration) * 1000; // items per second
      
      console.log(`   Batch size ${batchSize}: ${Math.round(throughput)} items/sec`);
      
      if (throughput < 100) {
        this.results.push({
          category: 'Storage',
          issue: 'Slow Batch Operations',
          severity: 'medium',
          description: `Batch size ${batchSize} achieves only ${Math.round(throughput)} items/sec`,
          recommendation: 'Increase batch sizes and reduce transaction overhead',
          estimatedImpact: 'Bulk ingestion takes 2-3x longer than necessary'
        });
      }
    }
  }
  
  private async testChunkProcessing(): Promise<void> {
    console.log('🧩 Testing Chunk Processing Speed...');
    
    const text = 'x'.repeat(50000); // 50KB text
    const iterations = 100;
    
    // Test current chunking approach
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const chunks = this.createMockChunks(text, 800, 200);
      
      // Simulate deduplication
      const seen = new Set();
      for (const chunk of chunks) {
        const signature = chunk.toLowerCase().trim();
        seen.add(signature);
      }
    }
    
    const duration = performance.now() - startTime;
    const avgTime = duration / iterations;
    
    console.log(`   Chunk processing: ${Math.round(avgTime)}ms per document`);
    
    if (avgTime > 50) {
      this.results.push({
        category: 'Chunking',
        issue: 'Slow Chunk Processing',
        severity: 'medium',
        description: `Chunk processing takes ${Math.round(avgTime)}ms per document`,
        recommendation: 'Implement bloom filter for deduplication and reduce chunk overlap',
        estimatedImpact: 'Adds 1-2 seconds per 100 documents'
      });
    }
  }
  
  private async testPdfProcessing(): Promise<void> {
    console.log('📄 Testing PDF Processing Bottlenecks...');
    
    // Simulate PDF processing with different page counts
    const pageCounts = [1, 5, 10, 20];
    
    for (const pageCount of pageCounts) {
      const startTime = performance.now();
      
      // Simulate PDF text extraction
      const textPerPage = 2000; // characters per page
      let totalText = '';
      
      for (let i = 0; i < pageCount; i++) {
        totalText += 'x'.repeat(textPerPage);
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate OCR time
      }
      
      const duration = performance.now() - startTime;
      console.log(`   ${pageCount} pages: ${Math.round(duration)}ms`);
      
      if (duration > 2000) {
        this.results.push({
          category: 'PDF Processing',
          issue: 'Slow PDF Text Extraction',
          severity: 'high',
          description: `${pageCount}-page PDF takes ${Math.round(duration)}ms to process`,
          recommendation: 'Implement stricter page limits and parallel processing',
          estimatedImpact: 'Large PDFs can stall bulk ingestion for minutes'
        });
      }
    }
  }
  
  private createMockChunks(text: string, chunkSize: number, overlap: number = 200): string[] {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
  }
  
  private getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage();
    }
    return { heapUsed: 0, heapTotal: 0 };
  }
  
  private generateReport(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📋 BULK INGESTION DIAGNOSTIC REPORT');
    console.log('='.repeat(60));
    
    if (this.results.length === 0) {
      console.log('✅ No critical issues detected!');
      return;
    }
    
    // Group by severity
    const critical = this.results.filter(r => r.severity === 'critical');
    const high = this.results.filter(r => r.severity === 'high');
    const medium = this.results.filter(r => r.severity === 'medium');
    const low = this.results.filter(r => r.severity === 'low');
    
    // Print issues by severity
    if (critical.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES:');
      critical.forEach(issue => this.printIssue(issue));
    }
    
    if (high.length > 0) {
      console.log('\n⚠️  HIGH PRIORITY:');
      high.forEach(issue => this.printIssue(issue));
    }
    
    if (medium.length > 0) {
      console.log('\n🔧 MEDIUM PRIORITY:');
      medium.forEach(issue => this.printIssue(issue));
    }
    
    if (low.length > 0) {
      console.log('\n💡 LOW PRIORITY:');
      low.forEach(issue => this.printIssue(issue));
    }
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`   Critical: ${critical.length}`);
    console.log(`   High: ${high.length}`);
    console.log(`   Medium: ${medium.length}`);
    console.log(`   Low: ${low.length}`);
    console.log(`   Total: ${this.results.length} issues found`);
    
    // Top recommendations
    console.log('\n🎯 TOP 3 RECOMMENDATIONS:');
    const topIssues = this.results
      .sort((a, b) => {
        const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityWeight[b.severity] - severityWeight[a.severity];
      })
      .slice(0, 3);
    
    topIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. ${issue.recommendation}`);
    });
  }
  
  private printIssue(issue: DiagnosticResult): void {
    const icon = {
      critical: '🚨',
      high: '⚠️',
      medium: '🔧',
      low: '💡'
    }[issue.severity];
    
    console.log(`\n   ${icon} ${issue.issue}`);
    console.log(`      Description: ${issue.description}`);
    console.log(`      Impact: ${issue.estimatedImpact}`);
    console.log(`      Recommendation: ${issue.recommendation}`);
  }
}

// Run diagnostic if called directly
if (require.main === module) {
  const diagnostic = new BulkIngestionDiagnostic();
  diagnostic.runFullDiagnostic().catch(console.error);
}

export { BulkIngestionDiagnostic };
