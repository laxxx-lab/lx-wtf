param([ValidateSet('read','observe','scan','radio','connect','disconnect','pair')][string]$Action='read',[string]$DeviceId='',[ValidateSet('On','Off')][string]$State='On')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$result=[ordered]@{accepted=$false;verified=$false;radios=@();devices=@()}
$cacheRoot=Join-Path (Split-Path $PSScriptRoot -Parent) '.local/bluetooth'
function Await($operation,$type){
 $method=[System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'}|Select-Object -First 1
 $task=$method.MakeGenericMethod($type).Invoke($null,@($operation));if(-not $task.Wait(10000)){throw 'Windows-Radio antwortet nicht.'};$task.Result
}
function ReadRadios{
 $all=Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]])
 @($all|Where-Object {[string]$_.Kind -eq 'Bluetooth'})
}
function Catalog{
 $file=Join-Path $cacheRoot (([Guid]::NewGuid().ToString('N'))+'.xml')
 $pairArgs=@('/enum-endpoints','/protocol','Bluetooth,BluetoothLE','/persisted','/sync','/format','XML','/output-file',('"'+$file+'"'))
 $process=$null
 try{
  $process=New-Object System.Diagnostics.Process;$process.StartInfo.FileName=Join-Path $env:SystemRoot 'System32/pairtool.exe';$process.StartInfo.Arguments=$pairArgs -join ' ';$process.StartInfo.UseShellExecute=$false;$process.StartInfo.CreateNoWindow=$true;$process.Start()|Out-Null
  if(-not $process.WaitForExit(5000)){try{$process.Kill()}catch{};throw 'Bluetooth-Geraetesuche hat zu lange gedauert.'}
  $process.Refresh()
  if($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $file)){throw 'Windows-Geraeteliste ist nicht verfuegbar.'}
  if((Get-Item -LiteralPath $file).Length -gt 256KB){throw 'Zu viele Bluetooth-Geraete.'}
  # Read only PairTool's bounded local XML; external entities are disabled.
  $readerSettings=New-Object System.Xml.XmlReaderSettings;$readerSettings.DtdProcessing=[System.Xml.DtdProcessing]::Prohibit;$readerSettings.XmlResolver=$null
  $reader=[System.Xml.XmlReader]::Create($file,$readerSettings);$xml=New-Object System.Xml.XmlDocument;$xml.XmlResolver=$null
  try{$xml.Load($reader)}finally{$reader.Dispose()}
  $rows=@();foreach($item in @($xml.objects.object)){
   if($item.id -notmatch '^Bluetooth(LE)?#Bluetooth(LE)?([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}-([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$'){continue}
   $properties=@($item.properties.property);$name=@($properties|Where-Object id -EQ 'Name'|Select-Object -First 1)[0].InnerText
   if(-not $name -or $name.Length -gt 200 -or $name -match '[\x00-\x1f\x7f]'){continue}
   $containerProperty=$properties|Where-Object id -EQ 'ContainerId'|Select-Object -First 1;$container=if($containerProperty){$containerProperty.InnerText.Trim('{}').ToLowerInvariant()}else{$null}
   $rows+=[pscustomobject]@{id=[string]$item.id;name=$name;paired=(@($properties|Where-Object {$_.id -eq 'Associated' -and $_.InnerText -eq 'true'}).Count -gt 0);connected=(@($properties|Where-Object {$_.id -eq 'Connected' -and $_.InnerText -eq 'true'}).Count -gt 0);containerId=$container}
   if($rows.Count -gt 128){throw 'Zu viele Bluetooth-Geraete.'}
  }
  @($rows|Sort-Object id -Unique)
 }finally{if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file};if($process){$process.Dispose()}}
}
function Discover{
 [Windows.Devices.Enumeration.DeviceInformation,Windows.Devices.Enumeration,ContentType=WindowsRuntime]|Out-Null
 [Windows.Devices.Bluetooth.BluetoothDevice,Windows.Devices.Bluetooth,ContentType=WindowsRuntime]|Out-Null
 [Windows.Devices.Bluetooth.BluetoothLEDevice,Windows.Devices.Bluetooth,ContentType=WindowsRuntime]|Out-Null
 Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text.RegularExpressions;
public sealed class LilithBluetoothFound {public string id,name,containerId;public bool paired,connected;}
public static class LilithBluetoothScan {
 public static ConcurrentDictionary<string,LilithBluetoothFound> Rows=new ConcurrentDictionary<string,LilithBluetoothFound>();
 public static volatile bool Active=true;
 public static void Added(object sender,object data){
  if(!Active||Rows.Count>=128)return;
  try{var type=data.GetType();var id=(string)type.GetProperty("Id").GetValue(data,null);var name=(string)type.GetProperty("Name").GetValue(data,null);
   if(String.IsNullOrWhiteSpace(name)||name.Length>200||Regex.IsMatch(name,@"[\x00-\x1f\x7f]")||!Regex.IsMatch(id,@"^Bluetooth(LE)?#Bluetooth(LE)?([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}-([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$"))return;
   var properties=(IReadOnlyDictionary<string,object>)type.GetProperty("Properties").GetValue(data,null);object container,connected;properties.TryGetValue("System.Devices.Aep.ContainerId",out container);properties.TryGetValue("System.Devices.Aep.IsConnected",out connected);
   var pairing=type.GetProperty("Pairing").GetValue(data,null);var paired=(bool)pairing.GetType().GetProperty("IsPaired").GetValue(pairing,null);Guid guid;var containerId=container!=null&&Guid.TryParse(container.ToString(),out guid)?guid.ToString("D"):null;
   if(Active)Rows.TryAdd(id,new LilithBluetoothFound{id=id,name=name,paired=paired,connected=connected is bool&&(bool)connected,containerId=containerId});
  }catch{ /* An incomplete advertisement is not a usable pairing target. */ }
 }
}
'@
 $classic=[Windows.Devices.Bluetooth.BluetoothDevice]::GetDeviceSelectorFromPairingState($false)
 $le=[Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelectorFromPairingState($false)
 $watcher=[Windows.Devices.Enumeration.DeviceInformation]::CreateWatcher(('('+ $classic + ') OR (' + $le + ')'),[string[]]@('System.Devices.Aep.ContainerId','System.Devices.Aep.IsConnected'),[Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint)
 $delegateType=[Windows.Foundation.TypedEventHandler[Windows.Devices.Enumeration.DeviceWatcher,Windows.Devices.Enumeration.DeviceInformation]]
 $handler=[System.Delegate]::CreateDelegate($delegateType,[LilithBluetoothScan].GetMethod('Added'))
 $eventToken=$watcher.add_Added($handler)
 try{$watcher.Start();Start-Sleep -Seconds 8;$result.enumerationComplete=([string]$watcher.Status -eq 'EnumerationCompleted');@([LilithBluetoothScan]::Rows.Values)}
 finally{[LilithBluetoothScan]::Active=$false;$watcher.Stop();$watcher.remove_Added($eventToken)}
}
try{
 New-Item -ItemType Directory -Path $cacheRoot -Force|Out-Null
 Add-Type -AssemblyName System.Runtime.WindowsRuntime
 [Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime]|Out-Null
 $radioObjects=@(ReadRadios);$result.radios=@($radioObjects|ForEach-Object{[pscustomobject]@{name='Bluetooth';state=[string]$_.State}})
 $known=@(Catalog);$scanCache=Join-Path $cacheRoot 'last-scan.json'
 if(Test-Path -LiteralPath $scanCache){try{$cached=Get-Content -LiteralPath $scanCache -Raw|ConvertFrom-Json;if($cached.at -gt ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-120000)){$known+=@($cached.devices|Where-Object {-not $_.paired -and $_.id -notin $known.id})}}catch{}}
 $result.devices=@($known|Sort-Object id -Unique)
 if($Action -eq 'read'){$result.accepted=$true}
 else{
  $wpf=Join-Path ([Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'WPF'
  Add-Type -ReferencedAssemblies (Join-Path $wpf 'UIAutomationClient.dll'),(Join-Path $wpf 'UIAutomationTypes.dll'),(Join-Path $wpf 'WindowsBase.dll') -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Automation;
namespace LilithBluetooth {
 public static class Ui {
  public static bool Dispatched=false;
  [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
  public static void Desktop(){if(Process.GetCurrentProcess().SessionId<=0||(uint)Process.GetCurrentProcess().SessionId!=WTSGetActiveConsoleSessionId())throw new InvalidOperationException("Kein interaktiver Windows-Desktop.");}
  static bool Trusted(int pid,string name){try{var p=Process.GetProcessById(pid);if(p.SessionId!=Process.GetCurrentProcess().SessionId)return false;var root=Environment.GetEnvironmentVariable("SystemRoot");string expected=name=="SystemSettings"?Path.Combine(root,"ImmersiveControlPanel","SystemSettings.exe"):name=="ShellExperienceHost"?Path.Combine(root,"SystemApps","ShellExperienceHost_cw5n1h2txyewy","ShellExperienceHost.exe"):Path.Combine(root,"System32",name+".exe");return String.Equals(p.MainModule.FileName,expected,StringComparison.OrdinalIgnoreCase);}catch{return false;}}
  static AutomationElement Id(AutomationElement root,string id){return root==null?null:root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,id));}
  static AutomationElement Settings(){
   foreach(AutomationElement window in AutomationElement.RootElement.FindAll(TreeScope.Children,Condition.TrueCondition)){
    if(Trusted(window.Current.ProcessId,"SystemSettings"))return window;
    if(!Trusted(window.Current.ProcessId,"ApplicationFrameHost"))continue;
    var button=Id(window,"SystemSettings_Device_BluetoothRadioToggle_ToggleSwitch");if(button!=null&&Trusted(button.Current.ProcessId,"SystemSettings"))return window;
   }return null;
  }
  static AutomationElement Picker(){
   foreach(AutomationElement window in AutomationElement.RootElement.FindAll(TreeScope.Children,Condition.TrueCondition)){
    // Windows Explorer hosts the native add-device window; the content must belong to ShellExperienceHost.
    int pid=window.Current.ProcessId;bool explorer=false;try{var p=Process.GetProcessById(pid);explorer=p.SessionId==Process.GetCurrentProcess().SessionId&&String.Equals(p.MainModule.FileName,Path.Combine(Environment.GetEnvironmentVariable("SystemRoot"),"explorer.exe"),StringComparison.OrdinalIgnoreCase);}catch{}
    if(!explorer&&!Trusted(pid,"ShellExperienceHost"))continue;
    var frame=Id(window,"DevicesFlowFrame");if(frame!=null&&Trusted(frame.Current.ProcessId,"ShellExperienceHost"))return frame;
   }return null;
  }
  static void Invoke(AutomationElement node){Desktop();if(node==null||!node.Current.IsEnabled||node.Current.IsOffscreen)throw new InvalidOperationException("Windows-Schaltflaeche ist nicht verfuegbar.");object pattern;if(!node.TryGetCurrentPattern(InvokePattern.Pattern,out pattern))throw new InvalidOperationException("Windows-Schaltflaeche kann nicht bedient werden.");((InvokePattern)pattern).Invoke();}
  static AutomationElement Wait(Func<AutomationElement> read,int ms){var clock=Stopwatch.StartNew();while(clock.ElapsedMilliseconds<ms){var node=read();if(node!=null)return node;Thread.Sleep(200);}return null;}
  public static void Open(){Desktop();Process.Start(new ProcessStartInfo("ms-settings:bluetooth"){UseShellExecute=true});if(Wait(Settings,6000)==null)throw new InvalidOperationException("Windows-Bluetoothseite ist nicht bereit.");}
  static string ButtonName(string container){var button=Id(Settings(),"{"+container+"}_Button");return button==null?null:button.Current.Name;}
  static bool? Connected(string container){var name=ButtonName(container);if(name=="Trennen"||name=="Disconnect")return true;if(name=="Verbinden"||name=="Connect")return false;return null;}
  public static bool Change(string container,bool connect){
   Open();var ready=Stopwatch.StartNew();bool? before;
   do{before=Connected(container);if(before!=null)break;Thread.Sleep(200);}while(ready.ElapsedMilliseconds<4000);
   if(before==connect)return true;
   var button=Id(Settings(),"{"+container+"}_Button");var expected=connect?new[]{"Verbinden","Connect"}:new[]{"Trennen","Disconnect"};
   if(button==null||Array.IndexOf(expected,button.Current.Name)<0)throw new InvalidOperationException("Windows bietet fuer dieses Geraet keinen passenden Verbindungsbutton. Selbstverbindende Controller am Geraet einschalten; zum Trennen am Geraet ausschalten.");
   Dispatched=true;Invoke(button);var clock=Stopwatch.StartNew();while(clock.ElapsedMilliseconds<12000){Thread.Sleep(300);if(Connected(container)==connect)return true;}return false;
  }
  public static bool? Observe(string container){Desktop();return Connected(container);}
  public static void Pair(string name){
   Open();if(Picker()!=null)throw new InvalidOperationException("Ein Windows-Kopplungsdialog ist bereits offen. Bitte zuerst abschliessen.");
   Invoke(Id(Settings(),"SystemSettings_Device_Discovery_Button"));var picker=Wait(Picker,5000);Invoke(Id(picker,"BluetoothDevicesButton"));
   var clock=Stopwatch.StartNew();while(clock.ElapsedMilliseconds<10000){
    picker=Picker();var list=Id(picker,"ListViewDevices");if(list!=null){var names=list.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,name));if(names.Count>1)throw new InvalidOperationException("Mehrere gleichnamige Geraete im Windows-Dialog. Bitte selbst eindeutig waehlen.");
     if(names.Count==1){var node=names[0];for(int i=0;i<4&&node!=null;i++,node=TreeWalker.ControlViewWalker.GetParent(node)){object pattern;if(node.TryGetCurrentPattern(InvokePattern.Pattern,out pattern)){Dispatched=true;Invoke(node);return;}if(node.TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern)){Desktop();Dispatched=true;((SelectionItemPattern)pattern).Select();return;}}throw new InvalidOperationException("Bitte das Zielgeraet im Windows-Dialog auswaehlen.");}}
    Thread.Sleep(300);
   }throw new InvalidOperationException("Das Zielgeraet erscheint nicht im Windows-Kopplungsdialog. Bitte den Kopplungsmodus am Geraet einschalten.");
  }
 }
}
'@
  [LilithBluetooth.Ui]::Desktop()
  if($Action -eq 'radio'){
   if($radioObjects.Count -ne 1){throw 'Kein eindeutiger Bluetooth-Adapter vorhanden.'}
   if($radioObjects.Count -eq 1){
    $access=Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus]);if([string]$access -ne 'Allowed'){throw 'Windows erlaubt die Radio-Aenderung nicht.'}
    $result.accepted=$true;$status=Await ($radioObjects[0].SetStateAsync([Windows.Devices.Radios.RadioState]::$State)) ([Windows.Devices.Radios.RadioAccessStatus]);if([string]$status -ne 'Allowed'){throw 'Bluetooth-Radio konnte nicht geaendert werden.'}
   }
   $radioObjects=@(ReadRadios);$result.radios=@($radioObjects|ForEach-Object{[pscustomobject]@{name='Bluetooth';state=[string]$_.State}});$result.verified=($radioObjects.Count -eq 1 -and [string]$radioObjects[0].State -eq $State);$result.accepted=$true
  }elseif($Action -eq 'scan'){
   if(-not @($radioObjects|Where-Object {[string]$_.State -eq 'On'}).Count){throw 'Bluetooth ist aus. Bitte zuerst einschalten.'}
   $rows=@(Discover);$result.devices=@(($known+$rows)|Sort-Object id -Unique);@{at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();devices=$rows}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath $scanCache -Encoding utf8;$result.accepted=$true;$result.scanCompleted=$true;$result.scanWindowSeconds=8;$result.verified=$true
  }else{
   if($DeviceId -notmatch '^Bluetooth(LE)?#Bluetooth(LE)?([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}-([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$'){throw 'Ungueltiges Bluetooth-Ziel.'}
   $selected=@($result.devices|Where-Object id -EQ $DeviceId);if($selected.Count -ne 1){throw 'Bluetooth-Ziel ist nicht mehr vorhanden. Bitte erneut suchen.'};$selected=$selected[0]
   if($Action -eq 'observe'){$observed=[LilithBluetooth.Ui]::Observe($selected.containerId);$result.accepted=$true;$result.targetObservationVerified=($null -ne $observed);if($null -ne $observed){$selected.connected=[bool]$observed}}elseif($Action -eq 'pair'){
    if($selected.paired){$result.accepted=$true;$result.verified=$true}
    else{
     $fresh=Await ([Windows.Devices.Enumeration.DeviceInformation,Windows.Devices.Enumeration,ContentType=WindowsRuntime]::CreateFromIdAsync($DeviceId,[string[]]@('System.Devices.Aep.IsPresent'),[Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint)) ([Windows.Devices.Enumeration.DeviceInformation]);if(-not $fresh -or $fresh.Name -ne $selected.name -or -not $fresh.Pairing.CanPair){throw 'Bluetooth-Ziel ist nicht mehr auffindbar oder nicht kopplungsbereit.'}
     if(@($result.devices|Where-Object name -EQ $selected.name).Count -ne 1){throw 'Mehrere gleichnamige Geraete. Bitte in Windows eindeutig auswaehlen.'}
     [LilithBluetooth.Ui]::Pair($selected.name);$result.accepted=$true;$paired=@(Catalog|Where-Object id -EQ $selected.id);if($paired.Count -eq 1 -and $paired[0].paired){$selected=$paired[0];$result.verified=$true}else{$result.needsUser=$true}
    }
   }else{
    if(-not $selected.paired){throw 'Dieses Geraet ist noch nicht gekoppelt. Bitte zuerst koppeln.'}
    $result.verified=[LilithBluetooth.Ui]::Change($selected.containerId,($Action -eq 'connect'));$result.accepted=$true;if($result.verified){$selected.connected=($Action -eq 'connect')}
   }
   $result.devices=@($result.devices|ForEach-Object{if($_.id -eq $selected.id){$selected}else{$_}});$result.target=$selected
  }
 }
}catch{if('LilithBluetooth.Ui' -as [type]){$result.accepted=$result.accepted -or [LilithBluetooth.Ui]::Dispatched};$result.error=$_.Exception.GetBaseException().Message.Substring(0,[Math]::Min(350,$_.Exception.GetBaseException().Message.Length));$result.effectUnknown=$result.accepted}
$result.observedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
ConvertTo-Json -InputObject $result -Depth 6 -Compress
