$ErrorActionPreference='Stop'
$voiceRoot=$PSScriptRoot
$voiceShell=New-Object -ComObject WScript.Shell
$voicePrograms=Join-Path ([Environment]::GetFolderPath('Programs')) 'Hermes Voice.lnk'
$voiceDesktop=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hermes Voice.lnk'
foreach($voiceLink in @($voicePrograms,$voiceDesktop)) {
  $voiceShortcut=$voiceShell.CreateShortcut($voiceLink)
  $voiceShortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $voiceShortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $voiceRoot 'launch.ps1')+'"'
  $voiceShortcut.WorkingDirectory=$voiceRoot
  $voiceShortcut.Description='Lokaler Hermes-Sprachassistent mit Orb und Systemüberwachung'
  $voiceShortcut.WindowStyle=7
  if(Test-Path -LiteralPath (Join-Path $voiceRoot '.local\app.ico')) {$voiceShortcut.IconLocation=Join-Path $voiceRoot '.local\app.ico'}
  $voiceShortcut.Save()
  Write-Output $voiceLink
}
