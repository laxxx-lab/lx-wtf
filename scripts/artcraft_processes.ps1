param(
    [Parameter(Mandatory=$true)][string]$InstallRoot,
    [long]$FocusPid = 0,
    [long]$FocusHandle = 0,
    [string]$FocusExe = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$knownApps = @('Photo','Vector','Design','Deck','Grid','Word','Cad','Light','Sound','Effect','Film','Pdf')
$knownPaths = @{}
foreach ($appName in $knownApps) {
    $exePath = [IO.Path]::GetFullPath((Join-Path $InstallRoot ('apps\' + $appName + 'Craft\' + $appName.ToLowerInvariant() + 'craft.exe')))
    if (Test-Path -LiteralPath $exePath -PathType Leaf) { $knownPaths[$exePath.ToLowerInvariant()] = $exePath }
}
if ($FocusPid -gt 0) {
    # Only this explicit-click branch activates a precisely identified native window.
    if ($FocusHandle -le 0 -or -not $knownPaths.ContainsKey($FocusExe.ToLowerInvariant())) { throw 'Unknown Craft focus target.' }
    $targetProcess = Get-Process -Id $FocusPid -ErrorAction Stop
    if ($targetProcess.Path -ine $FocusExe -or $targetProcess.MainWindowHandle.ToInt64() -ne $FocusHandle) { throw 'Craft window identity changed.' }
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LilithCraftFocus {
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
}
'@
    $targetHandle = [IntPtr]$FocusHandle
    [uint32]$windowOwner = 0
    [void][LilithCraftFocus]::GetWindowThreadProcessId($targetHandle,[ref]$windowOwner)
    if (-not [LilithCraftFocus]::IsWindow($targetHandle) -or $windowOwner -ne $FocusPid) { throw 'Craft window identity changed.' }
    [void][LilithCraftFocus]::ShowWindow($targetHandle,9)
    if (-not [LilithCraftFocus]::SetForegroundWindow($targetHandle)) { throw 'Craft focus refused.' }
    '{"focused":true}'
    exit
}
$processRecords = @()
foreach ($candidate in @(Get-CimInstance Win32_Process)) {
    if (-not $candidate.ExecutablePath) { continue }
    $identity = $candidate.ExecutablePath.ToLowerInvariant()
    if (-not $knownPaths.ContainsKey($identity)) { continue }
    try { $nativeProcess = Get-Process -Id $candidate.ProcessId -ErrorAction Stop } catch { continue }
    $record = [ordered]@{ pid = [int]$candidate.ProcessId; executablePath = $knownPaths[$identity]; mainWindowHandle = $nativeProcess.MainWindowHandle.ToInt64() }
    # Parse only known control arguments; never output or persist the raw command line.
    $parts = @([regex]::Matches([string]$candidate.CommandLine,'(?:"[^"]*"|[^\s"]+)+') | ForEach-Object { $_.Value.Trim('"') })
    for ($index = 1; $index -lt $parts.Count; $index++) {
        $flag = $parts[$index]
        $value = $null
        if ($flag -match '^(--control|--control-token-file)=(.+)$') { $flag = $Matches[1]; $value = $Matches[2].Trim('"') }
        elseif (($flag -eq '--control' -or $flag -eq '--control-token-file') -and $index + 1 -lt $parts.Count) { $index++; $value = $parts[$index] }
        if (-not $value) { continue }
        if ($flag -eq '--control-token-file') { $record.tokenFile = $value }
        elseif ([IO.Path]::GetFileNameWithoutExtension($record.executablePath) -eq 'pdfcraft') { $record.endpointFile = $value }
        else { $controlNumber = 0; if ([int]::TryParse($value,[ref]$controlNumber) -and $controlNumber -gt 0 -and $controlNumber -le 65535) { $record.controlPort = $controlNumber } }
    }
    $processRecords += [PSCustomObject]$record
}
$ownerPids = @($processRecords | ForEach-Object { $_.pid })
$listeners = @()
if ($ownerPids.Count) {
    foreach ($listener in @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue)) {
        if ($ownerPids -contains [int]$listener.OwningProcess -and $listener.LocalAddress -eq '127.0.0.1') {
            $listeners += [PSCustomObject]@{ pid = [int]$listener.OwningProcess; port = [int]$listener.LocalPort; localAddress = '127.0.0.1' }
        }
    }
}
[PSCustomObject]@{ processes = @($processRecords); listeners = @($listeners) } | ConvertTo-Json -Depth 5 -Compress
