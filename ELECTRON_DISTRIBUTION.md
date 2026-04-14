# Wrytica Desktop Distribution (Windows)

This project now builds a **standard installable Windows setup EXE** using `electron-builder` + NSIS.

## Output artifacts

Running:

```bash
npm run electron:build:win
```

produces:

- `dist-electron-release/Wrytica-Setup-<version>.exe` → **Installer for end users**
- `dist-electron-release/win-unpacked/` → unpacked app folder (debug/testing)

Optional portable build:

```bash
npm run electron:build:win:portable
```

## Installer behavior (NSIS)

- Wizard-based installer (`oneClick: false`)
- User can choose install directory
- Desktop and Start menu shortcuts created
- Can run app after install
- Uninstall keeps user data by default (`deleteAppDataOnUninstall: false`)

## What users need

Users only need to run:

- `Wrytica-Setup-<version>.exe`

No manual Node/Python install is required because app runtime + backend resources are bundled.

## Production recommendations before public sharing

1. Set real metadata in `package.json`
   - `version`
   - `author`
   - `description`
2. Add app icon assets in `build/` and reference them in `electron-builder.json`
3. Code-sign installer and app executable to reduce SmartScreen warnings
4. Validate on a clean Windows VM (no dev dependencies installed)
5. Create release notes with known limitations (e.g., deep extract model availability)
