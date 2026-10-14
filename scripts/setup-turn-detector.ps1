[CmdletBinding()]
param(
    [string]$Root,
    [string]$PythonPath,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$Root = [IO.Path]::GetFullPath($Root)
if (-not $PythonPath) { $PythonPath = Join-Path $Root 'runtime/voice/venv/Scripts/python.exe' }
if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) { throw 'Turn-Detektor-Python fehlt: vorhandene Voice-Laufzeit zuerst einrichten.' }
$turnDirectory = Join-Path $Root 'runtime/turn'
$turnPackages = Join-Path $turnDirectory 'python'
$turnVersion = '0.2.7'
$turnWheelName = 'livekit_local_inference-0.2.7-cp312-cp312-win_amd64.whl'
$turnWheelHash = '5a497ed9dc7f11666b2226cf195c85bd12f511ad7d57dbd7857bec4c573b9031'
$turnWheelUrl = 'https://files.pythonhosted.org/packages/13/30/230770d450305c53cad880445d046c7f84c26507b61c50fe185ea15a29ca/livekit_local_inference-0.2.7-cp312-cp312-win_amd64.whl'

# Reuse existing NumPy; this helper never changes the STT/TTS environment.
$turnPythonProbe = @'
import sys,struct,numpy
assert sys.platform=='win32' and sys.version_info[:2]==(3,12) and struct.calcsize('P')==8, 'requires CPython 3.12 Windows x64'
'@
& $PythonPath -c $turnPythonProbe
if ($LASTEXITCODE -ne 0) { throw 'Turn-Detektor braucht bestehendes CPython 3.12 Windows x64 mit NumPy.' }
if (-not $CheckOnly) {
    New-Item -ItemType Directory -Path $turnDirectory -Force | Out-Null
    $turnWheelPath = Join-Path $turnDirectory $turnWheelName
    if (-not (Test-Path -LiteralPath $turnWheelPath -PathType Leaf)) {
        $turnPartialPath = $turnWheelPath + '.part'
        Invoke-WebRequest -Uri $turnWheelUrl -OutFile $turnPartialPath -UseBasicParsing -TimeoutSec 120
        if ((Get-FileHash -LiteralPath $turnPartialPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $turnWheelHash) { throw 'Turn-Detektor-Download: SHA256 stimmt nicht.' }
        Move-Item -LiteralPath $turnPartialPath -Destination $turnWheelPath
    }
    if ((Get-FileHash -LiteralPath $turnWheelPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $turnWheelHash) { throw 'Turn-Detektor-Wheel: SHA256 stimmt nicht.' }
    & $PythonPath -m pip install --disable-pip-version-check --no-index --no-deps --upgrade --target $turnPackages $turnWheelPath
    if ($LASTEXITCODE -ne 0) { throw 'Turn-Detektor konnte nicht in runtime/turn installiert werden.' }
    $turnProvenance = [ordered]@{ package = 'livekit-local-inference'; version = $turnVersion; model = 'turn-detector-v1-mini'; wheel = $turnWheelName; sha256 = $turnWheelHash; source = $turnWheelUrl; installedAt = [DateTime]::UtcNow.ToString('o') }
    $turnProvenance | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $turnDirectory 'provenance.json') -Encoding UTF8
}
$turnProbe = @'
import sys,json,time,math,importlib.metadata
sys.path.insert(0,sys.argv[1])
import numpy as np
from livekit.local_inference import EOT,EOT_MAX_SAMPLES
assert importlib.metadata.version('livekit-local-inference')=='0.2.7'
started=time.perf_counter();detector=EOT()
load_ms=round((time.perf_counter()-started)*1000,2)
started=time.perf_counter();probability=float(detector.predict(np.zeros(EOT_MAX_SAMPLES,dtype=np.int16)))
assert math.isfinite(probability) and 0<=probability<=1
detector.close()
print(json.dumps({'available':True,'model':'turn-detector-v1-mini','language':'de','threshold':0.245,'loadMs':load_ms,'probeMs':round((time.perf_counter()-started)*1000,2),'sampleRate':16000,'windowSamples':EOT_MAX_SAMPLES}))
'@
& $PythonPath -c $turnProbe $turnPackages
if ($LASTEXITCODE -ne 0) { throw 'Lokaler Turn-Detektor nicht bereit; Silero bleibt der Fallback.' }
