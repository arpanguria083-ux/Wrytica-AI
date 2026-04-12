# PRD: MinerU Deep PDF Extraction Engine
## Wrytica AI — Feature Integration

**Document Type:** Product Requirements Document  
**Feature:** Structured PDF Extraction via MinerU  
**Status:** Draft  
**Date:** April 2026  
**Author:** Wrytica Engineering  

---

## 1. Executive Summary

Wrytica's current PDF pipeline uses `pdfplumber` (backend) and `pdf.js` (browser) for text extraction. Both tools treat a PDF as a stream of characters — they have no understanding of layout, tables, formulas, or multi-column structure. This causes garbled output for academic papers, financial reports, and scanned documents.

This PRD defines the integration of **MinerU** (the production-ready build of PDF-Extract-Kit by OpenDataLab) as a new "Deep Extract" processing tier in Wrytica's backend. MinerU converts PDFs to clean, structured Markdown using AI layout detection, PaddleOCR, and table/formula recognition — producing output that is dramatically better for the Knowledge Base and LLM queries.

**Key constraint:** Wrytica runs local LLMs via LM Studio. MinerU and LM Studio compete for GPU VRAM on laptops. The implementation must handle this gracefully with CPU-mode fallback, intelligent VRAM detection, and non-blocking background processing.

---

## 2. Problem Statement

### 2.1 Current State (What Breaks Today)

| Document Type | Current Result | Root Cause |
|---|---|---|
| Multi-column PDF (research paper) | Text in wrong order, columns merged | `pdfplumber` reads left-to-right character stream, ignores columns |
| Scanned PDF (contract, invoice) | Empty / no text extracted | No OCR — only digital text is read |
| PDF with tables | Table data merged into a single paragraph | No table structure detection |
| PDF with LaTeX formulas | Garbled unicode symbols | No formula recognition |
| Large PDF (>10MB) | Browser crash or OOM error | Browser memory limit hit |

### 2.2 User Impact

- Knowledge Base search returns irrelevant or garbled results for complex PDFs
- Users manually copy-paste from PDFs as a workaround
- Bulk folder ingestion fails silently on scanned document collections
- LLM answers are incorrect because source text is malformed

### 2.3 Why Now

The FastAPI backend infrastructure (`backend/main.py`) is already deployed. The `ocr: false` flag in the health check endpoint (line 109) explicitly marks this as a planned enhancement. The architecture is ready — only the MinerU integration layer is missing.

---

## 3. Goals and Non-Goals

### Goals
- Replace `pdfplumber` with MinerU for complex PDFs as the **primary** backend extraction path
- Preserve `pdfplumber` as an instant fallback if MinerU is not installed
- Preserve browser-side `pdf.js` as the fallback when the backend is offline
- Work on **Windows, macOS, and Linux** on consumer hardware (laptops)
- Detect and avoid VRAM conflicts with LM Studio
- Expose extraction quality via the existing health check endpoint
- Add a user-configurable toggle in Settings ("Standard" vs "Deep Extract")

### Non-Goals
- Replacing LM Studio or changing the LLM inference pipeline
- Cloud-based PDF processing (all processing remains local)
- Real-time collaborative editing of extracted documents
- OCR for video or audio files

---

## 4. System Architecture

### 4.1 Current Architecture

```
User uploads PDF
       │
       ▼
[Browser: pdf.js]──────────────────────────────────────────►[KB IndexedDB]
       │ (fallback if backend offline)
       ▼
[Backend Health Check (:8000/health)]
       │ (if available)
       ▼
[FastAPI: /api/documents/process]
       │
       ▼
[pdfplumber → raw text chunks]──────────────────────────────►[KB IndexedDB]
```

### 4.2 Target Architecture (After This Feature)

