Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "📂 File Organizer" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ask user for folder path
Write-Host "Enter the folder path to organize:" -ForegroundColor Yellow
Write-Host "(Press Enter to use your Downloads folder)" -ForegroundColor DarkGray
$inputPath = Read-Host "📁 Path"

if ([string]::IsNullOrWhiteSpace($inputPath)) {
    $targetPath = "$env:USERPROFILE\Downloads"
    Write-Host "Using default: $targetPath" -ForegroundColor DarkGray
} else {
    $targetPath = $inputPath.Trim('"').Trim("'")
}

# Validate the path
if (-not (Test-Path $targetPath)) {
    Write-Host ""
    Write-Host "❌ Folder not found: $targetPath" -ForegroundColor Red
    Write-Host "Please check the path and try again." -ForegroundColor Red
    exit
}

Write-Host ""

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
    "📷 Images"      = @("*.jpg","*.jpeg","*.png","*.gif","*.bmp","*.svg","*.webp",
                         "*.tiff","*.tif","*.ico","*.heic","*.raw")

    "📄 Documents"   = @("*.pdf","*.doc","*.docx","*.txt","*.xlsx","*.xls","*.pptx","*.ppt",
                         "*.odt","*.rtf","*.csv","*.epub","*.md")

    "🎬 Videos"      = @("*.mp4","*.avi","*.mkv","*.mov","*.wmv","*.flv","*.webm",
                         "*.m4v","*.3gp","*.ts","*.mpeg")

    "🎵 Audios"      = @("*.mp3","*.wav","*.flac","*.aac","*.ogg","*.m4a",
                         "*.wma","*.aiff","*.opus")

    "📦 Archives"    = @("*.zip","*.rar","*.7z","*.tar","*.gz","*.bz2","*.xz","*.zst")

    "💿 Installers"  = @("*.exe","*.msi","*.dmg","*.pkg")

    "💻 Code"        = @("*.py","*.ipynb","*.java","*.js","*.json","*.html","*.css",
                         "*.cpp","*.c","*.sh","*.ps1","*.ts","*.tsx","*.jsx","*.xml",
                         "*.yaml","*.yml","*.sql","*.rb","*.go","*.rs","*.php",
                         "*.swift","*.kt")

    "🖼️ Design"      = @("*.psd","*.ai","*.fig","*.sketch","*.blend","*.obj","*.stl")

    "🗄️ Data"        = @("*.db","*.sqlite","*.parquet")
}

Write-Host "🔍 Scanning: $targetPath" -ForegroundColor Cyan
Write-Host ""

$totalMoved = 0

foreach ($category in $categories.Keys) {

    # Remove emoji from folder name
    $folderName = ($category -replace "^[^\w]+","").Trim()
    $categoryPath = Join-Path $targetPath $folderName

    if (-not (Test-Path $categoryPath)) {
        New-Item -ItemType Directory -Path $categoryPath | Out-Null
    }

    Write-Host "⌛ Processing $category..." -ForegroundColor DarkCyan

    $categoryCount = 0

    foreach ($extension in $categories[$category]) {

        $files = Get-ChildItem -Path $targetPath -Filter $extension -File -ErrorAction SilentlyContinue

        foreach ($file in $files) {

            if ($file.DirectoryName -ne $targetPath) { continue }

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
        Write-Host "   No files to move" -ForegroundColor Gray
    }
    else {
        Write-Host "   Moved $categoryCount file(s)" -ForegroundColor Cyan
    }

    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Organized $totalMoved file(s) successfully!" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
