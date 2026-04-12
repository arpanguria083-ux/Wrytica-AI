param(
  [switch]$SetupOnly,
  [switch]$NoInstall,
  [switch]$RecreateVenv
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$runtimeVenvPointerFile = Join-Path $backendDir ".runtime_venv_path.txt"
$runtimeVenvDir = Join-Path $backendDir ".venv_runtime"
$pythonExe = Join-Path $runtimeVenvDir "Scripts\python.exe"
$healthUrl = "http://127.0.0.1:8000/health"

function Write-Step($message) {
  Write-Host "[Wrytica] $message" -ForegroundColor Cyan
}

function Invoke-CheckedPython {
  param(
    [string[]]$Arguments,
    [string]$Description
  )

  & $pythonExe @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Description failed with exit code $LASTEXITCODE."
  }
}

function Set-RuntimeVenv($targetDir) {
  $script:runtimeVenvDir = $targetDir
  $script:pythonExe = Join-Path $script:runtimeVenvDir "Scripts\python.exe"
}

function Test-PythonModulesAvailable {
  param(
    [string[]]$Modules
  )

  if (-not (Test-Path $pythonExe)) {
    return $false
  }

  $checkScript = "import importlib.util, sys; missing = [m for m in sys.argv[1:] if importlib.util.find_spec(m) is None]; print('|'.join(missing)); sys.exit(0 if not missing else 1)"
  $missingModules = & $pythonExe -c $checkScript @Modules 2>$null
  if ($LASTEXITCODE -eq 0) {
    return $true
  }

  if ($missingModules) {
    Write-Step "Missing Python modules in runtime env: $missingModules"
  }
  return $false
}

function Load-PreferredRuntimeVenv {
  if (Test-Path $runtimeVenvPointerFile) {
    $savedPath = (Get-Content $runtimeVenvPointerFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if ($savedPath -and (Test-Path $savedPath)) {
      Set-RuntimeVenv $savedPath
      return
    }
  }

  $existingRuntimeVenv = Get-ChildItem $backendDir -Directory -Filter ".venv_runtime*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($existingRuntimeVenv) {
    Set-RuntimeVenv $existingRuntimeVenv.FullName
    return
  }

  Set-RuntimeVenv (Join-Path $backendDir ".venv_runtime")
}

function Save-PreferredRuntimeVenv {
  Set-Content -Path $runtimeVenvPointerFile -Value $runtimeVenvDir -Encoding ASCII
}

function New-RuntimeVenvPath {
  return (Join-Path $backendDir (".venv_runtime_" + (Get-Date -Format "yyyyMMdd_HHmmss")))
}

function Get-UvExe {
  # Check PATH first, then the standard uv install location
  $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
  if ($uvCmd) { return $uvCmd.Source }

  $knownPaths = @(
    (Join-Path $env:USERPROFILE ".local\bin\uv.exe"),
    (Join-Path $env:LOCALAPPDATA "uv\bin\uv.exe"),
    (Join-Path $env:APPDATA "uv\bin\uv.exe")
  )
  foreach ($p in $knownPaths) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Get-HostPython {
  $uvPythonRoots = @(
    (Join-Path $env:APPDATA "uv\python\cpython-3.12.12-windows-x86_64-none\python.exe"),
    (Join-Path $env:APPDATA "uv\python\cpython-3.12-windows-x86_64-none\python.exe")
  )
  foreach ($candidate in $uvPythonRoots) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd) {
    return $pythonCmd.Source
  }

  throw "Python 3 was not found on PATH."
}

function Stop-ProcessesUsingRuntimeVenv {
  $normalizedBackendDir = $backendDir.ToLowerInvariant()
  $pythonProcesses = Get-Process python -ErrorAction SilentlyContinue

  foreach ($process in $pythonProcesses) {
    try {
      $processPath = $process.Path
      if (
        $processPath -and
        $processPath.ToLowerInvariant().StartsWith($normalizedBackendDir) -and
        $processPath.ToLowerInvariant().Contains("\.venv_runtime")
      ) {
        Write-Step "Stopping backend runtime process $($process.Id)..."
        Stop-Process -Id $process.Id -Force
      }
    } catch {
      # Ignore inaccessible/already-closed processes
    }
  }
}

