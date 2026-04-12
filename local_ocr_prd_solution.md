# Product Requirements Document and Solution Design
## Local PDF OCR and Document Extraction Workbench

## Executive Summary
This document defines a product and solution architecture for a local-first PDF OCR and document extraction workbench intended for consultant laptops, including 16 GB RAM Windows/Linux laptops and Apple M1/M2 series laptops.[cite:13][cite:18][cite:21][cite:22][cite:25][cite:30] The recommended baseline architecture uses Chandra OCR 2 as the primary OCR engine, LM Studio-hosted local vision/language models for reasoning and post-processing, and MinerU or selected PDF-Extract-Kit components only where advanced layout, table, or formula extraction is required.[cite:13][cite:18][cite:21][cite:22][cite:25][cite:30]

The core recommendation is to avoid a heavy all-in-one research-style document parsing stack on 16 GB class machines unless the use case specifically requires high-fidelity table, formula, and layout reconstruction across complex PDFs.[cite:21][cite:22][cite:25] Chandra is better aligned with constrained hardware because it supports structured OCR outputs such as Markdown, HTML, and JSON, and is documented for Apple Silicon and CPU-oriented usage patterns that fit consultant laptops more realistically.[cite:9][cite:13][cite:30]

## Background and Context
The target user needs a local OCR capability inspired by repositories such as PDF-Extract-Kit and Chandra, while also leveraging LM Studio with local Gemma and DeepSeek vision-enabled models for downstream intelligence tasks.[cite:11][cite:13][cite:21] PDF-Extract-Kit is a modular toolkit composed of multiple specialized sub-systems for layout detection, formula detection, formula recognition, OCR, and table recognition, which makes it functionally rich but operationally heavier.[cite:21] Chandra, by contrast, is positioned as an OCR model that preserves document structure and outputs Markdown, HTML, and JSON more directly, which better matches a lightweight deployment objective.[cite:9][cite:13]

The solution must therefore balance five constraints: local execution, limited memory, structured extraction quality, operational simplicity, and compatibility with both x86 laptops and Apple Silicon machines.[cite:13][cite:22][cite:25][cite:30] This product is designed as a practical workbench for business users, analysts, and consultants handling scanned reports, invoices, presentations, contracts, and research PDFs in offline or privacy-sensitive environments.[cite:13][cite:22][cite:30]

## Product Vision
The product will provide a local-first desktop workbench that can ingest PDFs and images, classify the document type, run the most suitable OCR and extraction path, and produce business-ready outputs including searchable text, Markdown, HTML, JSON, tables, and summary artifacts.[cite:9][cite:13][cite:22][cite:25] It will optimize for dependable performance on 16 GB RAM laptops, while preserving an upgrade path for higher-end hardware and optional advanced extraction modules.[cite:22][cite:25][cite:30]

## Product Goals
- Deliver accurate OCR and structured extraction for common consultant workflows such as due diligence reports, decks, invoices, contracts, and scanned documents.[cite:13][cite:22][cite:25]
- Operate locally on 16 GB RAM laptops and Apple M1/M2 class machines without requiring cloud inference for the core workflow.[cite:22][cite:25][cite:30]
- Provide a modular architecture where OCR, layout parsing, and reasoning are separated so that heavy components are only invoked when necessary.[cite:13][cite:21][cite:22]
- Support privacy-sensitive use cases by keeping documents on-device unless the user explicitly exports them.[cite:22][cite:25]
- Produce outputs that are easy to consume in analyst workflows: Markdown, HTML, JSON, plain text, CSV-like table export, and optional summaries.[cite:9][cite:13]

## Non-Goals
- The first release will not target enterprise-scale distributed processing or server-based fleet orchestration.[cite:22][cite:25]
- The first release will not attempt perfect reproduction of all academic PDF edge cases, especially where advanced formula and table reconstruction depend on heavier specialized models from PDF-Extract-Kit.[cite:21]
- The first release will not rely on a large local multimodal model as the sole OCR engine, because that would reduce determinism and hardware efficiency on target machines.[cite:13][cite:21][cite:30]

## User Personas
### Management Consultant
This user works on client reports, market studies, board decks, scanned appendices, and financial documents, and needs fast OCR plus structured extraction into Markdown or JSON for downstream analysis.[cite:13][cite:22][cite:25] The user values local execution, document confidentiality, and usable output over research-benchmark completeness.[cite:22][cite:25]

