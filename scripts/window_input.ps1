param(
 [Parameter(Mandatory=$true)][long]$ExpectedPid,
 [Parameter(Mandatory=$true)][long]$ExpectedHandle,
 [Parameter(Mandatory=$true)][string]$ExpectedExe
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($ExpectedPid -le 0 -or $ExpectedHandle -le 0 -or -not [IO.Path]::IsPathRooted($ExpectedExe)) { throw 'Invalid Craft target.' }
$targetProcess = Get-Process -Id $ExpectedPid -ErrorAction Stop
if ($targetProcess.Path -ine $ExpectedExe -or $targetProcess.MainWindowHandle.ToInt64() -ne $ExpectedHandle) { throw 'Craft identity changed.' }
# Read-only native checks. No cursor, focus, input, window-state or desktop changes.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LilithCraftGeometry {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int x, y; }
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
 [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
 [DllImport("user32.dll")] public static extern IntPtr GetLastActivePopup(IntPtr window);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);
}
'@
$priorDpi = [LilithCraftGeometry]::SetThreadDpiAwarenessContext([IntPtr](-4))
if ($priorDpi -eq [IntPtr]::Zero) { throw 'Physical DPI context unavailable.' }
try {
 $window = [IntPtr]$ExpectedHandle
 [uint32]$owner = 0
 [void][LilithCraftGeometry]::GetWindowThreadProcessId($window,[ref]$owner)
 if (-not [LilithCraftGeometry]::IsWindow($window) -or $owner -ne $ExpectedPid) { throw 'Craft HWND owner changed.' }
 $frame = New-Object LilithCraftGeometry+Rect
 $client = New-Object LilithCraftGeometry+Rect
 $origin = New-Object LilithCraftGeometry+Point
 if ([LilithCraftGeometry]::DwmGetWindowAttribute($window,9,[ref]$frame,16) -ne 0 -or -not [LilithCraftGeometry]::GetClientRect($window,[ref]$client) -or -not [LilithCraftGeometry]::ClientToScreen($window,[ref]$origin)) { throw 'Craft geometry unavailable.' }
 [PSCustomObject]@{
  pid = [int]$ExpectedPid; windowId = [string]$ExpectedHandle; executablePath = $targetProcess.Path
  visible = [LilithCraftGeometry]::IsWindowVisible($window); minimized = [LilithCraftGeometry]::IsIconic($window); enabled = [LilithCraftGeometry]::IsWindowEnabled($window)
  popupWindowId = [string]([LilithCraftGeometry]::GetLastActivePopup($window).ToInt64()); dpi = [int]([LilithCraftGeometry]::GetDpiForWindow($window))
  frame = [ordered]@{ x=$frame.left; y=$frame.top; width=($frame.right-$frame.left); height=($frame.bottom-$frame.top) }
  client = [ordered]@{ x=$origin.x; y=$origin.y; width=($client.right-$client.left); height=($client.bottom-$client.top) }
 } | ConvertTo-Json -Depth 4 -Compress
} finally { [void][LilithCraftGeometry]::SetThreadDpiAwarenessContext($priorDpi) }