function Remove-RuntimeVenvIfPresent {
  if (-not (Test-Path $runtimeVenvDir)) {
    return $true
  }

  Stop-ProcessesUsingRuntimeVenv
  Write-Step "Removing backend runtime virtual environment..."

  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      # Use cmd rd /s /q which handles Windows file locks better than Remove-Item
      cmd /c rd /s /q "`"$runtimeVenvDir`"" 2>$null
      if (-not (Test-Path $runtimeVenvDir)) {
        return $true
      }
      throw "Directory still exists after rd /s /q"
    } catch {
      if ($attempt -eq 3) {
        return $false
      }
      Start-Sleep -Seconds 2
    }
  }
}

function Test-RuntimeVenvHealthy {
  if (-not (Test-Path $pythonExe)) {
    return $false
  }

  try {
    # Only check that the Python binary runs — avoid importing ensurepip
    # which internally spawns a subprocess that Windows Defender freezes.
    & $pythonExe -c "import sys; print(sys.version)" 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Ensure-RuntimeVenv {
  Load-PreferredRuntimeVenv

  if ($RecreateVenv) {
    if (-not (Remove-RuntimeVenvIfPresent)) {
      Write-Step "Could not delete the current runtime venv. Creating a fresh runtime venv instead..."
      Set-RuntimeVenv (New-RuntimeVenvPath)
    }
  }

  if (Test-RuntimeVenvHealthy) {
    return
  }

  if (Test-Path $runtimeVenvDir) {
    Write-Step "Runtime venv not healthy, recreating..."
    if (-not (Remove-RuntimeVenvIfPresent)) {
      Write-Step "Current runtime venv is locked. Creating a fresh runtime venv instead..."
      Set-RuntimeVenv (New-RuntimeVenvPath)
    }
  }

  Write-Step "Creating backend runtime virtual environment..."

  # Prefer uv venv — it's 10-100x faster than python -m venv and avoids
  # Windows Defender scan stalls during venv creation.
  $uvExe = Get-UvExe
  $hostPython = Get-HostPython
  if ($uvExe) {
    & $uvExe venv --python $hostPython $runtimeVenvDir
    if ($LASTEXITCODE -ne 0) {
      throw "uv venv creation failed with exit code $LASTEXITCODE."
    }
  } else {
    & $hostPython -m venv $runtimeVenvDir
    if ($LASTEXITCODE -ne 0) {
      throw "python -m venv creation failed with exit code $LASTEXITCODE."
    }
  }
}

function Install-PipPackagesWithRetry {
  param(
    [string[]]$Packages,
    [string]$Description,
    [string[]]$RequiredModules = @(),
    [int]$MaxAttempts = 3
  )

  $uvExe = Get-UvExe

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      Write-Step "$Description (attempt $attempt/$MaxAttempts)..."
      if ($uvExe) {
        # uv pip is significantly faster than pip and avoids Defender stalls
        & $uvExe pip install --python $pythonExe @Packages
        if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
      } else {
        Invoke-CheckedPython -Arguments (@("-m", "pip", "install", "--disable-pip-version-check") + $Packages) -Description $Description
      }

      if ($RequiredModules.Count -gt 0 -and -not (Test-PythonModulesAvailable -Modules $RequiredModules)) {
        throw "$Description completed but required modules are still missing."
      }

      return
    } catch {
      if ($attempt -ge $MaxAttempts) {
        throw
      }

      Write-Step "$Description did not complete cleanly. Retrying shortly..."
      Stop-ProcessesUsingRuntimeVenv
      Start-Sleep -Seconds 2
    }
  }
}

function Install-BackendDependencies {
  Write-Step "Installing backend requirements into .venv_runtime..."
  Stop-ProcessesUsingRuntimeVenv
  # ensurepip is not needed: uv venv bundles pip, and python -m venv in
  # Python 3.12 includes pip by default. Running ensurepip hangs on Windows
  # Defender real-time scanning.
  Install-PipPackagesWithRetry -Packages @("fastapi==0.115.0") -Description "FastAPI install" -RequiredModules @("fastapi")
  Install-PipPackagesWithRetry -Packages @("uvicorn[standard]==0.32.0", "python-multipart==0.0.12") -Description "Uvicorn and multipart install" -RequiredModules @("uvicorn")
  Install-PipPackagesWithRetry -Packages @("PyPDF2==3.0.1", "pdfplumber==0.11.0") -Description "PDF parser install" -RequiredModules @("PyPDF2", "pdfplumber")
  Install-PipPackagesWithRetry -Packages @("python-docx==1.1.2", "openpyxl==3.1.5", "python-pptx==1.0.0") -Description "Office parser install" -RequiredModules @("docx", "openpyxl", "pptx")
  Install-PipPackagesWithRetry -Packages @("psutil>=5.9.0") -Description "System monitor install" -RequiredModules @("psutil")
  Install-PipPackagesWithRetry -Packages @("pypdfium2>=4.0.0") -Description "Chandra OCR engine install" -RequiredModules @("pypdfium2")

  if (-not (Test-PythonModulesAvailable -Modules @("fastapi", "uvicorn", "pdfplumber", "PyPDF2", "docx", "openpyxl", "pptx", "psutil", "pypdfium2"))) {
    throw "Core backend dependencies are still missing after installation."
  }

  Save-PreferredRuntimeVenv

  try {
    Write-Step "Installing MinerU support..."
    Invoke-CheckedPython -Arguments @("-m", "pip", "install", "-r", (Join-Path $backendDir "requirements_mineru.txt")) -Description "MinerU dependency install"
    Invoke-CheckedPython -Arguments @((Join-Path $backendDir "install_mineru.py")) -Description "MinerU package install"
  } catch {
    Write-Host "[Wrytica] MinerU installation did not complete. Core backend is still usable, but Deep Extract may stay unavailable until MinerU finishes installing." -ForegroundColor Yellow
  }
}

function Stop-ExistingBackend {
  $connections = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    return
  }

  foreach ($connection in $connections) {
    try {
      $process = Get-Process -Id $connection.OwningProcess -ErrorAction Stop
      Write-Step "Stopping existing backend process $($process.Id) on port 8000..."
      Stop-Process -Id $process.Id -Force
    } catch {
      # Ignore missing/terminated processes
    }
  }
}

function Start-Backend {
  Stop-ExistingBackend
  Write-Step "Starting backend on http://127.0.0.1:8000 ..."
  Start-Process -FilePath $pythonExe -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000" -WorkingDirectory $backendDir | Out-Null
}

function Wait-ForHealth {
  Write-Step "Waiting for backend health check..."
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 5
      return $response
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "Backend did not become healthy in time."
}

Push-Location $repoRoot
try {
  Ensure-RuntimeVenv

  if (-not $NoInstall) {
    Install-BackendDependencies
  }

  if ($SetupOnly) {
    Write-Step "Deep Extract dependencies are installed. Start the backend with:"
    Write-Host "  $pythonExe -m uvicorn main:app --host 127.0.0.1 --port 8000" -ForegroundColor Green
    exit 0
  }

  Start-Backend
  $health = Wait-ForHealth

  Write-Step "Backend is healthy."
  $features = $health.features
  Write-Host ""
  Write-Host "Deep Extract: $($features.deep_extract)" -ForegroundColor Green
  Write-Host "GPU Mode:    $($features.deep_extract_gpu)" -ForegroundColor Green
  Write-Host "CPU Mode:    $($features.deep_extract_cpu)" -ForegroundColor Green
  Write-Host "MinerU Ver:  $($features.mineru_version)" -ForegroundColor Green
  Write-Host ""
  Write-Host "If the UI is already open, refresh Settings or OCR Tool." -ForegroundColor Yellow
} finally {
  Pop-Location
}
