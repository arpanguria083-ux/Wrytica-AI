import { KnowledgeChunk, KnowledgeDocument, STOP_WORDS } from '../utils';
import { StorageService } from './storageService';

type VectorEntry = {
  id: string; // Required for IndexedDB keyPath
  docId: string;
  chunkId: string;
  vector: Float32Array;
};

const DIM = 96; // Small to keep memory light on 16 GB laptops
let store: VectorEntry[] = [];
const MAX_VECTOR_ENTRIES = 10000; // Limit to prevent unbounded growth
const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/\W+/).filter(t => t && !STOP_WORDS.has(t)).slice(0, 512);

const hashToken = (token: string): number => {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const embed = (text: string): Float32Array => {
  const vec = new Float32Array(DIM);
  const tokens = tokenize(text);
  if (!tokens.length) return vec;
  tokens.forEach(token => {
    vec[hashToken(token) % DIM] += 1;
  });
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return vec;
};

const cosine = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < DIM; i++) {
    sum += a[i] * b[i];
  }
  return sum;
};

const buildEntriesForDoc = (doc: KnowledgeDocument): VectorEntry[] => {
  return (doc.chunks || []).map(chunk => ({
    id: chunk.id, // Use chunkId as the primary key
    docId: doc.id,
    chunkId: chunk.id,
    vector: embed(chunk.text || '')
  }));
};



export const VectorStoreService = {
  async clear() {
    store = [];
    await StorageService.clear('vectorStore');
  },

  async rebuild(docs: KnowledgeDocument[]) {
    const entries: VectorEntry[] = [];
    const batchSize = 10;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      batch.forEach(doc => entries.push(...buildEntriesForDoc(doc)));
      // Yield to UI thread every batch
      await new Promise(r => setTimeout(r, 0));
    }
    
    store = entries;
    // Persist in background
    StorageService.clear('vectorStore').then(() => {
      StorageService.bulkPut('vectorStore', entries);
    });
  },


  async loadFromStorage() {
    try {
      const saved = await StorageService.getAll<VectorEntry>('vectorStore');
      if (saved && saved.length > 0) {
        // Recover Float32Array from object if needed
        store = saved.map(s => ({
          ...s,
          vector: s.vector instanceof Float32Array ? s.vector : new Float32Array(Object.values(s.vector))
        }));
        console.log(`Loaded ${store.length} persistent vector entries.`);
        return true;
      }
    } catch (e) {
      console.error('Failed to load vector store from storage:', e);
    }
    return false;
  },

  async upsertDocument(doc: KnowledgeDocument, replace = false) {
    if (replace) {
      this.removeDocument(doc.id);
    }
    const entries = buildEntriesForDoc(doc);
    
    // Enforce memory limit - remove oldest entries if over limit
    if (store.length + entries.length > MAX_VECTOR_ENTRIES) {
      // Remove oldest 20% of entries
      const removeCount = Math.floor(MAX_VECTOR_ENTRIES * 0.2);
      store = store.slice(removeCount);
    }
    
    store.push(...entries);
    // Async persist
    StorageService.bulkPut('vectorStore', entries);
  },

  removeDocument(docId: string) {
    store = store.filter(entry => entry.docId !== docId);
  },

  search(query: string, knowledgeBase: KnowledgeDocument[], limit = 6): KnowledgeChunk[] {
    if (!query.trim() || store.length === 0 || !knowledgeBase.length) return [];
    
    // Create a flat map of all chunks for quick lookup
    const chunkMap = new Map<string, KnowledgeChunk>();
    knowledgeBase.forEach(doc => {
      (doc.chunks || []).forEach(chunk => chunkMap.set(chunk.id, chunk));
    });

    const queryVec = embed(query);
    const scored = store
      .map(entry => ({ entry, score: cosine(queryVec, entry.vector) }))
      .filter(item => item.score > 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
      
    return scored.map(item => {
      const chunk = chunkMap.get(item.entry.chunkId);
      if (!chunk) return null;
      const hydrated: KnowledgeChunk = {
        ...chunk,
        summary: chunk.summary || `Vector match score ${item.score.toFixed(2)}`
      };
      return hydrated;
    }).filter((c): c is KnowledgeChunk => c !== null);
  }
};