```
User uploads PDF
       │
       ▼
[Browser: pdf.js]──────────────────────────────────────────►[KB IndexedDB]
       │ (fallback: backend offline OR user chose Standard mode)
       ▼
[Backend Health Check (:8000/health)]
  ├── features.ocr = true   (MinerU installed)
  └── features.ocr = false  (MinerU not installed)
       │
       ▼
[FastAPI: /api/documents/process]
       │
       ├──[Standard mode]──►[pdfplumber]──────────────────►[KB IndexedDB]
       │
       └──[Deep Extract mode]
              │
              ▼
       [VRAM Check]
         ├── GPU free (LM Studio idle)  ──►[MinerU GPU mode]
         └── GPU occupied (LM Studio running)──►[MinerU CPU mode]
              │
              ▼
       [MinerU → Markdown]
              │
              ▼
       [Markdown chunker]──────────────────────────────────►[KB IndexedDB]
```

### 4.3 Fallback Chain (Priority Order)

```
1. MinerU Deep Extract (GPU)     — Best quality, requires VRAM available
2. MinerU Deep Extract (CPU)     — Best quality, slower (~2–5 min/doc on laptop)
3. pdfplumber                    — Fast, no layout awareness
4. pdf.js (browser)              — Always available, no backend required
```

---

## 5. Functional Requirements

### 5.1 Backend — New MinerU Endpoint

**Endpoint:** `POST /api/v1/ocr/deep-extract`  
**Input:** Multipart file upload (PDF)  
**Output:** `DeepExtractResult` JSON (see schema below)

```
DeepExtractResult {
  document_id:     string
  filename:        string
  markdown:        string       ← structured Markdown output from MinerU
  total_pages:     int
  processing_mode: "gpu" | "cpu" | "fallback_pdfplumber"
  processing_time_ms: float
  file_size_bytes: int
  layout_elements: {
    text_blocks:   int
    tables:        int
    formulas:      int
    images:        int
    figures:       int
  }
}
```

**Behavior:**
- Detect if MinerU (`magic-pdf`) is importable; if not, return `processing_mode: "fallback_pdfplumber"`
- Detect GPU availability and free VRAM; if LM Studio occupies >50% VRAM, use CPU mode
- Process with `method="auto"` (MinerU selects optimal sub-method per page)
- Return structured Markdown with table syntax, formula LaTeX, and heading hierarchy preserved
- Clean up temp files after every request

### 5.2 Backend — Updated Health Check

Extend `GET /health` response to include MinerU status:

```json
{
  "status": "healthy",
  "version": "1.1.0",
  "features": {
    "pdf_processing": true,
    "office_processing": true,
    "embeddings": true,
    "ocr": true,
    "deep_extract": true,
    "deep_extract_gpu": false,
    "deep_extract_cpu": true,
    "mineru_version": "1.3.x"
  }
}
```

### 5.3 Backend — Modified `process_pdf` Function

The existing `/api/documents/process` endpoint must check a query parameter:

```
POST /api/documents/process?include_embeddings=false&extraction_mode=deep
```

- `extraction_mode=standard` (default) → uses `pdfplumber` (current behavior, zero regression)
- `extraction_mode=deep` → routes through MinerU pipeline

### 5.4 Frontend — Settings Page New Section

Add a new **"Document Processing"** section in `pages/Settings.tsx`:

```
┌─────────────────────────────────────────────────┐
│  PDF Extraction Mode                            │
│  ○ Standard  — Fast, digital text only          │
│  ● Deep Extract — AI layout + OCR + tables      │
│  (requires backend + MinerU to be installed)    │
│                                                 │
│  Backend Status: ✓ Connected                    │
│  MinerU Status:  ✓ Installed (CPU mode)         │
│  GPU Mode:       ✗ LM Studio is using GPU       │
└─────────────────────────────────────────────────┘
```

- Save selection to `localStorage` key `wrytica_pdf_extraction_mode`
- Show real-time MinerU status from health check response
- Show warning if Deep Extract selected but backend offline

### 5.5 Frontend — Knowledge Base Integration

In `pages/KnowledgeBase.tsx`, pass `extraction_mode` to the `processDocument` call:

- Read `wrytica_pdf_extraction_mode` from localStorage
- If `deep`, call `/api/documents/process?extraction_mode=deep` for PDFs
- If `standard` or backend unavailable, use existing flow unchanged

### 5.6 Frontend — OCR Tool Page

