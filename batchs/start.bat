@echo off
cls
cd "C:\Programing\Harmony (v0.1)"
echo Starting server...
start cmd /k "npm run server"
timeout /t 3 >nul
echo Starting frontend dev server...
start cmd /k "npm run dev"
timeout /t 3 >nul
echo Ready to deploy? Hit any key to continue.
pause
vercel --prod
pause
