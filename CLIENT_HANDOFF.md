# Wrytica Client Handoff

This document is the shortest path from a fresh checkout to a working client demo.

## What Is Included

- Frontend writing tools: paraphrasing, grammar, summarization, citation, chat
- Knowledge Base: local document storage, folder import, PageIndex reasoning
- OCR and document extraction: browser OCR, backend OCR queue, deep extract via MinerU
- Backend health and stability monitoring

## Prerequisites

- Node.js 18+
- Python 3.11+ for backend OCR and document processing
- Windows PowerShell or Command Prompt

## One-Step Setup

Run one of these from the repo root:

```powershell
.\setup.ps1
```

Or:

```bat
setup.bat
```

This installs the frontend dependencies and prepares the backend runtime used for OCR and deep extract.

## Start the App

Frontend:

```bash
npm.cmd run dev
```

Backend:

```bash
npm.cmd run backend:start
```

## First-Run Verification

1. Open the app in the browser.
2. Go to Settings and confirm the backend status card shows connected.
3. Open OCR & Document Extraction and confirm the backend mode is available.
4. Open Knowledge Base and upload a PDF or folder.
5. Try OCR on a PDF and save the result into the Knowledge Base.

## Recommended Client Demo Flow

1. Show the main writing tools.
2. Show Knowledge Base import and PageIndex reasoning.
3. Show OCR processing with a small PDF.
4. Show Deep Extract in Settings if MinerU is installed.
5. Show that the app stays responsive while jobs run.

## OCR Setup Notes

- `Standard` mode uses the browser-first extraction path.
- `Deep Extract` uses the Python backend and MinerU when available.
- If the backend is offline, the app falls back to the browser flow.

## Knowledge Base Notes

- The Knowledge Base stores documents locally in the browser.
- Folder indexing can ingest text, Office files, and PDFs.
- Large PDFs can use backend extraction when the backend is available.

## Support Checklist

If something is not working, check these in order:

1. `http://localhost:8000/health`
2. Backend terminal logs
3. Browser devtools console
4. `Settings` backend status card

## Validation Completed

- TypeScript source check passed
- Python backend syntax check passed
- See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for final sign-off steps
- See [RUN_NOTE.md](RUN_NOTE.md) for the shortest startup reminder
- See [PACKAGING_READINESS.md](PACKAGING_READINESS.md) for delivery packaging guidance
- See [DEMO_NOTES.md](DEMO_NOTES.md) for screenshots and walkthrough notes
- See [CHANGELOG_CLIENT.md](CHANGELOG_CLIENT.md) for the concise delivery summary

## Useful Commands

```bash
npm.cmd run backend:setup
npm.cmd run backend:start
npm.cmd run dev
npm.cmd run build
```
