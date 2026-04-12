param(
    [string]$DeviceName = "Bluetooth Device",
    [int]$IntervalMinutes = 4,
    [switch]$RegisterOnly
)

# ================================
# CONFIG
# ================================
$TaskName = "BluetoothKeepAlive"

# Resolve full script path safely
$ScriptPath = (Resolve-Path $MyInvocation.MyCommand.Path).Path

# ================================
# ADMIN CHECK
# ================================
function Test-Admin {
    $currentUser = New-Object Security.Principal.WindowsPrincipal(
        [Security.Principal.WindowsIdentity]::GetCurrent()
    )
    return $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Relaunch as admin if needed
if (-not (Test-Admin)) {
    Write-Host "Restarting as admin..."

    Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList @(
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$ScriptPath`"",
        "-DeviceName", "`"$DeviceName`"",
        "-IntervalMinutes", $IntervalMinutes,
        "-RegisterOnly"
    )
    exit
}

# ================================
# REGISTER SCHEDULED TASK
# ================================
if (-not $RegisterOnly) {

    Write-Host "Setting up scheduled task..."

    $taskExists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

    if ($null -eq $taskExists) {

        $argString = @(
            "-WindowStyle Hidden",
            "-ExecutionPolicy Bypass",
            "-File `"$ScriptPath`"",
            "-DeviceName `"$DeviceName`"",
            "-IntervalMinutes $IntervalMinutes"
        ) -join " "

        $action = New-ScheduledTaskAction `
            -Execute "powershell.exe" `
            -Argument $argString

    $trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
    -RepetitionDuration (New-TimeSpan -Days 1)

        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable

        Register-ScheduledTask `
            -TaskName $TaskName `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -RunLevel Highest `
            -User $env:USERNAME `
            -Force

        Write-Host "Scheduled task created successfully!"
    }
    else {
        Write-Host "Task already exists."
    }

    exit
}

# ================================
# KEEP-ALIVE LOOP
# ================================
Write-Host "Keep-alive running..."

while ($true) {
    try {
        # Play silent beep (keeps audio session alive)
        [console]::beep(1000, 200)

        Write-Host "Ping sent at $(Get-Date)"
    }
    catch {
        Write-Host "Error: $_"
    }

    Start-Sleep -Seconds ($IntervalMinutes * 60)
}