In `pages/OCRTool.tsx`, add a "Deep Extract" button for PDFs that calls the new `/api/v1/ocr/deep-extract` endpoint and renders the Markdown result in a preview panel.

---

## 6. Cross-Platform Implementation Details

### 6.1 Windows (Primary Target — LM Studio users)

**Setup approach:** Use `pip install mineru` inside the existing `backend/venv`.

| Scenario | Handling |
|---|---|
| LM Studio loaded a model | GPU VRAM detection shows <2GB free → auto CPU mode |
| LM Studio idle | GPU VRAM ≥4GB free → GPU mode |
| No NVIDIA GPU (integrated only) | CPU mode only |
| Windows Defender slowing pip | Document in setup guide; add `--no-cache-dir` flag |
| Path spaces (e.g. `C:\Users\My Name\`) | Use `pathlib.Path` throughout; never string concatenation for paths |

**VRAM Detection (Windows — `pynvml`):**
```python
import pynvml
pynvml.nvmlInit()
handle = pynvml.nvmlDeviceGetHandleByIndex(0)
info = pynvml.nvmlDeviceGetMemoryInfo(handle)
free_vram_gb = info.free / (1024**3)
use_gpu = free_vram_gb >= 4.0  # Safe threshold for MinerU
```

### 6.2 macOS (Apple Silicon — M1/M2/M3/M4)

**Key difference:** Apple Silicon uses unified memory (RAM = VRAM). LM Studio and MinerU share the same memory pool.

| Scenario | Handling |
|---|---|
| M1/M2/M3 Mac (8GB unified) | Force CPU mode; MinerU + LM Studio = OOM on 8GB |
| M1/M2/M3 Mac (16GB+ unified) | Allow MPS (Metal Performance Shaders) mode |
| Intel Mac | Standard CPU-only mode |
| MinerU install | Use `pip install mineru[cpu]` for Intel; `pip install mineru` for Apple Silicon (uses MPS) |

**Memory Detection (macOS):**
```python
import platform, subprocess
if platform.system() == 'Darwin' and platform.processor() == 'arm':
    # Apple Silicon — check available RAM
    result = subprocess.run(['sysctl', 'hw.memsize'], capture_output=True, text=True)
    total_gb = int(result.stdout.split(':')[1].strip()) / (1024**3)
    use_gpu = total_gb >= 16  # Only use MPS on 16GB+ unified memory
```

### 6.3 Linux (Servers and Desktops)

Linux is the best-supported platform for MinerU. No special handling needed beyond the standard VRAM check with `pynvml`. Works with NVIDIA CUDA and AMD ROCm.

| GPU | Install |
|---|---|
| NVIDIA CUDA | `pip install mineru[full]` (default) |
| AMD ROCm | `pip install mineru[rocm]` |
| CPU only | `pip install mineru[cpu]` |

### 6.4 Cross-Platform Installer Script

Provide a single `backend/install_mineru.py` setup script that auto-detects platform and installs the correct variant:

```python
# backend/install_mineru.py
# Cross-platform MinerU installer — run with: python install_mineru.py
import platform, subprocess, sys

system = platform.system()
machine = platform.machine()

if system == 'Darwin' and machine == 'arm64':
    pkg = 'mineru'          # Apple Silicon MPS
elif system == 'Windows':
    pkg = 'mineru[full]'    # Windows CUDA (falls back to CPU automatically)
elif system == 'Linux':
    pkg = 'mineru[full]'    # Linux CUDA
else:
    pkg = 'mineru[cpu]'     # Safe fallback

subprocess.run([sys.executable, '-m', 'pip', 'install', pkg, '--upgrade'], check=True)
print(f"[OK] MinerU installed for {system} ({machine})")
```

---

## 7. Implementation Plan

### Phase 1 — Backend Core (Week 1)

**Files to modify:** `backend/main.py`  
**Files to create:** `backend/install_mineru.py`, `backend/requirements_mineru.txt`

#### Step 1.1 — Platform detection utility (backend/main.py)

Add at top of `backend/main.py` after imports:

```python
def detect_compute_mode() -> dict:
    """
    Detect available compute resources.
    Returns dict with mode, free_vram_gb, platform info.
    """
    import platform
    info = {
        "platform": platform.system(),
        "machine": platform.machine(),
        "use_gpu": False,
        "free_vram_gb": 0.0,
        "reason": "cpu_default"
    }

    # Apple Silicon — check unified memory
    if info["platform"] == "Darwin" and info["machine"] == "arm64":
        try:
            import subprocess
            result = subprocess.run(
                ['sysctl', 'hw.memsize'], capture_output=True, text=True
            )
            total_gb = int(result.stdout.split(':')[1].strip()) / (1024**3)
            info["use_gpu"] = total_gb >= 16
            info["reason"] = "mps_unified_memory" if info["use_gpu"] else "mps_insufficient_memory"
        except Exception:
            pass
        return info

    # NVIDIA GPU check (Windows/Linux)
    try:
        import pynvml
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
        info["free_vram_gb"] = mem.free / (1024**3)
        info["use_gpu"] = info["free_vram_gb"] >= 4.0
        info["reason"] = "gpu_available" if info["use_gpu"] else "gpu_busy_lmstudio"
    except Exception:
        info["reason"] = "no_gpu_detected"

    return info
```

#### Step 1.2 — MinerU check utility

```python
def is_mineru_available() -> tuple[bool, str]:
    """Returns (available: bool, version: str)"""
    try:
        import mineru
        version = getattr(mineru, '__version__', 'unknown')
        return True, version
    except ImportError:
        return False, ""
```

#### Step 1.3 — New deep extract endpoint

```python
class DeepExtractResult(BaseModel):
    document_id: str
    filename: str
    markdown: str
    total_pages: Optional[int] = None
    processing_mode: str  # "gpu" | "cpu" | "mps" | "fallback_pdfplumber"
    processing_time_ms: float
    file_size_bytes: int
    layout_elements: Dict[str, int]

@app.post("/api/v1/ocr/deep-extract", response_model=DeepExtractResult)
async def deep_extract_pdf(file: UploadFile = File(...)):
    """
    Deep structured extraction using MinerU.
    Falls back to pdfplumber if MinerU is not installed.
    """
    import time
    start_time = time.time()

    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files supported")

    content = await file.read()
    temp_file = TEMP_DIR / f"{uuid.uuid4()}_{file.filename}"

    try:
        with open(temp_file, "wb") as f:
            f.write(content)

        mineru_ok, _ = is_mineru_available()
        compute = detect_compute_mode()

        if mineru_ok:
            markdown, layout, mode = await _extract_with_mineru(
                temp_file, compute
            )
        else:
            # Graceful fallback
            logger.warning("MinerU not installed — falling back to pdfplumber")
            markdown, layout, mode = await _extract_with_pdfplumber(temp_file)

        processing_time = (time.time() - start_time) * 1000

        return DeepExtractResult(
            document_id=str(uuid.uuid4()),
            filename=file.filename,
            markdown=markdown,
            total_pages=layout.get("total_pages"),
            processing_mode=mode,
            processing_time_ms=processing_time,
            file_size_bytes=len(content),
            layout_elements=layout
        )
    finally:
        try:
            os.remove(temp_file)
        except Exception:
            pass


async def _extract_with_mineru(
    file_path: Path, compute: dict
) -> tuple[str, dict, str]:
    """Run MinerU extraction in a thread pool to avoid blocking the event loop."""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    def _run():
        from mineru.api import pdf_extract
        method = "auto"
        backend = "gpu" if compute["use_gpu"] else "cpu"
        result = pdf_extract(
            str(file_path),
            method=method,
            backend=backend
        )
        # result is a dict with 'markdown', 'layout', etc.
        markdown = result.get("markdown", "")
        layout = {
            "total_pages": result.get("total_pages", 0),
            "text_blocks": result.get("text_blocks", 0),
            "tables": result.get("tables", 0),
            "formulas": result.get("formulas", 0),
            "images": result.get("images", 0),
            "figures": result.get("figures", 0),
        }
        mode = "gpu" if compute["use_gpu"] else "cpu"
        if compute["machine"] == "arm64":
            mode = "mps"
        return markdown, layout, mode

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as pool:
        return await loop.run_in_executor(pool, _run)


async def _extract_with_pdfplumber(
    file_path: Path
) -> tuple[str, dict, str]:
    """Pdfplumber fallback — returns plain text as Markdown."""
    import pdfplumber
    parts = []
    total_pages = 0
    with pdfplumber.open(file_path) as pdf:
        total_pages = len(pdf.pages)
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text()
            if text and text.strip():
                parts.append(f"## Page {i}\n\n{text.strip()}")
    markdown = "\n\n---\n\n".join(parts)
    layout = {
        "total_pages": total_pages,
        "text_blocks": len(parts),
        "tables": 0,
        "formulas": 0,
        "images": 0,
        "figures": 0,
    }
    return markdown, layout, "fallback_pdfplumber"
```

#### Step 1.4 — Update health check

```python
@app.get("/health", response_model=HealthStatus)
async def health_check():
    global embedding_model
    mineru_ok, mineru_version = is_mineru_available()
    compute = detect_compute_mode() if mineru_ok else {}

    return HealthStatus(
        status="healthy",
        version="1.1.0",
        features={
            "pdf_processing": True,
            "office_processing": True,
            "embeddings": embedding_model is not None,
            "ocr": mineru_ok,
            "deep_extract": mineru_ok,
            "deep_extract_gpu": mineru_ok and compute.get("use_gpu", False),
            "deep_extract_cpu": mineru_ok,
            "mineru_version": mineru_version if mineru_ok else None,
        }
    )
```

> **Note:** `HealthStatus` Pydantic model must be updated to include the new fields.

---

### Phase 2 — Frontend Settings UI (Week 2)

**Files to modify:** `pages/Settings.tsx`, `services/backendApi.ts`

#### Step 2.1 — Extend HealthStatus interface in backendApi.ts

```typescript
export interface HealthStatus {
  status: string;
  version: string;
  features: {
    pdf_processing: boolean;
    office_processing: boolean;
    embeddings: boolean;
    ocr: boolean;
    deep_extract?: boolean;
    deep_extract_gpu?: boolean;
    deep_extract_cpu?: boolean;
    mineru_version?: string | null;
  };
}
```

#### Step 2.2 — Add deep extract API call in backendApi.ts

```typescript
export interface DeepExtractResult {
  document_id: string;
  filename: string;
  markdown: string;
  total_pages?: number;
  processing_mode: 'gpu' | 'cpu' | 'mps' | 'fallback_pdfplumber';
  processing_time_ms: number;
  file_size_bytes: number;
  layout_elements: {
    text_blocks: number;
    tables: number;
    formulas: number;
    images: number;
    figures: number;
  };
}

async deepExtractPdf(file: File): Promise<DeepExtractResult> {
  if (!this._isAvailable) {
    throw new Error('Backend not available');
  }
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${this.baseUrl}/api/v1/ocr/deep-extract`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deep extract failed: ${response.status} - ${errorText}`);
  }
  return await response.json();
}
```

#### Step 2.3 — Settings.tsx new section

Add after the existing ingestion config section in `pages/Settings.tsx`:

```tsx
{/* PDF Extraction Mode */}
<div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
    <FileText size={16} />
    PDF Extraction Mode
  </h3>

  <div className="space-y-3">
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="radio"
        name="pdfMode"
        value="standard"
        checked={ingestionConfig.pdfExtractionMode !== 'deep'}
        onChange={() => updateIngestionConfig({ pdfExtractionMode: 'standard' })}
        className="mt-1"
      />
      <div>
        <div className="text-white text-sm font-medium">Standard</div>
        <div className="text-gray-400 text-xs">Fast text extraction. Best for digital PDFs with selectable text.</div>
      </div>
    </label>

    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="radio"
        name="pdfMode"
        value="deep"
        checked={ingestionConfig.pdfExtractionMode === 'deep'}
        onChange={() => updateIngestionConfig({ pdfExtractionMode: 'deep' })}
        className="mt-1"
      />
      <div>
        <div className="text-white text-sm font-medium">Deep Extract</div>
        <div className="text-gray-400 text-xs">
          AI layout detection, table recognition, formula OCR. Best for scanned PDFs, research papers, and financial documents.
          Requires backend + MinerU installed.
        </div>
      </div>
    </label>
  </div>

  {/* Live status indicators */}
  <div className="mt-4 pt-3 border-t border-gray-700 space-y-1.5">
    <MineruStatusRow label="Backend" available={backendStatus.available} />
    <MineruStatusRow label="MinerU" available={backendStatus.health?.features.deep_extract} />
    <MineruStatusRow
      label="GPU Mode"
      available={backendStatus.health?.features.deep_extract_gpu}
      unavailableText="CPU mode (LM Studio may be using GPU)"
    />
    {backendStatus.health?.features.mineru_version && (
      <div className="text-gray-500 text-xs pl-1">
        MinerU v{backendStatus.health.features.mineru_version}
      </div>
    )}
  </div>
