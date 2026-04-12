export interface WorkspaceHandle {
  directory: FileSystemDirectoryHandle;
  name: string;
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
    try {
      // @ts-ignore - showDirectoryPicker is experimental but supported in Chrome/Edge
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      return {
        directory: handle,
        name: handle.name
      };
    } catch (err) {
      console.error('Failed to get directory handle:', err);
      return null;
    }
  },

  async writeFile(dirHandle: FileSystemDirectoryHandle, fileName: string, content: string): Promise<boolean> {
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

  async readFile(dirHandle: FileSystemDirectoryHandle, fileName: string): Promise<string | null> {
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

  async listFiles(dirHandle: FileSystemDirectoryHandle): Promise<string[]> {
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

  async getDiskUsage(dirHandle: FileSystemDirectoryHandle): Promise<{ fileName: string; sizeBytes: number }[]> {
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
