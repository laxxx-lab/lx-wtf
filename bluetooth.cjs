'use strict';
const path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const runNative=promisify(execFile);
const DEVICE_ID=/^Bluetooth(?:LE)?#Bluetooth(?:LE)?(?:[a-f0-9]{2}:){5}[a-f0-9]{2}-(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i;
const GUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const key=text=>text.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/g,' ').trim();
function bluetoothIntent(text){
 if(typeof text!=='string'||text.length>500||/[\p{Cc}\p{Cf}?;:]/u.test(text))return null;
 const value=text.trim().replace(/^(?:hey\s+)?(?:lilith|lillis|hermes)[,\s]+/i,'').replace(/^bitte\s+/i,'').replace(/[.!]$/,'').replace(/\s+bitte$/i,'').trim();
 if(/\b(?:nicht|kein\w*|niemals|und|dann|danach|alle|sämtliche)\b/i.test(value))return null;
 if(/^(?:aktiviere|aktivier) bluetooth$/i.test(value)||/^bluetooth einschalten$/i.test(value))return {type:'bluetooth',action:'radio',enabled:true};
 if(/^(?:deaktiviere|deaktivier) bluetooth$/i.test(value)||/^bluetooth ausschalten$/i.test(value))return {type:'bluetooth',action:'radio',enabled:false};
 const radio=/^(?:(?:schalte|schalt|stelle|stell|mach|mache) (?:bitte )?(?:das )?)?bluetooth (ein|an|aus)$/i.exec(value);if(radio)return {type:'bluetooth',action:'radio',enabled:radio[1].toLowerCase()!=='aus'};
 if(/^(?:(?:suche|such|finde) (?:nach )?(?:neuen )?bluetooth[ -]?geräten?|(?:starte|start) (?:die )?bluetooth[ -]?suche|bluetooth[ -]?geräte suchen)$/i.test(value))return {type:'bluetooth',action:'scan'};
 const action=/^(verbinde|trenne|kopple|koppele) (?:(?:das )?bluetooth(?:[ -]?gerät)? )?(?:mit |von )?(?:(?:die|den|das|meine|meinen|mein) )?(.+)$/i.exec(value);
 if(action)return {type:'bluetooth',action:/^ver/i.test(action[1])?'connect':/^tre/i.test(action[1])?'disconnect':'pair',name:action[2].trim()};
 const audio=/^(?:(?:schalte|schalt|stelle|stell|wechsle|wechsele) (?:(?:die|den|das) )?)?(?:audioausgabe|audio|ton|sound|wiedergabe) (?:über bluetooth )?(?:auf|über) (?:(?:die|den|das|meine|meinen|mein) )?(.+?)(?: um)?$/i.exec(value);if(audio)return {type:'bluetooth',action:'audio',name:audio[1].trim()};return null;
}
function validBluetoothCommand(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.type!=='bluetooth')return false;
 const keys=Object.keys(value).sort().join('|');
 if(value.action==='radio')return keys==='action|enabled|type'&&typeof value.enabled==='boolean';
 if(value.action==='scan')return keys==='action|type';
 return ['connect','disconnect','pair','audio'].includes(value.action)&&keys==='action|deviceId|type'&&typeof value.deviceId==='string'&&DEVICE_ID.test(value.deviceId);
}
function validateBluetoothSnapshot(value,now=Date.now()){
 if(!value||!Number.isSafeInteger(value.observedAt)||Math.abs(now-value.observedAt)>15000||!Array.isArray(value.radios)||value.radios.length>8||!Array.isArray(value.devices)||value.devices.length>128)throw Error('Bluetooth-Zustand ist nicht aktuell.');
 const ids=new Set();for(const radio of value.radios)if(!radio||radio.name!=='Bluetooth'||!['On','Off','Disabled','Unknown'].includes(radio.state))throw Error('Ungültiger Bluetooth-Adapter.');
 for(const device of value.devices){if(!device||typeof device.id!=='string'||!DEVICE_ID.test(device.id)||ids.has(device.id.toLowerCase())||typeof device.name!=='string'||!device.name.trim()||device.name.length>200||/[\p{Cc}\p{Cf}]/u.test(device.name)||typeof device.paired!=='boolean'||typeof device.connected!=='boolean'||device.containerId!==null&&device.containerId!==undefined&&(typeof device.containerId!=='string'||!GUID.test(device.containerId)))throw Error('Ungültiges Bluetooth-Gerät.');ids.add(device.id.toLowerCase());}
 return {radios:value.radios.map(({name,state})=>({name,state})),devices:value.devices.map(({id,name,paired,connected,containerId})=>({id,name,paired,connected,containerId:containerId?.toLowerCase()||null})),observedAt:value.observedAt};
}
function resolveBluetoothDevice(name,snapshot){
 if(typeof name!=='string'||!name.trim())throw Error('Bitte das Bluetooth-Gerät nennen.');
 const matches=snapshot.devices.filter(item=>DEVICE_ID.test(name)?key(item.id)===key(name):key(item.name)===key(name));
 const candidates=matches.length?matches:snapshot.devices.filter(item=>key(item.name).includes(key(name)));
 if(candidates.length!==1)throw Error(candidates.length?'Mehrere Bluetooth-Geräte passen. Bitte das genaue Gerät auswählen.':'Dieses Bluetooth-Gerät wurde nicht gefunden. Bitte eine Gerätesuche starten.');return candidates[0];
}
function createBluetooth({platform=process.platform,runFile=runNative,audio}={}){
 async function native(action,{deviceId,enabled,signal}={}){
  signal?.throwIfAborted();if(platform!=='win32')throw Error('Bluetooth-Steuerung benötigt Windows.');
  const args=['-MTA','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'scripts/bluetooth.ps1'),'-Action',action];
  if(deviceId)args.push('-DeviceId',deviceId);if(typeof enabled==='boolean')args.push('-State',enabled?'On':'Off');
  const result=await runFile(path.win32.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),args,{windowsHide:true,shell:false,encoding:'utf8',timeout:45000,maxBuffer:256*1024,signal});signal?.throwIfAborted();return JSON.parse(result.stdout.replace(/^\uFEFF/,'').trim());
 }
 async function read(options={}){const raw=await native('read',options);if(raw.accepted!==true)throw Error('Bluetooth-Geräte konnten nicht gelesen werden.');return validateBluetoothSnapshot(raw);}
 async function audioEndpoint(device,options){
  if(!audio||!device.containerId)throw Error('Keine eindeutige Bluetooth-Audioausgabe verfügbar.');const snapshot=await audio.read(options);
  const outputs=snapshot.devices.filter(item=>item.containerId?.toLowerCase()===device.containerId.toLowerCase());
  if(outputs.length!==1)throw Error(outputs.length?'Mehrere Audioausgaben für dieses Gerät vorhanden. Bitte die gewünschte Ausgabe unter Audio auswählen.':'Bluetooth ist verbunden; die Audioausgabe ist noch nicht verfügbar.');return {device:outputs[0],snapshot};
 }
 async function run(command,{signal,observeOnly=false}={}){
  if(!validBluetoothCommand(command))return {status:'failed',verified:false,message:'Ungültiger Bluetooth-Auftrag.'};
  command=structuredClone(command);let dispatched=false;
  try{
   signal?.throwIfAborted();if(platform!=='win32')throw Error('Bluetooth-Steuerung benötigt Windows.');
   dispatched=!observeOnly&&command.action!=='scan';
   const raw=await native(observeOnly&&['connect','disconnect','audio'].includes(command.action)?'observe':observeOnly?'read':command.action==='audio'?'connect':command.action,{...command,signal});dispatched=raw.accepted===true&&!observeOnly;
   const snapshot=validateBluetoothSnapshot(raw);let selected;
   let verified=raw.accepted===true&&!raw.error&&!raw.needsUser;
   if(command.deviceId){selected=snapshot.devices.find(item=>key(item.id)===key(command.deviceId));verified=verified&&!!selected;
    if(!observeOnly)verified=verified&&raw.verified===true&&raw.target?.id===selected?.id;else if(['connect','disconnect','audio'].includes(command.action))verified=verified&&raw.targetObservationVerified===true;
    verified=verified&&(command.action==='pair'?selected?.paired:command.action==='disconnect'?selected?.connected===false:selected?.connected===true);
   }else if(command.action==='radio')verified=verified&&snapshot.radios.length===1&&snapshot.radios[0].state===(command.enabled?'On':'Off');
   else verified=verified&&!observeOnly&&raw.scanCompleted===true;
   if(verified&&command.action==='audio'){
    const endpoint=await audioEndpoint(selected,{signal});
    const routed=observeOnly?{verified:endpoint.snapshot.defaults?.console===endpoint.device.id&&endpoint.snapshot.defaults?.multimedia===endpoint.device.id}:await audio.switch(endpoint.device.id,{signal});verified=routed.verified===true;
   }
   const message=verified?command.action==='radio'?'Bluetooth ist '+(command.enabled?'eingeschaltet.':'ausgeschaltet.'):command.action==='scan'?'Gerätesuche abgeschlossen. '+snapshot.devices.length+' Bluetooth-Geräte gefunden.':selected.name+(command.action==='pair'?' ist gekoppelt.':command.action==='disconnect'?' ist getrennt.':command.action==='audio'?' ist verbunden und als Audioausgabe ausgewählt.':' ist verbunden.'):raw.needsUser?'Bitte den Windows-Kopplungsdialog abschließen. Die Kopplung ist noch nicht bestätigt.':raw.error||'Der Bluetooth-Auftrag wurde nicht sicher bestätigt.';
   return {status:verified?'completed':raw.accepted===false?'failed':'unverified',verified,message,snapshot,evidence:{kind:'bluetooth',accepted:raw.accepted===true,effectUnknown:!verified&&dispatched,deviceId:command.deviceId||null,action:command.action,observedAt:snapshot.observedAt,needsUser:raw.needsUser===true}};
  }catch(error){return {status:dispatched?'unverified':'failed',verified:false,message:error.message?.slice(0,350)||'Bluetooth-Ergebnis ist unbekannt.',evidence:{kind:'bluetooth',effectUnknown:dispatched}};}
 }
 return {read,resolve:async(name,options)=>resolveBluetoothDevice(name,await read(options)),execute:(command,options)=>run(command,options),observe:(command,options)=>run(command,{...options,observeOnly:true})};
}
module.exports={bluetoothIntent,validBluetoothCommand,validateBluetoothSnapshot,resolveBluetoothDevice,createBluetooth};
