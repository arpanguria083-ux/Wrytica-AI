# Wrytica AI - One-step setup script (PowerShell)
# Usage: .\setup.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Wrytica AI - One-Step Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    $nodeVersion = node --version
    $npmVersion = & npm.cmd --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "npm: $npmVersion" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Node.js is not installed or not on PATH." -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[1/2] Installing frontend dependencies..." -ForegroundColor Yellow
& npm.cmd install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "[2/2] Setting up backend OCR and knowledge-base support..." -ForegroundColor Yellow
& npm.cmd run backend:setup
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Backend setup failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Setup completed successfully." -ForegroundColor Green
Write-Host "Start the app with: npm.cmd run dev" -ForegroundColor Cyan
Write-Host "Start the backend with: npm.cmd run backend:start" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"
