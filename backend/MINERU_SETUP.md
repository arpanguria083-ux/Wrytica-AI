# MinerU Setup

MinerU provides the Deep Extract path for structured PDF parsing.

## Install

Use the project script:

```powershell
npm run deep-extract:enable
```

Or install directly in the runtime venv:

```powershell
backend\.venv_runtime\Scripts\python.exe -m pip install -r backend\requirements.txt
backend\.venv_runtime\Scripts\python.exe -m pip install -r backend\requirements_mineru.txt
backend\.venv_runtime\Scripts\python.exe backend\install_mineru.py
```

The setup script now verifies `python -m pip --version` before reusing an existing runtime venv, so a half-installed or corrupted `pip` gets repaired by recreating the environment.

## Notes

- If LM Studio is using most of the GPU, the backend will prefer CPU fallback.
- If MinerU is unavailable, the backend falls back to standard PDF parsing.
- If `backend/.venv` is corrupted, the scripts automatically use `backend/.venv_runtime`.
