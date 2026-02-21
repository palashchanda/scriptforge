Write-Host "Cleaning temporary files..." -ForegroundColor Yellow
Write-Host ""

$admin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $admin) {
    Write-Host "⚠ Run as Administrator to clean Windows temp files." -ForegroundColor Red
    Write-Host ""
}

$paths = @(
    "$env:TEMP\*",
    "C:\Windows\Temp\*"
)

$deletedCount = 0

foreach ($path in $paths) {

    if (Test-Path $path) {

        $items = Get-ChildItem $path -Recurse -Force -ErrorAction SilentlyContinue

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

Write-Host ""
Write-Host "Temp cleanup complete!" -ForegroundColor Green
Write-Host "Removed $deletedCount items." -ForegroundColor Cyan