### M&A / FDD Analyst
This user processes contracts, invoices, legal appendices, CIMs, diligence packs, and financial statements, and needs page-wise OCR, searchable content, table capture, and extraction of key data points into review workflows.[cite:13][cite:21][cite:22] The user often benefits from a second-stage reasoning model that can identify clauses, obligations, customer names, or financial metrics once OCR is complete.[cite:13]

### Research / Knowledge Worker
This user works with scanned papers, policy documents, and multilingual reports, and needs robust OCR with layout awareness, section preservation, and the option to summarize or query results using a local model.[cite:9][cite:13][cite:30]

## Problem Statement
Existing local OCR options tend to fall into two extremes: lightweight OCR tools that lose structure, and heavyweight research pipelines that are difficult to install, slow on laptops, and dependent on multiple model downloads and libraries.[cite:13][cite:21][cite:22] Consultant-class laptops, especially 16 GB RAM machines and Apple M1/M2 laptops, need a middle path that provides structured OCR and selective advanced parsing without overwhelming memory, CPU, or installation complexity.[cite:22][cite:25][cite:30]

## Functional Requirements
### Core Ingestion
- Upload or watch local PDF and image files.[cite:22][cite:25]
- Support scanned PDFs, born-digital PDFs, PNG, JPG, and TIFF inputs.[cite:13][cite:22]
- Perform basic file validation, page count estimation, and document metadata capture.[cite:22][cite:25]

### OCR and Extraction
- Extract text from PDFs and images into plain text, Markdown, HTML, and JSON outputs.[cite:9][cite:13]
- Preserve page segmentation and reading order for standard business documents.[cite:9][cite:13]
- Support page-level fallback logic when one extraction path fails.[cite:22][cite:25]
- Allow user selection between fast mode, balanced mode, and advanced mode.[cite:13][cite:21][cite:22]

### Advanced Parsing
- Detect whether a document likely contains dense tables, formulas, or complex layouts.[cite:21][cite:25]
- Route eligible files to MinerU pipeline or selected PDF-Extract-Kit-derived modules where the user opts into advanced extraction.[cite:21][cite:22][cite:25]
- Export tables as structured JSON and CSV-compatible output when recoverable.[cite:21][cite:25]

### Post-Processing with Local Models
- Allow LM Studio-hosted Gemma or DeepSeek vision/language models to summarize OCR text, classify documents, extract key fields, answer questions, and normalize output formats.[cite:13][cite:30]
- Keep reasoning models optional and asynchronous so OCR remains usable even when local LLM inference is disabled.[cite:13][cite:30]

### User Interface
- Provide a desktop UI with queue management, per-document status, output preview, and export actions.[cite:22][cite:25]
- Show extracted text side-by-side with source pages where feasible.[cite:9][cite:13]
- Offer presets such as Invoice, Contract, Report, Deck, Research Paper, and General Scan.[cite:21][cite:25]

### Logging and Diagnostics
- Capture processing mode, engine selected, elapsed time, failure points, and output confidence proxies where available.[cite:22][cite:25]
- Provide troubleshooting hints such as “switch to advanced mode for tables” or “split 300-page PDF into batches.”[cite:22][cite:25][cite:30]

## Non-Functional Requirements
### Performance
The system should process small and medium business PDFs reliably on 16 GB RAM devices, with graceful degradation for large documents through batching and page-range execution.[cite:19][cite:22][cite:25][cite:30] CPU-only operation must remain supported for Apple Silicon and non-GPU consultant laptops, even if throughput is lower than dedicated GPU systems.[cite:19][cite:22][cite:25][cite:30]

### Privacy
All core OCR and extraction functions must run locally without mandatory cloud calls.[cite:22][cite:25] Export, sharing, and sync must be user-triggered and disabled by default.[cite:22][cite:25]

### Reliability
The system should preserve original inputs, create deterministic output directories, and isolate failures to specific documents or pages rather than halting the full queue.[cite:22][cite:25]

### Portability
The application must support Windows, macOS Apple Silicon, and Linux where underlying model packages permit, with a preferred support focus on macOS Apple Silicon and mainstream Windows laptops.[cite:21][cite:22][cite:25][cite:30]

