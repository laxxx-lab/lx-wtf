param([string]$Python)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(-not $Python){$Python=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'}
if(-not (Test-Path -LiteralPath $Python -PathType Leaf)){throw 'Python nicht gefunden. -Python mit einem Python 3.10+ Pfad angeben.'}
$graphRuntime=Join-Path $projectRoot 'runtime\graphify'
$graphPython=Join-Path $graphRuntime 'Scripts\python.exe'
if(-not (Test-Path -LiteralPath $graphPython -PathType Leaf)){& $Python -m venv $graphRuntime;if($LASTEXITCODE -ne 0){throw 'Graphify-Umgebung konnte nicht erstellt werden.'}}
& $graphPython -m pip install --disable-pip-version-check 'graphifyy==0.9.84'
if($LASTEXITCODE -ne 0){throw 'Graphify-Installation fehlgeschlagen.'}
& $graphPython -m graphify --version
if($LASTEXITCODE -ne 0){throw 'Graphify-Version konnte nicht geprüft werden.'}