</div>
```

Small helper component (same file):
```tsx
const MineruStatusRow: React.FC<{
  label: string;
  available?: boolean;
  unavailableText?: string;
}> = ({ label, available, unavailableText }) => (
  <div className="flex items-center gap-2 text-xs">
    {available
      ? <CheckCircle size={12} className="text-green-400" />
      : <AlertCircle size={12} className="text-yellow-400" />
    }
    <span className="text-gray-400">{label}:</span>
    <span className={available ? 'text-green-400' : 'text-yellow-400'}>
      {available ? 'Ready' : (unavailableText ?? 'Not available')}
    </span>
  </div>
);
```

---

### Phase 3 — Knowledge Base & OCR Integration (Week 2–3)

**Files to modify:** `pages/KnowledgeBase.tsx`, `pages/OCRTool.tsx`, `services/ocrService.ts`

#### Step 3.1 — Knowledge Base passes extraction mode

In `KnowledgeBase.tsx`, when processing PDFs via backend, check localStorage for mode and call the appropriate endpoint:

```typescript
const pdfExtractionMode = ingestionConfig.pdfExtractionMode ?? 'standard';

if (pdfExtractionMode === 'deep' && backendAvailable) {
  // Use new deep extract endpoint
  const result = await documentProcessorAPI.deepExtractPdf(file);
  return {
    title: file.name,
    content: result.markdown,  // Structured Markdown — much better for KB search
    source: 'Deep Extract',
    tags: ['deep-extract', `mode-${result.processing_mode}`],
  };
} else {
  // Existing path (pdfplumber via /api/documents/process)
  return await readPdfTextViaBackend(file, onProgress);
}
```

#### Step 3.2 — Extend IngestionConfig type

In `utils.ts`, add `pdfExtractionMode` to the `IngestionConfig` interface:

```typescript
export interface IngestionConfig {
  // ... existing fields ...
  pdfExtractionMode: 'standard' | 'deep';
}

