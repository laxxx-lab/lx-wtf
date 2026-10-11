param(
 [Parameter(Mandatory=$true)][ValidateSet('target','clipboard','window')][string]$Kind,
 [long]$ExpectedPid=0,
 [long]$ExpectedHandle=0,
 [string]$ExpectedApp='',
 [string]$ExpectedTitle='',
 [string]$ExpectedProcessStart='',
 [string]$OwnProcessIds=''
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
# One explicitly requested, read-only observation. No focus/input, clipboard writes or watchers.
try {
 $wpf=Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'WPF'
 Add-Type -ReferencedAssemblies (Join-Path $wpf 'UIAutomationClient.dll'),(Join-Path $wpf 'UIAutomationTypes.dll'),(Join-Path $wpf 'WindowsBase.dll') -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Automation;

public sealed class LilithContentWindow {
 public string kind="window",label,app,windowTitle,hwnd,processStartedAt;
 public int pid;
}
public sealed class LilithContentObservation {
 public bool ok=true,truncated=false;
 public string kind,observedAt,text="";
 public LilithContentWindow source;
 public string[] limitations=new string[0];
}
public static class LilithCurrentContent {
 const int MaxText=20000,MaxNodes=600;
 static readonly Regex SensitiveApp=new Regex(@"(?:^|[^a-z])(1password|bitwarden|keepass(?:xc)?|lastpass|dashlane|nordpass|enpass)(?:$|[^a-z])",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
 static readonly Regex SensitiveName=new Regex(@"passw[oö]r(?:d|t)|kennwort|secret|token|api[ _-]?key|anmeld(?:ung|en)|sign[ -]?in|log[ -]?in|authenticat|authentifiz|banking|bankkonto|payment|zahlung|credit card|kreditkarte|private browsing|incognito|inkognito|inprivate",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
 static readonly Regex OwnApp=new Regex(@"^(?:hermes|lilith)[ ._-]voice$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
 static readonly Regex OwnTitle=new Regex(@"^(?:hermes|lilith)\s+(?:voice|workbench|craft|overlay)(?:[ .:–—-]|$)",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr handle,StringBuilder value,int maximum);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr handle);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr handle);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr handle);
 [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr handle,int index,StringBuilder value,int length,out int needed);
 [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr handle);
 [DllImport("kernel32.dll")] static extern uint WTSGetActiveConsoleSessionId();
 [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr owner);
 [DllImport("user32.dll")] static extern bool CloseClipboard();
 [DllImport("user32.dll")] static extern bool IsClipboardFormatAvailable(uint format);
 [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint format);
 [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
 [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr memory);
 [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr memory);
 [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr memory);

 static Exception Rejected(string code){return new InvalidOperationException(code);}
 public static string Bounded(string value){
  if(value==null)return "";
  int count=Math.Min(value.Length,MaxText);
  if(count>0&&Char.IsHighSurrogate(value[count-1]))count--;
  string text=value.Substring(0,count);
  return Regex.Replace(text,@"[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]","\uFFFD");
 }
 public static void RequireAllowed(LilithContentWindow window,int[] ownPids){
  if(window==null)throw Rejected("UNAVAILABLE");
  if(Array.IndexOf(ownPids,window.pid)>=0||OwnApp.IsMatch(window.app)||OwnTitle.IsMatch(window.windowTitle))throw Rejected("OWN_WINDOW");
  if(SensitiveApp.IsMatch(window.app)||SensitiveName.IsMatch(window.windowTitle))throw Rejected("SENSITIVE_WINDOW");
 }
 public static void RequireReadableControl(bool isPassword,ControlType type,string name){
  if(isPassword)throw Rejected("SENSITIVE_WINDOW");
  name=(name??"").Trim();
  // A document discussing credentials is data; authentication widgets and short field labels are excluded.
  if(name.Length>0&&name.Length<=120&&
    ((type==ControlType.Edit||type==ControlType.Button||type==ControlType.Hyperlink)&&SensitiveName.IsMatch(name)||
     type==ControlType.Text&&Regex.IsMatch(name,@"^(?:passw[oö]r(?:d|t)|kennwort|token|secret|api[ _-]?key|anmelden|anmeldung|sign[ -]?in|log[ -]?in)[: ]*$",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant)))throw Rejected("SENSITIVE_WINDOW");
 }
 public static void RequireSameIdentity(LilithContentWindow before,LilithContentWindow after){
  if(before==null||after==null||before.pid!=after.pid||before.hwnd!=after.hwnd||before.app!=after.app||before.windowTitle!=after.windowTitle||before.processStartedAt!=after.processStartedAt)throw Rejected("WINDOW_CHANGED");
 }
 static void RequireDesktop(){
  if(WTSGetActiveConsoleSessionId()!=(uint)Process.GetCurrentProcess().SessionId)throw Rejected("DESKTOP_UNAVAILABLE");
  IntPtr desktop=OpenInputDesktop(0,false,1);
  if(desktop==IntPtr.Zero)throw Rejected("DESKTOP_UNAVAILABLE");
  try {
   StringBuilder name=new StringBuilder(256);int needed;
   if(!GetUserObjectInformation(desktop,2,name,name.Capacity*2,out needed)||name.ToString()!="Default")throw Rejected("DESKTOP_UNAVAILABLE");
  } finally {CloseDesktop(desktop);}
 }
 static LilithContentWindow Identity(IntPtr handle){
  uint pid;
  if(handle==IntPtr.Zero||!IsWindow(handle)||!IsWindowVisible(handle)||IsIconic(handle)||GetWindowThreadProcessId(handle,out pid)==0||pid==0||pid>Int32.MaxValue)throw Rejected("WINDOW_CHANGED");
  StringBuilder title=new StringBuilder(1025);GetWindowText(handle,title,title.Capacity);
  if(title.Length>=1024)throw Rejected("UNAVAILABLE");
  using(Process process=Process.GetProcessById((int)pid)){
   return new LilithContentWindow{pid=(int)pid,hwnd=handle.ToInt64().ToString(CultureInfo.InvariantCulture),app=process.ProcessName,windowTitle=title.ToString(),label=title.ToString(),processStartedAt=process.StartTime.ToUniversalTime().ToString("o",CultureInfo.InvariantCulture)};
  }
 }
 static void RequireForeground(LilithContentWindow selected,int[] ownPids){
  IntPtr foreground=GetForegroundWindow();
  if(foreground.ToInt64().ToString(CultureInfo.InvariantCulture)==selected.hwnd)return;
  uint pid;GetWindowThreadProcessId(foreground,out pid);
  if(pid==0||pid>Int32.MaxValue||Array.IndexOf(ownPids,(int)pid)<0)throw Rejected("WINDOW_CHANGED");
 }
 static LilithContentObservation Clipboard(){
  if(!OpenClipboard(IntPtr.Zero))throw Rejected("UNAVAILABLE");
  IntPtr memory=IntPtr.Zero,pointer=IntPtr.Zero;
  uint sequence=GetClipboardSequenceNumber();
  try {
   if(!IsClipboardFormatAvailable(13))throw Rejected("CURRENT_CONTENT_EMPTY"); // CF_UNICODETEXT only.
   memory=GetClipboardData(13);if(memory==IntPtr.Zero)throw Rejected("CURRENT_CONTENT_EMPTY");
   ulong bytes=GlobalSize(memory).ToUInt64();if(bytes<2)throw Rejected("CURRENT_CONTENT_EMPTY");
   pointer=GlobalLock(memory);if(pointer==IntPtr.Zero)throw Rejected("UNAVAILABLE");
   int available=(int)Math.Min(bytes/2,(ulong)(MaxText+1));
   StringBuilder buffer=new StringBuilder(Math.Min(available,MaxText+1));
   bool terminated=false;
   for(int index=0;index<available;index++){
    char value=(char)(ushort)Marshal.ReadInt16(pointer,index*2);
    if(value=='\0'){terminated=true;break;}buffer.Append(value);
   }
   string raw=buffer.ToString(),text=Bounded(raw);
   if(sequence!=GetClipboardSequenceNumber())throw Rejected("CLIPBOARD_CHANGED");
   if(String.IsNullOrWhiteSpace(text))throw Rejected("CURRENT_CONTENT_EMPTY");
   return new LilithContentObservation{kind="clipboard",text=text,truncated=text.Length<raw.Length||!terminated};
  } finally {if(pointer!=IntPtr.Zero)GlobalUnlock(memory);CloseClipboard();}
 }
 static void AppendText(StringBuilder content,string text,HashSet<string> seen,ref bool truncated){
  if(String.IsNullOrWhiteSpace(text)||!seen.Add(text))return;
  string prefix=content.Length>0?"\n":"";
  int remaining=MaxText-content.Length-prefix.Length;
  if(remaining<=0){truncated=true;return;}
  string chunk=text.Length>remaining?text.Substring(0,remaining):text;
  if(chunk.Length>0&&Char.IsHighSurrogate(chunk[chunk.Length-1]))chunk=chunk.Substring(0,chunk.Length-1);
  content.Append(prefix).Append(chunk);
  if(chunk.Length<text.Length)truncated=true;
 }
 static List<AutomationElement> VisibleControls(AutomationElement root){
  // Scan the bounded control tree for sensitive fields BEFORE asking any text provider for content.
  // ponytail: stop on more than 600 UIA controls; add a trusted provider-specific reader if needed.
  List<AutomationElement> visible=new List<AutomationElement>();
  Queue<AutomationElement> pending=new Queue<AutomationElement>();pending.Enqueue(root);
  TreeWalker walker=TreeWalker.ControlViewWalker;int nodes=0;
  while(pending.Count>0){
   if(++nodes>MaxNodes)throw Rejected("UNAVAILABLE");
   AutomationElement node=pending.Dequeue();var current=node.Current;
   RequireReadableControl(current.IsPassword,current.ControlType,current.Name);
   if(!current.IsOffscreen&&node!=root)visible.Add(node);
   AutomationElement child=walker.GetFirstChild(node);
   while(child!=null){
    if(pending.Count+nodes>=MaxNodes)throw Rejected("UNAVAILABLE");
    pending.Enqueue(child);child=walker.GetNextSibling(child);
   }
  }
  return visible;
 }
 static LilithContentObservation Window(LilithContentWindow selected,int[] ownPids){
  IntPtr handle=new IntPtr(Int64.Parse(selected.hwnd,CultureInfo.InvariantCulture));
  RequireForeground(selected,ownPids);
  AutomationElement root=AutomationElement.FromHandle(handle);
  if(root==null||root.Current.ProcessId!=selected.pid)throw Rejected("WINDOW_CHANGED");
  List<AutomationElement> visible=VisibleControls(root);
  StringBuilder content=new StringBuilder();HashSet<string> seen=new HashSet<string>(StringComparer.Ordinal);
  bool truncated=false,documentText=false;
  foreach(AutomationElement node in visible){
   var current=node.Current;
   RequireReadableControl(current.IsPassword,current.ControlType,current.Name);
   if(current.IsOffscreen)continue;
   object pattern;
   if(node.TryGetCurrentPattern(TextPattern.Pattern,out pattern)){
    TextPattern textPattern=(TextPattern)pattern;
    foreach(var range in textPattern.GetVisibleRanges()){
     int remaining=MaxText-content.Length;
     if(remaining<=0){truncated=true;break;}
     string text=range.GetText(remaining+1);
     if(!String.IsNullOrWhiteSpace(text))documentText=true;
     AppendText(content,text,seen,ref truncated);
    }
   } else if(current.ControlType!=ControlType.Window&&current.ControlType!=ControlType.Pane&&current.ControlType!=ControlType.Document&&current.ControlType!=ControlType.Edit){
    AppendText(content,current.Name??"",seen,ref truncated);
   }
   if(content.Length>=MaxText){truncated=true;break;}
  }
  VisibleControls(root); // Reject sensitive controls introduced while text was being read.
  RequireSameIdentity(selected,Identity(handle));RequireForeground(selected,ownPids);RequireDesktop();
  if(String.IsNullOrWhiteSpace(content.ToString()))throw Rejected("CURRENT_CONTENT_EMPTY");
  return new LilithContentObservation{kind="window",source=selected,text=Bounded(content.ToString()),truncated=truncated,limitations=documentText?new string[0]:new[]{"Die Anwendung hat nur UI-Beschriftungen bereitgestellt; ein Dokumentinhalt konnte nicht vollständig gelesen werden."}};
 }
 public static LilithContentObservation Observe(string kind,long expectedPid,long expectedHandle,string expectedApp,string expectedTitle,string expectedProcessStart,int[] ownPids){
  RequireDesktop();LilithContentObservation result;
  if(kind=="clipboard")result=Clipboard();
  else {
   IntPtr handle=expectedHandle>0?new IntPtr(expectedHandle):GetForegroundWindow();
   LilithContentWindow selected=Identity(handle);RequireAllowed(selected,ownPids);
   if(expectedHandle>0&&(selected.pid!=expectedPid||selected.app!=expectedApp||selected.windowTitle!=expectedTitle||(expectedProcessStart!=""&&selected.processStartedAt!=expectedProcessStart)))throw Rejected("WINDOW_CHANGED");
   RequireForeground(selected,ownPids);
   if(kind=="target"){
    RequireSameIdentity(selected,Identity(handle));RequireForeground(selected,ownPids);
    result=new LilithContentObservation{kind="target",source=selected};
   } else if(kind=="window")result=Window(selected,ownPids);
   else throw Rejected("UNAVAILABLE");
  }
  RequireDesktop();result.observedAt=DateTime.UtcNow.ToString("o",CultureInfo.InvariantCulture);return result;
 }
}
'@
 [int[]]$localPids=@()
 if ($OwnProcessIds) {
  $entries=$OwnProcessIds.Split(',')
  if ($entries.Count -gt 32) { throw 'UNAVAILABLE' }
  foreach ($entry in $entries) { if ($entry -notmatch '^[1-9]\d{0,9}$') { throw 'UNAVAILABLE' }; $localPids+= [int]::Parse($entry) }
 }
 if (($ExpectedHandle -gt 0) -ne ($ExpectedPid -gt 0)) { throw 'UNAVAILABLE' }
 $observation=[LilithCurrentContent]::Observe($Kind,$ExpectedPid,$ExpectedHandle,$ExpectedApp,$ExpectedTitle,$ExpectedProcessStart,$localPids)
 if ($Kind -eq 'clipboard') {
  [PSCustomObject]@{ok=$true;kind='clipboard';source=[PSCustomObject]@{kind='clipboard';label='Zwischenablage (Text)'};observedAt=$observation.observedAt;text=$observation.text;truncated=$observation.truncated;limitations=@($observation.limitations)} | ConvertTo-Json -Depth 5 -Compress
 } else { $observation | ConvertTo-Json -Depth 5 -Compress }
} catch {
 $code=$_.Exception.GetBaseException().Message
 if ($code -notin @('CURRENT_CONTENT_EMPTY','SENSITIVE_WINDOW','WINDOW_CHANGED','OWN_WINDOW','DESKTOP_UNAVAILABLE','CLIPBOARD_CHANGED')) { $code='UNAVAILABLE' }
 [PSCustomObject]@{ok=$false;code=$code} | ConvertTo-Json -Compress
}
