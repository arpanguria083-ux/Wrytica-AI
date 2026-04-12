# Wrytica Stability Testing Guide

## Quick Start

The application now has comprehensive stability enhancements to prevent browser crashes during OCR operations.

---

## What Changed

### Before
- Large PDFs loaded entirely into browser memory
- No progress feedback
- Browser could freeze or crash
- No resource awareness

### After ✅
- All OCR processing happens in Python backend
- Real-time progress with ETA
- Browser stays responsive always
- Resource-aware job queueing
- Safe cancellation anytime

---

## Testing the Stable OCR

### 1. Start the Application

```bash
# Terminal 1 - Start backend
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000

# Terminal 2 - Start frontend
npm run dev
```

### 2. Navigate to OCR Tool

- Open http://localhost:5173 in browser
- Click **OCR & Document Extraction** tab

### 3. Test Basic Flow

**Upload a PDF:**
1. Click file upload
2. Select a PDF (any size, 5-50 pages is ideal for testing)
3. Choose engine:
   - **Fast** (pdfplumber) - instant
   - **Balanced** (Chandra) - few seconds
   - **Advanced** (MinerU) - if available

**Watch Progress:**
- Progress bar shows % complete
- ETA shows remaining time
- Status updates in real-time
- Browser stays fully responsive

**Cancel a Job:**
1. Start an OCR job
2. While processing, click the X button
3. Job cancels immediately
4. Results are discarded

---

## Stability Tests

### Test 1: Multiple Files
**Objective**: Verify system handles multiple jobs safely

1. Upload 5 PDF files
2. Click "Start OCR"
3. All 5 jobs queue and process
4. Monitor `/api/system/metrics` (open in another tab)
5. Expected: `is_throttled` stays `false`

**Pass Criteria**:
- ✅ Browser never lags
- ✅ All jobs complete (1 at a time on CPU laptop)
- ✅ No memory spikes

### Test 2: Large File
**Objective**: Verify large files don't crash browser

1. Find or create a 50+ page PDF
2. Start OCR with Fast mode
3. Let it run to completion
4. Browser should remain responsive
5. Progress updates should flow continuously

**Pass Criteria**:
- ✅ No browser freeze
- ✅ Progress updates every 500ms–2s
- ✅ Can open Settings tab while processing

### Test 3: Cancellation
**Objective**: Verify jobs can be cancelled safely

1. Start an OCR job
2. Wait 3–5 seconds
3. Click Cancel button
4. Job should stop immediately
5. No temp files left behind

**Pass Criteria**:
- ✅ Cancellation instant (no hanging)
- ✅ Temp files cleaned up
- ✅ Can immediately start new job

### Test 4: Browser Health Warning
**Objective**: Verify browser detects slowness and warns user

1. Start 3 OCR jobs
2. Open Settings → inspect element console
3. Look for "Browser responsiveness degraded" warning
4. Warning should appear if main thread slows
5. Jobs should auto-pause

**Pass Criteria**:
- ✅ Warning appears on slow systems
- ✅ Jobs pause gracefully
- ✅ User can resume

### Test 5: System Metrics Endpoint
**Objective**: Verify backend correctly reports resource state

```bash
# While OCR is processing, in another terminal:
curl http://127.0.0.1:8000/api/system/metrics | jq

# Expected output:
{
  "resources": {
    "cpu_percent": 45.2,
    "memory_available_gb": 8.3,
    "memory_percent": 48.1,
    "disk_free_gb": 45.2,
    "is_throttled": false
  },
  "queue": {
    "total_jobs": 3,
    "current_processing": 1,
    "max_concurrent": 1,
    "statuses": {
      "processing": 1,
      "queued": 2
    }
  }
}
```

**Pass Criteria**:
- ✅ Metrics update in real-time
- ✅ Queue size reflects jobs
- ✅ CPU < max limit

### Test 6: Polling Throttler
**Objective**: Verify frontend doesn't spam backend with requests

1. Start an OCR job
2. Open browser DevTools → Network tab
3. Filter for `jobs/` requests
4. Expected: Request every 500ms–5s (adaptive)

**Pass Criteria**:
- ✅ No requests faster than 500ms
- ✅ Requests back off when stuck
- ✅ Resume fast polling when progress resumes

---

## Performance Benchmarks

Run on your system and compare:

### Benchmark 1: Simple 5-Page PDF
```
Engine        | Expected Time | Acceptable Range
pdfplumber    | 1–2s          | <5s
Chandra       | 3–5s          | <10s
MinerU        | 30–60s        | <120s
```

