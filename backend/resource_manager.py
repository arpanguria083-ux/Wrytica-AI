"""
System resource monitoring and management.
Prevents backend overload and ensures stable OCR processing.
"""

import psutil
import asyncio
import time
import logging
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


class HardwareProfile(str, Enum):
    """Hardware profile determines resource limits."""
    CPU_LAPTOP = "cpu_laptop"      # ≤16GB RAM, no GPU
    GPU_LITE = "gpu_lite"          # 8-12GB VRAM
    GPU_PRO = "gpu_pro"            # 16GB+ VRAM
    APPLE_SILICON = "apple_silicon"  # M1/M2 with unified memory


# Resource limits by hardware profile
RESOURCE_LIMITS = {
    HardwareProfile.CPU_LAPTOP: {
        "max_concurrent_jobs": 1,
        "max_cpu_percent": 60,
        "min_memory_gb": 2.0,
        "min_disk_gb": 5.0,
        "ocr_timeout_sec": 1800,  # 30 min
        "job_memory_estimate": {
            "ocr_pdfplumber": 0.5,
            "ocr_chandra": 2.5,
            "ocr_mineru": 4.0,
            "download": 1.0,
            "ingest": 0.5,
        }
    },
    HardwareProfile.GPU_LITE: {
        "max_concurrent_jobs": 2,
        "max_cpu_percent": 70,
        "min_memory_gb": 3.5,
        "min_disk_gb": 5.0,
        "ocr_timeout_sec": 1800,
        "job_memory_estimate": {
            "ocr_pdfplumber": 0.8,
            "ocr_chandra": 3.0,
            "ocr_mineru": 5.0,
            "download": 1.0,
            "ingest": 0.5,
        }
    },
    HardwareProfile.GPU_PRO: {
        "max_concurrent_jobs": 3,
        "max_cpu_percent": 80,
        "min_memory_gb": 6.0,
        "min_disk_gb": 5.0,
        "ocr_timeout_sec": 1800,
        "job_memory_estimate": {
            "ocr_pdfplumber": 1.0,
            "ocr_chandra": 3.0,
            "ocr_mineru": 5.0,
            "download": 1.0,
            "ingest": 0.5,
        }
    },
    HardwareProfile.APPLE_SILICON: {
        "max_concurrent_jobs": 2,
        "max_cpu_percent": 75,
        "min_memory_gb": 4.0,
        "min_disk_gb": 5.0,
        "ocr_timeout_sec": 1800,
        "job_memory_estimate": {
            "ocr_pdfplumber": 1.0,
            "ocr_chandra": 2.5,
            "ocr_mineru": 4.5,
            "download": 1.0,
            "ingest": 0.5,
        }
    },
}


@dataclass
class ResourceSnapshot:
    """Current system resource state."""
    timestamp: float
    cpu_percent: float
    memory_available_gb: float
    memory_total_gb: float
    memory_percent: float
    disk_free_gb: float
    disk_total_gb: float
    is_throttled: bool
    throttle_reason: Optional[str] = None
    processes_count: int = 0

    def to_dict(self) -> Dict:
        """Convert to dictionary for API response."""
        return {
            "timestamp": self.timestamp,
            "cpu_percent": round(self.cpu_percent, 1),
            "memory_available_gb": round(self.memory_available_gb, 2),
            "memory_total_gb": round(self.memory_total_gb, 2),
            "memory_percent": round(self.memory_percent, 1),
            "disk_free_gb": round(self.disk_free_gb, 2),
            "disk_total_gb": round(self.disk_total_gb, 2),
            "is_throttled": self.is_throttled,
            "throttle_reason": self.throttle_reason,
            "processes_count": self.processes_count,
        }


