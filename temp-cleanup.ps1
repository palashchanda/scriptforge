Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🧹 Temp Cleanup Tool" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔍 Scanning temporary files..." -ForegroundColor Cyan
Write-Host ""

# Check for admin rights
$admin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $admin) {
    Write-Host "⚠️ Run as Administrator to fully clean Windows temp files." -ForegroundColor Red
    Write-Host ""
}

$paths = @(
    "$env:TEMP\*",
    "C:\Windows\Temp\*"
)

$deletedCount = 0

foreach ($path in $paths) {

    if (Test-Path $path) {

        Write-Host "📁 Cleaning: $path" -ForegroundColor DarkCyan

        $items = Get-ChildItem $path -Recurse -Force -ErrorAction SilentyContinue

        foreach ($item in $items) {
            try {
                Remove-Item $item.FullName -Recurse -Force -ErrorAction Stop
                $deletedCount++
            }
            catch {
            }
        }
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Cleanup Complete!" -ForegroundColor Green
Write-Host "🗑️ Removed $deletedCount item(s)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
