param(
    [Parameter(Mandatory = $true)][ValidateSet('list', 'focus', 'place')][string]$Action,
    [ValidatePattern('^[1-9][0-9]{0,18}$')][string]$Id,
    [ValidateRange(0, 2147483647)][int]$ProcessId = 0,
    [string]$ProcessStartedAt,
    [string]$MonitorId,
    [int]$X, [int]$Y, [int]$Width, [int]$Height
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$result = [ordered]@{ kind = $Action; accepted = $false; identityMatched = $false; activeDesktop = $false; sessionId = 0 }
if ($Action -ne 'list') { $result.target = @{ id = $Id; pid = $ProcessId; processStartedAt = $ProcessStartedAt } }
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
  public class Frame { public int x; public int y; public int width; public int height; }
  public class MonitorState { public string id; public bool primary; public Frame bounds; public Frame workArea; }
  public class WindowState { public string id; public int pid; public string title; public string app; public string processStartedAt; public Frame rect; public bool minimized; }
  public static class Desktop {
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left,Top,Right,Bottom; }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct MonitorInfo { public int Size;public Rect Bounds,Work;public int Flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string Device; }
    delegate bool MonitorCallback(IntPtr monitor,IntPtr dc,ref Rect bounds,IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc,IntPtr clip,MonitorCallback callback,IntPtr parameter);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out Rect rect);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window,uint flags);
    public static void PhysicalPixels(){SetThreadDpiAwarenessContext(new IntPtr(-4));}
    static Frame FrameOf(Rect r){return new Frame{x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top};}
    public static Frame Bounds(IntPtr window){Rect r;if(!GetWindowRect(window,out r))throw new InvalidOperationException("WINDOW_CHANGED");return FrameOf(r);}
    public static MonitorState[] Monitors(){
      if(!IsActive())throw new InvalidOperationException("DESKTOP_INACTIVE");var list=new List<MonitorState>();
      MonitorCallback callback=delegate(IntPtr monitor,IntPtr dc,ref Rect bounds,IntPtr parameter){var info=new MonitorInfo();info.Size=Marshal.SizeOf(info);if(!GetMonitorInfo(monitor,ref info))return false;list.Add(new MonitorState{id=info.Device,primary=(info.Flags&1)!=0,bounds=FrameOf(info.Bounds),workArea=FrameOf(info.Work)});return true;};
      if(!EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,callback,IntPtr.Zero)||list.Count==0||!IsActive())throw new InvalidOperationException("DESKTOP_INACTIVE");return list.ToArray();
    }
    public static bool Place(IntPtr window,int x,int y,int width,int height){return SetWindowPos(window,IntPtr.Zero,x,y,width,height,0x4014);}
    public static bool MoveToMonitor(IntPtr window,int x,int y){return SetWindowPos(window,IntPtr.Zero,x,y,0,0,0x4015);}
    public static string MonitorId(IntPtr window){var info=new MonitorInfo();info.Size=Marshal.SizeOf(info);if(!GetMonitorInfo(MonitorFromWindow(window,2),ref info))throw new InvalidOperationException("WINDOW_CHANGED");return info.Device;}
    delegate bool WindowCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr window);
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
            title = text.ToString(), app = process.ProcessName, processStartedAt = started,rect=Bounds(window),minimized=IsIconic(window) };
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
    public static bool Maximized(IntPtr window) { return IsZoomed(window); }
    public static void RestoreForPlacement(IntPtr window) { ShowWindowAsync(window, 4); }
    public static void Restore(IntPtr window) { ShowWindowAsync(window, 9); }
    public static void Focus(IntPtr window) { SetForegroundWindow(window); }
    public static string ForegroundId() { return GetForegroundWindow().ToInt64().ToString(CultureInfo.InvariantCulture); }
  }
}
'@
    [LilithWindows.Desktop]::PhysicalPixels()
    $result.sessionId = [LilithWindows.Desktop]::Session()
    $result.activeDesktop = [LilithWindows.Desktop]::IsActive()
    if (-not $result.activeDesktop) { throw 'DESKTOP_INACTIVE' }
    if ($Action -eq 'list') {
        $result.monitors = @([LilithWindows.Desktop]::Monitors())
        $result.windows = @([LilithWindows.Desktop]::Read())
    } else {
        if (-not $Id -or $ProcessId -le 0 -or $ProcessStartedAt -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,7}Z$') { throw 'INVALID_TARGET' }
        $targetHandle = [IntPtr]([long]::Parse($Id, [Globalization.CultureInfo]::InvariantCulture))
        if (-not [LilithWindows.Desktop]::IsActive() -or -not [LilithWindows.Desktop]::Matches($targetHandle, $ProcessId, $ProcessStartedAt)) { throw 'WINDOW_CHANGED' }
        $result.identityMatched = $true
        if($Action -eq 'place') {
            $monitor=@([LilithWindows.Desktop]::Monitors() | Where-Object {$_.id -ceq $MonitorId})
            if($monitor.Count -ne 1 -or $Width -lt 160 -or $Height -lt 100 -or $Width -gt 32768 -or $Height -gt 32768){throw 'INVALID_TARGET'}
            $area=$monitor[0].workArea
            if($X -lt $area.x -or $Y -lt $area.y -or [long]$X+$Width -gt [long]$area.x+$area.width -or [long]$Y+$Height -gt [long]$area.y+$area.height){throw 'INVALID_TARGET'}
            $result.monitorId=$MonitorId;$result.workArea=$area
        }
        $restoreStarted=$false
        if ([LilithWindows.Desktop]::Minimized($targetHandle) -or ($Action -eq 'place' -and [LilithWindows.Desktop]::Maximized($targetHandle))) {
            $restoreStarted=$true
            $result.accepted = $true # A restore can take effect even if subsequent focus/readback fails.
            if($Action -eq 'place'){[LilithWindows.Desktop]::RestoreForPlacement($targetHandle)}else{[LilithWindows.Desktop]::Restore($targetHandle)}
            $restoreClock = [Diagnostics.Stopwatch]::StartNew()
            while (([LilithWindows.Desktop]::Minimized($targetHandle) -or ($Action -eq 'place' -and [LilithWindows.Desktop]::Maximized($targetHandle))) -and $restoreClock.ElapsedMilliseconds -lt 1000) { Start-Sleep -Milliseconds 50 }
        }
        if (-not [LilithWindows.Desktop]::IsActive() -or -not [LilithWindows.Desktop]::Matches($targetHandle, $ProcessId, $ProcessStartedAt)) { throw 'WINDOW_CHANGED' }
        if($Action -eq 'place'){
            if([LilithWindows.Desktop]::MonitorId($targetHandle) -cne $MonitorId){
                # WM_DPICHANGED may resize the application after monitor migration.
                # Finish that migration before setting the requested physical size.
                $moved=[LilithWindows.Desktop]::MoveToMonitor($targetHandle,$X,$Y);$result.accepted=$restoreStarted -or $moved
                if(-not $moved){throw 'WINDOW_CONTROL_UNAVAILABLE'}
                $clock=[Diagnostics.Stopwatch]::StartNew();$stable=0;$last=''
                do{
                    if(-not [LilithWindows.Desktop]::IsActive() -or -not [LilithWindows.Desktop]::Matches($targetHandle,$ProcessId,$ProcessStartedAt)){throw 'WINDOW_CHANGED'}
                    $frame=[LilithWindows.Desktop]::Bounds($targetHandle);$key="$($frame.x),$($frame.y),$($frame.width),$($frame.height)"
                    if([LilithWindows.Desktop]::MonitorId($targetHandle) -ceq $MonitorId -and $key -ceq $last){$stable++}else{$stable=0};$last=$key
                    if($stable -ge 3){break};Start-Sleep -Milliseconds 50
                }while($clock.ElapsedMilliseconds -lt 1000)
                if($stable -lt 3 -or $frame.x -ne $X -or $frame.y -ne $Y){throw 'WINDOW_CHANGED'}
            }
            $monitor=@([LilithWindows.Desktop]::Monitors() | Where-Object {$_.id -ceq $MonitorId})
            if($monitor.Count -ne 1){throw 'WINDOW_CHANGED'};$area=$monitor[0].workArea;$result.workArea=$area
            if($X -lt $area.x -or $Y -lt $area.y -or [long]$X+$Width -gt [long]$area.x+$area.width -or [long]$Y+$Height -gt [long]$area.y+$area.height){throw 'WINDOW_CHANGED'}
            $result.placementAccepted=[LilithWindows.Desktop]::Place($targetHandle,$X,$Y,$Width,$Height);$result.accepted=$result.accepted -or $result.placementAccepted
            $clock=[Diagnostics.Stopwatch]::StartNew()
            do{
                $result.activeDesktop=[LilithWindows.Desktop]::IsActive();$result.identityMatched=[LilithWindows.Desktop]::Matches($targetHandle,$ProcessId,$ProcessStartedAt)
                if(-not $result.activeDesktop -or -not $result.identityMatched){throw 'WINDOW_CHANGED'}
                $result.minimized=[LilithWindows.Desktop]::Minimized($targetHandle);$result.rect=[LilithWindows.Desktop]::Bounds($targetHandle)
                if(-not $result.placementAccepted -or ($result.rect.x -eq $X -and $result.rect.y -eq $Y -and $result.rect.width -eq $Width -and $result.rect.height -eq $Height) -or $clock.ElapsedMilliseconds -ge 1500){break};Start-Sleep -Milliseconds 50
            }while($true)
        } else {
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
    }
} catch {
    # Fixed error codes keep private PowerShell/native error detail out of API responses.
    $result.errorCode = if ($_.Exception.Message -in @('DESKTOP_INACTIVE', 'WINDOW_CHANGED', 'INVALID_TARGET')) { $_.Exception.Message } else { 'WINDOW_CONTROL_UNAVAILABLE' }
}
$result.observedAt = [DateTime]::UtcNow.ToString('o', [Globalization.CultureInfo]::InvariantCulture)
ConvertTo-Json -InputObject $result -Depth 5 -Compress