## Scope by Release
### Release 1: Balanced OCR Workbench
- Chandra OCR 2 integration as primary engine.[cite:13][cite:18]
- PDF/image ingestion, queueing, per-file OCR, and export to text/Markdown/HTML/JSON.[cite:9][cite:13]
- LM Studio integration for summarization, document classification, field extraction, and Q&A.[cite:13][cite:30]
- Batch sizing and page-splitting for 16 GB devices.[cite:19][cite:22][cite:25]

### Release 2: Advanced Parsing Pack
- MinerU pipeline integration for complex documents.[cite:22][cite:25]
- Table and formula aware routing logic.[cite:21][cite:25]
- Enhanced extraction templates for invoice, contract, diligence report, and research paper classes.[cite:21][cite:22][cite:25]

### Release 3: Analyst Automation
- Bulk extraction jobs, watch folders, metadata indexing, and semantic search over extracted outputs.[cite:13][cite:22]
- Optional local vector index for document retrieval if hardware permits.[cite:13]

## Option Assessment
| Option | Strengths | Weaknesses | Fit for 16 GB laptop |
|---|---|---|---|
| Chandra OCR 2 | Structured OCR output in Markdown/HTML/JSON, simpler usage path, tested on Apple Silicon, CPU-usable.[cite:9][cite:13][cite:30] | Less specialized than full research pipeline for formulas and complex tables.[cite:21] | Best default choice.[cite:13][cite:30] |
| PDF-Extract-Kit | Rich modular capabilities for layout, formulas, OCR, and table recognition.[cite:21] | Heavier install, multiple components, more model downloads, more engineering complexity.[cite:21] | Poor default, use selectively.[cite:21] |
| MinerU | Higher-level document extraction pipeline with 16 GB+ minimum memory guidance and CPU support.[cite:22][cite:25] | Heavier than Chandra and slower on consultant laptops for large PDFs.[cite:22][cite:25] | Good optional advanced mode.[cite:22][cite:25] |
| LM Studio VLM only | Flexible prompting and easy local integration if already installed.[cite:30] | Less deterministic and less document-specialized as primary OCR.[cite:13][cite:21] | Good post-processing layer, weak primary OCR.[cite:13][cite:21] |

## Recommended Product Strategy
The recommended strategy is a three-layer architecture: Chandra as the default OCR engine, MinerU as an optional advanced extraction path for complex documents, and LM Studio local models as post-processing intelligence for summarization, classification, and data extraction.[cite:13][cite:22][cite:25][cite:30] This architecture minimizes resource consumption on 16 GB laptops while preserving a path to more accurate handling of difficult layouts when explicitly needed.[cite:22][cite:25][cite:30]

## Solution Architecture
### Layer 1: Ingestion and Orchestration
The orchestration layer handles file intake, page splitting, job queueing, and routing decisions.[cite:22][cite:25] It inspects document size, estimated complexity, and user-selected mode to decide between the default Chandra path and the advanced MinerU/PDF-Extract-Kit path.[cite:21][cite:22][cite:25]

### Layer 2: OCR and Structure Extraction
The primary extraction engine is Chandra OCR 2, which produces structured outputs that are directly useful in analyst workflows.[cite:9][cite:13] For complex documents with tables or formulas, the system can optionally invoke MinerU pipeline or selected PDF-Extract-Kit components, accepting slower runtimes in exchange for richer parsing.[cite:21][cite:22][cite:25]

### Layer 3: Intelligence and Normalization
LM Studio-hosted Gemma or DeepSeek local models consume OCR output rather than raw pages by default, allowing lower memory pressure and better task specialization.[cite:13][cite:30] This layer performs document summarization, data-point extraction, question answering, section labeling, clause extraction, and normalization into predefined schemas.[cite:13][cite:30]

## High-Level Workflow
1. User imports a PDF or image set.[cite:22][cite:25]
2. System reads page count, file size, and simple document heuristics.[cite:22][cite:25]
3. Router selects Fast, Balanced, or Advanced mode.[cite:21][cite:22][cite:25]
4. Chandra runs by default; MinerU or advanced modules run only where triggered.[cite:13][cite:22][cite:25]
5. Structured output is saved as Markdown, HTML, JSON, and text.[cite:9][cite:13]
6. Optional LM Studio post-processing enriches the output with summaries, extracted fields, or Q&A artifacts.[cite:13][cite:30]
7. User reviews output, exports files, or retries with another mode.[cite:22][cite:25]

