import { AIService } from './aiService';
import { ContextEnhancement, KnowledgeChunk, KnowledgeDocument, LLMConfig, PageIndexNode, PageIndexPromptNode, PageIndexSelection, generateId, rankPageIndexNodesByQuery } from '../utils';

interface PageIndexQueryOptions {
  config: LLMConfig;
  language: string;
  query: string;
  documents: KnowledgeDocument[];
  limit?: number;
  enhancement?: ContextEnhancement;
}

interface PageIndexCandidate {
  doc: KnowledgeDocument;
  node: PageIndexNode;
}

const MAX_PROMPT_CANDIDATES = 8;
const DEFAULT_LIMIT = 3;

const toPromptNode = (candidate: PageIndexCandidate): PageIndexPromptNode => ({
  nodeId: candidate.node.id,
  title: candidate.node.title,
  summary: candidate.node.summary,
  content: candidate.node.content,
  docTitle: candidate.doc.title,
  docId: candidate.doc.id,
  pageNumber: candidate.node.pageNumber,
  drivePath: candidate.doc.drivePath
});

const toKnowledgeChunk = (candidate: PageIndexCandidate, reason?: string, rank?: number): KnowledgeChunk | null => {
  const textSource = (candidate.node.content || candidate.node.summary || candidate.node.title || '').trim();
  if (!textSource) return null;
  const mergedTags = Array.from(new Set([...(candidate.doc.tags || []), ...(candidate.node.tags || [])]));
  const summaryParts = [candidate.node.summary, reason].filter(Boolean);
  return {
    id: generateId(),
    docId: candidate.doc.id,
    text: textSource,
    order: rank ?? 0,
    sourceTitle: candidate.doc.title,
    sourcePath: candidate.doc.drivePath,
    tags: mergedTags,
    nodeId: candidate.node.id,
    pageNumber: candidate.node.pageNumber,
    summary: summaryParts.join(' | '),
    reason
  };
};

export const PageIndexService = {
  async queryPageIndex(options: PageIndexQueryOptions): Promise<{ chunks: KnowledgeChunk[]; thinking?: string }> {
    const { config, language, query, documents, limit = DEFAULT_LIMIT, enhancement } = options;
    if (!query.trim()) return { chunks: [] };

    const flattened: PageIndexCandidate[] = [];
    documents.forEach(doc => {
      (doc.pageIndex || []).forEach(node => {
        if (!node.id || !node.title) return;
        flattened.push({ doc, node });
      });
    });

    if (!flattened.length) return { chunks: [] };

    const rankedNodes = rankPageIndexNodesByQuery(flattened.map(({ node }) => node), query);
    const orderedCandidates = rankedNodes
      .slice(0, MAX_PROMPT_CANDIDATES)
      .map(node => flattened.find(candidate => candidate.node.id === node.id))
      .filter((item): item is PageIndexCandidate => Boolean(item));

    if (!orderedCandidates.length) return { chunks: [] };

    let selections: PageIndexSelection[] = [];
    let thinking: string | undefined;
    try {
      const result = await AIService.reasonOverPageIndex(
        config,
        query,
        orderedCandidates.map(c => toPromptNode(c)),
        language,
        enhancement,
        limit
      );
      selections = result.nodes;
      thinking = result.thinking;
    } catch (error) {
      console.error('PageIndex reasoning failed, falling back to score-based picks', error);
    }

    const selectionIds = new Set(selections.map(sel => sel.nodeId));
    const reasoningMap = new Map(selections.map(sel => [sel.nodeId, sel.reason]));

    const filteredCandidates = (selectionIds.size
      ? orderedCandidates.filter(candidate => selectionIds.has(candidate.node.id))
      : orderedCandidates
    ).slice(0, limit);

    const finalChunks: KnowledgeChunk[] = [];
    filteredCandidates.forEach((candidate, idx) => {
      const chunk = toKnowledgeChunk(candidate, reasoningMap.get(candidate.node.id), idx);
      if (chunk) finalChunks.push(chunk);
    });

    return { chunks: finalChunks, thinking };
  }
};


