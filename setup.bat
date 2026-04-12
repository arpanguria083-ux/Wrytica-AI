@echo off
echo ========================================
echo Wrytica AI - One-Step Setup
echo ========================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/2] Installing frontend dependencies...
call npm.cmd install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)

echo.
echo [2/2] Setting up backend OCR and knowledge-base support...
call npm.cmd run backend:setup
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backend setup failed.
    pause
    exit /b 1
)

echo.
echo Setup completed successfully.
echo Start the app with: npm.cmd run dev
echo Start the backend with: npm.cmd run backend:start
echo.
pause
