# Wrytica AI — Feature Reference

> Complete technical reference for every feature, function, and service in the application.
> Version 1.2.2 · © 2024–2025 Arpan Guria

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Paraphraser](#2-paraphraser)
3. [Grammar Checker](#3-grammar-checker)
4. [Summarizer](#4-summarizer)
5. [Citation Generator](#5-citation-generator)
6. [Chat Assistant](#6-chat-assistant)
7. [OCR & Document Extraction](#7-ocr--document-extraction)
8. [Knowledge Base](#8-knowledge-base)
9. [Agent Planner](#9-agent-planner)
10. [History Dashboard](#10-history-dashboard)
11. [Document Viewer](#11-document-viewer)
12. [Settings](#12-settings)
13. [Developer Page](#13-developer-page)
14. [AI Service Layer](#14-ai-service-layer)
15. [Gemini Service](#15-gemini-service)
16. [Local LLM Service](#16-local-llm-service)
17. [Knowledge Base Service](#17-knowledge-base-service)
18. [Storage Service](#18-storage-service)
19. [OCR Service](#19-ocr-service)
20. [Citation Service](#20-citation-service)
21. [Agent Planner Service](#21-agent-planner-service)
22. [Vision Service](#22-vision-service)
23. [Stability Manager](#23-stability-manager)
24. [Workspace Service](#24-workspace-service)
25. [Backend API Service](#25-backend-api-service)
26. [Vector Store Service](#26-vector-store-service)
27. [App Context (Global State)](#27-app-context-global-state)
28. [Utility Functions (utils.ts)](#28-utility-functions-utilsts)
29. [Type Definitions](#29-type-definitions)
30. [Backend (Python FastAPI)](#30-backend-python-fastapi)

---

## 1. Architecture Overview

Wrytica AI is a **privacy-first, local-first** AI writing application. The entire application can run without any external server — all processing happens in the browser or on the user's local machine.

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                     │
│  Pages ──► AI Service ──► Gemini API  (online, optional)   │
│         └──────────────► Local LLM  (Ollama / LM Studio)   │
│                                                             │
│  Knowledge Base ──► IndexedDB (all data stored locally)    │
│  Chat Sessions  ──► IndexedDB                              │
│  History        ──► IndexedDB                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ (optional, for OCR only)
┌──────────────────────▼──────────────────────────────────────┐
│              Python Backend (FastAPI, port 8000)            │
│  Fast OCR  ──► pdfplumber                                   │
│  Balanced  ──► Chandra (pypdfium2)                         │
│  Advanced  ──► MinerU  (optional, heavy install)           │
└─────────────────────────────────────────────────────────────┘
```

**Key design principles:**
- No user data is ever sent to Wrytica servers (there are none)
- API keys are stored only in `localStorage`, never transmitted
- All documents, history, and knowledge base data live in the browser's `IndexedDB`
- AI inference is either via the user's own API key (Gemini) or entirely local (Ollama/LM Studio)
- The Python backend is optional and used only for advanced OCR

---

## 2. Paraphraser

**File:** `pages/Paraphraser.tsx`

The most feature-rich tool in the app. Rewrites text in one of ten distinct writing styles with fine-grained intensity control, multiple variant generation, and inline diff highlighting.

### 2.1 Paraphrase Modes

| Mode | Character | Best for |
|------|-----------|----------|
| Standard | Balanced rewrite | General text |
| Fluency | Improves flow and readability | Rough drafts |
| Formal | Professional, elevated tone | Business documents |
| Simple | Plain language, short sentences | Non-technical audiences |
| Creative | Imaginative rewording | Marketing, storytelling |
| Academic | Scholarly phrasing, passive voice | Research and essays |
| Humanize | Removes AI-sounding patterns | AI-generated text |
| Expand | Adds context and elaboration | Thin content |
| Shorten | Condenses without losing meaning | Long-winded text |
| Custom | User-written instruction | Any specific need |

Each mode uses a **mathematical creativity curve** that maps the Synonyms slider (0–100) to an effective synonym intensity:

| Mode | Curve Formula |
|------|---------------|
| Standard | Linear: `y = x` |
| Fluency | Polynomial: `20 + x×60 + x²×20` |
| Humanize | Sigmoid: `10 + 80 / (1 + e^(−0.08(x−50)))` |
| Formal | Square root: `5 + √x × 35` |
| Academic | Offset linear: `15 + x × 45` |
| Creative | Power: `10 + x^1.2 × 80` |
| Expand | Logarithmic: `30 + log₁₀(1+0.09x) × 25` |
| Shorten | Inverse: `100 − ((100−x)/100)^0.7 × 70` |
| Simple / Custom | Linear: `y = x` |

### 2.2 Extras Toggles (QuillBot-style)

| Toggle | What it does |
|--------|--------------|
| Phrase Flip | Inverts parallel structures (`not only X but Y` → `Y as well as X`) |
| Sentence Restructure | Changes word order while preserving meaning |
| Fluency | Repairs grammar and natural flow |
| Sentence Compression | Removes redundant words |
| Word Level | Focuses on word-by-word synonym substitution |

Extras stack on top of the chosen mode — they narrow the focus of the paraphrase prompt.

### 2.3 Controls

| Control | Range | Purpose |
|---------|-------|---------|
| Synonyms slider | 0–100 | Controls vocabulary diversity (processed through mode curve) |
| Mode Intensity | 0–100 | Controls how aggressively the mode is applied |
| Variants | 1–8 | Number of candidate outputs to generate in parallel |

### 2.4 Key Functions

**`handleParaphrase()`**
- Validates input: minimum 3 chars, maximum 10,000 chars, checks for excessive repetition and non-text content
- Validates Custom instructions for harmful patterns if mode is `Custom`
- Calls `AIService.paraphraseWithMiddleware()` which runs multiple candidates in parallel
- Short-circuit: If both synonym intensity and mode intensity are ≤ 8, returns the original text unchanged (avoids a wasted API call)
- Rate limit: enforces max 10 requests per minute

**`paraphraseWithMiddleware(config, request, language, enhancement)`** *(in aiService.ts)*
- Generates 1–8 candidate paraphrases by calling the underlying LLM multiple times with temperature variation
- Temperature per candidate: `baseTemp + (candidateIndex × 0.05)`
- Calculates `actualChangePct` for each candidate using `calculateChangePercentage()`
- Ranks candidates using a **penalty score**: penalizes change percentage too far from the target synonyms level
- Returns ranked array of `ParaphraseCandidate` objects

**`handleSelectCandidate(index)`** — Switch the active output to a different candidate card.

**`handleFeedback(rating)`** — Record positive/negative rating to `feedbackLog` for self-improvement reranking.

**`handleCopy()`** — Write the selected candidate's text to the clipboard.

### 2.5 Diff Highlighting

When `showDiff` is enabled, `generateHtmlDiff(original, paraphrased)` computes a word-level diff and wraps changed words in `<mark>` and `<del>` tags for visual comparison.

---

## 3. Grammar Checker

**File:** `pages/GrammarChecker.tsx`

Detects grammar, spelling, style, punctuation, and clarity errors with one-click correction. Provides predictive "forecast" suggestions based on writing patterns.

### 3.1 Error Types

| Type | Examples |
|------|---------|
| `grammar` | Subject-verb disagreement, tense errors |
| `spelling` | Typos, misspellings |
| `style` | Wordiness, passive voice, weak verbs |
| `punctuation` | Missing commas, misplaced apostrophes |
| `clarity` | Ambiguous pronouns, complex sentence structures |

Each error card contains:
- `original` — the problematic text
- `suggestion` — the recommended replacement
- `reason` — plain-English explanation
- `type` — error category badge
- `context` — surrounding sentence for reference

### 3.2 Key Functions

**`runCheck()`**
1. Calls `AIService.checkGrammar(config, text, patternsHistory, language, enhancement)`
2. Falls back to `FallbackService.checkGrammar()` (local regex-based) on API error
3. The `patternsHistory` argument passes prior writing samples so the AI can detect recurring mistakes
4. Records result to tool history

**`applyFix(errorId)`**
- Finds the error by ID
- Replaces `error.original` with `error.suggestion` in the text using `String.replace()`
- Removes the fixed error from the list
- Increments `fixesAppliedCount`

**`fixAll()`**
- Applies all remaining errors in a single pass
- Uses `reduce()` on errors array to chain all replacements
- Prevents double-replacement by processing longest errors first

**`renderHighlightedText()`**
- Overlays an absolutely-positioned `div` on top of the textarea
- Highlights error spans using `background-color`
- Errors sorted by length (longest first) to prevent partial-match collisions

**`handleFeedback(rating)`** — Records feedback and tracks error correction count for self-improvement data.

### 3.3 Forecast

The AI returns a `forecast` array: 3–5 predictions about writing patterns the user tends to repeat. These are displayed below the error list as "watch out for" tips.

---

## 4. Summarizer

**File:** `pages/Summarizer.tsx`

Condenses text into Short, Medium, or Long summaries in Paragraph or Bullet Points format.

### 4.1 Options

| Option | Values |
|--------|--------|
| Length | Short (3 sentences) · Medium (1 paragraph) · Long (full coverage) |
| Format | Paragraph (prose) · Bullet Points (list) |
| Language | All languages supported by configured model |

### 4.2 Key Functions

**`handleSummarize()`**
1. Calls `AIService.summarize(config, text, length, format, language, enhancement)`
2. Converts plain-text result to HTML via `plainTextToHtml()` for the rich text editor
3. Records input/output to tool history

**`handleSummaryHtmlChange(value)`** — Updates both `summaryHtml` (editor) and `summary` (plain) state via `htmlToPlainText()`.

### 4.3 Fallback

If the AI call fails, `FallbackService.summarize(text, length, format)` runs a deterministic extractive summarizer:
- Splits text into paragraphs → sentences
- Extracts first and last sentence of each paragraph
- Slices to 3 sentences for Short length
- Formats as bullet points if requested

---

## 5. Citation Generator

**File:** `pages/CitationGenerator.tsx`  
**Service:** `services/citationService.ts`

Generates academic citations in 10 styles from DOIs, URLs, book titles, or freeform text. Supports batch processing and fully custom template formats.

### 5.1 Supported Citation Styles

APA 7 · MLA 9 · Chicago · Harvard · IEEE · Vancouver · Turabian · ACS · AMA · ASA

### 5.2 Source Type Detection

`detectSourceType(input)` in `citationService.ts`:

| Input Pattern | Detected As |
|--------------|-------------|
| `10.xxxx/...` or `doi.org/...` | `doi` |
| `http://` or `https://` | `url` |
| Short input without special chars | `title` |
| Everything else | `text` |

### 5.3 Metadata Fetching

**For DOIs:** `fetchCrossRefMetadata(doi, retries=3)` — Queries the CrossRef API (`api.crossref.org/works/{doi}`). 10-second timeout, auto-retry on failure. Extracts: author, title, journal, volume, issue, pages, year, DOI.

**For URLs:** `fetchURLMetadata(url)` — Uses `allorigins.win` as a CORS proxy to fetch the page HTML, then parses `og:title`, `og:description`, `author` meta tags.

**For titles/text:** `deriveMetadataFromInput(input)` — Passes to the AI to infer author, year, and publisher.

### 5.4 Key Functions

**`handleRunCitation()`**
1. Detects source type
2. Fetches metadata (CrossRef/URL proxy/AI inference)
3. Calls `AIService.generateCitation(config, source, style, language, enhancement)`
4. Displays `formatted_citation`, `bibtex`, and component fields

**`handleAddCustomFormat()`** — Validates the template has at least one `{placeholder}`, saves to `localStorage`.

**`validateTemplate(template)`** — Checks for valid placeholders against the allowed list: `{author}`, `{title}`, `{year}`, `{source}`, `{doi_or_url}`, `{journal}`, `{volume}`, `{issue}`, `{pages}`, `{publisher}`.

**`buildCustomCitation(metadata, template)`** — Replaces all `{placeholder}` tokens with actual metadata values.

**`handleBatchEditStart(index)`** — Opens inline editor for a specific batch result.

**`handleExportFormats()` / `handleImportFormats()`** — Save/load custom citation format templates as JSON files.

### 5.5 Batch Mode

Users can paste multiple sources (one per line), click "Batch Generate", and all citations are produced sequentially with a progress counter. Results can be bulk-copied or exported.

---

## 6. Chat Assistant

**File:** `pages/ChatAssistant.tsx`

Full multi-turn conversational AI with streaming, knowledge base grounding, document uploads, vision analysis, and reasoning traces.

### 6.1 Context Sources

Chat can pull from three sources simultaneously:

| Source | How |
|--------|-----|
| Knowledge Base | Semantic search on current KB chunks, injected as system context |
| Uploaded Document | PDF/image text extracted and prepended to context |
| Vision RAG | Images from KB documents sent to vision-capable models |

### 6.2 Session Management

- Sessions stored in `IndexedDB` under `chatSessions` store
- Each session: `id`, `title`, `messages[]`, `createdAt`, `updatedAt`
- Max 50 sessions (configurable)
- Session title auto-generated from the first user message

### 6.3 Key Functions

**`handleSend()`**
1. Builds system context: guardrail instructions + knowledge chunks + document text
2. Merges knowledge refs via `mergeKnowledgeChunks()` (deduplicates by chunk ID)
3. Calls `chatSession.sendMessage(input, contextInfo, onToken, images)` — streaming
4. `onToken` callback appends each token to `streamingContent` for real-time display
5. On completion: persists message to `IndexedDB`, updates session, records history
6. Runs `RewardService.rerankReferences()` if self-improvement is enabled

**`handleDocUpload(event)`**
- PDF: calls `extractPdfText()` from ocrService + renders page canvases to base64 for vision
- Image: reads as base64 directly
- Result stored in `uploadedDoc` state with `{ name, text, images[], type }`

**`playNotificationSound()`** — Creates a Web Audio API `OscillatorNode` playing a 440Hz tone for 150ms. Reuses a single `AudioContext` instance to avoid resource limits.

**`downloadChat()`** — Exports the current session as `wrytica-chat-{date}.json` with all messages and references.

**`renderMessageContent(content)`** — Extracts `<think>...</think>` blocks from model output (used by reasoning models like Qwen), renders them separately as a collapsible "Reasoning Trace" below the main response.

### 6.4 Streaming

Uses token-by-token streaming when the provider supports it:
- **Gemini**: `generateContentStream()` from `@google/genai`
- **Ollama/LM Studio**: Server-Sent Events from `/api/chat` or `/v1/chat/completions` with `stream: true`

---

## 7. OCR & Document Extraction

**File:** `pages/OCRTool.tsx`  
**Service:** `services/stabilityManager.ts`, `services/ocrService.ts`

Extracts text from scanned PDFs and images using three progressively more powerful engines, all running asynchronously in a background job queue.

### 7.1 OCR Engines

| Engine | Backend | Best for | Fallback |
|--------|---------|----------|----------|
| Fast | `pdfplumber` (Python) | Digital PDFs, speed | — |
| Balanced | `Chandra` (`pypdfium2`) | Scanned docs, layout | pdfplumber |
| Advanced | `MinerU` | Tables, formulas, research papers | Chandra |

**Auto-fallback chain:** If MinerU is requested but unavailable, the backend automatically falls back to Chandra. If Chandra fails, it falls back to pdfplumber.

### 7.2 Job Lifecycle

```
Upload file → POST /api/jobs/ocr → Job created (status: queued)
    → Backend processes asynchronously
    → Frontend polls GET /api/jobs/{job_id} every 500ms–5s
    → Status: queued → processing → completed / failed / cancelled
    → Result returned in job output field
```

### 7.3 Key Functions

**`handleRunOCR()`**
1. For each file: calls `StabilityManager.startOCRJob(file, engine)`
2. Stores returned `job_id` in `jobIdsRef`
3. Calls `pollSingleJobSafely(fileName, jobId)` in the background (not awaited)
4. Sets UI to show progress cards

**`pollSingleJobSafely(fileName, jobId)`**
- Loops until job reaches a terminal state (`completed`, `failed`, `cancelled`, `timeout`)
- Checks `BrowserHealthMonitor.shouldPause()` before each poll
- Uses `PollingThrottler.calculateInterval()` for adaptive backoff:
  - If progress changed: poll every 500ms
  - If no progress after 3 checks: backoff up to 5s
- Maps backend status to display stage:

| Backend Status | Display Stage |
|---------------|--------------|
| `pending` | `pending` |
| `queued` | `queued` |
| `waiting_resources` | `queued` |
| `processing` | `processing` |
| `completed` | `done` |
| `failed` | `error` |
| `timeout` | `error` |
| `cancelled` | `cancelled` |

**`cancelOCRJob(fileName)`** — Calls `DELETE /api/jobs/{job_id}` and sets display stage to `cancelled`.

**`handleSaveResult(result)`** — Creates a `KnowledgeDocument` from the OCR text and calls `addKnowledgeDocument()`.

### 7.4 Browser Health Monitor

`BrowserHealthMonitor.shouldPause()`:
1. Creates a temporary DOM element, measures `getBoundingClientRect()` time
2. If that takes >50ms, the main thread is overloaded → pauses all polling
3. Checks `navigator.deviceMemory` — if <2GB, also pauses
4. Checks at most every 2 seconds

---

## 8. Knowledge Base

**File:** `pages/KnowledgeBase.tsx`  
**Service:** `services/knowledgeBaseService.ts`

Local document store with semantic search, folder import, PageIndex tree reasoning, and vision RAG support.

### 8.1 Storage Architecture

```
KnowledgeDocument
 ├── id, title, content, source, tags, type
 ├── chunks[]     ← flat text chunks for RAG (semantic search)
 ├── pageIndex[]  ← hierarchical tree for structural reasoning
 └── pageImages[] ← base64-encoded page images (for vision RAG)
```

### 8.2 Supported File Types

| Type | How processed |
|------|---------------|
| `.txt`, `.md` | Direct text read |
| `.pdf` | `pdfjs-dist` text extraction + canvas image capture |
| `.docx` | `mammoth.js` or backend extraction |
| `.xlsx` | `openpyxl` (backend) |
| `.pptx` | `python-pptx` (backend) |

### 8.3 Chunking Algorithm

`chunkText(text, chunkSize=600, overlap=150)`:
1. Splits text into segments of 600 characters
2. Each segment overlaps with the previous by 150 characters
3. `ChunkDeduplicator` filters identical chunks using a Bloom filter + Set

**Deduplication:** `ChunkDeduplicator` stores a normalized signature (trimmed lowercase, collapsed whitespace) for every chunk. Before adding a new chunk, `mightExist(signature)` does a fast Bloom filter check; `has(signature)` does the full Set lookup.

### 8.4 Folder Import

**`handleFolderUpload(event)`**
1. Reads all files from the `<input type="file" multiple>` selection
2. Filters by supported extensions
3. Processes in batches (`ingestionConfig.batchSize`, default 5)
4. Checks memory threshold before each batch — pauses if `IndexedDB` is near limit
5. For PDFs: uses `DocumentProcessorAPI.processDocumentDeep()` if backend is available, else falls back to `extractPdfText()`
6. Calls `addKnowledgeDocumentsBatch()` to persist to `IndexedDB`

**Memory limits (configurable in Settings):**
- Max file size: 100 MB
- Max PDF pages: 500
- Memory threshold: 900 MB
- Max stored content length per doc: 500,000 chars

### 8.5 PageIndex

A **PageIndex** is a hierarchical tree (similar to a table of contents) that describes the structure of a document. It enables the AI to reason about *where* in a document to look rather than scanning all chunks.

```
PageIndexNode {
  id: string
  title: string       ← section/chapter name
  summary: string     ← brief description of the section
  content?: string    ← full text (optional)
  pageNumber?: number
  tags: string[]
  children: PageIndexNode[]  ← sub-sections
}
```

**Creation:** Backend endpoint `POST /api/v1/pageindex/create` analyzes document structure and returns a tree. Frontend sends selected document IDs.

**Reasoning:** `AIService.reasonOverPageIndex(config, query, nodes, language, enhancement, limit)` asks the AI to identify which PageIndex nodes are relevant to a query, then retrieves only those nodes' full content.

### 8.6 Vision RAG

When `visionRagEnabled` is true in settings, the Chat tool sends up to 4 base64 page images from knowledge documents alongside the text query to vision-capable models.

### 8.7 Key Search Function

**`KnowledgeBaseService.search(query, documents, limit=6)`**
- Calls `rankChunksByQuery(allChunks, query)` from utils.ts
- `rankChunksByQuery` scores each chunk using word overlap (TF-style):
  - Tokenizes both query and chunk into lowercase words
  - Scores = sum of term frequency for query terms found in chunk
  - Returns chunks sorted by score descending

---

## 9. Agent Planner

**File:** `pages/AgentPlanner.tsx`  
**Service:** `services/agentPlanner.ts`

An AGNO-inspired autonomous workflow that turns a topic, goal, and notes into a fully written, grammar-checked, cited memo — in five sequential AI steps.

### 9.1 Workflow Steps

```
Input: topic + goal + notes + knowledge refs
  │
  ▼ Step 1: PLAN
  │   AIService.summarize() → 3-step outline
  │   Fallback: "1. Introduction\n2. Key Discussion\n3. Conclusion"
  │
  ▼ Step 2: DRAFT
  │   AIService.paraphrase() with Formal mode → full memo body
  │   Uses knowledge refs as context
  │
  ▼ Step 3: GRAMMAR
  │   AIService.checkGrammar() → error list + corrected text
  │
  ▼ Step 4: SUMMARY
  │   AIService.summarize() on draft → executive summary
  │
  ▼ Step 5: CITATION
      AIService.generateCitation() for first knowledge ref
      Returns: formatted_citation + bibtex

Output: AgentMemoResult { plan, memo, grammar, summary, citation }
```

### 9.2 Key Functions

**`handleRunAgent()`**
1. Retrieves relevant knowledge chunks from KB via `rankChunksByQuery()`
2. Calls `AgentPlannerService.runMemoWorkflow(options)`
3. Updates each step's visual status card (`pending` → `running` → `done` / `error`)
4. Applies `RewardService.rerankReferences()` on knowledge chunks if self-improve is enabled

**`runMemoWorkflow(options)`** *(in agentPlanner.ts)*
- Runs all 5 steps sequentially (each awaits the previous)
- Each step has a `try/catch` with graceful fallback text
- Returns `AgentMemoResult` with all outputs bundled together

---

## 10. History Dashboard

**File:** `pages/HistoryDashboard.tsx`

Searchable, filterable audit log of all tool uses with feedback tracking and training data export.

### 10.1 History Entry Fields

| Field | Type | Source |
|-------|------|--------|
| `tool` | ToolName | Which tool generated the entry |
| `input` | string | Original text input |
| `output` | string | AI-generated output |
| `timestamp` | number | Unix milliseconds |
| `modelName` | string | Model used |
| `guardrailId` | string | Active guardrail (if any) |
| `references` | KnowledgeChunk[] | KB chunks used |
| `metadata` | any | Tool-specific extras (error count, pages, etc.) |

### 10.2 Filter Controls

| Filter | Options |
|--------|---------|
| Tool | All · Paraphraser · Grammar · Summarizer · Citation · Chat · OCR · Agent |
| Rating | All · Positive (👍) · Needs Fix (👎) |
| Date | All · Today · This Week · This Month |
| Search | Full-text search in input + output |
| Guardrail | Filter by guardrail ID |

### 10.3 Training Data Export

**`exportTrainingData(format)`** — Exports filtered history as:

**JSONL format** (one JSON object per line):
```json
{"tool":"paraphraser","input":"...","output":"...","model":"gemini-2.0-flash","rating":1,"timestamp":"2025-01-15T..."}
```

**CSV format** with columns: `tool, input, output, model, rating, comment, timestamp, errors_found, errors_fixed`

Deduplication: entries within the same 5-minute window with identical input are merged (only last is kept).

---

## 11. Document Viewer

**File:** `pages/DocumentViewer.tsx`

Professional reading environment for viewing knowledge base documents with font control, reading themes, and fullscreen mode.

### 11.1 Reading Themes

| Theme | Background | Text | Font |
|-------|-----------|------|------|
| Day | `#ffffff` | `#1e293b` | Inter (sans-serif) |
| Night | `#1e293b` | `#e2e8f0` | Inter (sans-serif) |
| Sepia | `#f5f0e8` | `#3d2b1f` | Georgia (serif) |

### 11.2 View Modes

| Mode | Description |
|------|-------------|
| Original | Shows Blob URL preview (PDF iframe or image tag) |
| Text | Shows extracted plain text in reading theme |
| Compare | Side-by-side original + text split view |

### 11.3 Key Functions

**`handleSelectDoc(docId)`** — Loads document from KB, logs to history, sets active doc.

**`handleFileUpload(event)`** — Reads a new file from the filesystem:
- PDF → extracts text via `extractPdfText()` + creates a `Blob URL` for preview
- Image → base64 data URL for display
- Text → direct `FileReader.readAsText()`
- DOCX → passes to backend for text extraction

---

## 12. Settings

**File:** `pages/Settings.tsx`

Central configuration hub for AI provider, model, guardrails, hardware detection, and backend monitoring.

### 12.1 AI Provider Configuration

| Provider | Auth | Notes |
|----------|------|-------|
| Gemini | API key (from Google AI Studio) | Models: `gemini-2.0-flash`, `gemini-2.5-pro`, etc. |
| Ollama | No auth (local server) | Base URL: `http://localhost:11434` |
| LM Studio | No auth (local server) | Base URL: `http://localhost:1234` |

Provider configs are stored **per-provider** in `localStorage` under `wrytica_provider_configs`. Switching providers restores that provider's last-used config without losing the other.

### 12.2 Hardware Profiling

**`detectHardwareProfile()`** in `services/hardwareAdvisor.ts`:
1. Reads `navigator.deviceMemory` (in GB)
2. Queries WebGL for `UNMASKED_RENDERER_WEBGL` to detect GPU model
3. Maps to profile: `'low'` (<4GB RAM) · `'medium'` (4–8GB) · `'high'` (>8GB with GPU)

**`getRecommendations(profile)`** returns:
- Suggested model name (e.g., `gemini-2.0-flash` for low, `gemini-2.5-pro` for high)
- Recommended context limit
- Vision model suggestion
- Max vision images

### 12.3 Guardrails

A **Guardrail** is a set of writing constraints injected into every AI prompt:

```typescript
Guardrail {
  name: string              // e.g., "Corporate Neutral"
  description: string       // Human-readable purpose
  tone: string              // e.g., "Professional, neutral"
  formattingNotes?: string  // e.g., "Use bullet points for lists"
  requiredPhrases: string[] // Must appear in output
  prohibitedPhrases: string[] // Must not appear in output
}
```

Guardrails are converted to system instructions via `buildGuardrailInstructions(guardrail, toolName)` and injected into every AI call when active.

### 12.4 Backend Status Card

Polls `GET http://localhost:8000/health` every 15 seconds. Displays:
- Connection status (connected / not available)
- Backend version
- Feature flags: `pdf_processing`, `office_processing`, `embeddings`, `ocr`, `ocr_fast`, `ocr_balanced`, `deep_extract`, `deep_extract_gpu`

### 12.5 Ingestion Configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| Max file size | 100 MB | Skip files larger than this |
| Max PDF pages | 500 | Truncate PDFs at this page |
| Memory threshold | 900 MB | Pause ingestion if IndexedDB approaches this |
| Batch size | 5 | Files processed simultaneously |
| Max stored content | 500,000 chars | Truncate document content at this length |

---

## 13. Developer Page

**File:** `pages/Developer.tsx`

In-app documentation and licensing page accessible from the sidebar.

### 13.1 Sections

| Section | Content |
|---------|---------|
| Developer Card | Arpan Guria bio, portfolio link, GitHub, contact |
| App Info Bar | Version, license type, build tool, privacy mode |
| Tech Stack | Categorised list of all dependencies |
| Changelog | Timeline from v1.0.0 to current, with release notes |
| Privacy & Data | How (and how not) data is handled |
| Third-Party Licenses | 13 packages with license types |
| MIT License | Full license text |

---

## 14. AI Service Layer

**File:** `services/aiService.ts`

The **unified abstraction layer** that all UI components call. Routes requests to the correct backend (Gemini or Local LLM) and implements cross-cutting concerns like retries, candidates, and output sanitization.

### 14.1 Function Reference

| Function | Parameters | Returns | Purpose |
|----------|-----------|---------|---------|
| `getService(config)` | `LLMConfig` | `GeminiService` or `LocalLlmService` | Select backend |
| `testConnection(config)` | `LLMConfig` | `{ success, message }` | Verify API key/endpoint |
| `paraphraseWithMiddleware(config, request, language, enhancement)` | See below | `ParaphraseCandidate[]` | Multi-candidate paraphrase |
| `paraphrase(config, text, mode, synonyms, language, enhancement, options)` | — | `ParaphraseResponse` | Single paraphrase |
| `checkGrammar(config, text, patternsHistory, language, enhancement)` | — | `GrammarCheckResult` | Grammar analysis |
| `summarize(config, text, length, format, language, enhancement)` | — | `string` | Summarization |
| `generateCitation(config, source, style, language, enhancement)` | — | `CitationResponse` | Citation |
| `reasonOverPageIndex(config, query, nodes, language, enhancement, limit)` | — | `PageIndexSelection` | Structural reasoning |
| `createChatSession(config, language, enhancement, history)` | — | `AISession` | Chat session factory |
| `sanitizeOutput(output)` | `string` | `string` | Remove artifacts |

### 14.2 Middleware Pattern (Multi-Candidate)

```
paraphraseWithMiddleware(config, request, language, enhancement)
  │
  ├─ Short-circuit if intensity <= 8 → return original text
  │
  ├─ For each candidate (1 to numCandidates):
  │    temperature = baseTemp + (i × 0.05)
  │    call underlying LLM with this temperature
  │    calculate actualChangePct
  │    store as ParaphraseCandidate
  │
  └─ rankCandidates(candidates, original, targetSynonyms, mode)
       → sort by penalty score (|actualChange - targetChange|²)
       → return sorted array
```

### 14.3 Output Sanitization

`sanitizeOutput(output)` removes:
- `<think>...</think>` XML blocks (reasoning model traces)
- Leading/trailing markdown code fences (` ``` `)
- Non-printable control characters
- Gibberish detection (no vowels, excessive special chars)

---

## 15. Gemini Service

**File:** `services/geminiService.ts`

Google Gemini API integration using the `@google/genai` SDK (v1.30.0).

### 15.1 Prompt Architecture

Each AI call uses a **two-part prompt structure**:
1. **System instruction** — role definition, guardrails, knowledge context
2. **User content** — the actual text to process

`composeInstruction(base, enhancement, toolName)` assembles the system instruction:
```
base instruction
  + guardrail text (if any)
  + additional instructions (if any)
  + knowledge context (knowledge chunks formatted as reference material)
```

### 15.2 Structured JSON Responses

All non-chat endpoints use `responseMimeType: 'application/json'` with a `responseSchema` to get consistently structured output. Example for grammar:

```json
{
  "errors": [
    { "original": "...", "suggestion": "...", "reason": "...", "type": "spelling" }
  ],
  "forecast": ["...", "..."]
}
```

### 15.3 Reasoning vs Standard Prompts

`shouldUseReasoningPrompts(modelName)` checks if the model name contains `flash-thinking`, `o1`, `deepthink`, or `qwq`. If true, uses enhanced prompts that include explicit chain-of-thought instructions and a systematic analysis framework.

### 15.4 Vision

`extractImageText(apiKey, base64, mimeType, language)` sends an image to `gemini-2.0-flash` with the prompt "Extract all text from this image verbatim. Return only the extracted text."

---

## 16. Local LLM Service

**File:** `services/localLlmService.ts`

Handles Ollama and LM Studio (OpenAI-compatible) API calls for fully local AI inference.

### 16.1 Ollama Endpoints

| Operation | Endpoint | Method |
|-----------|---------|--------|
| Chat | `{baseUrl}/api/chat` | POST |
| List models | `{baseUrl}/api/tags` | GET |
| Stream | Same endpoint with `stream: true` | POST |

### 16.2 LM Studio Endpoints

| Operation | Endpoint | Method |
|-----------|---------|--------|
| Chat | `{baseUrl}/v1/chat/completions` | POST |
| List models | `{baseUrl}/v1/models` | GET |

### 16.3 Role Conversion

Local LLMs use `assistant` as the model role, while the app uses `model` internally. `LocalChatSession` converts between them:
```typescript
history.map(msg => ({
  ...msg,
  role: msg.role === 'model' ? 'assistant' : msg.role
}))
```

### 16.4 Streaming

When `onToken` callback is provided, uses `EventSource`-style streaming:
- Reads response as `ReadableStream`
- Parses each `data: {...}` chunk
- Extracts delta content and calls `onToken(deltaText)`

---

## 17. Knowledge Base Service

**File:** `services/knowledgeBaseService.ts`

Document lifecycle management: creation, chunking, deduplication, and search.

### 17.1 Document Creation

**`createDocument(options: CreateDocOptions)`**

```typescript
CreateDocOptions {
  title: string
  content: string
  source?: string
  tags?: string[]
  type?: 'pdf'|'image'|'text'|'docx'|'other'
  pageIndex?: PageIndexNode[]    // if already extracted
  pageImages?: string[]          // base64 page images
  drivePath?: string
}
```

Process:
1. Generates UUID for document ID
2. If `pageIndex` provided: creates chunks from leaf nodes' content
3. Otherwise: calls `chunkText(content, 600, 150)` to split into overlapping chunks
4. Deduplicates chunks against global `ChunkDeduplicator`
5. Assigns `docId`, `order`, `tags`, `sourceTitle` to each chunk

**`createBulkDocuments(options[])`** — Resets the global deduplicator before batch, then creates all documents. More aggressive dedup across the batch.

### 17.2 Search

**`search(query, documents, limit=6)`**
1. Flattens all documents into a single `KnowledgeChunk[]`
2. Calls `rankChunksByQuery(chunks, query)` from utils.ts
3. Returns top `limit` chunks

`rankChunksByQuery` algorithm:
```
For each chunk:
  tokens = chunk.text.toLowerCase().split(/\W+/)
  queryTokens = query.toLowerCase().split(/\W+/)
  score = sum(tokens.filter(t => queryTokens.includes(t)).length)
Sort by score descending
```

### 17.3 Bloom Filter (ChunkDeduplicator)

The `ChunkDeduplicator` class combines two strategies:
- **Bloom filter** (fast, probabilistic): 16 hash functions, 1MB bit array → ~1% false positive rate at 100K items
- **Set** (exact): For definitive confirmation when Bloom filter says "might exist"

Signature = `text.trim().toLowerCase().replace(/\s+/g, ' ')`

---

## 18. Storage Service

**File:** `services/storageService.ts`

IndexedDB abstraction built on `idb` (v8). All persistent data in Wrytica flows through this service.

### 18.1 Object Stores

| Store | Key | Content |
|-------|-----|---------|
| `knowledgeBase` | `id` | `KnowledgeDocument` objects |
| `chatSessions` | `id` | `ChatSession` objects |
| `toolHistory` | `id` | `TimelineEntry` objects |
| `chatHistory` | `id` | `TimelineEntry` objects |
| `vectorStore` | `id` | `{ id, vectors: Float32Array[] }` |
| `settings` | `id` | `{ id: string, value: any }` |

### 18.2 Function Reference

| Function | Purpose |
|----------|---------|
| `getAll<T>(storeName)` | Return all items from a store |
| `put<T>(storeName, item)` | Upsert a single item |
| `delete(storeName, id)` | Remove item by ID |
| `clear(storeName)` | Delete all items in store |
| `bulkPut<T>(storeName, items)` | Batch upsert (1,000 items per transaction) |
| `bulkPutOptimized<T>(storeName, items, options)` | Batch with yielding to prevent UI freeze |

**`bulkPutOptimized` options:**
```typescript
{
  batchSize: number         // items per transaction (default: 500)
  yieldInterval: number     // yield to main thread every N items (default: 200)
  onProgress?: (pct) => void
}
```

---

## 19. OCR Service

**File:** `services/ocrService.ts`

PDF text extraction with multiple strategies and progressive fallback.

### 19.1 Extraction Methods

| Method | Description |
|--------|-------------|
| `extractPdfText(file, options)` | Direct pdf.js extraction in main thread |
| `extractPdfTextWithOffloading(file, options)` | Try Web Worker first, fallback to main |
| `WebWorkerManager.extractPdfText(file, maxPages)` | Worker-based (avoids UI freeze) |
| `IndexedDBOffloader.getPdfText(fileHash)` | Return cached extraction |

### 19.2 Processing Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_PDF_PAGES` | 200 | Hard cap on pages extracted |
| `PDF_RENDER_SCALE` | 0.8 | Canvas scale for image rendering |
| `OCR_JPEG_QUALITY` | 0.4 | JPEG compression for OCR images |
| `MAX_IMAGE_SIZE` | 1024×768 | Max canvas dimensions |
| `MEMORY_CLEANUP_INTERVAL` | 5 | Pages between explicit GC hints |

### 19.3 Canvas Cleanup

`cleanupCanvas(canvas)` is called after each page render to aggressively free GPU memory:
1. `ctx.clearRect(0, 0, canvas.width, canvas.height)` — clear pixels
2. `canvas.width = 0; canvas.height = 0` — release GPU texture
3. `canvas.remove()` — detach from DOM

### 19.4 File Hash

`IndexedDBOffloader.generateFileHash(file)` creates a cache key from:
`${file.name}-${file.size}-${first1KB}`

---

## 20. Citation Service

**File:** `services/citationService.ts`

Metadata extraction, source type detection, and citation formatting.

### 20.1 CrossRef Integration

`fetchCrossRefMetadata(doi, retries=3)`:
- Endpoint: `https://api.crossref.org/works/{doi}`
- Timeout: 10 seconds
- Extracts: `author`, `title`, `container-title` (journal), `volume`, `issue`, `page`, `published-print.date-parts`, `DOI`
- Auto-retry up to 3 times on network error

### 20.2 OpenGraph Proxy

`fetchURLMetadata(url)`:
- Uses `https://api.allorigins.win/get?url={encodedUrl}` to bypass CORS
- Parses `og:title`, `og:description`, `article:author`, `og:site_name` from HTML

### 20.3 BibTeX Generation

`generateBibtexFromMetadata(metadata)`:
```
@article{author_year,
  author    = {Last, First},
  title     = {Title},
  journal   = {Source},
  year      = {2025},
  doi       = {10.xxxx/xxxx}
}
```

---

## 21. Agent Planner Service

**File:** `services/agentPlanner.ts`

Orchestrates the 5-step autonomous memo generation workflow.

### 21.1 Step Details

**Step 1 — Plan**
```typescript
AIService.summarize(config, inputText, 'Short', 'Paragraph', language, enhancement)
// inputText = "Topic: {topic}\nGoal: {goal}\nNotes: {notes}"
// Result: 3-step outline like "1. Context\n2. Analysis\n3. Recommendations"
```

**Step 2 — Draft**
```typescript
AIService.paraphrase(config, planText, 'Formal', 70, language, enhancement, {})
// Takes the plan outline and expands it into a full memo body
```

**Step 3 — Grammar**
```typescript
AIService.checkGrammar(config, draftText, [], language, enhancement)
// Returns errors + corrected text
```

**Step 4 — Summary**
```typescript
AIService.summarize(config, draftText, 'Short', 'Bullet Points', language, enhancement)
// Executive summary of the memo
```

**Step 5 — Citation**
```typescript
AIService.generateCitation(config, knowledgeRefs[0].sourceTitle, 'APA 7', language, enhancement)
// Citation for the primary knowledge reference used
```

---

## 22. Vision Service

**File:** `services/visionService.ts`

Multi-provider vision/OCR for images and documents.

### 22.1 Provider Routing

| Provider | Vision Endpoint | Image Format |
|----------|----------------|-------------|
| Gemini | `generateContent` with `inlineData` | base64 |
| Ollama | `/api/chat` with `images[]` | base64 |
| LM Studio | `/v1/chat/completions` with `image_url` | `data:image/jpeg;base64,...` |

### 22.2 Function Reference

| Function | Parameters | Returns | Purpose |
|----------|-----------|---------|---------|
| `checkVisionCapability(config)` | LLMConfig | boolean | Verify model supports vision |
| `resizeImageIfNeeded(file)` | File | base64 string | Compress images >5MB |
| `extractText(file, config, language)` | File, LLMConfig, string | string | OCR single image |
| `answerWithImages(config, question, images[], language)` | — | string | Multi-image question |
| `tryOllamaVision(config, base64, prompt)` | — | string | Ollama vision call |
| `tryOpenAiCompatVision(config, dataUrl, prompt)` | — | string | OpenAI-compat call |

**`answerWithImages`** — Sends up to 4 images with the question. The AI synthesizes an answer grounded in all images.

---

## 23. Stability Manager

**File:** `services/stabilityManager.ts`

Browser-safe job polling with health monitoring and intelligent backoff.

### 23.1 PollingThrottler

Tracks progress per job and adjusts polling interval:

| Condition | Interval |
|-----------|---------|
| Progress made (progress changed) | 500ms (minimum) |
| Stuck × 1 | 500ms × 1.5⁰ = 500ms |
| Stuck × 2 | 500ms × 1.5¹ = 750ms |
| Stuck × 3 | 500ms × 1.5² = 1,125ms |
| Stuck × 3+ | Capped at 5,000ms |

### 23.2 BrowserHealthMonitor

`shouldPause()` — Returns `true` if:
- Main thread response time >50ms (measured via forced reflow)
- `navigator.deviceMemory` <2GB

### 23.3 Function Reference

| Function | Purpose |
|----------|---------|
| `startOCRJob(file, engine, timeout_sec)` | POST file to `/api/jobs/ocr` |
| `pollJob(jobId)` | GET `/api/jobs/{jobId}` |
| `cancelJob(jobId)` | POST `/api/jobs/{jobId}/cancel` |
| `pollJobSafely(jobId, onProgress, onPausedStatusChanged)` | Polling loop with health checks |
| `pollMultipleJobs(jobIds[], onProgress, onPausedStatusChanged)` | Concurrent polling |
| `createRateLimiter(maxOpsPerSecond)` | Returns async rate-limited wrapper |
| `clearJobState(jobId)` | Reset throttler for a job |
| `getSystemMetrics()` | GET `/api/system/metrics` |

---

## 24. Workspace Service

**File:** `services/workspaceService.ts`

File System Access API wrapper for persistent local folder access (hybrid storage mode).

### 24.1 Function Reference

| Function | Parameters | Returns | Purpose |
|----------|-----------|---------|---------|
| `requestFolder()` | — | `WorkspaceHandle \| null` | Show directory picker |
| `writeFile(dirHandle, fileName, content)` | — | `boolean` | Write file to folder |
| `readFile(dirHandle, fileName)` | — | `string \| null` | Read file from folder |
| `listFiles(dirHandle)` | — | `string[]` | List files in folder |
| `getDiskUsage(dirHandle)` | — | `{fileName, sizeBytes}[]` | Get file sizes |

Uses the experimental **File System Access API** (`window.showDirectoryPicker`, `FileSystemDirectoryHandle`). Calls `queryPermission()` and `requestPermission()` before each operation. Falls back gracefully if permission is denied.

---

## 25. Backend API Service

**File:** `services/backendApi.ts`

Frontend client for the optional Python FastAPI backend.

### 25.1 Function Reference

| Function | Endpoint | Returns | Purpose |
|----------|---------|---------|---------|
| `isBackendAvailable()` | GET `/health` | boolean | Ping check |
| `getHealthStatus()` | GET `/health` | HealthStatus | Full status with features |
| `processDocument(file, options)` | POST `/api/documents/process` | ProcessedDocument | PDF/Office extraction |
| `processDocumentDeep(file)` | POST `/api/v1/ocr/deep-extract` | DeepExtractResult | MinerU extraction |
| `startHealthChecks()` | — | — | Begin 30s interval polling |
| `onHealthChange(callback)` | — | unsubscribe fn | Subscribe to availability changes |

### 25.2 Auto-Discovery

`startHealthChecks()` polls `/health` every 30 seconds and fires all registered `onHealthChange` callbacks when availability changes. The `documentProcessorAPI` singleton is initialized on module load and begins health checks immediately in browser environments.

---

## 26. Vector Store Service

**File:** `services/vectorStoreService.ts`

Optional in-browser vector similarity search using `Float32Array` embeddings.

### 26.1 Overview

When `retrievalMode === 'hybrid'`, the app stores embedding vectors in `IndexedDB` (`vectorStore`) alongside knowledge chunks. Semantic search uses cosine similarity on these vectors instead of the word-overlap method.

### 26.2 Key Operations

| Operation | Description |
|-----------|-------------|
| `addVectors(docId, vectors)` | Store embedding vectors for a document's chunks |
| `search(queryVector, limit)` | Return top-N chunks by cosine similarity |
| `deleteVectors(docId)` | Remove vectors when document is deleted |
| `clear()` | Wipe entire vector store |

Embeddings are generated by the Python backend's `sentence-transformers` model (`all-MiniLM-L6-v2`, 384 dimensions) if available.

---

## 27. App Context (Global State)

**File:** `contexts/AppContext.tsx`

React Context providing global state to all components. Uses a mix of `useState`, `useEffect`, and direct `localStorage` reads for synchronous hydration.

### 27.1 Storage Boundaries

| Data | Storage | Max |
|------|---------|-----|
| LLM config | `localStorage` | — |
| Tool UI states | `localStorage` | — |
| API keys | `localStorage` | — |
| Knowledge base | `IndexedDB` | 500 docs |
| Chat sessions | `IndexedDB` | 50 sessions |
| Tool history | `IndexedDB` | 200 entries |
| Chat history | `IndexedDB` | 200 entries |
| Vectors | `IndexedDB` | 10,000 vectors |
| Disk cache (hybrid) | File System API | User-chosen folder |

### 27.2 Key Actions

| Action | What it does |
|--------|-------------|
| `updateConfig(partial)` | Merge partial config, save to localStorage |
| `addKnowledgeDocument(doc)` | Add doc, enforce 500-doc limit, persist to IndexedDB |
| `addKnowledgeDocumentsBatch(docs)` | Bulk add with `bulkPutOptimized` |
| `removeKnowledgeDocument(id)` | Remove from state + IndexedDB + delete vectors |
| `createNewChatSession()` | Create session, enforce 50-session limit |
| `loadChatSession(id)` | Load messages from IndexedDB |
| `syncChatSessionToMemory(id, messages)` | Save updated messages |
| `recordToolHistory(entry)` | Add to history, enforce 200-entry limit |
| `recordFeedback(entry)` | Add to feedbackLog, save to localStorage |
| `getFeedbackHints(tool)` | Return last 10 negative feedbacks for a tool |
| `clearMemory(scope)` | Clear: `'knowledge'`, `'chat'`, `'history'`, `'vectors'`, or `'all'` |
| `getMemoryStats()` | Return async doc/session/vector counts and storage sizes |
| `exportMemoryStats()` | Serialize all stats to JSON string |
| `connectWorkspace(handle)` | Enable hybrid storage with a local folder |

### 27.3 Self-Improvement

When `selfImproveEnabled` is true:
- `getFeedbackHints(tool)` returns the last 10 negative feedback comments for a tool
- These hints are passed as `feedbackHints` to `AgentPlannerService.runMemoWorkflow()`
- `RewardService.rerankReferences()` reorders knowledge chunks based on historical user preferences

---

## 28. Utility Functions (utils.ts)

Key pure functions shared across the application.

### 28.1 Text Processing

| Function | Signature | Description |
|----------|-----------|-------------|
| `generateId()` | `() → string` | UUID v4 |
| `estimateTokens(text)` | `(string) → number` | ~4 chars per token estimate |
| `chunkText(text, size, overlap, meta)` | `(string, number, number, Partial<KnowledgeChunk>) → KnowledgeChunk[]` | Overlapping text splitter |
| `rankChunksByQuery(chunks, query)` | `(KnowledgeChunk[], string) → KnowledgeChunk[]` | Word-overlap ranking |
| `mergeKnowledgeChunks(...arrays)` | `(...KnowledgeChunk[][]) → KnowledgeChunk[]` | Deduplicate and merge |
| `copyToClipboard(text)` | `(string) → Promise<void>` | Navigator clipboard API |
| `plainTextToHtml(text)` | `(string) → string` | Newlines → `<br/>` |
| `htmlToPlainText(html)` | `(string) → string` | Strip HTML tags |

### 28.2 Prompt Building

| Function | Purpose |
|----------|---------|
| `buildGuardrailInstructions(guardrail, toolName)` | Format guardrail as numbered instructions |
| `buildKnowledgeContext(chunks)` | Format KB chunks as numbered reference list |
| `buildContextEnhancement(guardrail?, instructions?, chunks?)` | Assemble `ContextEnhancement` object |

### 28.3 Diff and Change Calculation

| Function | Purpose |
|----------|---------|
| `damerauLevenshteinWords(a, b)` | Word-level edit distance (supports transpositions) |
| `calculateChangePercentage(original, paraphrased)` | Heuristic: `(changedWords / totalWords) × 100` |
| `generateHtmlDiff(original, paraphrased)` | Word-level HTML diff with `<ins>` / `<del>` |

### 28.4 Candidate Ranking

`rankCandidates(candidates, original, targetSynonyms, mode)`:

```
penalty = |candidate.actualChangePct - effectiveTargetChangePct|²
         + confidencePenalty (if confidence < 0.5)
         + modeLengthPenalty (mode-specific, e.g., Expand penalizes short outputs)

Sort by penalty ascending (lowest penalty = best candidate)
```

### 28.5 Intensity Conversions

| Function | Purpose |
|----------|---------|
| `getEffectiveSynonyms(sliderValue, mode)` | Apply mode curve to slider (0–100 → 0–100) |
| `getIntensityAdverb(intensity)` | `0–25 → "very lightly"`, `75–100 → "aggressively"` |
| `getSynonymAdverb(intensity)` | `0–25 → "minimal synonyms"`, `75–100 → "maximum variety"` |

---

## 29. Type Definitions

Key TypeScript interfaces used throughout the app (defined in `utils.ts`).

### Core Types

```typescript
// AI Provider Configuration
interface LLMConfig {
  provider: 'gemini' | 'ollama' | 'lmstudio'
  apiKey?: string
  modelName: string
  baseUrl?: string
  contextLimit: number
  maxCompletionTokens: number
}

// Text Paraphrasing
interface ParaphraseRequest {
  originalText: string
  mode: ParaphraseMode       // 10 modes
  modeIntensity: number      // 0–100
  globalSynonymIntensity: number
  extras: {
    phraseFlip: boolean
    restructure: boolean
    fluencyBoost: boolean
    compress: boolean
    wordLevel: boolean
  }
  customInstruction?: string
  numCandidates: number      // 1–8
}

// Paraphrase output
interface ParaphraseCandidate {
  paraphrasedText: string
  highlightedDiff: string    // HTML diff
  actualChangePct: number
  confidence: number
  tone?: string
}

// Grammar
interface GrammarError {
  id: string
  original: string
  suggestion: string
  reason: string
  context: string            // surrounding sentence
  type: 'grammar' | 'spelling' | 'style' | 'punctuation' | 'clarity'
}

// Knowledge Base
interface KnowledgeChunk {
  id: string
  docId: string
  text: string
  order: number
  sourceTitle: string
  sourcePath?: string
  tags: string[]
  nodeId?: string            // links to PageIndex node
  pageNumber?: number
  summary?: string
}

interface KnowledgeDocument {
  id: string
  title: string
  content: string
  source?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  chunks: KnowledgeChunk[]
  pageIndex?: PageIndexNode[]
  pageImages?: string[]      // base64 for vision RAG
  previewUrl?: string        // Blob URL for document viewer
  type?: 'pdf' | 'image' | 'text' | 'docx' | 'other'
  drivePath?: string
}

// Hierarchical document structure
interface PageIndexNode {
  id: string
  title: string
  summary: string
  content?: string
  pageNumber?: number
  tags: string[]
  children: PageIndexNode[]
}

// Chat
interface ChatMessage {
  role: 'user' | 'model'
  content: string
  timestamp: number
  references?: KnowledgeChunk[]
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

// Content guardrail
interface Guardrail {
  id: string
  name: string
  description: string
  tone: string
  formattingNotes?: string
  requiredPhrases: string[]
  prohibitedPhrases: string[]
}

// Context passed to every AI call
interface ContextEnhancement {
  guardrail?: Guardrail
  knowledgeRefs?: KnowledgeChunk[]
  additionalInstructions?: string
}

// History
interface TimelineEntry {
  id: string
  tool: ToolName
  input: string
  output: string
  timestamp: number
  guardrailId?: string
  modelName?: string
  metadata?: any
  references?: KnowledgeChunk[]
}
```

---

## 30. Backend (Python FastAPI)

**Files:** `backend/main.py`, `backend/job_queue.py`, `backend/resource_manager.py`

Optional local Python server for OCR and document processing. Runs on `http://localhost:8000`.

### 30.1 API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check with feature flags |
| GET | `/api/system/metrics` | CPU, RAM, queue stats |
| GET | `/api/system/stats` | Detailed system statistics |
| POST | `/api/jobs/ocr` | Start OCR job (async) |
| GET | `/api/jobs/{job_id}` | Poll job status |
| GET | `/api/jobs` | List all jobs |
| POST | `/api/jobs/{job_id}/cancel` | Cancel job |
| POST | `/api/documents/process` | Sync document extraction |
| POST | `/api/v1/ocr/deep-extract` | MinerU deep extraction |

### 30.2 OCR Job Handler

`ocr_job_handler(job_id, task_type, payload)`:

```python
if engine == "mineru" and mineru_available:
    try:
        markdown, layout, mode = await _extract_with_mineru(file_path, compute)
    except Exception:
        # Fallback to Chandra
        markdown, layout, mode = await _extract_with_chandra(file_path)
elif engine == "chandra":
    try:
        markdown, layout, mode = await _extract_with_chandra(file_path)
    except Exception:
        # Fallback to pdfplumber
        markdown, layout, mode = await _extract_with_pdf_fallback(file_path)
else:  # pdfplumber
    markdown, layout, mode = await _extract_with_pdf_fallback(file_path)
```

### 30.3 Resource Monitor

`ResourceMonitor` (in `resource_manager.py`) tracks:
- CPU percent (via `psutil`)
- RAM usage (available / total)
- Disk free space
- Active job count

`can_start_job(task_type)` returns `(True, None)` if resources are available, or `(False, reason)` if system is overloaded.

**Hardware profiles:** `LOW` / `MEDIUM` / `HIGH` — sets `max_concurrent_jobs` and `max_memory_per_job_mb`.

### 30.4 Job Queue

`job_queue.py` implements a simple async job queue:
- `add_job(job_id, task_type, payload, timeout_sec, file_size_mb)` — Enqueue
- `get_status(job_id)` — Return `JobStatus` object
- `set_progress(job_id, percent, remaining_sec)` — Update progress
- `cancel_job(job_id)` — Mark as cancelled
- `get_queue_stats()` — Return `{ total_jobs, current_processing, max_concurrent, queue_size }`

Job lifecycle: `pending` → `queued` → `waiting_resources` → `processing` → `completed` | `failed` | `cancelled` | `timeout`

### 30.5 Chandra Engine

`_extract_with_chandra_sync(file_path)` using `pypdfium2`:

```python
pdf = pdfium.PdfDocument(str(file_path))
for page_num in range(len(pdf)):
    page = pdf[page_num]
    textpage = page.get_textpage()
    page_text = textpage.get_text_range()
    img_count = sum(
        1 for _ in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_IMAGE])
    )
    # builds markdown with layout metadata
return markdown, layout_elements, "chandra_pypdfium2"
```

### 30.6 Health Response

```json
{
  "status": "healthy",
  "version": "1.2.2",
  "features": {
    "pdf_processing": true,
    "office_processing": true,
    "embeddings": false,
    "ocr": true,
    "ocr_fast": true,
    "ocr_balanced": true,
    "deep_extract": false,
    "deep_extract_gpu": false,
    "deep_extract_cpu": false,
    "mineru_version": null,
    "deep_extract_compute_reason": "no_nvidia_vram_info"
  }
}
```

---

*End of Feature Reference — Wrytica AI v1.2.2*  
*© 2024–2025 Arpan Guria · MIT License · [www.arpan-guria.in](https://www.arpan-guria.in/)*
