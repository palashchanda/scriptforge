# System Stats Display
# Shows your computer's vital stats in a fun way

Clear-Host
Write-Host "================================" -ForegroundColor Cyan
Write-Host "    System Info" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Cyan
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

# Memory
$totalRAM = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
$freeRAM = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$usedRAM = $totalRAM - $freeRAM
Write-Host "Memory Usage: " -NoNewline -ForegroundColor Green
Write-Host "$usedRAM GB used of $totalRAM GB"

# CPU
$cpu = Get-CimInstance Win32_Processor
Write-Host "Processor: " -NoNewline -ForegroundColor Green
Write-Host $cpu.Name

# Disk space
Write-Host ""
Write-Host "Disk Space:" -ForegroundColor Yellow
Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -gt 0 } | ForEach-Object {
    $used = [math]::Round($_.Used / 1GB, 2)
        $free = [math]::Round($_.Free / 1GB, 2)
            $total = $used + $free
                $percentUsed = [math]::Round(($used / $total) * 100, 1)
                    Write-Host "  Drive $($_.Name): " -NoNewline -ForegroundColor Green
                        Write-Host "$used GB used / $total GB total ($percentUsed% full)"
                        }

                        Write-Host ""
                        Write-Host "================================" -ForegroundColor Cyan

                        