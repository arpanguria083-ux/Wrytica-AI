import { isDesktopRuntime } from './runtimeConfig';

const decodeBase64Utf8 = (base64: string): string => {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export interface WorkspaceHandle {
  directory: FileSystemDirectoryHandle | string;
  name: string;
  isElectron?: boolean;
}

const isPermissionError = (err: unknown): boolean => {
  if (!(err instanceof DOMException)) return false;
  return err.name === 'NotAllowedError' || err.name === 'SecurityError';
};

const ensurePermission = async (
  dirHandle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite'
): Promise<boolean> => {
  try {
    // @ts-ignore
    const current = await dirHandle.queryPermission?.({ mode });
    if (current === 'granted') return true;
    if (current === 'denied') return false;
    // @ts-ignore
    const requested = await dirHandle.requestPermission?.({ mode });
    return requested === 'granted';
  } catch {
    return false;
  }
};

export const WorkspaceService = {
  async requestFolder(): Promise<WorkspaceHandle | null> {
    if (isDesktopRuntime() && window.electronAPI) {
      const folderPath = await window.electronAPI.dialog.openDirectory();
      if (folderPath) {
        return {
          directory: folderPath,
          name: folderPath.split(/[/\\]/).pop() || 'Workspace',
          isElectron: true
        };
      }
      return null;
    }

    try {
      // @ts-ignore - showDirectoryPicker is experimental but supported in Chrome/Edge
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      return {
        directory: handle,
        name: handle.name,
        isElectron: false
      };
    } catch (err) {
      console.error('Failed to get directory handle:', err);
      return null;
    }
  },

  async writeFile(dirHandle: FileSystemDirectoryHandle | string, fileName: string, content: string): Promise<boolean> {
    if (isDesktopRuntime() && window.electronAPI && typeof dirHandle === 'string') {
      const filePath = `${dirHandle}/${fileName}`;
      const result = await window.electronAPI.fs.writeFile(filePath, content);
      return result.success;
    }

    if (typeof dirHandle === 'string') {
      console.error('String directory handle used in browser mode');
      return false;
    }

    try {
      const allowed = await ensurePermission(dirHandle, 'readwrite');
      if (!allowed) return false;
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      // @ts-ignore - createWritable is supported in File System Access API
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err) {
      if (isPermissionError(err)) return false;
      console.error(`Failed to write file ${fileName}:`, err);
      return false;
    }
  },

  async readFile(dirHandle: FileSystemDirectoryHandle | string, fileName: string): Promise<string | null> {
    if (isDesktopRuntime() && window.electronAPI && typeof dirHandle === 'string') {
      const filePath = `${dirHandle}/${fileName}`;
      const result = await window.electronAPI.fs.readFile(filePath);
      if (result.success && result.data) {
        return decodeBase64Utf8(result.data);
      }
      return null;
    }

    if (typeof dirHandle === 'string') {
      console.error('String directory handle used in browser mode');
      return null;
    }

    try {
      const allowed = await ensurePermission(dirHandle, 'read');
      if (!allowed) return null;
      const fileHandle = await dirHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (err) {
      if (isPermissionError(err)) return null;
      console.error(`Failed to read file ${fileName}:`, err);
      return null;
    }
  },

  async listFiles(dirHandle: FileSystemDirectoryHandle | string): Promise<string[]> {
    if (isDesktopRuntime() && window.electronAPI && typeof dirHandle === 'string') {
      const result = await window.electronAPI.fs.readDir(dirHandle);
      if (result.success && result.entries) {
        return result.entries
          .filter(entry => entry.isFile)
          .map(entry => entry.name);
      }
      return [];
    }

    if (typeof dirHandle === 'string') {
      console.error('String directory handle used in browser mode');
      return [];
    }

    const files: string[] = [];
    try {
      const allowed = await ensurePermission(dirHandle, 'read');
      if (!allowed) return files;
      // @ts-ignore - values() is part of the AsyncIterable in FileSystemDirectoryHandle
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          files.push(entry.name);
        }
      }
    } catch (err) {
      if (!isPermissionError(err)) {
        console.error('Failed to list files:', err);
      }
    }
    return files;
  },

  async getDiskUsage(dirHandle: FileSystemDirectoryHandle | string): Promise<{ fileName: string; sizeBytes: number }[]> {
    if (isDesktopRuntime() && window.electronAPI && typeof dirHandle === 'string') {
      const result = await window.electronAPI.fs.readDir(dirHandle);
      if (result.success && result.entries) {
        const files: { fileName: string; sizeBytes: number }[] = [];
        for (const entry of result.entries.filter(e => e.isFile)) {
          const filePath = `${dirHandle}/${entry.name}`;
          const readResult = await window.electronAPI.fs.readFile(filePath);
          if (readResult.success) {
            const content = readResult.data ? atob(readResult.data) : '';
            files.push({
              fileName: entry.name,
              sizeBytes: new Blob([content]).size
            });
          }
        }
        return files;
      }
      return [];
    }

    if (typeof dirHandle === 'string') {
      console.error('String directory handle used in browser mode');
      return [];
    }

    const files: { fileName: string; sizeBytes: number }[] = [];
    try {
      const allowed = await ensurePermission(dirHandle, 'read');
      if (!allowed) return files;
      // @ts-ignore - values() is part of the AsyncIterable in FileSystemDirectoryHandle
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const fileHandle = await dirHandle.getFileHandle(entry.name);
          const file = await fileHandle.getFile();
          files.push({
            fileName: entry.name,
            sizeBytes: file.size
          });
        }
      }
    } catch (err) {
      if (!isPermissionError(err)) {
        console.error('Failed to get disk usage:', err);
      }
    }
    return files;
  }
};