## Routing Logic
### Fast Mode
Fast mode targets standard business PDFs, decks, and simple scans, using Chandra only and minimal post-processing.[cite:13][cite:30] This mode is the recommended default for 16 GB RAM laptops.[cite:19][cite:22][cite:25][cite:30]

### Balanced Mode
Balanced mode uses Chandra plus optional LM Studio post-processing for better structural cleanup, document classification, and extraction of target fields.[cite:13][cite:30] This mode should be the default preset for consultant workflows involving reports, contracts, and invoices.[cite:13][cite:30]

### Advanced Mode
Advanced mode is used only when the document is table-heavy, contains formulas, or has a complex multi-column scientific or technical layout, and it can invoke MinerU or selected PDF-Extract-Kit-style modules.[cite:21][cite:22][cite:25] The UI should warn users that advanced mode increases runtime and memory pressure on 16 GB systems.[cite:22][cite:25]

## Deployment Architecture
### Local Desktop App
A desktop application is the preferred deployment model because it can bundle runtime checks, manage output directories, and integrate cleanly with LM Studio running on localhost.[cite:13][cite:30] The app can be implemented as an Electron, Tauri, or Python desktop shell depending on the team’s stack preference, though the architecture itself is agnostic to the shell.[cite:13]

### Local Services
- OCR service wrapper around Chandra CLI or Python API.[cite:13][cite:18]
- Optional advanced parser wrapper around MinerU pipeline.[cite:22][cite:25]
- Local LM connector for LM Studio HTTP endpoints.[cite:13][cite:30]
- File storage and job metadata database using lightweight local persistence such as SQLite.[cite:13]

## Hardware Strategy
### 16 GB RAM Windows/Linux Laptop
This is the primary design point for the product.[cite:19][cite:22][cite:25] The system should default to Chandra CPU or small-GPU operation, small batches, and page chunking, while disabling advanced parsing unless explicitly chosen.[cite:19][cite:22][cite:25]

### Apple M1/M2 Consultant Laptop
Apple Silicon machines are a strong fit for the recommended architecture because Chandra is documented for Apple Silicon usage and CPU-only workflows remain supported.[cite:13][cite:30] M1 Pro or M2 Pro devices with 16 GB to 32 GB unified memory can also run the advanced pipeline more comfortably, though Chandra should still remain the default due to simplicity and responsiveness.[cite:22][cite:25][cite:30]

## Detailed Requirements by Module
### Ingestion Module
- Drag-and-drop import.[cite:22][cite:25]
- Folder import and watched folder option for Release 2.[cite:22][cite:25]
- PDF split by page range for very large files.[cite:22][cite:25]

### OCR Module
- Chandra primary integration.[cite:13][cite:18]
- Configurable page concurrency.[cite:19][cite:30]
- Output folder per document with normalized file naming.[cite:13]

### Advanced Parsing Module
- Complexity classifier to identify likely table/formula/layout-heavy PDFs.[cite:21][cite:25]
- Optional MinerU invocation.[cite:22][cite:25]
- Failover to plain OCR if advanced parsing errors out.[cite:22][cite:25]

### Post-Processing Module
- Summary generation.[cite:13][cite:30]
- Schema extraction templates: invoice fields, contract clauses, diligence checklist items, report metadata.[cite:13][cite:30]
- Natural-language query over OCR output.[cite:13]

### Export Module
- Export to TXT, Markdown, HTML, JSON.[cite:9][cite:13]
- Optional CSV export for recognized tables when structured output exists.[cite:21][cite:25]
- Copy to clipboard and save-as actions.[cite:13]

## Data Model
Each document record should include source path, checksum, page count, import timestamp, selected mode, engine used, processing duration, output paths, and failure status if any.[cite:22][cite:25] Each page record should include page number, engine path used, OCR status, and links to output fragments for debugging and review.[cite:22][cite:25]

