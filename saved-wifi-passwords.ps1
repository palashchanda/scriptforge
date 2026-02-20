Clear-Host
Write-Host "Saved Wifi passwords :" -ForegroundColor Yellow
Write-Host ""

$profiles = netsh wlan show profiles | Select-String "All User Profile" | ForEach-Object {
    ($_ -split ":")[-1].Trim()
    }

    if ($profiles.Count -eq 0) {
        Write-Host "No saved WiFi profiles found!" -ForegroundColor Red
            exit
            }

            foreach ($profile in $profiles) {
                $passwordInfo = netsh wlan show profile name="$profile" key=clear | Select-String "Key Content"
                    
                        Write-Host "Network: " -NoNewline -ForegroundColor Cyan
                            Write-Host $profile
                                
                                    if ($passwordInfo) {
                                            $password = ($passwordInfo -split ":")[-1].Trim()
                                                    Write-Host "Password: " -NoNewline -ForegroundColor Green
                                                            Write-Host $password -ForegroundColor Yellow
                                                                } else {
                                                                        Write-Host "Password: " -NoNewline -ForegroundColor Green
                                                                                Write-Host "No password (open network)" -ForegroundColor Gray
                                                                                    }
                                                                                        Write-Host ""
                                                                                        }