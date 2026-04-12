/**
 * Browser Stability Manager
 * Prevents OCR operations from overloading the browser and provides safe polling
 */

import { getBackendApiBaseUrl } from './runtimeConfig';

const BACKEND_URL = getBackendApiBaseUrl();

export interface SystemResources {
  cpu_percent: number;
  memory_available_gb: number;
  memory_total_gb: number;
  memory_percent: number;
  disk_free_gb: number;
  disk_total_gb: number;
  is_throttled: boolean;
  throttle_reason?: string;
  processes_count: number;
}

export interface QueueStats {
  total_jobs: number;
  current_processing: number;
  max_concurrent: number;
  queue_size: number;
  statuses: Record<string, number>;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'queued' | 'waiting_resources' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  task_type: string;
  progress: number;  // 0-100
  output?: any;
  error?: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  estimated_remaining_sec?: number;
  peak_memory_mb: number;
  cpu_time_sec: number;
}

export interface SystemMetrics {
  resources: SystemResources;
  queue: QueueStats;
  hardware_profile: string;
}

/**
 * Polling throttler to prevent excessive API requests
 */
class PollingThrottler {
  private lastProgress: Map<string, number> = new Map();
  private stuckCount: Map<string, number> = new Map();
  private minInterval = 500;   // Never poll faster than 500ms
  private maxInterval = 5000;  // Max backoff to 5s
  private stuckThreshold = 3;  // Mark as stuck after 3 checks with no progress

  calculateInterval(jobId: string, currentProgress: number): number {
    const lastProg = this.lastProgress.get(jobId) ?? -1;
    const stuck = this.stuckCount.get(jobId) ?? 0;

    if (currentProgress === lastProg && lastProg >= 0) {
      // No progress, increase backoff
      const newStuck = Math.min(stuck + 1, this.stuckThreshold);
      this.stuckCount.set(jobId, newStuck);

      const backoff = this.minInterval * Math.pow(1.5, newStuck - 1);
      return Math.min(backoff, this.maxInterval);
    } else {
      // Progress made, reset
      this.stuckCount.set(jobId, 0);
      this.lastProgress.set(jobId, currentProgress);
      return this.minInterval;
    }
  }

  reset(jobId: string) {
    this.lastProgress.delete(jobId);
    this.stuckCount.delete(jobId);
  }
}

/**
 * Browser health monitor
 */
class BrowserHealthMonitor {
  private lastHealthCheck = 0;
  private checkInterval = 2000;  // Check every 2 seconds

  async measure(): Promise<{ responseTime: number; isHealthy: boolean }> {
    const start = performance.now();

    // Force a reflow to measure main thread responsiveness
    const element = document.createElement('div');
    document.body.appendChild(element);
    const rect = element.getBoundingClientRect();
    document.body.removeChild(element);

    const responseTime = performance.now() - start;

    return {
      responseTime,
      isHealthy: responseTime < 50,  // Should complete in <50ms
    };
  }

  async shouldPause(): Promise<boolean> {
    const now = Date.now();

    // Don't check too frequently
    if (now - this.lastHealthCheck < this.checkInterval) {
      return false;
    }

    this.lastHealthCheck = now;

    const health = await this.measure();

    // If main thread is slow, pause background work
    if (!health.isHealthy) {
      console.warn(`Browser responsiveness degraded: ${health.responseTime.toFixed(0)}ms`);
      return true;
    }

    // Check memory pressure (if available via navigator.deviceMemory)
    try {
      const deviceMemory = (navigator as any).deviceMemory;
      if (deviceMemory && deviceMemory < 2) {  // Less than 2GB estimated
        console.warn(`Low device memory: ${deviceMemory}GB`);
        return true;
      }
    } catch (e) {
      // navigator.deviceMemory not available, skip check
    }

    return false;
  }
}

/**
 * Main Stability Manager service
 */
