@echo off
echo Running with administrator privileges...
echo Disabling Public Profile Firewall...

REM Run the command with elevated privileges
powershell -Command "Start-Process cmd -ArgumentList '/c netsh advfirewall set publicprofile state off' -Verb RunAs"

echo.
echo Current firewall status:
netsh advfirewall show allprofiles state

echo.
echo Press any key to exit...
pause > nul