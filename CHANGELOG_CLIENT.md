# Client Changelog

This is a concise summary of the current delivery-ready state.

## Added

- One-step setup scripts for Windows: `setup.ps1` and `setup.bat`
- Client handoff documentation with setup, demo, and support guidance
- Release checklist for final sign-off
- Run note for quick startup reminders
- Packaging readiness guidance for delivery planning
- Demo notes for screenshots and client walkthroughs

## Improved

- Backend deep-extract flow now aligns with the API response schema
- OCR job status mapping now matches the backend lifecycle
- Build and backend docs now point to the current setup flow
- Visible Settings and OCR copy is cleaner and more client-facing

## Verified

- TypeScript source validation passes
- Python backend syntax validation passes

## Known Environment Note

- The Windows Vite/Vitest `spawn EPERM` issue remains environment-specific in this sandbox and is not a source-code regression.

