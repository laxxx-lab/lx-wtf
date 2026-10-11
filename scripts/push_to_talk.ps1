param([ValidateSet('F8','F9','Ctrl+Space')][string]$Binding='F8')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public static class LilithPushToTalk {
 delegate IntPtr Hook(int code,IntPtr message,IntPtr data);
 [StructLayout(LayoutKind.Sequential)] struct Key { public uint vk, scan, flags, time; public IntPtr extra; }
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id,Hook fn,IntPtr module,uint thread);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("kernel32.dll",CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
 static Hook callback=Receive; static IntPtr handle; static uint keyCode; static bool chord,held,keyDown; static long sequence;
 static bool Down(int key) {return (GetAsyncKeyState(key)&0x8000)!=0;}
 static void Emit(bool pressed){Console.WriteLine("{\"type\":\"key\",\"pressed\":"+(pressed?"true":"false")+",\"sequence\":"+sequence+",\"at\":"+DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+"}");Console.Out.Flush();}
 static bool Edge(bool press,bool release,bool modifiersAllowed){
  if(release){keyDown=false;if(!held)return false;held=false;Emit(false);return true;}
  if(!press)return false;
  if(keyDown)return held;
  keyDown=true;
  if(!modifiersAllowed)return false;
  held=true;sequence++;Emit(true);return true;
 }
 static IntPtr Receive(int code,IntPtr message,IntPtr data){
  if(code<0)return CallNextHookEx(handle,code,message,data);
  Key key=(Key)Marshal.PtrToStructure(data,typeof(Key));int m=message.ToInt32();bool press=m==0x100||m==0x104,release=m==0x101||m==0x105;
  if((key.flags&0x12)!=0||key.vk!=keyCode||(!press&&!release))return CallNextHookEx(handle,code,message,data);
  bool control=Down(0x11),alt=Down(0x12),shift=Down(0x10),windows=Down(0x5B)||Down(0x5C);
  if(Edge(press,release,!alt&&!shift&&!windows&&(chord?control:!control)))return new IntPtr(1);
  return CallNextHookEx(handle,code,message,data);
 }
 public static void Run(string binding){
  if(binding!="F8"&&binding!="F9"&&binding!="Ctrl+Space")throw new ArgumentException("Invalid binding");
  chord=binding=="Ctrl+Space";keyCode=chord?0x20u:binding=="F8"?0x77u:0x78u;
  keyDown=Down((int)keyCode);held=false;
  handle=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);if(handle==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  try{Console.WriteLine("{\"type\":\"ready\"}");Console.Out.Flush();Application.Run();}finally{UnhookWindowsHookEx(handle);}
 }
}
'@
[LilithPushToTalk]::Run($Binding)
