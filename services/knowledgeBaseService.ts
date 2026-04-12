import { generateId, KnowledgeDocument, KnowledgeChunk, chunkText, rankChunksByQuery, PageIndexNode, flattenPageIndexNodes } from '../utils';

interface CreateDocOptions {
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  drivePath?: string;
  pageIndex?: PageIndexNode[];
  pageImages?: string[];
  previewUrl?: string;
  type?: 'pdf' | 'image' | 'text' | 'docx' | 'other';
}

interface CreateIngestedDocOptions extends CreateDocOptions {
  chunkSourceContent: string;
}

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
  
  reset(): void {
    this.seen.clear();
    this.bloomFilter.fill(0);
  }
}

// Global deduplicator instance for bulk operations
const globalDeduplicator = new ChunkDeduplicator();

// Optimized deduplication with early exit
const deduplicateChunks = (chunks: KnowledgeChunk[], useGlobalDeduplicator = false): KnowledgeChunk[] => {
  const deduplicator = useGlobalDeduplicator ? globalDeduplicator : new ChunkDeduplicator();
  const unique: KnowledgeChunk[] = [];
  
  for (const chunk of chunks) {
    const signature = chunk.text.toLowerCase().trim();
    
    // Quick bloom filter check
    if (!deduplicator.mightExist(signature)) {
      deduplicator.add(signature);
      unique.push({ ...chunk, order: unique.length });
      continue;
    }
    
    // Full check only if bloom filter says it might exist
    if (!deduplicator.has(signature)) {
      deduplicator.add(signature);
      unique.push({ ...chunk, order: unique.length });
    }
  }
  
  return unique;
};

export const KnowledgeBaseService = {
  createDocument({ title, content, source, tags = [], drivePath, pageIndex, pageImages, previewUrl, type }: CreateDocOptions): KnowledgeDocument {
    const id = generateId();
    
    // Get flattened PageIndex nodes
    const indexNodes = flattenPageIndexNodes(pageIndex);
    const hasPageIndex = indexNodes.length > 0;
    
    // Only create content-based chunks if there's no PageIndex covering the content
    // When PageIndex exists, it already provides structured chunks
    let baseChunks: KnowledgeChunk[] = [];
    if (!hasPageIndex && content.trim()) {
      baseChunks = chunkText(content, 600, 150, { // Reduced chunk size and overlap
        docId: id,
        sourceTitle: title,
        sourcePath: drivePath,
        tags,
      });
    }

    // Create chunks from PageIndex nodes
    const indexChunks: KnowledgeChunk[] = indexNodes.reduce<KnowledgeChunk[]>((acc, node, idx) => {
      const nodeText = (node.content || node.summary || node.title || '').trim();
      if (!nodeText) return acc;
      acc.push({
        id: generateId(),
        docId: id,
        text: nodeText,
        order: baseChunks.length + idx,
        sourceTitle: title,
        sourcePath: drivePath,
        tags: [...tags, ...(node.tags || [])],
        nodeId: node.id,
        pageNumber: node.pageNumber,
        summary: node.summary
      });
      return acc;
    }, []);

    // Deduplicate to avoid storing the same text twice
    const allChunks = deduplicateChunks([...baseChunks, ...indexChunks]);

    return {
      id,
      title,
      content,
      source,
      tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chunks: allChunks,
      drivePath,
      pageIndex: hasPageIndex ? indexNodes : undefined,
      pageImages: pageImages && pageImages.length ? pageImages : undefined,
      previewUrl,
      type
    };
  },

  createIngestedDocument({ chunkSourceContent, ...rest }: CreateIngestedDocOptions): KnowledgeDocument {
    const doc = this.createDocument({
      ...rest,
      content: chunkSourceContent,
    });

    if (rest.content !== chunkSourceContent) {
      doc.content = rest.content;
    }

    return doc;
  },

  // Optimized bulk document creation for batch processing
  createBulkDocuments(options: CreateDocOptions[], useGlobalDeduplication = true): KnowledgeDocument[] {
    const documents: KnowledgeDocument[] = [];
    
    // Reset global deduplicator for bulk operations
    if (useGlobalDeduplication) {
      globalDeduplicator.reset();
    }
    
    for (const opts of options) {
      const doc = this.createDocument({
        ...opts,
        // Use optimized deduplication for bulk operations
      });
      documents.push(doc);
    }
    
    return documents;
  },

  addChunksToDocument(doc: KnowledgeDocument, extraText: string) {
    const extraChunks = chunkText(extraText, 600, 150, { // Reduced chunk size and overlap
      docId: doc.id,
      sourceTitle: doc.title,
      tags: doc.tags,
    });
    return {
      ...doc,
      content: `${doc.content}\n\n${extraText}`,
      updatedAt: Date.now(),
      chunks: [...doc.chunks, ...extraChunks],
    };
  },

  search(query: string, documents: KnowledgeDocument[], limit = 3): KnowledgeChunk[] {
    if (!query) return [];
    const allChunks = documents.flatMap(doc => doc.chunks);
    const ranked = rankChunksByQuery(allChunks, query);
    return ranked.slice(0, limit);
  },

  // Reset global deduplicator (call after bulk operations)
  resetGlobalDeduplicator(): void {
    globalDeduplicator.reset();
  }
};
