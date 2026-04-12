# Electron Readiness

This repo is not converted to Electron yet, but the app now has the seams needed to do it cleanly.

## What is already prepared

- Backend URL resolution is no longer tied only to hardcoded `localhost`
- A runtime config object can be injected with `window.__WRYTICA_RUNTIME__`
- A placeholder `public/runtime-config.js` is loaded before the app boots
- The backend can be installed and started through local scripts instead of manual shell steps

## Recommended Electron architecture

1. Main process starts the FastAPI backend as a child process.
2. Main process writes runtime values into the preload bridge.
3. Preload sets `window.__WRYTICA_RUNTIME__ = { backendUrl, desktop: true }`.
4. React app keeps using the same API layer with no per-page special cases.

## Next implementation steps

1. Add `electron/main.ts` to spawn the backend and BrowserWindow.
2. Add `electron/preload.ts` to expose runtime config and safe file dialogs.
3. Replace browser-only folder APIs with a desktop abstraction so Electron can use native folder selection.
4. Package the backend venv or switch to a bundled Python executable for desktop distribution.

## Why this matters

The heavy document-processing and deep-extract paths belong on the desktop side. Electron lets us keep the React UI while moving backend startup and local file orchestration out of the browser.
