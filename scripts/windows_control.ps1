param(
    [Parameter(Mandatory = $true)][ValidateSet('list', 'focus')][string]$Action,
    [ValidatePattern('^[1-9][0-9]{0,18}$')][string]$Id,
    [ValidateRange(0, 2147483647)][int]$ProcessId = 0,
    [string]$ProcessStartedAt
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$result = [ordered]@{ kind = $Action; accepted = $false; identityMatched = $false; activeDesktop = $false; sessionId = 0 }
if ($Action -eq 'focus') { $result.target = @{ id = $Id; pid = $ProcessId; processStartedAt = $ProcessStartedAt } }
try {
    # Fixed native window APIs; no keyboard simulation, UI text extraction or arbitrary shell.
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
namespace LilithWindows {
  public class WindowState { public string id; public int pid; public string title; public string app; public string processStartedAt; }
  public static class Desktop {
    delegate bool WindowCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, uint attribute, out int value, int length);
    [DllImport("kernel32.dll")] static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll")] static extern IntPtr GetThreadDesktop(uint threadId);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder value, int length, out int needed);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    public static int Session() { using (var process = Process.GetCurrentProcess()) return process.SessionId; }
    static bool DefaultDesktop(IntPtr desktop) {
      int needed; var name = new StringBuilder(256);
      return desktop != IntPtr.Zero && GetUserObjectInformation(desktop, 2, name, 512, out needed) && name.ToString() == "Default";
    }
    public static bool IsActive() {
      if (Session() <= 0 || WTSGetActiveConsoleSessionId() != (uint)Session() || !DefaultDesktop(GetThreadDesktop(GetCurrentThreadId()))) return false;
      var desktop = OpenInputDesktop(0, false, 1);
      if (desktop == IntPtr.Zero) return false;
      try { return DefaultDesktop(desktop); } finally { CloseDesktop(desktop); }
    }
    static bool NormalWindow(IntPtr window) {
      int cloaked; int style = GetWindowLong(window, -20);
      return IsWindow(window) && IsWindowVisible(window) && (style & 0x80) == 0
        && (GetWindow(window, 4) == IntPtr.Zero || (style & 0x40000) != 0)
        && DwmGetWindowAttribute(window, 14, out cloaked, 4) == 0 && cloaked == 0;
    }
    public static WindowState Inspect(IntPtr window) {
      if (!NormalWindow(window)) return null;
      uint owner; GetWindowThreadProcessId(window, out owner);
      if (owner == 0 || owner > Int32.MaxValue) return null;
      try {
        using (var process = Process.GetProcessById((int)owner)) {
          if (process.SessionId != Session()) return null;
          var text = new StringBuilder(513);
          if (GetWindowText(window, text, text.Capacity) <= 0) return null;
          string started = process.StartTime.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture);
          uint confirmed; GetWindowThreadProcessId(window, out confirmed);
          if (confirmed != owner || !NormalWindow(window) || process.HasExited) return null;
          return new WindowState { id = window.ToInt64().ToString(CultureInfo.InvariantCulture), pid = (int)owner,
            title = text.ToString(), app = process.ProcessName, processStartedAt = started };
        }
      } catch { return null; }
    }
    public static WindowState[] Read() {
      if (!IsActive()) throw new InvalidOperationException("DESKTOP_INACTIVE");
      var windows = new List<WindowState>();
      if (!EnumWindows((window, parameter) => { var record = Inspect(window); if (record != null) windows.Add(record); return true; }, IntPtr.Zero))
        throw new InvalidOperationException("ENUMERATION_FAILED");
      if (!IsActive()) throw new InvalidOperationException("DESKTOP_INACTIVE");
      return windows.ToArray();
    }
    public static bool Matches(IntPtr window, int processId, string started) {
      var value = Inspect(window);
      return value != null && value.pid == processId && value.processStartedAt == started;
    }
    public static bool Minimized(IntPtr window) { return IsIconic(window); }
    public static void Restore(IntPtr window) { ShowWindowAsync(window, 9); }
    public static void Focus(IntPtr window) { SetForegroundWindow(window); }
    public static string ForegroundId() { return GetForegroundWindow().ToInt64().ToString(CultureInfo.InvariantCulture); }
  }
}
'@
    $result.sessionId = [LilithWindows.Desktop]::Session()
    $result.activeDesktop = [LilithWindows.Desktop]::IsActive()
    if (-not $result.activeDesktop) { throw 'DESKTOP_INACTIVE' }
    if ($Action -eq 'list') {
        $result.windows = @([LilithWindows.Desktop]::Read())
    } else {
        if (-not $Id -or $ProcessId -le 0 -or $ProcessStartedAt -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,7}Z$') { throw 'INVALID_TARGET' }
        $targetHandle = [IntPtr]([long]::Parse($Id, [Globalization.CultureInfo]::InvariantCulture))
        if (-not [LilithWindows.Desktop]::IsActive() -or -not [LilithWindows.Desktop]::Matches($targetHandle, $ProcessId, $ProcessStartedAt)) { throw 'WINDOW_CHANGED' }
        $result.identityMatched = $true
        if ([LilithWindows.Desktop]::Minimized($targetHandle)) {
            $result.accepted = $true # A restore can take effect even if subsequent focus/readback fails.
            [LilithWindows.Desktop]::Restore($targetHandle)
            $restoreClock = [Diagnostics.Stopwatch]::StartNew()
            while ([LilithWindows.Desktop]::Minimized($targetHandle) -and $restoreClock.ElapsedMilliseconds -lt 1000) { Start-Sleep -Milliseconds 50 }
        }
        if (-not [LilithWindows.Desktop]::IsActive() -or -not [LilithWindows.Desktop]::Matches($targetHandle, $ProcessId, $ProcessStartedAt)) { throw 'WINDOW_CHANGED' }
        $result.accepted = $true
        [LilithWindows.Desktop]::Focus($targetHandle)
        if ([LilithWindows.Desktop]::ForegroundId() -ne $Id) {
            # A single validated UIA focus request; no control traversal or keyboard simulation.
            Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
            if ([LilithWindows.Desktop]::IsActive() -and [LilithWindows.Desktop]::Matches($targetHandle, $ProcessId, $ProcessStartedAt)) {
                try { [System.Windows.Automation.AutomationElement]::FromHandle($targetHandle).SetFocus() } catch {}
            }
        }
        $focusClock = [Diagnostics.Stopwatch]::StartNew()
        do {
            $result.activeDesktop = [LilithWindows.Desktop]::IsActive()
            $result.identityMatched = [LilithWindows.Desktop]::Matches($targetHandle, $ProcessId, $ProcessStartedAt)
            $result.minimized = [LilithWindows.Desktop]::Minimized($targetHandle)
            $result.foregroundId = [LilithWindows.Desktop]::ForegroundId()
            if (-not $result.activeDesktop -or -not $result.identityMatched -or $result.foregroundId -eq $Id -or $focusClock.ElapsedMilliseconds -ge 1500) { break }
            Start-Sleep -Milliseconds 50
        } while ($true)
        $foregroundHandle = [IntPtr]([long]::Parse($result.foregroundId, [Globalization.CultureInfo]::InvariantCulture))
        $foreground = [LilithWindows.Desktop]::Inspect($foregroundHandle)
        if ($foreground) { $result.foregroundPid = $foreground.pid; $result.foregroundProcessStartedAt = $foreground.processStartedAt }
    }
} catch {
    # Fixed error codes keep private PowerShell/native error detail out of API responses.
    $result.errorCode = if ($_.Exception.Message -in @('DESKTOP_INACTIVE', 'WINDOW_CHANGED', 'INVALID_TARGET')) { $_.Exception.Message } else { 'WINDOW_CONTROL_UNAVAILABLE' }
}
$result.observedAt = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
ConvertTo-Json -InputObject $result -Depth 5 -Compress
