$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# Read the foreground root window only. Never traverse controls or document bodies.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LilithForeground {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, StringBuilder title, int maxCount);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
}
'@
$foregroundHandle = [LilithForeground]::GetForegroundWindow()
if ($foregroundHandle -eq [IntPtr]::Zero) { 'null'; exit }
$titleBuffer = New-Object System.Text.StringBuilder 1024
[void][LilithForeground]::GetWindowText($foregroundHandle, $titleBuffer, $titleBuffer.Capacity)
[uint32]$foregroundProcessId = 0
[void][LilithForeground]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundProcessId)
$foregroundProcess = Get-Process -Id $foregroundProcessId -ErrorAction Stop
[PSCustomObject]@{
    app = $foregroundProcess.ProcessName
    windowTitle = $titleBuffer.ToString()
    pid = $foregroundProcessId
} | ConvertTo-Json -Compress
