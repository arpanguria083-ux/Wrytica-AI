# Wrytica Run Note

Quick reminder for anyone starting the project locally.

## Start Sequence

1. From the repo root, run `.\setup.ps1` or `setup.bat`.
2. Start the frontend with `npm.cmd run dev`.
3. Start the backend with `npm.cmd run backend:start`.
4. Open the app in the browser.

## What To Check First

- Settings shows the backend as connected
- OCR and Knowledge Base screens open without errors
- `http://localhost:8000/health` loads successfully
- A small PDF can be processed and saved into the Knowledge Base

## If Something Fails

- Check the backend terminal first
- Check the browser console second
- Rerun `npm.cmd run backend:setup` if Deep Extract needs repair
- Use the client handoff notes in [CLIENT_HANDOFF.md](CLIENT_HANDOFF.md)