### Benchmark 2: Complex 10-Page PDF (tables/formulas)
```
Engine        | Expected Time | Acceptable Range
pdfplumber    | 5–10s         | <20s
Chandra       | 10–20s        | <40s
MinerU        | 1–3 min       | <5 min
```

### Benchmark 3: Memory Usage
On 16GB system:
```
Idle          | <200 MB
Fast mode     | <500 MB
Balanced mode | <2.5 GB
Advanced mode | <4 GB
```

---

## Debugging Tips

### Check Job Status
```bash
# Get specific job
curl http://127.0.0.1:8000/api/jobs/{job_id} | jq

# List all jobs
curl http://127.0.0.1:8000/api/jobs | jq '.jobs[] | {id: .job_id, status, progress}'
```

### Monitor Backend Logs
```bash
# Watch backend logs while processing
tail -f backend_logs.txt | grep -i "job\|progress\|error"
```

### Check System Resources
```bash
# On Windows (PowerShell)
Get-Process python | Select-Object -Property Name, WorkingSet

# On macOS/Linux
ps aux | grep uvicorn
```

### Browser Console
Enable debug logging:
```javascript
// In browser console
localStorage.setItem('debug_stability', 'true');
```

---

## Common Issues & Fixes

### Issue: "Browser performance degraded" appears
**Cause**: Main thread slow (reflow time >50ms)  
**Fix**:
1. Close other browser tabs
2. Close other applications
3. Reduce file size
4. Use Fast mode instead of Advanced

### Issue: Job stays in "queued" forever
**Cause**: System under load (CPU >60%, RAM <2GB)  
**Fix**:
1. Close applications to free memory
2. Check `is_throttled` in `/api/system/metrics`
3. Wait for other jobs to complete
4. Check disk space (need >5GB)

### Issue: Jobs slow down over time
**Cause**: Accumulated temp files or memory fragmentation  
**Fix**:
1. Restart backend: `Ctrl+C` and restart
2. Clear temp directory: `rm -rf /tmp/wrytica_backend`
3. Reduce number of concurrent jobs

### Issue: Cancellation button doesn't work
**Cause**: Backend queue processing job already  
**Fix**:
1. Wait 1–2 seconds, try again
2. If stuck, restart backend
3. Check backend logs for errors

---

## Load Test Script

Use this to stress-test the system:

```javascript
// In OCRTool component or browser console
async function stressTest() {
  console.log('Starting stress test...');
  
  // Create 5 dummy files
  const files = [];
  for (let i = 0; i < 5; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = 612; canvas.height = 792;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 612, 792);
    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    ctx.fillText(`Test Page ${i + 1}`, 50, 50);
    
    canvas.toBlob(blob => {
      files.push(new File([blob], `test-${i}.png`, { type: 'image/png' }));
    });
  }
  
  await new Promise(r => setTimeout(r, 500));
  
  // Start all jobs
  for (const file of files) {
    console.log(`Starting job for ${file.name}`);
    // Call your OCR start function here
  }
  
  console.log('5 jobs queued, monitoring...');
  
  // Monitor for 5 minutes
  for (let i = 0; i < 60; i++) {
    const metrics = await fetch('/api/system/metrics').then(r => r.json());
    console.log(`[${i}s]`, {
      jobs: metrics.queue.current_processing,
      cpu: metrics.resources.cpu_percent + '%',
      mem: (metrics.resources.memory_total_gb - metrics.resources.memory_available_gb).toFixed(1) + 'GB',
      throttled: metrics.resources.is_throttled
    });
    
    if (metrics.queue.current_processing === 0 && i > 10) {
      console.log('All jobs done!');
      break;
    }
    
    await new Promise(r => setTimeout(r, 5000));
  }
}

// Run: stressTest()
```

---

## Success Checklist

After running all tests, check:

- [ ] Test 1 passed (multiple files)
- [ ] Test 2 passed (large file)
- [ ] Test 3 passed (cancellation)
- [ ] Test 4 passed (health warning)
- [ ] Test 5 passed (metrics endpoint)
- [ ] Test 6 passed (polling throttle)
- [ ] Performance within benchmarks
- [ ] No memory spikes observed
- [ ] No browser freezes
- [ ] All temp files cleaned up

---

## Reporting Issues

If you find a stability issue:

1. **Reproduce steps**: What did you do?
2. **System info**: OS, RAM, GPU (if any)
3. **Files tested**: PDF size/type
4. **Metrics snapshot**: `/api/system/metrics` at time of issue
5. **Backend logs**: Any errors in console output
6. **Browser console**: Any JavaScript errors

---

## Next Steps

Once stability is verified:
- [ ] Run full end-to-end test with real workflow
- [ ] Performance profile on target hardware
- [ ] Load test with multiple concurrent users
- [ ] Monitor memory over extended sessions