export const DEFAULT_INGESTION_CONFIG: IngestionConfig = {
  // ... existing defaults ...
  pdfExtractionMode: 'standard',  // Safe default — no regression
};
```

#### Step 3.3 — OCR Tool page enhancement

In `pages/OCRTool.tsx`, for PDF files, add a "Deep Extract" button alongside the existing OCR button. On click, call `documentProcessorAPI.deepExtractPdf()` and render the Markdown in a preview pane using the existing `react-markdown` dependency.

---

### Phase 4 — Testing and Documentation (Week 3)

#### Step 4.1 — Backend test script

Create `scripts/test-mineru.py`:
```python
"""
Test MinerU integration across all modes.
Run: python scripts/test-mineru.py <path-to-test.pdf>
"""
import sys, requests, json

if len(sys.argv) < 2:
    print("Usage: python test-mineru.py <pdf_path>")
    sys.exit(1)

pdf_path = sys.argv[1]

# Health check
health = requests.get("http://localhost:8000/health").json()
print(f"\n[Health] MinerU: {health['features'].get('deep_extract')}")
print(f"[Health] GPU mode: {health['features'].get('deep_extract_gpu')}")
print(f"[Health] Version: {health['features'].get('mineru_version')}\n")

# Deep extract
with open(pdf_path, 'rb') as f:
    response = requests.post(
        "http://localhost:8000/api/v1/ocr/deep-extract",
        files={"file": (pdf_path, f, "application/pdf")}
    )

