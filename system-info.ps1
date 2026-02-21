Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ℹ️ System Info" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Computer & User
Write-Host "👤 User        : " -NoNewline -ForegroundColor Green
Write-Host $env:USERNAME

Write-Host "💻 Computer    : " -NoNewline -ForegroundColor Green
Write-Host $env:COMPUTERNAME

# OS Info
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "🪟 OS          : " -NoNewline -ForegroundColor Green
Write-Host $os.Caption

# Uptime
$uptime = (Get-Date) - $os.LastBootUpTime
Write-Host "⏱️ Uptime      : " -NoNewline -ForegroundColor Green
Write-Host "$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m"

Write-Host ""
Write-Host "========== PERFORMANCE ==========" -ForegroundColor Cyan

# Memory
$totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeRAM  = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$usedRAM  = [math]::Round($totalRAM - $freeRAM, 2)
$ramPercent = [math]::Round(($usedRAM / $totalRAM) * 100)

# Memory bar
$ramBar = "█" * ($ramPercent / 5) + "░" * (20 - ($ramPercent / 5))

Write-Host "🧠 RAM Usage  : $usedRAM / $totalRAM GB ($ramPercent%)" -ForegroundColor Green
Write-Host "               [$ramBar]" -ForegroundColor DarkCyan

# CPU Info
$cpu = Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name
$cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average

Write-Host "⚙ CPU        : " -NoNewline -ForegroundColor Green
Write-Host $cpu

Write-Host "🔥 CPU Load   : " -NoNewline -ForegroundColor Green
Write-Host "$cpuLoad %"

Write-Host ""
Write-Host "========== STORAGE ==========" -ForegroundColor Cyan

# Disk space
Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -ne $null } | ForEach-Object {

    $used = [math]::Round($_.Used / 1GB, 2)
    $free = [math]::Round($_.Free / 1GB, 2)
    $total = $used + $free

    if ($total -gt 0) {
        $percentUsed = [math]::Round(($used / $total) * 100)
    } else {
        $percentUsed = 0
    }

    # Disk bar
    $bar = "█" * ($percentUsed / 5) + "░" * (20 - ($percentUsed / 5))

    Write-Host "💽 Drive $($_.Name): $used / $total GB ($percentUsed%)" -ForegroundColor Green
    Write-Host "               [$bar]" -ForegroundColor DarkCyan
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