class ResourceMonitor:
    """Monitor system resources and enforce limits."""

    def __init__(self, profile: HardwareProfile = HardwareProfile.CPU_LAPTOP):
        self.profile = profile
        self.limits = RESOURCE_LIMITS[profile]
        self.process = psutil.Process()
        self._snapshot_cache: Optional[ResourceSnapshot] = None
        self._cache_time = 0
        self._cache_ttl = 1  # Cache for 1 second
        self.job_history = []  # Track job resource usage

        logger.info(f"ResourceMonitor initialized for profile: {profile}")

    def detect_profile(self) -> HardwareProfile:
        """Auto-detect hardware profile from system info."""
        try:
            import platform

            machine = platform.machine().lower()
            system = platform.system()

            # Apple Silicon detection
            if system == "Darwin" and machine in {"arm64", "aarch64"}:
                try:
                    result = subprocess.run(
                        ["sysctl", "-n", "hw.memsize"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        check=True,
                    )
                    total_memory_gb = int(result.stdout.strip()) / (1024**3)
                    if total_memory_gb >= 16:
                        return HardwareProfile.APPLE_SILICON
                except Exception:
                    pass
                return HardwareProfile.APPLE_SILICON

            # GPU detection
            try:
                import pynvml
                pynvml.nvmlInit()
                handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                vram_gb = mem.total / (1024**3)

                if vram_gb >= 16:
                    return HardwareProfile.GPU_PRO
                elif vram_gb >= 8:
                    return HardwareProfile.GPU_LITE
            except Exception:
                pass

            # Default to CPU laptop
            return HardwareProfile.CPU_LAPTOP

        except Exception as e:
            logger.error(f"Profile detection failed: {e}")
            return HardwareProfile.CPU_LAPTOP

    def get_snapshot(self, use_cache: bool = True) -> ResourceSnapshot:
        """Get current system resource state."""
        # Use cache to avoid excessive system calls
        now = time.time()
        if use_cache and self._snapshot_cache and (now - self._cache_time) < self._cache_ttl:
            return self._snapshot_cache

        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=0.1)

            # Memory usage
            mem = psutil.virtual_memory()
            memory_available_gb = mem.available / (1024**3)
            memory_total_gb = mem.total / (1024**3)

            # Disk usage (home directory or root)
            try:
                disk = psutil.disk_usage(str(Path.home()))
            except Exception:
                disk = psutil.disk_usage('/')

            disk_free_gb = disk.free / (1024**3)
            disk_total_gb = disk.total / (1024**3)

            # Determine if throttled
            is_throttled = False
            throttle_reason = None

            if cpu_percent > self.limits["max_cpu_percent"]:
                is_throttled = True
                throttle_reason = f"High CPU ({cpu_percent:.0f}% > {self.limits['max_cpu_percent']}%)"

            if memory_available_gb < self.limits["min_memory_gb"]:
                is_throttled = True
                throttle_reason = f"Low memory ({memory_available_gb:.1f}GB < {self.limits['min_memory_gb']:.1f}GB)"

            if disk_free_gb < self.limits["min_disk_gb"]:
                is_throttled = True
                throttle_reason = f"Low disk ({disk_free_gb:.1f}GB < {self.limits['min_disk_gb']:.1f}GB)"

            # Process count
            processes_count = len(psutil.pids())

            snapshot = ResourceSnapshot(
                timestamp=now,
                cpu_percent=cpu_percent,
                memory_available_gb=memory_available_gb,
                memory_total_gb=memory_total_gb,
                memory_percent=mem.percent,
                disk_free_gb=disk_free_gb,
                disk_total_gb=disk_total_gb,
                is_throttled=is_throttled,
                throttle_reason=throttle_reason,
                processes_count=processes_count,
            )

            self._snapshot_cache = snapshot
            self._cache_time = now

            return snapshot

        except Exception as e:
            logger.error(f"Resource snapshot failed: {e}")
            # Return safe defaults
            return ResourceSnapshot(
                timestamp=now,
                cpu_percent=50,
                memory_available_gb=8,
                memory_total_gb=16,
                memory_percent=50,
                disk_free_gb=100,
                disk_total_gb=500,
                is_throttled=False,
            )

    def can_start_job(self, job_type: str) -> Tuple[bool, Optional[str]]:
        """Check if system has resources to start a job."""
        snapshot = self.get_snapshot()

        # Hard throttle: don't start if system is throttled
        if snapshot.is_throttled:
            return False, f"System throttled: {snapshot.throttle_reason}"

        # Memory estimate
        memory_estimate = self.limits["job_memory_estimate"].get(job_type, 1.0)

        if snapshot.memory_available_gb < memory_estimate:
            return False, f"Insufficient memory. Need {memory_estimate}GB, have {snapshot.memory_available_gb:.1f}GB"

        # Disk space for downloads
        if "download" in job_type and snapshot.disk_free_gb < 5.0:
            return False, f"Insufficient disk space. Need 5GB, have {snapshot.disk_free_gb:.1f}GB"

        return True, None

    async def wait_for_resources(
        self,
        job_type: str,
        timeout_sec: int = 300,
        check_interval_sec: int = 5
    ) -> bool:
        """Wait for system to have resources (with timeout)."""
        start = time.time()

        while time.time() - start < timeout_sec:
            can_start, reason = self.can_start_job(job_type)

            if can_start:
                logger.info(f"Resources available for {job_type}")
                return True

            logger.warning(f"Waiting for resources ({job_type}): {reason}")
            await asyncio.sleep(check_interval_sec)

        logger.error(f"Timeout waiting for resources for {job_type}")
        return False

    def estimate_job_duration(self, job_type: str, file_size_mb: float) -> float:
        """Estimate job duration in seconds."""
        # Rough estimates based on file size and job type
        if job_type == "ocr_pdfplumber":
            return file_size_mb * 0.5  # ~0.5s per MB
        elif job_type == "ocr_chandra":
            return file_size_mb * 2.0  # ~2s per MB
        elif job_type == "ocr_mineru":
            return file_size_mb * 5.0  # ~5s per MB
        elif job_type == "download":
            return file_size_mb * 0.1  # ~100MB/s
        else:
            return 60  # Default 1 minute

    def record_job(self, job_id: str, job_type: str, file_size_mb: float,
                   duration_sec: float, success: bool, error: Optional[str] = None):
        """Record job execution for monitoring."""
        self.job_history.append({
            "job_id": job_id,
            "type": job_type,
            "file_size_mb": file_size_mb,
            "duration_sec": duration_sec,
            "success": success,
            "error": error,
            "timestamp": time.time(),
        })

        # Keep only last 100 jobs
        if len(self.job_history) > 100:
            self.job_history = self.job_history[-100:]

    def get_stats(self) -> Dict:
        """Get resource monitoring statistics."""
        snapshot = self.get_snapshot()

        if not self.job_history:
            return {
                "resources": snapshot.to_dict(),
                "jobs": {
                    "total": 0,
                    "successful": 0,
                    "failed": 0,
                    "avg_duration_sec": 0,
                }
            }

        successful = [j for j in self.job_history if j["success"]]
        failed = [j for j in self.job_history if not j["success"]]

        return {
            "resources": snapshot.to_dict(),
            "jobs": {
                "total": len(self.job_history),
                "successful": len(successful),
                "failed": len(failed),
                "avg_duration_sec": sum(j["duration_sec"] for j in successful) / len(successful) if successful else 0,
                "recent_errors": [j["error"] for j in failed[-5:]]  # Last 5 errors
            }
        }


# Global instance
from pathlib import Path
import subprocess

resource_monitor = ResourceMonitor(profile=HardwareProfile.CPU_LAPTOP)