result = response.json()
print(f"[Result] Mode: {result['processing_mode']}")
print(f"[Result] Pages: {result['total_pages']}")
print(f"[Result] Tables: {result['layout_elements']['tables']}")
print(f"[Result] Time: {result['processing_time_ms']:.0f}ms")
print(f"\n--- First 500 chars of Markdown ---")
print(result['markdown'][:500])
```

#### Step 4.2 — Setup documentation

Create `backend/MINERU_SETUP.md` with:
- Platform-specific install instructions (Windows/macOS/Linux)
- VRAM sizing guide for LM Studio coexistence
- Model download steps (MinerU downloads models on first run — document the expected download size ~2–4GB)
- Troubleshooting (common errors per platform)

---

## 8. Performance Expectations

| Hardware | Mode | Time per PDF page | Notes |
|---|---|---|---|
| RTX 3060 12GB (LM Studio idle) | GPU | ~0.5–1s/page | Best case |
| RTX 3060 12GB (LM Studio loaded 7B) | CPU | ~5–10s/page | VRAM split, auto-CPU |
| M2 Mac 16GB | MPS | ~2–4s/page | Unified memory |
| M1 Mac 8GB | CPU | ~8–15s/page | Insufficient unified memory |
| Intel i7 laptop (no GPU) | CPU | ~10–20s/page | CPU-only |
| Ryzen 9 desktop (no GPU) | CPU | ~5–10s/page | Fast CPU |

**For bulk ingestion (50+ PDFs):** Run backend in background mode. Processing is async (FastAPI background tasks), so the UI remains responsive.

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MinerU API changes between versions | Medium | Medium | Pin `mineru>=1.3,<2.0` in requirements; test on upgrade |
| OOM on 8GB laptop with LM Studio loaded | High | High | Enforce CPU mode when free_vram_gb < 4.0; document swap space setup |
| MinerU first-run downloads models (~3GB) | High | Medium | Add progress indicator; document in setup guide |
| Long processing time frustrates users | Medium | Medium | Show real-time status in UI; queue extraction as background task |
| pdfplumber fallback silently used | Low | Low | Log warning in backend; show `processing_mode` in UI |
| Windows antivirus blocks MinerU models | Low | High | Document Windows Defender exclusion for backend venv path |

---

## 10. Definition of Done

- [ ] `POST /api/v1/ocr/deep-extract` endpoint returns structured Markdown for a test PDF
- [ ] Health check shows `deep_extract: true` when MinerU is installed
- [ ] Health check shows `deep_extract: false` without regression when MinerU is NOT installed
- [ ] `pdfplumber` fallback works when `import mineru` fails
- [ ] Settings page shows real-time MinerU status with correct GPU/CPU indicator
- [ ] Knowledge Base ingests a 50-page academic PDF in Deep Extract mode without crash
- [ ] Knowledge Base ingests the same PDF in Standard mode (zero regression)
- [ ] Test passes on Windows 11 with LM Studio running (CPU fallback verified)
- [ ] Test passes on macOS (Apple Silicon, 16GB)
- [ ] `install_mineru.py` successfully runs on all three platforms
- [ ] Processing time for a 10-page PDF is displayed in the UI

---

## 11. Dependency Summary

### New Backend Dependencies

```
# backend/requirements_mineru.txt
mineru>=1.3.0         # Core extraction engine
pynvml>=11.0.0        # NVIDIA VRAM detection (Windows/Linux)
```

### Frontend — No new npm packages required

All frontend changes use existing dependencies:
- `react-markdown` (already in `package.json`) for Markdown rendering
- `lucide-react` (already present) for status icons
- Existing `fetch` API for new endpoint calls

---

*PRD authored for Wrytica AI — MinerU Deep PDF Extraction — April 2026*
