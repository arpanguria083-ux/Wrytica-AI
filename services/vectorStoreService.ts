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

// Vector rebuild queue and debouncing
let rebuildQueue: KnowledgeDocument[] = [];
let rebuildTimer: NodeJS.Timeout | null = null;
let isRebuilding = false;

const hashToken = (token: string): number => {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const embed = (text: string): Float32Array => {
  const tokens = tokenize(text || '');
  const vec = new Float32Array(DIM);
  // Process tokens in chunks to prevent blocking
  const chunkSize = 50;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    chunk.forEach((token, idx) => {
      const h = hashToken(token);
      const index = (i + idx) % DIM;
      vec[index] += Math.sin(h) + Math.cos(h * 1.5);
    });
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
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
    rebuildQueue = [];
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
    isRebuilding = false;
    await StorageService.clear('vectorStore');
  },

  // Schedule rebuild instead of immediate execution
  scheduleRebuild(docs: KnowledgeDocument[], delay = 5000): void {
    // Add to queue
    rebuildQueue.push(...docs);
    
    // Clear existing timer
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
    }
    
    // Schedule new rebuild
    rebuildTimer = setTimeout(() => {
      this.executeRebuild();
    }, delay);
  },

  // Execute the actual rebuild
  async executeRebuild(): Promise<void> {
    if (isRebuilding || rebuildQueue.length === 0) return;
    
    isRebuilding = true;
    const docsToProcess = rebuildQueue.splice(0); // Clear queue
    rebuildTimer = null;
    
    try {
      await this.rebuild(docsToProcess);
    } catch (error) {
      console.error('Vector rebuild failed:', error);
    } finally {
      isRebuilding = false;
    }
  },

  // Cancel pending rebuild
  cancelPendingRebuild(): void {
    if (rebuildTimer) {
      clearTimeout(rebuildTimer);
      rebuildTimer = null;
    }
    rebuildQueue = [];
  },

  async rebuild(docs: KnowledgeDocument[]) {
    const entries: VectorEntry[] = [];
    const batchSize = 25; // Reduced from 50 for better responsiveness
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      
      // Build entries for this batch
      batch.forEach(doc => {
        const docEntries = buildEntriesForDoc(doc);
        entries.push(...docEntries);
      });
      
      // Yield to UI thread every batch
      await new Promise(r => setTimeout(r, 0));
      
      // Check if we should stop (memory protection)
      if (entries.length > MAX_VECTOR_ENTRIES) {
        console.warn(`Vector store limit reached: ${entries.length} entries`);
        break;
      }
    }
    
    store = entries.slice(0, MAX_VECTOR_ENTRIES);
    
    // Persist in background without blocking - use setImmediate equivalent
    setTimeout(() => {
      StorageService.clear('vectorStore').then(() => {
        // Store in small chunks to prevent blocking
        const storageBatchSize = 100;
        for (let i = 0; i < entries.length; i += storageBatchSize) {
          const batch = entries.slice(i, i + storageBatchSize);
          StorageService.bulkPut('vectorStore', batch);
        }
      });
    }, 100);
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