## API / Service Contracts
### OCR Request
Input should include document path, page range, mode, output formats, and optional document type hints.[cite:13][cite:22][cite:25] Output should include status, output file paths, page-level diagnostics, and a suggested next step when fallback or retry is advisable.[cite:22][cite:25]

### Post-Processing Request
Input should include extracted OCR text or structured JSON, selected prompt template, and chosen LM Studio model endpoint.[cite:13][cite:30] Output should include extracted structured fields, summaries, or answers with provenance back to page numbers where feasible.[cite:13][cite:30]

## Security and Privacy Considerations
The system must keep all source files and outputs on local disk by default and should never transmit content externally unless the user explicitly enables an export or connector.[cite:22][cite:25] Logs should avoid storing raw confidential text unless diagnostic mode is enabled by the user.[cite:22][cite:25]

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Large PDFs overwhelm 16 GB RAM devices. | Slowdowns or crashes. | Enforce chunking, page batching, and warnings for 200+ page jobs.[cite:19][cite:22][cite:25][cite:30] |
| Users expect perfect table and formula extraction in all cases. | Dissatisfaction with default mode. | Clear mode guidance and advanced-mode escalation to MinerU/PDF-Extract-Kit path.[cite:21][cite:22][cite:25] |
| LM Studio model concurrency causes memory pressure. | OCR and inference both slow down. | Run post-processing after OCR completion and recommend smaller local models on 16 GB devices.[cite:13][cite:30] |
| Installation complexity from multiple dependencies. | High support burden. | Keep Chandra as default and package advanced modules as optional add-ons.[cite:13][cite:21][cite:22] |
| Apple Silicon package incompatibilities. | User friction on Mac. | Prioritize tested Apple Silicon path using Chandra and CPU-compatible modules first.[cite:13][cite:30] |

## Success Metrics
- OCR completion rate for supported files.[cite:13][cite:22]
- Median processing time by document size band on 16 GB machines.[cite:19][cite:22][cite:25]
- Percentage of documents successfully handled in default mode without needing advanced mode.[cite:13][cite:22]
- User-rated usefulness of Markdown/JSON output for downstream workflows.[cite:9][cite:13]
- Rate of failed advanced parsing jobs versus successful fallback completion.[cite:22][cite:25]

## Acceptance Criteria
### Release 1 Acceptance
- User can import a PDF and receive Markdown, HTML, JSON, and text output locally using Chandra.[cite:9][cite:13]
- System runs on a 16 GB RAM laptop without mandatory cloud dependencies.[cite:22][cite:25][cite:30]
- User can optionally send extracted content to an LM Studio endpoint for summary or structured field extraction.[cite:13][cite:30]
- Application handles failures gracefully and preserves partial outputs.[cite:22][cite:25]

### Release 2 Acceptance
- User can opt into advanced parsing for complex documents and receive improved table/layout extraction where supported.[cite:21][cite:22][cite:25]
- System warns appropriately about runtime and memory trade-offs before running advanced mode.[cite:22][cite:25]

## Implementation Roadmap
### Phase 1: Foundations
- Build ingestion and queue framework.[cite:22][cite:25]
- Integrate Chandra OCR 2.[cite:13][cite:18]
- Define output schemas and local storage layout.[cite:9][cite:13]

### Phase 2: Business Workflow Features
- Add document presets and per-document routing.[cite:21][cite:25]
- Add LM Studio integrations for summary, extraction, and Q&A.[cite:13][cite:30]
- Add basic review UI and export actions.[cite:13]

### Phase 3: Advanced Extraction
- Integrate MinerU pipeline as optional advanced mode.[cite:22][cite:25]
- Add complexity heuristics for routing technical and table-heavy documents.[cite:21][cite:25]
- Tune fallback behaviors and failure handling.[cite:22][cite:25]

## Final Recommendation
The best product for the stated requirement is not a direct recreation of PDF-Extract-Kit in its full modular form, but a pragmatic local workbench centered on Chandra OCR 2, augmented by LM Studio for intelligence tasks and MinerU for selectively invoked advanced parsing.[cite:13][cite:21][cite:22][cite:25][cite:30] This design best matches the realities of 16 GB RAM laptops and Apple M1/M2 consultant devices while still preserving a path toward richer PDF extraction capabilities when specific documents justify the heavier pipeline.[cite:22][cite:25][cite:30]
