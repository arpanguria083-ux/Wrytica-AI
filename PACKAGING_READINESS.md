# Packaging Readiness

Use this when preparing a client delivery or demo build.

## Delivery Modes

### 1. Static web delivery

- Build the frontend with `npm.cmd run build`
- Deliver the `dist/` folder to a static host such as Netlify, Vercel, S3, or any web server
- Best when the client only needs browser-based writing tools and local browser storage

### 2. Local client delivery

- Deliver the repo with the backend scripts and setup notes
- Client runs `setup.ps1` or `setup.bat`
- Client starts frontend and backend locally
- Best when OCR, Deep Extract, and local Knowledge Base workflows are required

### 3. Hybrid delivery

- Provide the static frontend plus a separate backend setup package
- Best when the client wants simple frontend hosting now and local OCR later

## Pre-Delivery Checklist

- `npm.cmd run build` completes successfully in a normal developer environment
- `npm.cmd run backend:setup` prepares the backend runtime
- `npm.cmd run backend:start` starts the OCR backend
- `http://localhost:8000/health` responds as expected
- The client handoff docs are included:
  - [CLIENT_HANDOFF.md](CLIENT_HANDOFF.md)
  - [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)
  - [RUN_NOTE.md](RUN_NOTE.md)

## What To Include In A Delivery Zip

- `dist/` if you are shipping a static build
- `backend/`
- `scripts/`
- `setup.ps1`
- `setup.bat`
- `build.ps1`
- `build.bat`
- `README.md`
- `CLIENT_HANDOFF.md`
- `RELEASE_CHECKLIST.md`
- `RUN_NOTE.md`
- `CHANGELOG_CLIENT.md`

## Notes

- Keep the repo root intact so relative script paths continue to work.
- If OCR or Deep Extract is part of the delivery, make sure the backend instructions are included.
- If you are using a static host, note that backend-only features need a local backend or a separate server.

