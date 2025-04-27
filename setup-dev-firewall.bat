@echo off
echo Setting up firewall rules for development servers...

REM Remove any existing rules with these names
netsh advfirewall firewall delete rule name="Harmony Dev Frontend (TCP-In)"
netsh advfirewall firewall delete rule name="Harmony Dev Frontend (TCP-Out)"
netsh advfirewall firewall delete rule name="Harmony Dev Backend (TCP-In)"
netsh advfirewall firewall delete rule name="Harmony Dev Backend (TCP-Out)"

REM Add new rules for the frontend (Vite)
netsh advfirewall firewall add rule name="Harmony Dev Frontend (TCP-In)" dir=in action=allow protocol=TCP localport=5173 profile=any
netsh advfirewall firewall add rule name="Harmony Dev Frontend (TCP-Out)" dir=out action=allow protocol=TCP localport=5173 profile=any

REM Add new rules for the backend (Express)
netsh advfirewall firewall add rule name="Harmony Dev Backend (TCP-In)" dir=in action=allow protocol=TCP localport=3001 profile=any
netsh advfirewall firewall add rule name="Harmony Dev Backend (TCP-Out)" dir=out action=allow protocol=TCP localport=3001 profile=any

REM Add rules for Node.js executable
netsh advfirewall firewall add rule name="Node.js" dir=in action=allow program="%ProgramFiles%\nodejs\node.exe" enable=yes profile=any
netsh advfirewall firewall add rule name="Node.js" dir=out action=allow program="%ProgramFiles%\nodejs\node.exe" enable=yes profile=any

echo Firewall rules have been set up!
echo.
echo Current TCP connections on development ports:
netstat -an | findstr :5173
netstat -an | findstr :3001
echo.
pause 