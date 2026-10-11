'use strict';
const path=require('node:path'),{spawn}=require('node:child_process');
const PTT_KEYS=Object.freeze(['F8','F9','Ctrl+Space']);
class PushToTalkHotkey{
 constructor({platform=process.platform,spawn:launch=spawn,allowed=()=>true,onEvent=()=>{},onState=()=>{},now=Date.now}={}){this.platform=platform;this.launch=launch;this.allowed=allowed;this.onEvent=onEvent;this.onState=onState;this.now=now;this.child=null;this.key='F8';this.ready=false;this.error='';this.sequence=0;this.nativeSequence=0;this.held=null;this.timer=null;}
 snapshot(){return {ready:this.ready,key:this.key,held:!!this.held,error:this.error};}
 publish(){this.onState(this.snapshot());}
 cancel(){clearTimeout(this.timer);this.timer=null;if(this.held){const sequence=this.held.sequence;this.held=null;this.onEvent({pressed:false,cancelled:true,sequence,at:this.now()});}}
 close(){this.cancel();const child=this.child;this.child=null;this.ready=false;if(child)child.kill();this.publish();}
 set({enabled,key='F8'}={}){
  if(typeof enabled!=='boolean'||!PTT_KEYS.includes(key))throw Error('Sprechtaste: F8, F9 oder Ctrl+Leertaste auswählen.');
  if(!enabled||!this.allowed()){this.close();this.key=key;return this.snapshot();}
  if(this.child&&this.key===key)return this.snapshot();this.close();this.key=key;this.error='';this.nativeSequence=0;
  if(this.platform!=='win32'){this.error='Die globale Sprechtaste benötigt Windows.';this.publish();return this.snapshot();}
  let child;try{child=this.launch(path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'scripts/push_to_talk.ps1'),'-Binding',key],{windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});}catch(error){this.error='Sprechtaste konnte nicht gestartet werden.';this.publish();return this.snapshot();}
  this.child=child;let buffer='';
  const failed=()=>{if(this.child!==child)return;this.cancel();this.child=null;this.ready=false;this.error='Sprechtaste ist nicht verfügbar. Einstellung erneut aktivieren.';this.publish();};
  child.on('error',failed);child.on('exit',failed);child.stderr?.on('data',()=>{});
  child.stdout?.on('data',chunk=>{
   if(this.child!==child)return;buffer+=String(chunk);if(buffer.length>8192){this.close();this.error='Ungültige Sprechtastenmeldung.';this.publish();return;}
   for(let at;(at=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,at).trim();buffer=buffer.slice(at+1);let value;try{value=JSON.parse(line);}catch{continue;}
    if(value?.type==='ready'){this.ready=true;this.publish();continue;}
    if(!this.ready||value?.type!=='key'||typeof value.pressed!=='boolean'||!Number.isSafeInteger(value.sequence)||value.sequence<1||!Number.isFinite(value.at)||this.now()-value.at>500||value.at>this.now()+50)continue;
    if(!this.allowed()){this.cancel();continue;}
    if(value.pressed){if(this.held||value.sequence<=this.nativeSequence)continue;this.nativeSequence=value.sequence;this.held={native:value.sequence,sequence:++this.sequence};this.onEvent({pressed:true,sequence:this.held.sequence,at:value.at});this.timer=setTimeout(()=>this.cancel(),30000);this.timer.unref?.();}
    else if(this.held?.native===value.sequence){clearTimeout(this.timer);this.timer=null;const sequence=this.held.sequence;this.held=null;this.onEvent({pressed:false,sequence,at:value.at});}
   }
  });return this.snapshot();
 }
}
module.exports={PushToTalkHotkey,PTT_KEYS};
