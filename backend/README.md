# Wrytica Backend

Local FastAPI backend for document processing, embeddings, and Deep Extract PDF parsing.

## Files

- `main.py` - FastAPI app
- `requirements.txt` - core backend dependencies
- `requirements_mineru.txt` - Deep Extract dependencies
- `install_mineru.py` - MinerU installer helper

## Quick Start

From the repo root:

```powershell
.\setup.ps1
.\setup.bat
```

Then start the backend:

```powershell
npm.cmd run backend:start
```

Or manually:

```powershell
backend\.venv_runtime\Scripts\python.exe -m pip install -r backend\requirements.txt
backend\.venv_runtime\Scripts\python.exe -m pip install -r backend\requirements_mineru.txt
backend\.venv_runtime\Scripts\python.exe backend\install_mineru.py
backend\.venv_runtime\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

If the runtime venv is corrupted, rerun `npm.cmd run deep-extract:enable`; it now checks `python -m pip --version` and recreates the venv when `pip` itself is broken.

## Health Check

```powershell
Invoke-RestMethod http://localhost:8000/health
```

Look for:

- `features.deep_extract`
- `features.deep_extract_gpu`
- `features.deep_extract_cpu`
- `features.mineru_version`
