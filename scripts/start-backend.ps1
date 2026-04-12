$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$runtimeVenvPointerFile = Join-Path $backendDir ".runtime_venv_path.txt"
$runtimeVenvDir = $null

function Test-BackendRuntimeReady {
  param(
    [string]$CandidateDir
  )

  if (-not $CandidateDir) {
    return $false
  }

  $candidatePythonExe = Join-Path $CandidateDir "Scripts\\python.exe"
  if (-not (Test-Path $candidatePythonExe)) {
    return $false
  }

  $checkScript = "import importlib.util, sys; mods = ('fastapi', 'uvicorn'); missing = [m for m in mods if importlib.util.find_spec(m) is None]; print('|'.join(missing)); sys.exit(0 if not missing else 1)"
  & $candidatePythonExe -c $checkScript 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Resolve-BackendRuntimeVenv {
  $candidateDirs = New-Object System.Collections.Generic.List[string]

  if (Test-Path $runtimeVenvPointerFile) {
    $savedPath = (Get-Content $runtimeVenvPointerFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    if ($savedPath) {
      $candidateDirs.Add($savedPath)
    }
  }

  $discoveredDirs = Get-ChildItem $backendDir -Directory -Filter ".venv_runtime*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -ExpandProperty FullName
  foreach ($dir in $discoveredDirs) {
    if (-not $candidateDirs.Contains($dir)) {
      $candidateDirs.Add($dir)
    }
  }

  $defaultDir = Join-Path $backendDir ".venv_runtime"
  if (-not $candidateDirs.Contains($defaultDir)) {
    $candidateDirs.Add($defaultDir)
  }

  foreach ($dir in $candidateDirs) {
    if (Test-BackendRuntimeReady -CandidateDir $dir) {
      return $dir
    }
  }

  return $null
}

$runtimeVenvDir = Resolve-BackendRuntimeVenv
$runtimePythonExe = if ($runtimeVenvDir) { Join-Path $runtimeVenvDir "Scripts\\python.exe" } else { $null }

if (-not (Test-Path $runtimePythonExe)) {
  throw "Backend runtime environment not found. Run npm run deep-extract:enable first."
}

$connections = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($connections) {
  foreach ($connection in $connections) {
    try {
      Stop-Process -Id $connection.OwningProcess -Force
    } catch {
      # Ignore
    }
  }
}

Push-Location $backendDir
try {
  & $runtimePythonExe -m uvicorn main:app --host 127.0.0.1 --port 8000
} finally {
  Pop-Location
}
