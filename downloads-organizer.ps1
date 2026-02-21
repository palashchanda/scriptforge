Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "📂 Downloads Organizer" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$downloadsPath = "$env:USERPROFILE\Downloads"

# File categories
$categories = @{
    "🖼 Images"      = @("*.jpg","*.jpeg","*.png","*.gif","*.bmp","*.svg","*.webp")
    "📄 Documents"   = @("*.pdf","*.doc","*.docx","*.txt","*.xlsx","*.xls","*.pptx","*.ppt")
    "🎬 Videos"      = @("*.mp4","*.avi","*.mkv","*.mov","*.wmv","*.flv","*.webm")
    "🎵 Audios"      = @("*.mp3","*.wav","*.flac","*.aac","*.ogg","*.m4a")
    "📦 Archives"    = @("*.zip","*.rar","*.7z","*.tar","*.gz")
    "💿 Installers"  = @("*.exe","*.msi","*.dmg","*.pkg")
    "💻 Code"        = @("*.py","*.js","*.html","*.css","*.java","*.cpp","*.c","*.sh","*.ps1")
}

Write-Host "🔍 Scanning: $downloadsPath" -ForegroundColor Cyan
Write-Host ""

$filesMoved = 0

foreach ($category in $categories.Keys) {

    # Remove emoji for folder name (optional)
    $folderName = ($category -replace "^[^\w]+","").Trim()
    $categoryPath = Join-Path $downloadsPath $folderName

    if (-not (Test-Path $categoryPath)) {
        New-Item -ItemType Directory -Path $categoryPath | Out-Null
    }

    Write-Host "⌛ Processing $category..." -ForegroundColor DarkCyan

    foreach ($extension in $categories[$category]) {

        $files = Get-ChildItem -Path $downloadsPath -Filter $extension -File -ErrorAction SilentlyContinue

        foreach ($file in $files) {

            if ($file.DirectoryName -ne $downloadsPath) { continue }

            try {
                $destination = Join-Path $categoryPath $file.Name
                Move-Item $file.FullName $destination -Force

                Write-Host "   ✅ $($file.Name)" -ForegroundColor Green
                $filesMoved++
            }
            catch {
                Write-Host "   ❌ Failed: $($file.Name)" -ForegroundColor Red
            }
        }
    }

    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Organized $filesMoved file(s) successfully!" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
