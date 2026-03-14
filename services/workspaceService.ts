export interface WorkspaceHandle {
  directory: FileSystemDirectoryHandle;
  name: string;
}

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
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      // @ts-ignore - createWritable is supported in File System Access API
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err) {
      console.error(`Failed to write file ${fileName}:`, err);
      return false;
    }
  },

  async readFile(dirHandle: FileSystemDirectoryHandle, fileName: string): Promise<string | null> {
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (err) {
      console.error(`Failed to read file ${fileName}:`, err);
      return null;
    }
  },

  async listFiles(dirHandle: FileSystemDirectoryHandle): Promise<string[]> {
    const files: string[] = [];
    // @ts-ignore - values() is part of the AsyncIterable in FileSystemDirectoryHandle
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        files.push(entry.name);
      }
    }
    return files;
  },

  async getDiskUsage(dirHandle: FileSystemDirectoryHandle): Promise<{ fileName: string; sizeBytes: number }[]> {
    const files: { fileName: string; sizeBytes: number }[] = [];
    try {
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
      console.error('Failed to get disk usage:', err);
    }
    return files;
  }
};
