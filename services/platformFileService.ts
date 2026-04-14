import { isDesktopRuntime } from './runtimeConfig';
import type { ElectronAPI } from '../electron/preload';

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  ext: string;
  // For browser mode: store the actual File when available immediately
  // For Electron mode: this will be undefined and we'll read via IPC when needed
  file?: File;
}

export type DirectoryPickResult =
  | { type: 'electron'; path: string }
  | { type: 'browser'; handle: FileSystemDirectoryHandle };

export interface PlatformFileService {
  pickDirectory(): Promise<DirectoryPickResult | null>;
  walkDirectory(dir: DirectoryPickResult): Promise<FileEntry[]>;
  readFile(entry: FileEntry): Promise<File>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

function getElectronAPI(): Window['electronAPI'] | undefined {
  return window.electronAPI;
}

async function browserPickDirectory(): Promise<DirectoryPickResult | null> {
  if (!('showDirectoryPicker' in window)) {
    return null;
  }
  try {
    const handle = await (window as any).showDirectoryPicker();
    return { type: 'browser', handle };
  } catch {
    return null;
  }
}

async function browserWalkDirectory(
  dirHandle: FileSystemDirectoryHandle,
  onProgress?: (count: number, dir: string) => void
): Promise<FileEntry[]> {
  const SKIP_PATTERNS = [
    'node_modules', '.git', '.svn', '__pycache__', '.venv', 'venv',
    'dist', 'build', '.next', '.nuxt', 'target', '.idea', '.vscode',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'
  ];

  const SUPPORTED_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx',
    '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.log', '.java',
    '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.sql', '.sh', '.bat', '.ps1',
    '.rst', '.adoc', '.tex', '.rtf', '.doc', '.docx', '.pdf',
    '.jpg', '.jpeg', '.png', '.webp'
  ]);

  const files: FileEntry[] = [];

  function shouldSkipPath(path: string): boolean {
    const parts = path.toLowerCase().split(/[\\/]/);
    return SKIP_PATTERNS.some(pattern => parts.includes(pattern.toLowerCase()));
  }

  async function walkRecursive(
    handle: FileSystemDirectoryHandle,
    basePath: string = ''
  ): Promise<void> {
    try {
      for await (const entry of (handle as any).values()) {
        const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;
        if (shouldSkipPath(currentPath)) continue;

        if (entry.kind === 'file') {
          const ext = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase();
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            const fileHandle = entry as FileSystemFileHandle;
            const file = await fileHandle.getFile();
            files.push({
              path: currentPath,
              name: entry.name,
              size: file.size,
              ext,
              file // Store the File object for immediate use
            });
          }
        } else if (entry.kind === 'directory') {
          if (onProgress) onProgress(files.length, currentPath);
          await new Promise(r => setTimeout(r, 0));
          await walkRecursive(entry, currentPath);
        }
      }
    } catch (err) {
      console.error('Error reading directory:', err);
    }
  }

  await walkRecursive(dirHandle);
  return files;
}

function getBaseName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function isElectronDir(dir: DirectoryPickResult): dir is { type: 'electron'; path: string } {
  return dir.type === 'electron';
}

function isBrowserDir(dir: DirectoryPickResult): dir is { type: 'browser'; handle: FileSystemDirectoryHandle } {
  return dir.type === 'browser';
}

export { isElectronDir, isBrowserDir };

export const platformFileService: PlatformFileService = {
  async pickDirectory(): Promise<DirectoryPickResult | null> {
    const desktop = isDesktopRuntime();
    const api = getElectronAPI();
    console.info('[PlatformFileService] pickDirectory called', {
      desktop,
      hasElectronAPI: Boolean(api),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    });

    if (desktop) {
      if (api) {
        try {
          const path = await api.dialog.openDirectory();
          if (path) {
            console.info('[PlatformFileService] Electron directory selected', { path });
            return { type: 'electron', path };
          }
          console.warn('[PlatformFileService] Electron directory selection canceled or empty');
          return null;
        } catch (error) {
          console.error('[PlatformFileService] Electron directory picker failed', error);
          return null;
        }
      }
      console.error('[PlatformFileService] Desktop runtime detected but electronAPI is missing');
      return null;
    }

    const browserResult = await browserPickDirectory();
    if (!browserResult) {
      console.warn('[PlatformFileService] Browser directory picker unavailable or canceled');
    }
    return browserResult;
  },

  async walkDirectory(dir: DirectoryPickResult): Promise<FileEntry[]> {
    if (isElectronDir(dir)) {
      const api = getElectronAPI();
      if (!api) {
        console.error('[PlatformFileService] walkDirectory missing electronAPI', { path: dir.path });
        throw new Error('Electron API not available');
      }
      console.info('[PlatformFileService] walkDirectory via Electron', { path: dir.path });
      const result = await api.fs.walkDirectory(dir.path);
      if (!result.success) {
        console.error('[PlatformFileService] walkDirectory failed', { path: dir.path, error: result.error });
        throw new Error(result.error || 'Failed to walk directory');
      }
      console.info('[PlatformFileService] walkDirectory success', { path: dir.path, files: result.files?.length ?? 0 });
      return result.files || [];
    }
    if (isBrowserDir(dir)) {
      console.info('[PlatformFileService] walkDirectory via browser handle', { name: dir.handle.name });
      return browserWalkDirectory(dir.handle);
    }
    throw new Error('Unknown directory type');
  },

  async readFile(entry: FileEntry): Promise<File> {
    const api = getElectronAPI();
    if (api) {
      const result = await api.fs.readFile(entry.path);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to read file');
      }
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new File([bytes], entry.name, { type: getMimeType(entry.ext) });
    }
    // Browser mode - if we have a stored File object, use it
    if (entry.file) {
      return entry.file;
    }
    throw new Error('Cannot read file in browser mode without handle');
  }
};

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.xml': 'application/xml',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function getDirectoryName(dir: DirectoryPickResult): string {
  if (isElectronDir(dir)) {
    return getBaseName(dir.path);
  }
  if (isBrowserDir(dir)) {
    return dir.handle.name;
  }
  return 'unknown';
}
