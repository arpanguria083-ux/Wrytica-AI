import { generateId, KnowledgeDocument, KnowledgeChunk, chunkText, rankChunksByQuery, PageIndexNode, flattenPageIndexNodes } from '../utils';

interface CreateDocOptions {
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  drivePath?: string;
  pageIndex?: PageIndexNode[];
  pageImages?: string[];
}

// Deduplicate chunks to avoid storing duplicate content
const deduplicateChunks = (chunks: KnowledgeChunk[]): KnowledgeChunk[] => {
  const seen = new Map<string, KnowledgeChunk>();
  
  for (const chunk of chunks) {
    // Create a signature from the chunk text
    const signature = chunk.text.toLowerCase().trim();
    
    // Keep the first occurrence of each unique text
    if (!seen.has(signature)) {
      seen.set(signature, chunk);
    }
  }
  
  // Reorder and return deduplicated chunks
  return Array.from(seen.values()).map((chunk, idx) => ({
    ...chunk,
    order: idx
  }));
};

export const KnowledgeBaseService = {
  createDocument({ title, content, source, tags = [], drivePath, pageIndex, pageImages }: CreateDocOptions): KnowledgeDocument {
    const id = generateId();
    
    // Get flattened PageIndex nodes
    const indexNodes = flattenPageIndexNodes(pageIndex);
    const hasPageIndex = indexNodes.length > 0;
    
    // Only create content-based chunks if there's no PageIndex covering the content
    // When PageIndex exists, it already provides structured chunks
    let baseChunks: KnowledgeChunk[] = [];
    if (!hasPageIndex && content.trim()) {
      baseChunks = chunkText(content, 800, 200, {
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
    };
  },

  addChunksToDocument(doc: KnowledgeDocument, extraText: string) {
    const extraChunks = chunkText(extraText, 800, 200, {
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
  }
};
