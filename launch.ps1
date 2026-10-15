param([switch]$Expanded,[switch]$Smoke,[switch]$Login,[switch]$Setup)
$ErrorActionPreference='Stop'
$voiceRoot=$PSScriptRoot
$electronExe=Join-Path $voiceRoot 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $electronExe)) { $electronExe=Join-Path $env:LOCALAPPDATA 'hermes\hermes-agent\apps\desktop\node_modules\electron\dist\electron.exe' }
if (-not (Test-Path -LiteralPath $electronExe)) { throw 'Electron fehlt. Bitte scripts\install-windows.ps1 verwenden oder npm ci ausführen.' }
if (-not (Test-Path -LiteralPath (Join-Path $voiceRoot 'node_modules\ws'))) { & npm.cmd install --ignore-scripts --no-audit --no-fund --prefix $voiceRoot }
$voiceArgs=@('"'+$voiceRoot+'"')
if ($Expanded) { $voiceArgs+='--expanded' }
if ($Smoke) { $voiceArgs+='--smoke' }
if ($Login) { $voiceArgs+='--login' }
if ($Setup) { $voiceArgs+='--setup' }
Start-Process -FilePath $electronExe -ArgumentList $voiceArgs -WorkingDirectory $voiceRoot -WindowStyle Hidden
