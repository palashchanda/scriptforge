Clear-Host

Write-Host "================================" -ForegroundColor Green
Write-Host "  Downloads Organizer" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Green
Write-Host ""

$downloadsPath = "$env:USERPROFILE\Downloads"

# File categories
$categories = @{
    Images      = @("*.jpg","*.jpeg","*.png","*.gif","*.bmp","*.svg","*.webp")
    Documents   = @("*.pdf","*.doc","*.docx","*.txt","*.xlsx","*.xls","*.pptx","*.ppt")
    Videos      = @("*.mp4","*.avi","*.mkv","*.mov","*.wmv","*.flv","*.webm")
    Audios      = @("*.mp3","*.wav","*.flac","*.aac","*.ogg","*.m4a")
    Archives    = @("*.zip","*.rar","*.7z","*.tar","*.gz")
    Installers  = @("*.exe","*.msi","*.dmg","*.pkg")
    Code        = @("*.py","*.js","*.html","*.css","*.java","*.cpp","*.c","*.sh","*.ps1")
}

Write-Host "Scanning $downloadsPath..." -ForegroundColor Cyan
Write-Host ""

$filesMoved = 0

foreach ($category in $categories.Keys) {

    $categoryPath = Join-Path $downloadsPath $category

    # Create category folder if it doesn't exist
    if (-not (Test-Path $categoryPath)) {
        New-Item -ItemType Directory -Path $categoryPath | Out-Null
    }

    foreach ($extension in $categories[$category]) {

        $files = Get-ChildItem -Path $downloadsPath -Filter $extension -File -ErrorAction SilentlyContinue

        foreach ($file in $files) {

            # Skip if file already inside a category folder
            if ($file.DirectoryName -ne $downloadsPath) { continue }

            try {
                $destination = Join-Path $categoryPath $file.Name

                Move-Item -Path $file.FullName -Destination $destination -Force

                Write-Host "Moved: $($file.Name) -> $category" -ForegroundColor Green
                $filesMoved++
            }
            catch {
                Write-Host "Failed to move: $($file.Name)" -ForegroundColor Red
            }
        }
    }
}

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "Organized $filesMoved files." -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Green
