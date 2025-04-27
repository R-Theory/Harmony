@echo off
cls
echo Deploying Harmony to production...

cd "C:\Programing\Harmony (v0.1)"
if %ERRORLEVEL% NEQ 0 (
    echo Error: Could not change to project directory.
    pause
    exit /b 1
)

echo Are you sure you want to deploy to production?
echo This will make your application available to all users.
set /p confirm=Type 'yes' to confirm: 

if /i "%confirm%"=="yes" (
    echo Deploying to production...
    vercel --prod
) else (
    echo Deployment cancelled.
)

pause