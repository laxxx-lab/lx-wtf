param([switch]$Expanded,[switch]$Smoke,[switch]$Login)
$ErrorActionPreference='Stop'
$voiceRoot=$PSScriptRoot
$electronExe=Join-Path $env:LOCALAPPDATA 'hermes\hermes-agent\apps\desktop\node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $electronExe)) { throw 'Hermes Desktop Electron-Laufzeit fehlt. Bitte Hermes Desktop installieren.' }
if (-not (Test-Path -LiteralPath (Join-Path $voiceRoot 'node_modules\ws'))) { & npm.cmd install --ignore-scripts --no-audit --no-fund --prefix $voiceRoot }
$voiceArgs=@('"'+$voiceRoot+'"')
if ($Expanded) { $voiceArgs+='--expanded' }
if ($Smoke) { $voiceArgs+='--smoke' }
if ($Login) { $voiceArgs+='--login' }
Start-Process -FilePath $electronExe -ArgumentList $voiceArgs -WorkingDirectory $voiceRoot -WindowStyle Hidden
