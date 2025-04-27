@echo off
echo Starting deployment process...

REM Check if Git is installed
where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Git is not installed! Please install Git first.
    pause
    exit /b 1
)

REM Check if Vercel CLI is installed
where vercel >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing Vercel CLI...
    npm install -g vercel
)

REM Initialize Git repository if not already initialized
if not exist .git (
    echo Initializing Git repository...
    git init
)

REM Add all files
echo Adding files to Git...
git add .

REM Commit changes
echo Committing changes...
git commit -m "Deployment commit %date% %time%"

REM Push to GitHub (you'll need to set up the remote first)
echo Pushing to GitHub...
git push origin main

REM Deploy to Vercel
echo Deploying to Vercel...
vercel --prod

echo Deployment process completed!
pause 