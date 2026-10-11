param([ValidateSet('read','switch')][string]$Action='read',[string]$EndpointId='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$accepted=$false
$result=[ordered]@{accepted=$false;observationOnly=($Action -eq 'read');devices=@();defaults=$null}
try {
 Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
namespace LilithAudioOutputs {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class Enumerator {}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IEnumerator {
  void EnumAudioEndpoints(int flow,uint mask,out ICollection devices);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IDevice device);
  void GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id,out IDevice device);
 }
 [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ICollection {
  void GetCount(out uint count); void Item(uint index,out IDevice device);
 }
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
  void Activate(ref Guid iid,uint context,IntPtr activation,[MarshalAs(UnmanagedType.IUnknown)]out object value);
  void OpenPropertyStore(uint access,out IProperties store);
  void GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);void GetState(out uint state);
 }
 [StructLayout(LayoutKind.Sequential)] struct Key { public Guid guid;public uint id;public Key(string g,uint i){guid=new Guid(g);id=i;} }
 [StructLayout(LayoutKind.Explicit,Size=24)] struct Value { [FieldOffset(0)]public ushort type;[FieldOffset(8)]public IntPtr text;[FieldOffset(8)]public uint number; }
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IProperties {
  void GetCount(out uint count);void GetAt(uint index,out Key key);void GetValue(ref Key key,out Value value);
 }
 // Fixed Windows PolicyConfig ABI; only the render default setters are called.
 [ComImport,Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")] class PolicyClient {}
 [ComImport,Guid("F8679F50-850A-41CF-9C72-430F290290C8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPolicy {
  void GetMixFormat([MarshalAs(UnmanagedType.LPWStr)]string id,IntPtr format);
  void GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)]string id,int defaults,IntPtr format);
  void ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)]string id);
  void SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)]string id,IntPtr endpoint,IntPtr mix);
  void GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)]string id,int defaults,IntPtr period,IntPtr minimum);
  void SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)]string id,IntPtr period);
  void GetShareMode([MarshalAs(UnmanagedType.LPWStr)]string id,IntPtr mode);
  void SetShareMode([MarshalAs(UnmanagedType.LPWStr)]string id,IntPtr mode);
  void GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)]string id,int fx,IntPtr key,IntPtr value);
  void SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)]string id,int fx,IntPtr key,IntPtr value);
  void SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)]string id,int role);
 }
 public class Output {public string id;public string name;public int formFactor;}
 public class Defaults {public string console;public string multimedia;public string communications;}
 public class Snapshot {public Output[] devices;public Defaults defaults;}
 public static class Audio {
  [DllImport("ole32.dll")]static extern int PropVariantClear(ref Value value);
  [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
  static string Property(IProperties store,Key key){Value value;store.GetValue(ref key,out value);try{return value.type==31?Marshal.PtrToStringUni(value.text):null;}finally{PropVariantClear(ref value);}}
  static string Default(IEnumerator e,int role){IDevice device=null;try{if(e.GetDefaultAudioEndpoint(0,role,out device)!=0||device==null)return null;string id;device.GetId(out id);return id;}finally{if(device!=null)Marshal.ReleaseComObject(device);}}
  public static Snapshot Read(){var e=(IEnumerator)new Enumerator();ICollection list=null;try{
   e.EnumAudioEndpoints(0,1,out list);uint count;list.GetCount(out count);if(count>64)throw new InvalidOperationException("Too many audio outputs");var result=new List<Output>();
   for(uint i=0;i<count;i++){IDevice device=null;IProperties store=null;try{list.Item(i,out device);string id;device.GetId(out id);device.OpenPropertyStore(0,out store);var name=Property(store,new Key("a45c254e-df1c-4efd-8020-67d146a850e0",14));if(String.IsNullOrWhiteSpace(name)){var description=Property(store,new Key("a45c254e-df1c-4efd-8020-67d146a850e0",2));var adapter=Property(store,new Key("b3f8fa53-0004-438e-9003-51a46e139bfc",6));name=description+" ("+adapter+")";}
    var key=new Key("1da5d803-d492-4edd-8c23-e0c0ffee7f0e",0);Value value;store.GetValue(ref key,out value);int factor=10;try{if(value.type==19)factor=(int)value.number;}finally{PropVariantClear(ref value);}result.Add(new Output{id=id,name=name,formFactor=factor});
   }finally{if(store!=null)Marshal.ReleaseComObject(store);if(device!=null)Marshal.ReleaseComObject(device);}}
   return new Snapshot{devices=result.ToArray(),defaults=new Defaults{console=Default(e,0),multimedia=Default(e,1),communications=Default(e,2)}};
  }finally{if(list!=null)Marshal.ReleaseComObject(list);Marshal.ReleaseComObject(e);}}
  public static void Switch(string id){if(Process.GetCurrentProcess().SessionId<=0||WTSGetActiveConsoleSessionId()!=(uint)Process.GetCurrentProcess().SessionId)throw new InvalidOperationException("Kein aktiver Windows-Desktop");
   var e=(IEnumerator)new Enumerator();IDevice device=null;object policy=null;try{e.GetDevice(id,out device);uint state;device.GetState(out state);if(state!=1)throw new InvalidOperationException("Ausgabegeraet ist nicht aktiv");policy=new PolicyClient();var control=(IPolicy)policy;control.SetDefaultEndpoint(id,0);control.SetDefaultEndpoint(id,1);
   }finally{if(policy!=null)Marshal.ReleaseComObject(policy);if(device!=null)Marshal.ReleaseComObject(device);Marshal.ReleaseComObject(e);}}
 }
}
'@
 $before=[LilithAudioOutputs.Audio]::Read()
 $result.before=$before.defaults
 if($Action -eq 'switch'){
  if($EndpointId -notmatch '^\{0\.0\.0\.00000000\}\.\{[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}\}$' -or -not @($before.devices | Where-Object id -EQ $EndpointId).Count){throw 'Kein vorhandenes aktives Ausgabegeraet ausgewaehlt.'}
  $EndpointId=(@($before.devices | Where-Object id -EQ $EndpointId))[0].id
  $accepted=$true
  [LilithAudioOutputs.Audio]::Switch($EndpointId)
 }
 $after=if($Action -eq 'switch'){[LilithAudioOutputs.Audio]::Read()}else{$before}
 $result.devices=$after.devices;$result.defaults=$after.defaults;$accepted=$true
}catch{$result.error='Windows-Audiozugriff fehlgeschlagen: '+$_.Exception.GetBaseException().Message;$result.effectUnknown=($accepted -and $Action -eq 'switch')}
$result.accepted=$accepted;$result.observedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
ConvertTo-Json -InputObject $result -Depth 6 -Compress
