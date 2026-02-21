Clear-Host
Write-Host "    System Info" -ForegroundColor Yellow
Write-Host ""

# Computer name and user
Write-Host "Computer Name: " -NoNewline -ForegroundColor Green
Write-Host $env:COMPUTERNAME

Write-Host "Current User: " -NoNewline -ForegroundColor Green
Write-Host $env:USERNAME

# OS Info
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "Operating System: " -NoNewline -ForegroundColor Green
Write-Host $os.Caption

# Uptime
$uptime = (Get-Date) - $os.LastBootUpTime
Write-Host "System Uptime: " -NoNewline -ForegroundColor Green
Write-Host "$($uptime.Days) days, $($uptime.Hours) hours, $($uptime.Minutes) minutes"

# Memory (values returned in KB → convert to GB)
$totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeRAM  = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$usedRAM  = [math]::Round($totalRAM - $freeRAM, 2)

Write-Host "Memory Usage: " -NoNewline -ForegroundColor Green
Write-Host "$usedRAM GB used of $totalRAM GB"

# CPU Info
$cpu = Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name
$cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average

Write-Host "Processor: " -NoNewline -ForegroundColor Green
Write-Host $cpu

Write-Host "CPU Load: " -NoNewline -ForegroundColor Green
Write-Host "$cpuLoad%"

# Disk space
Write-Host ""
Write-Host "Disk Space:" -ForegroundColor Yellow

Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -ne $null } | ForEach-Object {

    $used = [math]::Round(($_.Used) / 1GB, 2)
    $free = [math]::Round(($_.Free) / 1GB, 2)
    $total = $used + $free

    if ($total -gt 0) {
        $percentUsed = [math]::Round(($used / $total) * 100, 1)
    } else {
        $percentUsed = 0
    }

    Write-Host "  Drive $($_.Name): " -NoNewline -ForegroundColor Green
    Write-Host "$used GB used / $total GB total ($percentUsed% full)"
}
