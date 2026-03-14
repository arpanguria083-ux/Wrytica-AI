import { openDB, IDBPDatabase } from 'idb';
import { KnowledgeDocument, TimelineEntry, ChatSession } from '../utils';

const DB_NAME = 'wrytica_db';
const DB_VERSION = 10;

export interface WryticaSchema {
  knowledgeBase: KnowledgeDocument;
  chatSessions: ChatSession;
  toolHistory: TimelineEntry;
  chatHistory: TimelineEntry;
  vectorStore: { id: string; vectors: any };
  settings: { id: string; value: any };
}

let dbPromise: Promise<IDBPDatabase<any>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {

      upgrade(db) {
        if (!db.objectStoreNames.contains('knowledgeBase')) {
          db.createObjectStore('knowledgeBase', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chatSessions')) {
          db.createObjectStore('chatSessions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('toolHistory')) {
          db.createObjectStore('toolHistory', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chatHistory')) {
          db.createObjectStore('chatHistory', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('vectorStore')) {
          db.createObjectStore('vectorStore', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};


export const StorageService = {
  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await getDB();
    return db.getAll(storeName);
  },

  async put<T>(storeName: string, item: T): Promise<void> {
    const db = await getDB();
    await db.put(storeName, item);
  },

  async delete(storeName: string, id: string): Promise<void> {
    const db = await getDB();
    await db.delete(storeName, id);
  },

  async clear(storeName: string): Promise<void> {
    const db = await getDB();
    await db.clear(storeName);
  },

  async bulkPut<T>(storeName: string, items: T[]): Promise<void> {
    const db = await getDB();
    const batchSize = 500;
    
    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const tx = db.transaction(storeName, 'readwrite');
      for (const item of chunk) {
        await tx.store.put(item);
      }
      await tx.done;
      // Yield to let the event loop and GC run
      await new Promise(r => setTimeout(r, 0));
    }
  }
};

