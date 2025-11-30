@echo off
echo ========================================
echo Wrytica AI - Automated Build Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Checking Node.js version...
node --version
npm --version
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [2/4] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
) else (
    echo [2/4] Dependencies already installed (skipping)
)
echo.

echo [3/4] Building production bundle...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)
echo.

echo [4/4] Build completed successfully!
echo.
echo ========================================
echo Build output is in the 'dist' folder
echo ========================================
echo.
echo To preview the build locally, run:
echo   npm run preview
echo.
echo To deploy, upload the 'dist' folder to your hosting service.
echo.
pause
