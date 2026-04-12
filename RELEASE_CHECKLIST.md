# Wrytica Release Checklist

Use this before handing the project to a client or packaging a demo build.

## Core Verification

- Confirm the frontend opens with `npm.cmd run dev`
- Confirm the backend opens with `npm.cmd run backend:start`
- Confirm `http://localhost:8000/health` returns a healthy response
- Confirm Settings shows backend readiness and OCR status
- Confirm OCR can process a PDF and save into the Knowledge Base

## Feature Verification

- Paraphraser works with the selected provider
- Grammar checker returns results without crashing
- Summarizer returns text in both short and long formats
- Citation generator returns a citation and BibTeX output
- Chat and memo features still respond with saved context
- Knowledge Base import works for text, PDF, and folder inputs
- Deep Extract remains optional and falls back cleanly when unavailable

## Stability Verification

- Long-running OCR jobs keep the UI responsive
- Canceling a job does not break the job queue
- Large PDFs do not freeze the browser
- Memory warning cards in the UI still behave correctly
- Backend temp files are cleaned up after processing

## Packaging Verification

- [CLIENT_HANDOFF.md](CLIENT_HANDOFF.md) is included in the delivery package
- [README.md](README.md) points to the client handoff instructions
- [setup.ps1](setup.ps1) and [setup.bat](setup.bat) are present
- [build.ps1](build.ps1) and [build.bat](build.bat) are present

## Final Sign-Off

- Run a final smoke test on the demo flow
- Capture screenshots of the main tools if needed
- Share the client handoff note with the delivery team
- Record any environment-specific caveats, especially on Windows

