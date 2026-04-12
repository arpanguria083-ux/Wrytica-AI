"""
Async job queue with resource management and stability controls.
Prevents browser crashes and backend overload during OCR processing.
"""

import asyncio
import time
import uuid
import logging
from typing import Dict, Optional, Callable, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import psutil

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Job lifecycle states."""
    PENDING = "pending"
    QUEUED = "queued"
    WAITING_RESOURCES = "waiting_resources"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class JobMetadata:
    """Metadata for a background job."""
    job_id: str
    status: JobStatus = JobStatus.PENDING
    task_type: str = ""  # "ocr_pdfplumber", "ocr_chandra", "ocr_mineru", "download", "ingest"
    progress: float = 0.0  # 0-100
    output: Optional[Dict[str, Any]] = field(default_factory=dict)
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    timeout_sec: int = 1800  # 30 min default

    # Performance tracking
    peak_memory_mb: float = 0.0
    cpu_time_sec: float = 0.0
    estimated_remaining_sec: Optional[float] = None
    file_size_mb: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "job_id": self.job_id,
            "status": self.status.value,
            "task_type": self.task_type,
            "progress": round(self.progress, 1),
            "output": self.output,
            "error": self.error,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "estimated_remaining_sec": self.estimated_remaining_sec,
            "peak_memory_mb": round(self.peak_memory_mb, 1),
            "cpu_time_sec": round(self.cpu_time_sec, 2),
        }


class JobQueue:
    """Async job queue with resource management and stability controls."""

    def __init__(
        self,
        max_concurrent_jobs: int = 2,
        resource_monitor: Optional[Any] = None,
        max_job_history: int = 100
    ):
        self.jobs: Dict[str, JobMetadata] = {}
        self.task_queue: asyncio.Queue = asyncio.Queue()
        self.max_concurrent = max_concurrent_jobs
        self.current_jobs = 0
        self.resource_monitor = resource_monitor
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.max_job_history = max_job_history
        self._lock = asyncio.Lock()

        logger.info(f"JobQueue initialized: max_concurrent={max_concurrent_jobs}")

    async def add_job(
        self,
        job_id: str,
        task_type: str,
        payload: Dict[str, Any],
        timeout_sec: int = 1800,
        file_size_mb: float = 0.0
    ) -> str:
        """Queue a job with timeout and resource checking."""
        job = JobMetadata(
            job_id=job_id,
            task_type=task_type,
            timeout_sec=timeout_sec,
            file_size_mb=file_size_mb
        )

        async with self._lock:
            self.jobs[job_id] = job

        # Check if we can start immediately or must queue
        if self.resource_monitor:
            can_start, reason = self.resource_monitor.can_start_job(task_type)
            if not can_start:
                job.status = JobStatus.WAITING_RESOURCES
                logger.warning(f"Job {job_id} waiting for resources: {reason}")
            else:
                job.status = JobStatus.QUEUED
        else:
            job.status = JobStatus.QUEUED

        await self.task_queue.put((job_id, task_type, payload))
        logger.info(f"Job {job_id} added ({task_type}, {file_size_mb}MB)")

        return job_id

    def get_status(self, job_id: str) -> Optional[JobMetadata]:
        """Get job status without blocking."""
        return self.jobs.get(job_id)

    def get_all_jobs(self) -> Dict[str, JobMetadata]:
        """Get all jobs (for monitoring)."""
        return dict(self.jobs)

    async def set_progress(
        self,
        job_id: str,
        progress: float,
        remaining_sec: Optional[float] = None
    ):
        """Update job progress."""
        if job := self.jobs.get(job_id):
            job.progress = min(progress, 100.0)
            if remaining_sec is not None:
                job.estimated_remaining_sec = remaining_sec

    async def mark_complete(self, job_id: str, output: Dict[str, Any]):
        """Mark job as successfully completed."""
        async with self._lock:
            if job := self.jobs.get(job_id):
                job.status = JobStatus.COMPLETED
                job.output = output
                job.completed_at = time.time()
                self.current_jobs = max(0, self.current_jobs - 1)
                logger.info(f"Job {job_id} completed in {job.completed_at - job.started_at:.1f}s")

    async def mark_failed(self, job_id: str, error: str):
        """Mark job as failed."""
        async with self._lock:
            if job := self.jobs.get(job_id):
                job.status = JobStatus.FAILED
                job.error = error
                job.completed_at = time.time()
                self.current_jobs = max(0, self.current_jobs - 1)
                logger.error(f"Job {job_id} failed: {error}")

    async def mark_timeout(self, job_id: str):
        """Mark job as timed out."""
        async with self._lock:
            if job := self.jobs.get(job_id):
                job.status = JobStatus.TIMEOUT
                job.error = f"Job exceeded timeout of {job.timeout_sec}s"
                job.completed_at = time.time()
                self.current_jobs = max(0, self.current_jobs - 1)
                logger.error(f"Job {job_id} timed out")

    async def mark_cancelled(self, job_id: str):
        """Mark job as cancelled."""
        async with self._lock:
            if job := self.jobs.get(job_id):
                job.status = JobStatus.CANCELLED
                job.completed_at = time.time()
                self.current_jobs = max(0, self.current_jobs - 1)
                logger.info(f"Job {job_id} cancelled")

    async def process_worker(self, handler: Callable):
        """Background worker that processes jobs with resource awareness."""
        logger.info("Job worker started")

        while True:
            try:
                # Wait if at capacity
                while self.current_jobs >= self.max_concurrent:
                    await asyncio.sleep(1)

                # Get next job from queue
                try:
                    job_id, task_type, payload = await asyncio.wait_for(
                        self.task_queue.get(),
                        timeout=None
                    )
                except asyncio.TimeoutError:
                    await asyncio.sleep(1)
                    continue

                job = self.jobs.get(job_id)
                if not job:
                    logger.warning(f"Job {job_id} not found in registry")
                    continue

                # Wait for resources if needed
                if job.status == JobStatus.WAITING_RESOURCES:
                    if self.resource_monitor:
                        can_wait = await self.resource_monitor.wait_for_resources(
                            task_type,
                            timeout_sec=300
                        )
                        if not can_wait:
                            await self.mark_failed(job_id, "Timed out waiting for system resources")
                            continue

                async with self._lock:
                    self.current_jobs += 1

                job.status = JobStatus.PROCESSING
                job.started_at = time.time()

                # Create task with timeout
                task = asyncio.create_task(
                    self._run_with_timeout(job_id, handler, task_type, payload, job.timeout_sec)
                )
                self.active_tasks[job_id] = task

                try:
                    await task
                finally:
                    self.active_tasks.pop(job_id, None)
                    await self._cleanup_old_jobs()

            except asyncio.CancelledError:
                logger.info("Job worker cancelled")
                break
            except Exception as e:
                logger.error(f"Worker error: {e}", exc_info=True)
                await asyncio.sleep(1)

    async def _run_with_timeout(
        self,
        job_id: str,
        handler: Callable,
        task_type: str,
        payload: Dict[str, Any],
        timeout_sec: int
    ):
        """Run handler with timeout and error handling."""
        start_time = time.time()

        try:
            result = await asyncio.wait_for(
                handler(job_id, task_type, payload),
                timeout=timeout_sec
            )
            await self.mark_complete(job_id, result)

            # Record job completion
            if self.resource_monitor:
                duration = time.time() - start_time
                job = self.jobs.get(job_id)
                if job:
                    self.resource_monitor.record_job(
                        job_id, task_type, job.file_size_mb, duration, True
                    )

        except asyncio.TimeoutError:
            logger.error(f"Job {job_id} timed out after {timeout_sec}s")
            await self.mark_timeout(job_id)

        except asyncio.CancelledError:
            logger.info(f"Job {job_id} cancelled")
            await self.mark_cancelled(job_id)

        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}")
            await self.mark_failed(job_id, str(e))

            # Record job failure
            if self.resource_monitor:
                duration = time.time() - start_time
                job = self.jobs.get(job_id)
                if job:
                    self.resource_monitor.record_job(
                        job_id, task_type, job.file_size_mb, duration, False, str(e)
                    )

    async def cancel_job(self, job_id: str) -> bool:
        """Cancel a running or queued job."""
        if task := self.active_tasks.get(job_id):
            task.cancel()
            logger.info(f"Cancelling job {job_id}")
            return True

        job = self.jobs.get(job_id)
        if job and job.status in [JobStatus.PENDING, JobStatus.QUEUED, JobStatus.WAITING_RESOURCES]:
            await self.mark_cancelled(job_id)
            return True

        return False

    async def _cleanup_old_jobs(self):
        """Remove old completed/failed jobs to prevent memory leak."""
        if len(self.jobs) > self.max_job_history:
            # Sort by completion time and remove oldest
            sorted_jobs = sorted(
                self.jobs.items(),
                key=lambda x: x[1].completed_at or 0
            )

            # Keep only recent jobs
            to_remove = len(self.jobs) - self.max_job_history
            for job_id, _ in sorted_jobs[:to_remove]:
                if self.jobs[job_id].status in [
                    JobStatus.COMPLETED,
                    JobStatus.FAILED,
                    JobStatus.TIMEOUT,
                    JobStatus.CANCELLED
                ]:
                    del self.jobs[job_id]

    def get_queue_stats(self) -> Dict[str, Any]:
        """Get queue statistics for monitoring."""
        jobs = self.jobs.values()

        statuses = {
            "pending": sum(1 for j in jobs if j.status == JobStatus.PENDING),
            "queued": sum(1 for j in jobs if j.status == JobStatus.QUEUED),
            "waiting_resources": sum(1 for j in jobs if j.status == JobStatus.WAITING_RESOURCES),
            "processing": sum(1 for j in jobs if j.status == JobStatus.PROCESSING),
            "completed": sum(1 for j in jobs if j.status == JobStatus.COMPLETED),
            "failed": sum(1 for j in jobs if j.status == JobStatus.FAILED),
            "timeout": sum(1 for j in jobs if j.status == JobStatus.TIMEOUT),
            "cancelled": sum(1 for j in jobs if j.status == JobStatus.CANCELLED),
        }

        return {
            "total_jobs": len(self.jobs),
            "current_processing": self.current_jobs,
            "max_concurrent": self.max_concurrent,
            "queue_size": self.task_queue.qsize(),
            "statuses": statuses,
        }

    async def wait_all_jobs(self, timeout_sec: int = 300) -> bool:
        """Wait for all jobs to complete (useful for graceful shutdown)."""
        start = time.time()

        while time.time() - start < timeout_sec:
            active = sum(
                1 for j in self.jobs.values()
                if j.status in [
                    JobStatus.PROCESSING,
                    JobStatus.QUEUED,
                    JobStatus.WAITING_RESOURCES
                ]
            )

            if active == 0:
                return True

            logger.info(f"Waiting for {active} jobs to complete...")
            await asyncio.sleep(1)

        logger.warning(f"Timeout waiting for jobs after {timeout_sec}s")
        return False


# Global instance
job_queue: Optional[JobQueue] = None


def init_job_queue(max_concurrent: int = 2, resource_monitor: Optional[Any] = None) -> JobQueue:
    """Initialize the global job queue."""
    global job_queue
    job_queue = JobQueue(max_concurrent, resource_monitor)
    return job_queue
