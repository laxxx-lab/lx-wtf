[CmdletBinding()]
param(
 [string]$SourceRoot,
 [switch]$InstallNode,
 [switch]$InstallPython,
 [switch]$Autostart,
 [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
if (-not $SourceRoot) { $SourceRoot = Split-Path -Parent $PSScriptRoot }
if ($DryRun) {
 Write-Output "Source=$SourceRoot; InstallNode=$InstallNode; InstallPython=$InstallPython; Autostart=$Autostart; first launch opens component/gateway setup"
 return
}
function Invoke-Checked([string]$Command, [string[]]$Arguments) {
 & $Command @Arguments
 if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
if ($InstallNode) { Invoke-Checked 'winget.exe' @('install','--id','OpenJS.NodeJS.LTS','--exact','--source','winget') }
if ($InstallPython) { Invoke-Checked 'winget.exe' @('install','--id','Python.Python.3.11','--exact','--source','winget') }
# winget can update PATH only for new processes.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer (or use -InstallNode), then rerun.' }
$SourceRoot = (Resolve-Path -LiteralPath $SourceRoot).Path
Push-Location -LiteralPath $SourceRoot
try {
 Invoke-Checked 'npm.cmd' @('ci')
 Invoke-Checked 'npm.cmd' @('run','runtime:install')
} finally { Pop-Location }
$electron = Join-Path $SourceRoot 'node_modules/electron/dist/electron.exe'
if (-not (Test-Path -LiteralPath $electron)) { throw 'Bundled Electron was not installed.' }
$shell = New-Object -ComObject WScript.Shell
function Write-Shortcut([string]$Destination) {
 $shortcut = $shell.CreateShortcut($Destination)
 $shortcut.TargetPath = $electron
 $shortcut.Arguments = '"' + $SourceRoot + '"'
 $shortcut.WorkingDirectory = $SourceRoot
 $shortcut.Save()
}
Write-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hermes Voice.lnk')
if ($Autostart) { Write-Shortcut (Join-Path ([Environment]::GetFolderPath('Startup')) 'Hermes Voice.lnk') }
Write-Output 'Installed. Open Hermes Voice to select your gateway and STT/TTS components.'
