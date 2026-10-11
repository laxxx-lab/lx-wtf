param(
    [Parameter(Mandatory = $true)][ValidateSet('app.open', 'volume', 'spotify')][string]$Kind,
    [ValidateSet('up', 'down', 'mute', 'unmute', 'set', 'play', 'pause', 'next', 'previous')][string]$Action,
    [ValidateRange(0, 100)][int]$Value = 0,
    [string]$Reference = '',
    [switch]$ObserveOnly
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$clock = [Diagnostics.Stopwatch]::StartNew()
$accepted = $false
$result = [ordered]@{ kind = $Kind; action = $Action; accepted = $false; observationOnly = [bool]$ObserveOnly }

try {
    # Fixed native interfaces only. No shell text, SendKeys, global media key or focus change.
    Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
namespace LilithDirect {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    void EnumAudioEndpoints(int flow, uint mask, out IntPtr devices);
    void GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    void Activate(ref Guid iid, uint context, IntPtr activation, [MarshalAs(UnmanagedType.IUnknown)] out object endpoint);
    void OpenPropertyStore(uint access, out IntPtr store);
    void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    void GetState(out uint state);
  }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    void RegisterControlChangeNotify(IntPtr callback);
    void UnregisterControlChangeNotify(IntPtr callback);
    void GetChannelCount(out uint count);
    void SetMasterVolumeLevel(float level, ref Guid context);
    void SetMasterVolumeLevelScalar(float level, ref Guid context);
    void GetMasterVolumeLevel(out float level);
    void GetMasterVolumeLevelScalar(out float level);
    void SetChannelVolumeLevel(uint channel, float level, ref Guid context);
    void SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
    void GetChannelVolumeLevel(uint channel, out float level);
    void GetChannelVolumeLevelScalar(uint channel, out float level);
    void SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
    void GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
  }
  public class VolumeState { public string endpointId; public double level; public bool muted; }
  public static class Audio {
    static IAudioEndpointVolume Open(out string id) {
      var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
      IMMDevice device = null; object endpoint = null;
      try {
        enumerator.GetDefaultAudioEndpoint(0, 1, out device);
        device.GetId(out id);
        Guid iid = typeof(IAudioEndpointVolume).GUID;
        device.Activate(ref iid, 23, IntPtr.Zero, out endpoint);
        return (IAudioEndpointVolume)endpoint;
      } finally { if (device != null) Marshal.ReleaseComObject(device); Marshal.ReleaseComObject(enumerator); }
    }
    public static VolumeState Read() {
      string id; var endpoint = Open(out id);
      try { float level; bool muted; endpoint.GetMasterVolumeLevelScalar(out level); endpoint.GetMute(out muted);
        return new VolumeState { endpointId = id, level = Math.Round(level * 100.0, 4), muted = muted }; }
      finally { Marshal.ReleaseComObject(endpoint); }
    }
    public static void Change(string action, double value, string expectedEndpoint) {
      string id; var endpoint = Open(out id);
      try {
        if (id != expectedEndpoint) throw new InvalidOperationException("Audio-Ausgabegerät hat gewechselt.");
        Guid context = Guid.Empty;
        if (action == "mute" || action == "unmute") endpoint.SetMute(action == "mute", ref context);
        else endpoint.SetMasterVolumeLevelScalar((float)(value / 100.0), ref context);
      } finally { Marshal.ReleaseComObject(endpoint); }
    }
  }
  public class WindowState { public string handle; public int processId; public int sessionId; public bool visible; public string matchedReference; }
  public static class Desktop {
    delegate bool WindowCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("kernel32.dll")] static extern bool ProcessIdToSessionId(uint processId, out uint sessionId);
    [DllImport("kernel32.dll")] static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder image, ref uint length);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr process, ref uint length, StringBuilder appId);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, uint attribute, out int value, int length);
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder value, int length, out int needed);
    public static int Session() { return Process.GetCurrentProcess().SessionId; }
    public static bool IsActive() {
      if (Session() <= 0 || WTSGetActiveConsoleSessionId() != (uint)Session()) return false;
      var desktop = OpenInputDesktop(0, false, 1);
      if (desktop == IntPtr.Zero) return false;
      try { int needed; var name = new StringBuilder(256); return GetUserObjectInformation(desktop, 2, name, 512, out needed) && name.ToString() == "Default"; }
      finally { CloseDesktop(desktop); }
    }
    static bool Matches(IntPtr window, string appId, string executable, out uint processId) {
      GetWindowThreadProcessId(window, out processId);
      uint session; if (!IsWindowVisible(window) || !ProcessIdToSessionId(processId, out session) || session != (uint)Session()) return false;
      var process = OpenProcess(0x1000, false, processId); if (process == IntPtr.Zero) return false;
      try {
        uint length = 32768; var text = new StringBuilder((int)length);
        if (!String.IsNullOrEmpty(executable)) return QueryFullProcessImageName(process, 0, text, ref length) && String.Equals(text.ToString(), executable, StringComparison.OrdinalIgnoreCase);
        length = 0; if (GetApplicationUserModelId(process, ref length, null) != 122 || length > 1024) return false;
        text = new StringBuilder((int)length);
        return GetApplicationUserModelId(process, ref length, text) == 0 && String.Equals(text.ToString(), appId, StringComparison.OrdinalIgnoreCase);
      } finally { CloseHandle(process); }
    }
    public static WindowState Find(string reference, string appId, string executable) {
      WindowState found = null;
      EnumWindows((window, parameter) => {
        int cloaked; if (!IsWindowVisible(window) || IsIconic(window) || DwmGetWindowAttribute(window, 14, out cloaked, 4) != 0 || cloaked != 0) return true;
        uint matchedProcess; bool matches = Matches(window, appId, executable, out matchedProcess);
        if (!matches && !String.IsNullOrEmpty(appId)) {
          uint childProcess = 0;
          EnumChildWindows(window, (child, ignored) => { uint candidate; if (Matches(child, appId, executable, out candidate)) { childProcess = candidate; return false; } return true; }, IntPtr.Zero);
          matches = childProcess > 0; matchedProcess = childProcess;
        }
        if (matches) { found = new WindowState { handle = window.ToInt64().ToString(), processId = (int)matchedProcess, sessionId = Session(), visible = true, matchedReference = reference }; return false; }
        return true;
      }, IntPtr.Zero);
      return found;
    }
  }
}
'@
    if (-not [LilithDirect.Desktop]::IsActive()) { throw 'Kein aktiver angemeldeter Windows-Desktop.' }

    if ($Kind -eq 'volume') {
        if ($Action -notin @('up', 'down', 'mute', 'unmute', 'set')) { throw 'Ungültige Lautstärkeaktion.' }
        $before = [LilithDirect.Audio]::Read()
        $expected = $before.level
        if ($Action -eq 'set') { $expected = $Value }
        if ($Action -eq 'up') { $expected = [Math]::Min(100, $before.level + 10) }
        if ($Action -eq 'down') { $expected = [Math]::Max(0, $before.level - 10) }
        $result.before = $before
        $result.expected = @{ level = $expected; muted = $(if ($Action -eq 'mute') { $true } elseif ($Action -eq 'unmute') { $false } else { $before.muted }) }
        $accepted = $true
        if (-not $ObserveOnly) { [LilithDirect.Audio]::Change($Action, $expected, $before.endpointId) }
        $result.after = [LilithDirect.Audio]::Read()
        if ($result.after.endpointId -cne $before.endpointId) { throw 'Audio-Ausgabegerät hat während der Prüfung gewechselt.' }
    } elseif ($Kind -eq 'app.open') {
        $appId = ''; $executable = ''
        if ($Reference -match '^app:([A-Za-z0-9][A-Za-z0-9._-]*![A-Za-z0-9][A-Za-z0-9._-]*)$' -and $Reference.Length -le 132) {
            $appId = $Matches[1]
            if (-not @(Get-StartApps | Where-Object { $_.AppID -ieq $appId }).Count) { throw 'Anwendung ist nicht mehr in AppsFolder installiert.' }
        } elseif ($Reference.Length -le 1000 -and $Reference -match '^[A-Za-z]:[\\/]' -and $Reference -notmatch '[\x00-\x1f<>"|?*]' -and $Reference -match '\.(exe|lnk|appref-ms)$' -and (Test-Path -LiteralPath $Reference -PathType Leaf)) {
            if ([IO.Path]::GetExtension($Reference) -ieq '.exe') { $executable = [IO.Path]::GetFullPath($Reference) }
            elseif ([IO.Path]::GetExtension($Reference) -ieq '.lnk') {
                $shell = New-Object -ComObject WScript.Shell
                try { $target = $shell.CreateShortcut($Reference).TargetPath } finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
                if ($target -match '^[A-Za-z]:[\\/].+\.exe$' -and (Test-Path -LiteralPath $target -PathType Leaf)) { $executable = [IO.Path]::GetFullPath($target) }
            }
        } else { throw 'Ungültige oder fehlende Anwendung im App-Katalog.' }
        $result.reference = $Reference; $result.installed = $true; $result.desktopSessionId = [LilithDirect.Desktop]::Session()
        $accepted = $true
        if (-not $ObserveOnly) {
            $start = New-Object Diagnostics.ProcessStartInfo
            if ($appId) {
                $start.FileName = Join-Path $env:SystemRoot 'explorer.exe'; $start.Arguments = 'shell:AppsFolder\' + $appId; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
            } else { $start.FileName = $Reference; $start.UseShellExecute = $true }
            [void][Diagnostics.Process]::Start($start)
        }
        $until = [Math]::Min(14000, $clock.ElapsedMilliseconds + $(if ($ObserveOnly) { 0 } else { 7000 }))
        do {
            if (-not [LilithDirect.Desktop]::IsActive()) { throw 'Windows-Desktop ist während der Prüfung nicht mehr aktiv.' }
            $result.window = [LilithDirect.Desktop]::Find($Reference, $appId, $executable)
            if ($result.window -or $ObserveOnly -or $clock.ElapsedMilliseconds -ge $until) { break }
            Start-Sleep -Milliseconds 200
        } while ($true)
    } else {
        if ($Action -notin @('play', 'pause', 'next', 'previous')) { throw 'Ungültige Spotify-Aktion.' }
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
        [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
        $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        } | Select-Object -First 1
        function Await-WinRt($operation, [Type]$type) {
            $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
            $wait = [Math]::Min(1500, [Math]::Max(1, 14000 - $clock.ElapsedMilliseconds))
            if (-not $task.Wait([int]$wait)) { throw 'Zeitlimit beim Lesen der Windows-Mediensitzung.' }
            return $task.Result
        }
        $manager = Await-WinRt ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
        $sources = @('Spotify.exe', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify')
        function Find-Spotify {
            $sessions = @($manager.GetSessions() | Where-Object { $sources -ccontains $_.SourceAppUserModelId })
            if ($sessions.Count -ne 1) { throw 'Keine eindeutige Spotify-Sitzung in Windows SMTC.' }
            return $sessions[0]
        }
        function Read-Spotify($session) {
            $properties = Await-WinRt ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
            return @{ sourceAppId = [string]$session.SourceAppUserModelId; playbackState = [string]$session.GetPlaybackInfo().PlaybackStatus; title = ([string]$properties.Title).Substring(0, [Math]::Min(300, ([string]$properties.Title).Length)); artist = ([string]$properties.Artist).Substring(0, [Math]::Min(300, ([string]$properties.Artist).Length)) }
        }
        $session = Find-Spotify
        $before = Read-Spotify $session
        $result.before = $before; $result.after = $before
        if ($ObserveOnly) { $accepted = $true } else {
            $accepted = $true # From here a timeout can mean an applied action; never report safe failure.
            $operation = switch ($Action) { 'play' { $session.TryPlayAsync() } 'pause' { $session.TryPauseAsync() } 'next' { $session.TrySkipNextAsync() } 'previous' { $session.TrySkipPreviousAsync() } }
            $requested = Await-WinRt $operation ([bool])
            if (-not $requested) { $accepted = $false; throw 'Spotify hat die Aktion abgelehnt.' }
            $until = [Math]::Min(13500, $clock.ElapsedMilliseconds + 5000)
            do {
                if (-not [LilithDirect.Desktop]::IsActive()) { throw 'Windows-Desktop ist während der Prüfung nicht mehr aktiv.' }
                $after = Read-Spotify (Find-Spotify)
                $result.after = $after
                $changed = $after.sourceAppId -ceq $before.sourceAppId -and $(if ($Action -eq 'play') { $after.playbackState -eq 'Playing' } elseif ($Action -eq 'pause') { $after.playbackState -eq 'Paused' } else { $after.title -and $before.title -and ($after.title -cne $before.title -or $after.artist -cne $before.artist) -and $after.playbackState -eq $before.playbackState })
                if ($changed -or $clock.ElapsedMilliseconds -ge $until) { break }
                Start-Sleep -Milliseconds 200
            } while ($true)
        }
    }
} catch {
    $result.error = $_.Exception.Message.Substring(0, [Math]::Min(400, $_.Exception.Message.Length))
    $result.effectUnknown = $accepted -and -not $ObserveOnly
}
$result.accepted = $accepted
$result.observedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
ConvertTo-Json -InputObject $result -Depth 6 -Compress
