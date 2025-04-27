@echo off
echo Opening ports for Harmony...

netsh advfirewall firewall add rule name="Harmony Frontend (5173)" dir=in action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="Harmony Frontend (5173)" dir=out action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="Harmony Backend (3001)" dir=in action=allow protocol=TCP localport=3001
netsh advfirewall firewall add rule name="Harmony Backend (3001)" dir=out action=allow protocol=TCP localport=3001

echo Ports opened successfully!
pause 