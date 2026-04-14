import { generateId, KnowledgeDocument, KnowledgeChunk, chunkText, rankChunksByQuery, PageIndexNode, flattenPageIndexNodes } from '../utils';
import { buildImageAssetRef } from './imageAssetStore';

interface CreateDocOptions {
  title: string;
  content: string;
  source?: string;
  tags?: string[];
  drivePath?: string;
  pageIndex?: PageIndexNode[];
  pageImageRefs?: string[];
  previewUrl?: string;
  type?: 'pdf' | 'image' | 'text' | 'docx' | 'other';
  _pageImagesData?: string[];
}

interface CreateIngestedDocOptions extends CreateDocOptions {
  chunkSourceContent: string;
}

class ChunkDeduplicator {
  private seen = new Set<string>();
  private bloomFilter = new Uint8Array(1024);

  private hashSignature(signature: string): number {
    let hash = 0;
    for (let i = 0; i < signature.length; i++) {
      hash = (hash * 31 + signature.charCodeAt(i)) >>> 0;
    }
    return hash % this.bloomFilter.length;
  }

  mightExist(signature: string): boolean {
    return this.bloomFilter[this.hashSignature(signature)] === 1;
  }

  add(signature: string): void {
    this.bloomFilter[this.hashSignature(signature)] = 1;
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

const globalDeduplicator = new ChunkDeduplicator();

const deduplicateChunks = (chunks: KnowledgeChunk[], useGlobalDeduplicator = false): KnowledgeChunk[] => {
  const deduplicator = useGlobalDeduplicator ? globalDeduplicator : new ChunkDeduplicator();
  const unique: KnowledgeChunk[] = [];

  for (const chunk of chunks) {
    const signature = chunk.text.toLowerCase().trim();
    if (!deduplicator.mightExist(signature)) {
      deduplicator.add(signature);
      unique.push({ ...chunk, order: unique.length });
      continue;
    }

    if (!deduplicator.has(signature)) {
      deduplicator.add(signature);
      unique.push({ ...chunk, order: unique.length });
    }
  }

  return unique;
};

export const KnowledgeBaseService = {
  createDocument({ title, content, source, tags = [], drivePath, pageIndex, pageImageRefs, previewUrl, type, _pageImagesData }: CreateDocOptions): KnowledgeDocument {
    const id = generateId();
    const resolvedPageImageRefs = pageImageRefs?.length
      ? pageImageRefs
      : _pageImagesData?.map((_, index) => buildImageAssetRef(id, index));

    const indexNodes = flattenPageIndexNodes(pageIndex);
    const hasPageIndex = indexNodes.length > 0;

    let baseChunks: KnowledgeChunk[] = [];
    if (!hasPageIndex && content.trim()) {
      baseChunks = chunkText(content, 600, 150, {
        docId: id,
        sourceTitle: title,
        sourcePath: drivePath,
        tags,
      });
    }

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
        summary: node.summary,
      });
      return acc;
    }, []);

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
      pageImageRefs: resolvedPageImageRefs?.length ? resolvedPageImageRefs : undefined,
      previewUrl,
      type,
    };
  },

  createIngestedDocument({ chunkSourceContent, _pageImagesData, ...rest }: CreateIngestedDocOptions): KnowledgeDocument {
    const doc = this.createDocument({
      ...rest,
      content: chunkSourceContent,
      _pageImagesData,
    });

    if (rest.content !== chunkSourceContent) {
      doc.content = rest.content;
    }

    return doc;
  },

  createBulkDocuments(options: CreateDocOptions[], useGlobalDeduplication = true): KnowledgeDocument[] {
    if (useGlobalDeduplication) {
      globalDeduplicator.reset();
    }

    return options.map(opts => this.createDocument(opts));
  },

  addChunksToDocument(doc: KnowledgeDocument, extraText: string) {
    const extraChunks = chunkText(extraText, 600, 150, {
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
    return rankChunksByQuery(allChunks, query).slice(0, limit);
  },

  resetGlobalDeduplicator(): void {
    globalDeduplicator.reset();
  },
};
