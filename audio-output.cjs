'use strict';
const path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const runNative=promisify(execFile),RENDER_ID=/^\{0\.0\.0\.00000000\}\.\{[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\}$/i;
const validAudioTarget=value=>value==='headphones'||value==='speakers'||typeof value==='string'&&RENDER_ID.test(value);
function audioOutputIntent(text){
 if(typeof text!=='string'||text.length>500||/[\p{Cc}\p{Cf}?;:]/u.test(text))return null;
 const value=text.normalize('NFKC').toLocaleLowerCase('de-DE').trim().replace(/^(?:hey\s+)?(?:lilith|lillis|hermes)[,\s]+/,'').replace(/^bitte\s+/,'').replace(/[.!]$/,'').replace(/\s+bitte$/,'').trim();
 if(/\b(?:nicht|kein\w*|niemals)\b/.test(value))return null;
 const target='(?:(?:die|den|das|meine|meinen|mein) )?(kopfhörer|kopfhoerer|headset|lautsprecher|boxen)';
 const patterns=[new RegExp('^(?:wechsle|wechsele|wechsel|schalte|schalt|stelle|stell|setze) (?:bitte )?(?:(?:die|den|das|meine|meinen|mein) )?(?:audioausgabe|audio-ausgabe|ausgabe|audio|ton|sound|wiedergabe)(?: von (?:kopfhörer|kopfhörern|headset|lautsprecher|lautsprechern|boxen))? (?:auf|zu) '+target+'(?: um)?$','u'),new RegExp('^(?:audio|ton|sound|ausgabe) (?:auf|über) '+target+'$','u'),new RegExp('^(?:nutze|benutze|verwende) '+target+'$','u')];
 for(const pattern of patterns){const found=pattern.exec(value);if(found)return {type:'audio.output',target:/^(?:kopfhörer|kopfhoerer|headset)$/.test(found[1])?'headphones':'speakers'};}return null;
}
function normalizeAudioPreferences(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['headphones','speakers'].includes(key)))throw Error('Ungültige Audio-Zuordnung.');
 const result={headphones:'',speakers:''};for(const key of Object.keys(result)){const id=value[key]??'';if(typeof id!=='string'||id!==''&&!RENDER_ID.test(id))throw Error('Bitte ein vorhandenes Windows-Ausgabegerät auswählen.');result[key]=id;}return result;
}
function validateAudioSnapshot(value,now=Date.now()){
 if(!value||!Array.isArray(value.devices)||value.devices.length>64||!Number.isSafeInteger(value.observedAt)||Math.abs(now-value.observedAt)>15000||!value.defaults||['console','multimedia','communications'].some(role=>value.defaults[role]!==null&&(typeof value.defaults[role]!=='string'||!RENDER_ID.test(value.defaults[role]))))throw Error('Windows-Audiozustand ist nicht aktuell oder eindeutig.');
 const ids=new Set();for(const item of value.devices){if(!item||(typeof item.id!=='string'||!RENDER_ID.test(item.id))||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>300||/[\p{Cc}\p{Cf}]/u.test(item.name)||!Number.isInteger(item.formFactor)||item.formFactor<0||item.formFactor>10)throw Error('Ungültige Windows-Audioausgabe.');ids.add(item.id);}
 return {devices:value.devices.map(({id,name,formFactor})=>({id,name,formFactor})),defaults:{...value.defaults},observedAt:value.observedAt};
}
function resolveAudioOutput(target,snapshot,preferences={}){
 if(!validAudioTarget(target))throw Error('Ungültige Audioausgabe.');const prefs=normalizeAudioPreferences(preferences);
 const id=RENDER_ID.test(target)?target:prefs[target];if(id){const selected=snapshot.devices.find(item=>item.id.toLowerCase()===id.toLowerCase());if(!selected)throw Error('Das gewünschte Ausgabegerät ist gerade nicht verfügbar.');return selected;}
 const candidates=snapshot.devices.filter(item=>target==='headphones'?[3,5,6].includes(item.formFactor)||/kopfhörer|headphones|headset/i.test(item.name):item.formFactor===1||/lautsprecher|speakers/i.test(item.name));
 if(candidates.length!==1)throw Error(candidates.length?'Mehrere Ausgabegeräte gefunden. Bitte deine Boxen beziehungsweise Kopfhörer unter Audio zuordnen.':'Kein passendes aktives Ausgabegerät verfügbar.');return candidates[0];
}
function createAudioOutputs({platform=process.platform,runFile=runNative,preferences=()=>({})}={}){
 async function native(action,endpointId,{signal}={}){
  signal?.throwIfAborted();if(platform!=='win32')throw Error('Audioausgabe benötigt Windows.');
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'scripts/audio_outputs.ps1'),'-Action',action];if(endpointId)args.push('-EndpointId',endpointId);
  const {stdout}=await runFile(path.win32.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),args,{windowsHide:true,shell:false,encoding:'utf8',timeout:12000,maxBuffer:128*1024,signal});signal?.throwIfAborted();return JSON.parse(stdout.replace(/^\uFEFF/,'').trim());
 }
 async function read(options){const result=await native('read',null,options);if(result.accepted!==true)throw Error('Windows-Audioausgaben sind gerade nicht verfügbar.');return validateAudioSnapshot(result);}
 const controller={read,async resolve(target,options){return resolveAudioOutput(target,await read(options),preferences());},async switch(target,options={}){
  let dispatched=false;
  try{if(!validAudioTarget(target))throw Error('Ungültige Audioausgabe.');if(platform!=='win32')throw Error('Audioausgabe benötigt Windows.');
   const pinned=RENDER_ID.test(target)?target:(await controller.resolve(target,options)).id;options.signal?.throwIfAborted();dispatched=true;const raw=await native('switch',pinned,options);
   if(raw.accepted===false)return {status:'failed',verified:false,message:'Das Ausgabegerät konnte nicht umgestellt werden.',evidence:{kind:'audio.output',accepted:false,effectUnknown:false}};
   const after=validateAudioSnapshot(raw),selected=after.devices.find(item=>item.id.toLowerCase()===pinned.toLowerCase());if(!selected)throw Error('Ausgabegerät nicht bestätigt.');const verified=raw.accepted===true&&!raw.error&&!raw.effectUnknown&&after.defaults.console===selected.id&&after.defaults.multimedia===selected.id&&after.devices.some(item=>item.id===selected.id)&&raw.before?.communications===after.defaults.communications;
   return {status:verified?'completed':raw.accepted===false?'failed':'unverified',verified,message:verified?'Audioausgabe ist jetzt '+selected.name+'.':raw.accepted===false?'Das Ausgabegerät konnte nicht umgestellt werden.':'Audio-Wechsel wurde angefordert; Wirkung noch nicht bestätigt.',evidence:{kind:'audio.output',accepted:raw.accepted===true,effectUnknown:!verified&&raw.accepted!==false,targetId:selected.id,targetName:selected.name,before:raw.before,after:after.defaults,observedAt:after.observedAt}};
  }catch(error){return {status:dispatched?'unverified':'failed',verified:false,message:dispatched?'Audio-Wechsel konnte nicht bestätigt werden.':error.message,evidence:{kind:'audio.output',accepted:dispatched,effectUnknown:dispatched}};}
 },async observe(target,options){try{if(!RENDER_ID.test(target))throw Error('Vorheriges Ausgabegerät ist nicht eindeutig.');const snapshot=await read(options),selected=resolveAudioOutput(target,snapshot,{}),verified=snapshot.defaults.console===selected.id&&snapshot.defaults.multimedia===selected.id;return {status:verified?'completed':'unverified',verified,message:verified?'Windows verwendet '+selected.name+'.':'Windows verwendet noch eine andere Audioausgabe.',evidence:{kind:'audio.output',accepted:true,targetId:selected.id,after:snapshot.defaults,observedAt:snapshot.observedAt}};}catch(error){return {status:'failed',verified:false,message:error.message};}}};return controller;
}
module.exports={audioOutputIntent,validAudioTarget,normalizeAudioPreferences,validateAudioSnapshot,resolveAudioOutput,createAudioOutputs};
