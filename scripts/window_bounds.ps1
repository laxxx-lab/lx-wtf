[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[1-9][0-9]{0,15}$')][string]$WindowId,
    [Parameter(Mandatory=$true)][ValidateRange(1,4294967295)][uint64]$ProcessId
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# Read metadata and geometry for this exact HWND only. Never traverse controls or send input.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LilithGuideWindow {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out RECT rect);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, StringBuilder title, int maxCount);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
[int64]$handleNumber = 0
if (-not [int64]::TryParse($WindowId, [ref]$handleNumber) -or $handleNumber -le 0 -or $handleNumber -gt 9007199254740991) { '{"valid":false}'; exit }
$targetHandle = New-Object IntPtr $handleNumber
$previousDpiContext = [IntPtr]::Zero
try {
    # Per-monitor DPI awareness makes GetWindowRect physical rather than DPI-virtualized.
    $previousDpiContext = [LilithGuideWindow]::SetThreadDpiAwarenessContext((New-Object IntPtr -ArgumentList -4))
    if ($previousDpiContext -eq [IntPtr]::Zero) { '{"valid":false}'; exit }
    if (-not [LilithGuideWindow]::IsWindow($targetHandle)) { '{"valid":false}'; exit }
    [uint32]$ownerProcessId = 0
    [void][LilithGuideWindow]::GetWindowThreadProcessId($targetHandle, [ref]$ownerProcessId)
    if ($ownerProcessId -ne $ProcessId) { '{"valid":false}'; exit }
    $windowRect = New-Object LilithGuideWindow+RECT
    if (-not [LilithGuideWindow]::GetWindowRect($targetHandle, [ref]$windowRect)) { '{"valid":false}'; exit }
    $titleBuffer = New-Object System.Text.StringBuilder 1024
    [void][LilithGuideWindow]::GetWindowText($targetHandle, $titleBuffer, $titleBuffer.Capacity)
    $targetProcess = Get-Process -Id $ProcessId -ErrorAction Stop
    [uint32]$confirmedProcessId = 0
    [void][LilithGuideWindow]::GetWindowThreadProcessId($targetHandle, [ref]$confirmedProcessId)
    if (-not [LilithGuideWindow]::IsWindow($targetHandle) -or $confirmedProcessId -ne $ProcessId) { '{"valid":false}'; exit }
    [PSCustomObject]@{
        valid = $true
        windowId = $handleNumber
        pid = $ownerProcessId
        x = $windowRect.Left
        y = $windowRect.Top
        width = $windowRect.Right - $windowRect.Left
        height = $windowRect.Bottom - $windowRect.Top
        minimized = [LilithGuideWindow]::IsIconic($targetHandle)
        visible = [LilithGuideWindow]::IsWindowVisible($targetHandle)
        app = $targetProcess.ProcessName
        windowTitle = $titleBuffer.ToString()
    } | ConvertTo-Json -Compress
} finally {
    if ($previousDpiContext -ne [IntPtr]::Zero) { [void][LilithGuideWindow]::SetThreadDpiAwarenessContext($previousDpiContext) }
}
