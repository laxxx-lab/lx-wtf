[CmdletBinding(SupportsShouldProcess=$true,ConfirmImpact='Medium')]
param([switch]$StopServiceSession)
$ErrorActionPreference='Stop'

# Only repair Spotify processes stranded in Windows service session 0.
# Leave Spotify in the user's interactive desktop session alone.
function Get-StrandedSpotify {
    @(Get-CimInstance Win32_Process -Filter "Name = 'Spotify.exe' AND SessionId = 0")
}
$stranded=Get-StrandedSpotify
if (-not $stranded.Count) { Write-Output 'Keine Spotify-Prozesse in Dienstsitzung 0 gefunden.'; return }
if (-not $StopServiceSession) {
    $stranded | Select-Object ProcessId,SessionId,ExecutablePath
    Write-Output 'Zum Beenden dieser Fehlstarts in einer PowerShell als Administrator mit -StopServiceSession aufrufen.'
    return
}
$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal=[System.Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Diese Fehlstarts sind geschützt. Bitte dieses Skript in einer PowerShell als Administrator aufrufen.'
}
$validated=@()
foreach($item in $stranded) {
    # Recheck the PID before changing it; do not trust an earlier process list.
    $current=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$item.ProcessId)
    if (-not $current) { continue }
    if ($current.Name -ne 'Spotify.exe' -or $current.SessionId -ne 0 -or
        $current.ExecutablePath -notmatch '^C:\\Program Files\\WindowsApps\\SpotifyAB\.SpotifyMusic_[^\\]+\\Spotify\.exe$') {
        throw ('Prozess '+$item.ProcessId+' ist kein bestätigter Spotify-Fehlstart; keine Änderung.')
    }
    $validated+=$current
}
$attempted=$false
foreach($item in $validated) {
    $current=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$item.ProcessId)
    if (-not $current) { continue }
    if ($current.Name -ne $item.Name -or $current.SessionId -ne 0 -or $current.ExecutablePath -ne $item.ExecutablePath) {
        throw ('Prozess '+$item.ProcessId+' hat sich verändert; keine weitere Änderung.')
    }
    if ($PSCmdlet.ShouldProcess('Spotify PID '+$current.ProcessId+' in Sitzung 0','Fehlstart beenden')) {
        $attempted=$true
        Stop-Process -Id $current.ProcessId -Force
    }
}
if (-not $attempted) { Write-Output 'Keine Prozesse beendet (Vorschau oder abgelehnte Aktion).'; return }
$remaining=Get-StrandedSpotify
if ($remaining.Count) { throw ('Spotify-Fehlstarts verbleiben: '+(($remaining.ProcessId) -join ', ')) }
Write-Output 'Spotify-Fehlstarts beendet. Spotify kann jetzt über den Desktop-Treiber gestartet werden.'
