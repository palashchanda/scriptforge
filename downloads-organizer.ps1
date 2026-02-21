Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "📂 Downloads Organizer" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$downloadsPath = "$env:USERPROFILE\Downloads"

# Function: Prevent overwrite by renaming duplicates
function Get-UniqueFileName {
    param ($destinationPath)

    if (-not (Test-Path $destinationPath)) {
        return $destinationPath
    }

    $directory = Split-Path $destinationPath
    $filename = [System.IO.Path]::GetFileNameWithoutExtension($destinationPath)
    $extension = [System.IO.Path]::GetExtension($destinationPath)

    $counter = 1
    do {
        $newName = "$filename ($counter)$extension"
        $newPath = Join-Path $directory $newName
        $counter++
    } while (Test-Path $newPath)

    return $newPath
}

# File categories
$categories = @{
    "🖼️ Images"      = @("*.jpg","*.jpeg","*.png","*.gif","*.bmp","*.svg","*.webp")
    "📄 Documents"   = @("*.pdf","*.doc","*.docx","*.txt","*.xlsx","*.xls","*.pptx","*.ppt")
    "🎬 Videos"      = @("*.mp4","*.avi","*.mkv","*.mov","*.wmv","*.flv","*.webm")
    "🎵 Audios"      = @("*.mp3","*.wav","*.flac","*.aac","*.ogg","*.m4a")
    "📦 Archives"    = @("*.zip","*.rar","*.7z","*.tar","*.gz")
    "💿 Installers"  = @("*.exe","*.msi","*.dmg","*.pkg")
    "💻 Code"        = @("*.py","*.js","*.html","*.css","*.java","*.cpp","*.c","*.sh","*.ps1")
}

Write-Host "🔍 Scanning: $downloadsPath" -ForegroundColor Cyan
Write-Host ""

$totalMoved = 0

foreach ($category in $categories.Keys) {

    # Remove emoji from folder name
    $folderName = ($category -replace "^[^\w]+","").Trim()
    $categoryPath = Join-Path $downloadsPath $folderName

    if (-not (Test-Path $categoryPath)) {
        New-Item -ItemType Directory -Path $categoryPath | Out-Null
    }

    Write-Host "⌛ Processing $category..." -ForegroundColor DarkCyan

    $categoryCount = 0

    foreach ($extension in $categories[$category]) {

        $files = Get-ChildItem -Path $downloadsPath -Filter $extension -File -ErrorAction SilentlyContinue

        foreach ($file in $files) {

            if ($file.DirectoryName -ne $downloadsPath) { continue }

            try {
                $destination = Join-Path $categoryPath $file.Name
                $uniqueDestination = Get-UniqueFileName $destination

                Move-Item $file.FullName $uniqueDestination

                if ($uniqueDestination -ne $destination) {
                    $newName = Split-Path $uniqueDestination -Leaf
                    Write-Host "   Renamed → $newName" -ForegroundColor Yellow
                }
                else {
                    Write-Host "   Moved $($file.Name)" -ForegroundColor Green
                }

                $categoryCount++
                $totalMoved++
            }
            catch {
                Write-Host "   Failed to move $($file.Name)" -ForegroundColor Red
            }
        }
    }

    if ($categoryCount -eq 0) {
        Write-Host "   ❕ No files found" -ForegroundColor Gray
    }
    else {
        Write-Host "   📦 Moved $categoryCount file(s)" -ForegroundColor Cyan
    }

    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Organized $totalMoved file(s) successfully!" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
