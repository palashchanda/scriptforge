Write-Host "Cleaning temp files..."

$paths = @(
    "$env:TEMP\*",
        "C:\Windows\Temp\*"
        )

        foreach ($path in $paths) {
            Get-ChildItem $path -Recurse -Force -ErrorAction SilentlyContinue |
                Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
                }

                Write-Host "Temp cleanup done!"