export const StabilityManager = {
  throttler: new PollingThrottler(),
  healthMonitor: new BrowserHealthMonitor(),

  /**
   * Get current system resource status
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const response = await fetch(`${BACKEND_URL}/api/system/metrics`);
    if (!response.ok) {
      throw new Error(`Failed to get system metrics: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get detailed system statistics
   */
  async getSystemStats(): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/api/system/stats`);
    if (!response.ok) {
      throw new Error(`Failed to get system stats: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Start an OCR job
   */
  async startOCRJob(
    file: File,
    engine: string = 'auto',
    timeout_sec: number = 1800
  ): Promise<{ job_id: string; status: string; file_size_mb: number; can_start_immediately: boolean }> {
    const formData = new FormData();
    formData.append('file', file);

    const params = new URLSearchParams({
      engine,
      timeout_sec: timeout_sec.toString(),
    });

    const response = await fetch(`${BACKEND_URL}/api/jobs/ocr?${params}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to start OCR job: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Poll job status with intelligent throttling
   */
  async pollJob(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${BACKEND_URL}/api/jobs/${jobId}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Job not found');
      }
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<{ cancelled: boolean; reason?: string }> {
    const response = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/cancel`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel job: ${response.statusText}`);
    }

    return response.json();
  },

  /**
   * Poll job status with browser safety checks and intelligent backoff
   */
  async pollJobSafely(
    jobId: string,
    onProgress: (status: JobStatus) => void | Promise<void>,
    onPausedStatusChanged?: (isPaused: boolean) => void
  ): Promise<JobStatus> {
    let isPaused = false;
    let lastJobStatus: JobStatus | null = null;

    while (true) {
      // Check browser health
      const shouldPause = await this.healthMonitor.shouldPause();
      if (shouldPause && !isPaused) {
        isPaused = true;
        onPausedStatusChanged?.(true);
        console.warn('Browser performance degraded, pausing job polling');
      }

      if (!shouldPause && isPaused) {
        isPaused = false;
        onPausedStatusChanged?.(false);
        console.log('Browser performance recovered, resuming job polling');
      }

      // Get job status
      try {
        lastJobStatus = await this.pollJob(jobId);
      } catch (error) {
        console.error(`Failed to poll job ${jobId}:`, error);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      // Call progress handler
      try {
        const result = onProgress(lastJobStatus);
        if (result instanceof Promise) {
          await result;
        }
      } catch (error) {
        console.error('Progress handler error:', error);
      }

      // Check if job is complete
      if (
        lastJobStatus.status === 'completed' ||
        lastJobStatus.status === 'failed' ||
        lastJobStatus.status === 'cancelled' ||
        lastJobStatus.status === 'timeout'
      ) {
        return lastJobStatus;
      }

      // Calculate throttled polling interval
      const interval = this.throttler.calculateInterval(jobId, lastJobStatus.progress);

      // Non-blocking wait
      await new Promise(r => setTimeout(r, interval));
    }
  },

  /**
   * Helper to poll multiple jobs concurrently but safely
   */
  async pollMultipleJobs(
    jobIds: string[],
    onProgress: (jobId: string, status: JobStatus) => void | Promise<void>,
    onPausedStatusChanged?: (isPaused: boolean) => void
  ): Promise<Record<string, JobStatus>> {
    const results: Record<string, JobStatus> = {};

    const promises = jobIds.map(jobId =>
      this.pollJobSafely(
        jobId,
        (status) => {
          results[jobId] = status;
          return onProgress(jobId, status);
        },
        onPausedStatusChanged
      )
    );

    const allResults = await Promise.all(promises);

    return results;
  },

  /**
   * Get or create rate limiter for operations
   */
  createRateLimiter(maxOpsPerSecond: number = 5) {
    let lastOp = 0;
    const minInterval = 1000 / maxOpsPerSecond;

    return async <T,>(fn: () => Promise<T>): Promise<T> => {
      const now = Date.now();
      const timeToWait = Math.max(0, minInterval - (now - lastOp));

      if (timeToWait > 0) {
        await new Promise(r => setTimeout(r, timeToWait));
      }

      lastOp = Date.now();
      return fn();
    };
  },

  /**
   * Clear throttler state for a job
   */
  clearJobState(jobId: string) {
    this.throttler.reset(jobId);
  },
};

/**
 * Hook for React components to use stability features
 */
export function useStabilityManager() {
  return {
    getSystemMetrics: StabilityManager.getSystemMetrics,
    startOCRJob: StabilityManager.startOCRJob,
    pollJobSafely: StabilityManager.pollJobSafely,
    cancelJob: StabilityManager.cancelJob,
    clearJobState: StabilityManager.clearJobState,
  };
}
