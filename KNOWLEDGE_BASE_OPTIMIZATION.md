# Knowledge Base & Indexing Optimizations

## Summary

Optimizations were applied to prevent UI freezes and out-of-memory crashes when using **Index Local Folder**, **Bridge PageIndex Folder**, and **Import CLI Output** with large datasets. The Python backend script was updated so large folders can be processed entirely on the server and then imported into the app.

---

## Root Causes Addressed

1. **Re-render bomb**  
   A single `setState` with hundreds of documents after bulk indexing caused one large re-render and blocked the main thread.

2. **Rendering the full document list**  
   Rendering hundreds of list items at once increased DOM size and memory use.

3. **Bridge PageIndex in one shot**  
   Building and adding all bridged documents in one batch could freeze the UI.

4. **No “backend-only” path**  
   There was no clear way to process large folders only on the backend and then import the result.

---

## Changes Made

### 1. React state updates (AppContext)

- **`startTransition` for bulk completion**  
  When bulk ingestion ends, `setBulkIngestionInProgress(false)` triggers a single `setKnowledgeBase(...)` inside `startTransition`, so the large update is non-blocking.

- **Bulk vs non-bulk in `addKnowledgeDocumentsBatch`**  
  - **During bulk** (Index Local Folder): batches are merged into a ref; no `setState` per batch.  
  - **On completion**: the ref is flushed to state once when the page calls `setBulkIngestionInProgress(false)`.

- **Non-bulk batches** (e.g. Import CLI Output, Bridge in chunks) still call `setKnowledgeBase` per batch, wrapped in `startTransition` so the UI stays responsive.

### 2. Paginated and virtualized document list (KnowledgeBase.tsx)

- **Under 50 docs:** First 50 shown with Load more for the next 50.
- **Over 50 docs:** Virtualized list (react-window) renders only visible rows so 500+ documents scroll without loading all into the DOM.

### 3. Bridge PageIndex in batches

- Documents are bridged in batches of **15**.
- Each batch is passed to `addKnowledgeDocumentsBatch` and followed by a short delay so the UI can update.
- Avoids building one huge array and a single blocking update.

### 4. Python script export for app import

- **`backend_offload_script.py`** can now export an app-compatible JSON file.
- Prompt: “Export JSON for app import? (path or Enter to skip)”.
- Output format matches what **Import CLI Output** expects: `{ "documents": [ { "title", "content", "source", "tags", "drivePath" }, ... ] }`.
- **Recommended flow for large folders:**  
  Run the script → enter folder path → enter export path (e.g. `knowledge_export.json`) → in the app, use **Import CLI Output** and select that file.

### 5. UI hint when backend is available

- If the backend is detected, a short note suggests using the Python script for large folders (e.g. 50+ files) and then **Import CLI Output**, to avoid browser memory limits.

---

## OCR and memory

- **Index Local Folder** and **Bridge PageIndex** do **not** use OCR. They use PDF text extraction only (`extractPdfText` → `getTextContent()`), which is lighter.
- OCR (Tesseract) is used only in the **OCR Tool** page. If that page is heavy, consider processing fewer or smaller images per run.

---

## What to test

1. **Index Local Folder** with 30–50+ files (with backend on): progress should update, UI should stay responsive, and completion should not hang.
2. **Bridge PageIndex Folder** with a catalog of 50+ entries: bridging should complete in batches without freezing.
3. **Import CLI Output** with a large JSON (e.g. from the Python script): import should complete and the list should be paginated with “Load more”.
4. **Python script**: run with a folder path, provide an export path, then import the generated JSON via **Import CLI Output**.

---

## Optional follow-ups

- **Virtualized list**: Implemented with `react-window` when doc count > 50; no further change needed for 500+ docs.
- **Web Worker for storage**: Moving IndexedDB writes to a worker could reduce main-thread blocking during import (more involved).
- **Backend health**: `useBackendStatus` already polls; no change required for these optimizations.
