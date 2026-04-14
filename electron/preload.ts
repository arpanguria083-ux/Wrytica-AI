import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export interface RuntimeConfig {
  backendUrl: string;
  desktop: boolean;
  version?: string;
}

export interface BackendStatus {
  starting: boolean;
  ready: boolean;
  url: string;
}

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileEntryResult {
  path: string;
  name: string;
  size: number;
  ext: string;
}

export interface DialogResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ElectronAPI {
  config: {
    get: () => Promise<RuntimeConfig>;
  };
  backend: {
    status: () => Promise<BackendStatus>;
    restart: () => Promise<boolean>;
  };
  dialog: {
    openDirectory: () => Promise<string | null>;
    openFile: (filters?: FileFilter[]) => Promise<string | null>;
    openFiles: (filters?: FileFilter[]) => Promise<string[]>;
    saveFile: (options?: { defaultPath?: string; filters?: FileFilter[] }) => Promise<string | null>;
  };
  fs: {
    readFile: (filePath: string) => Promise<{ success: boolean; data?: string; isBase64?: boolean; error?: string }>;
    writeFile: (filePath: string, content: string, encoding?: 'utf8' | 'base64') => Promise<{ success: boolean; error?: string }>;
    readDir: (dirPath: string) => Promise<{ success: boolean; entries?: FileEntry[]; error?: string }>;
    exists: (filePath: string) => Promise<boolean>;
    mkdir: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
    walkDirectory: (dirPath: string) => Promise<{ success: boolean; files?: FileEntryResult[]; error?: string }>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    showItemInFolder: (filePath: string) => Promise<{ success: boolean }>;
  };
  app: {
    getPath: (name: 'home' | 'appData' | 'userData' | 'temp' | 'desktop' | 'documents') => Promise<string>;
    getVersion: () => Promise<string>;
  };
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
}

interface FileFilter {
  name: string;
  extensions: string[];
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    __WRYTICA_RUNTIME__?: {
      backendUrl?: string;
      desktop?: boolean;
      version?: string;
    };
  }
}

const api: ElectronAPI = {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
  },
  backend: {
    status: () => ipcRenderer.invoke('backend:status'),
    restart: () => ipcRenderer.invoke('backend:restart'),
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
    openFiles: (filters) => ipcRenderer.invoke('dialog:openFiles', filters),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  },
  fs: {
    readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath, content, encoding) => ipcRenderer.invoke('fs:writeFile', filePath, content, encoding),
    readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
    exists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
    walkDirectory: (dirPath) => ipcRenderer.invoke('fs:walkDirectory', dirPath),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  },
  app: {
    getPath: (name) => ipcRenderer.invoke('app:getPath', name),
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

async function initializeRuntime() {
  try {
    const config = await api.config.get();
    window.__WRYTICA_RUNTIME__ = config;
    console.log('[Preload] Runtime config initialized:', config);
  } catch (err) {
    console.error('[Preload] Failed to initialize runtime config:', err);
    window.__WRYTICA_RUNTIME__ = {
      backendUrl: 'http://127.0.0.1:8000',
      desktop: true,
      version: '0.0.0'
    };
  }
}

initializeRuntime();

console.log('[Preload] Electron preload script loaded');
