$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step($message) {
  Write-Host "`n[Step] $message" -ForegroundColor Cyan
}

function Write-Success($message) {
  Write-Host "[OK] $message" -ForegroundColor Green
}

function Write-Info($message) {
  Write-Host "[INFO] $message" -ForegroundColor Gray
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "   Wrytica Desktop Build Script" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

Write-Step "Checking prerequisites..."

$nodeVersion = node --version
Write-Info "Node.js: $nodeVersion"

$pythonExe = python --version 2>&1
Write-Info "Python: $pythonExe"

if (-not (Test-Path "node_modules")) {
  Write-Step "Installing npm dependencies..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install failed!" -ForegroundColor Red
    exit 1
  }
  Write-Success "npm dependencies installed"
} else {
  Write-Success "npm dependencies already installed"
}

Write-Step "Setting up Python backend..."
if (Test-Path "backend") {
  npm run backend:setup
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Backend setup had issues, continuing anyway..." -ForegroundColor Yellow
  } else {
    Write-Success "Backend setup complete"
  }
} else {
  Write-Info "No backend directory found, skipping..."
}

Write-Step "Building Vite frontend and Electron..."
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] Build failed!" -ForegroundColor Red
  exit 1
}
Write-Success "Build complete"

Write-Step "Building Electron installer..."
npm run electron:build:win
if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] Electron build failed!" -ForegroundColor Red
  exit 1
}
Write-Success "Electron installer created"

$releaseDir = Join-Path $repoRoot "dist-electron-release"
if (Test-Path $releaseDir) {
  Write-Step "Build outputs:"
  Get-ChildItem $releaseDir -File | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  - $($_.Name) ($sizeMB MB)" -ForegroundColor White
  }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "   Build Complete!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Output location: $releaseDir`n" -ForegroundColor White
