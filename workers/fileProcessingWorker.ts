/**
 * File Processing Web Worker
 * Offloads file processing from main thread to prevent browser hangs
 */

// Worker message types
interface WorkerMessage {
  type: 'PROCESS_FILE' | 'CANCEL' | 'PING';
  payload?: any;
  id: string;
}

interface WorkerResponse {
  type: 'SUCCESS' | 'ERROR' | 'PROGRESS' | 'PONG';
  id: string;
  payload?: any;
  error?: string;
}

// Backend API URL
const BACKEND_URL = 'http://localhost:8000';

// Process a single file through backend
async function processFile(fileData: { name: string; size: number; type: string; content: ArrayBuffer }): Promise<any> {
  const formData = new FormData();
  const blob = new Blob([fileData.content], { type: fileData.type });
  formData.append('file', blob, fileData.name);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  try {
    const response = await fetch(`${BACKEND_URL}/api/documents/process`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = event.data;

  switch (type) {
    case 'PING':
      self.postMessage({ type: 'PONG', id } as WorkerResponse);
      break;

    case 'PROCESS_FILE':
      try {
        self.postMessage({
          type: 'PROGRESS',
          id,
          payload: { stage: 'uploading', fileName: payload.name }
        } as WorkerResponse);

        const result = await processFile(payload);

        self.postMessage({
          type: 'SUCCESS',
          id,
          payload: result
        } as WorkerResponse);
      } catch (error: any) {
        self.postMessage({
          type: 'ERROR',
          id,
          error: error.message || 'Unknown error'
        } as WorkerResponse);
      }
      break;

    case 'CANCEL':
      // Cancellation is handled by the main thread not sending more files
      break;

    default:
      self.postMessage({
        type: 'ERROR',
        id,
        error: `Unknown message type: ${type}`
      } as WorkerResponse);
  }
};

export {}; // Make this a module
