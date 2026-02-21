$refreshRate = 5

function Get-Color($percent) {
    if ($percent -lt 50) { "Green" }
    elseif ($percent -lt 80) { "Yellow" }
    else { "Red" }
}

while ($true) {

Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ℹ️ System Info" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# OS & uptime
$os = Get-CimInstance Win32_OperatingSystem
$uptime = (Get-Date) - $os.LastBootUpTime

Write-Host "👤 User        : $env:USERNAME" -ForegroundColor Green
Write-Host "💻 Computer    : $env:COMPUTERNAME" -ForegroundColor Green
Write-Host "🪟 OS          : $($os.Caption)" -ForegroundColor Green
Write-Host "⌚ Uptime      : $($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m" -ForegroundColor Green

# IP Address
$ip = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {$_.IPAddress -notlike "169.*" -and $_.InterfaceAlias -notmatch "Loopback"} |
      Select-Object -First 1 -ExpandProperty IPAddress

Write-Host "🌐 IP Address  : $ip" -ForegroundColor Cyan

Write-Host ""
Write-Host "========== PERFORMANCE ==========" -ForegroundColor Cyan

# RAM
$totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB,2)
$freeRAM  = [math]::Round($os.FreePhysicalMemory / 1MB,2)
$usedRAM  = $totalRAM - $freeRAM
$ramPercent = [math]::Round(($usedRAM / $totalRAM) * 100)

$ramColor = Get-Color $ramPercent
$ramBar = "█" * ($ramPercent/5) + "░" * (20-($ramPercent/5))

Write-Host "👟 RAM Usage  : $usedRAM / $totalRAM GB ($ramPercent%)" -ForegroundColor $ramColor
Write-Host "               [$ramBar]" -ForegroundColor DarkCyan

# CPU
$cpu = Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name
$cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average
$cpuColor = Get-Color $cpuLoad

Write-Host "🧠 CPU        : $cpu" -ForegroundColor Green
Write-Host "🔥 CPU Load   : $cpuLoad %" -ForegroundColor $cpuColor

# GPU
$gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1
$vram = [math]::Round($gpu.AdapterRAM / 1GB,2)

Write-Host "🎮 GPU        : $($gpu.Name)" -ForegroundColor Green
Write-Host "🧩 VRAM       : $vram GB" -ForegroundColor Green

# Temperature (may not work on all systems)
$tempObj = Get-WmiObject MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1

if ($tempObj) {
    $tempC = [math]::Round(($tempObj.CurrentTemperature / 10) - 273.15, 1)
    $tempColor = Get-Color $tempC
    Write-Host "🌡 Temp       : $tempC °C" -ForegroundColor $tempColor
} else {
    Write-Host "🌡 Temp       : N/A" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========== STORAGE ==========" -ForegroundColor Cyan

Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Free -ne $null} | ForEach-Object {

    $used = [math]::Round($_.Used / 1GB,2)
    $free = [math]::Round($_.Free / 1GB,2)
    $total = $used + $free

    if ($total -gt 0) { $percent = [math]::Round(($used/$total)*100) } else { $percent = 0 }

    $color = Get-Color $percent
    $bar = "█" * ($percent/5) + "░" * (20-($percent/5))

    Write-Host "💽 Drive $($_.Name): $used / $total GB ($percent%)" -ForegroundColor $color
    Write-Host "               [$bar]" -ForegroundColor DarkCyan
}

Write-Host ""
Write-Host "========== NETWORK ==========" -ForegroundColor Cyan

# Get active physical adapters only
$adapters = Get-NetAdapter |
    Where-Object { $_.Status -eq "Up" -and $_.HardwareInterface -eq $true }

if (-not $adapters) {
    Write-Host "No active network adapters" -ForegroundColor Red
}
else {
    # capture start stats
    $startStats = foreach ($adapter in $adapters) {
        Get-NetAdapterStatistics -Name $adapter.Name
    }

    Start-Sleep -Seconds $refreshRate

    # capture end stats
    $endStats = foreach ($adapter in $adapters) {
        Get-NetAdapterStatistics -Name $adapter.Name
    }

    $recv = 0
    $sent = 0

    for ($i=0; $i -lt $startStats.Count; $i++) {
        $recv += ($endStats[$i].ReceivedBytes - $startStats[$i].ReceivedBytes)
        $sent += ($endStats[$i].SentBytes - $startStats[$i].SentBytes)
    }

    $downKB = $recv / 1KB / $refreshRate
    $upKB   = $sent / 1KB / $refreshRate

    if ($downKB -gt 1024) { $down = "{0:N2} MB/s" -f ($downKB/1024) }
    else { $down = "{0:N2} KB/s" -f $downKB }

    if ($upKB -gt 1024) { $up = "{0:N2} MB/s" -f ($upKB/1024) }
    else { $up = "{0:N2} KB/s" -f $upKB }

    Write-Host "🌐 Adapter(s): $($adapters.Name -join ', ')" -ForegroundColor DarkCyan
    Write-Host "⬇ Download   : $down" -ForegroundColor Green
    Write-Host "⬆ Upload     : $up" -ForegroundColor Green
}

Write-Host ""
Write-Host "Press CTRL + C to exit" -ForegroundColor DarkGray

}
