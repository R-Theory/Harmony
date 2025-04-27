@echo off
echo Disabling Public Profile Firewall...
netsh advfirewall set publicprofile state off

echo Current firewall status:
netsh advfirewall show allprofiles state

pause 