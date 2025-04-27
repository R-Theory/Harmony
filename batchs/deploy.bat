@echo off
REM Prompt for a commit message
set /p msg="Enter commit message: "

REM Add all changes
git add .

REM Commit with the provided message
git commit -m "%msg%"

REM Push to the current branch
git push

pause