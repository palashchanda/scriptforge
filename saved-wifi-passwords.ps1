Clear-Host

Write-Host "Saved WiFi Passwords:" -ForegroundColor Yellow
Write-Host ""

# Check if running as Administrator (recommended)
$admin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $admin) {
    Write-Host "⚠ Run PowerShell as Administrator for full results." -ForegroundColor Red
    Write-Host ""
}

# Get saved WiFi profiles
$profiles = netsh wlan show profiles |
    Select-String "All User Profile" |
    ForEach-Object { ($_ -split ":")[1].Trim() }

if (-not $profiles) {
    Write-Host "No saved WiFi profiles found!" -ForegroundColor Red
    exit
}

foreach ($profile in $profiles) {

    Write-Host "Network: " -NoNewline -ForegroundColor Cyan
    Write-Host $profile

    # Get password info
    $passwordInfo = netsh wlan show profile name="$profile" key=clear |
        Select-String "Key Content"

    if ($passwordInfo) {
        $password = ($passwordInfo -split ":")[1].Trim()

        Write-Host "Password: " -NoNewline -ForegroundColor Green
        Write-Host $password -ForegroundColor Yellow
    }
    else {
        Write-Host "Password: " -NoNewline -ForegroundColor Green
        Write-Host "No password (open network)" -ForegroundColor Gray
    }

    Write-Host ""
}
