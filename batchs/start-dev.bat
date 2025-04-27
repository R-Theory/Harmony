@echo off
cls
echo Starting Harmony development environment...

cd "%~dp0.."
if %ERRORLEVEL% NEQ 0 (
    echo Error: Could not change to project directory.
    pause
    exit /b 1
)

echo Installing dependencies (if needed)...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Error: Failed to install dependencies.
    pause
    exit /b 1
)

echo Starting server...
start cmd /k "npm run server"
timeout /t 3 >nul

echo Starting frontend dev server...
start cmd /k "npm run dev"
timeout /t 3 >nul

echo Development environment started successfully!
echo.
echo Press any key to exit...
pause