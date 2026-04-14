import { openDB, IDBPDatabase } from 'idb';
import { generateId } from '../utils';

const DB_NAME = 'wrytica_image_assets';
const DB_VERSION = 2;
const STORE_NAME = 'assets';
const DOC_INDEX = 'byDocId';

export interface ImageAsset {
  id: string;
  docId: string;
  data: string;
  timestamp: number;
  sizeBytes: number;
}

let dbPromise: Promise<IDBPDatabase<any>> | null = null;

export const buildImageAssetRef = (docId: string, index: number): string => `${docId}:image:${index}`;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        let store;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        } else {
          store = transaction.objectStore(STORE_NAME);
        }

        if (!store.indexNames.contains(DOC_INDEX)) {
          store.createIndex(DOC_INDEX, 'docId');
        }
      },
    });
  }
  return dbPromise;
};

export const ImageAssetStore = {
  async saveAssetsForDoc(docId: string, images: string[]): Promise<string[]> {
    if (!images.length) return [];

    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const refs = images.map((_img, index) => buildImageAssetRef(docId, index));

    for (let index = 0; index < images.length; index++) {
      const data = images[index];
      await tx.store.put({
        id: refs[index] || generateId(),
        docId,
        data,
        timestamp: Date.now(),
        sizeBytes: new Blob([data]).size,
      } satisfies ImageAsset);
    }

    await tx.done;
    return refs;
  },

  async getAssetsForDoc(docId: string, limit?: number): Promise<ImageAsset[]> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index(DOC_INDEX);
    const assets = (await index.getAll(docId)) as ImageAsset[];
    return typeof limit === 'number' ? assets.slice(0, limit) : assets;
  },

  async getAssetDataForDoc(docId: string, limit?: number): Promise<string[]> {
    const assets = await this.getAssetsForDoc(docId, limit);
    return assets.map(asset => asset.data);
  },

  async deleteAssetsForDoc(docId: string): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const index = tx.store.index(DOC_INDEX);
    const keys = await index.getAllKeys(docId);
    for (const key of keys) {
      await tx.store.delete(key);
    }
    await tx.done;
  },

  async getStats(): Promise<{ count: number; sizeBytes: number }> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    let count = 0;
    let sizeBytes = 0;
    let cursor = await tx.store.openCursor();

    while (cursor) {
      count += 1;
      sizeBytes += (cursor.value as ImageAsset).sizeBytes || 0;
      cursor = await cursor.continue();
    }

    return { count, sizeBytes };
  },

  async hasAssets(docId: string): Promise<boolean> {
    const assets = await this.getAssetsForDoc(docId, 1);
    return assets.length > 0;
  },

  async clearAll(): Promise<void> {
    const db = await getDB();
    await db.clear(STORE_NAME);
  },
};
