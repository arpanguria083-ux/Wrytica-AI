# Wrytica AI - Automated Build Script (PowerShell)
# Usage: .\build.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Wrytica AI - Automated Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    $npmVersion = & npm.cmd --version
    Write-Host "[1/4] Checking Node.js version..." -ForegroundColor Yellow
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "npm: $npmVersion" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERROR] Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if node_modules exists
if (-Not (Test-Path "node_modules")) {
    Write-Host "[2/4] Installing dependencies..." -ForegroundColor Yellow
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "[2/4] Dependencies already installed (skipping)" -ForegroundColor Green
}
Write-Host ""

# Build the project
Write-Host "[3/4] Building production bundle..." -ForegroundColor Yellow
& npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host ""

Write-Host "[4/4] Build completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build output is in the 'dist' folder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To preview the build locally, run:" -ForegroundColor Yellow
Write-Host "  npm run preview" -ForegroundColor White
Write-Host ""
Write-Host "To deploy, upload the 'dist' folder to your hosting service." -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to exit"
