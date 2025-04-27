# Requires administrator privileges
Write-Host "Temporarily disabling Windows Firewall..."
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

Write-Host "Starting test server..."
Start-Process node -ArgumentList "simple-test.js" -NoNewWindow -Wait

Write-Host "Re-enabling Windows Firewall..."
Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True

Write-Host "Done!"
pause 