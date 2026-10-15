'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fields=['assistantName','url','stt','tts','language'];
function validateSetup(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key)))throw Error('Unexpected setup fields.');
 for(const key of fields)if(typeof value[key]!=='string'||/[\u0000-\u001f\u007f-\u009f]/u.test(value[key]))throw Error('Invalid '+key+'.');
 const assistantName=value.assistantName.trim();if(!assistantName||assistantName.length>80||/[\u202a-\u202e\u2066-\u2069]/u.test(assistantName))throw Error('Choose a name of 1–80 characters.');
 if(value.url.length>2048||value.url!==value.url.trim())throw Error('Invalid gateway URL.');
 let url;try{url=new URL(value.url);}catch{throw Error('Enter your Hermes HTTP(S) gateway URL.');}
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash||value.url.includes('?')||value.url.includes('#'))throw Error('Gateway URL must use HTTP(S), without credentials, query or fragment.');
 if(!['none','base','small','existing'].includes(value.stt)||!['none','de_DE-thorsten-medium','en_US-lessac-medium','existing'].includes(value.tts)||!['de','en'].includes(value.language))throw Error('Invalid speech selection.');
 return {assistantName,url:require('./gateway.cjs').validateGatewayUrl(value.url),stt:value.stt,tts:value.tts,language:value.language};
}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temporary=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';try{fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temporary,file);}finally{try{fs.unlinkSync(temporary);}catch{}}}
function readInstallation(root){try{const value=JSON.parse(fs.readFileSync(path.join(root,'.local/installation.json'),'utf8'));if(value.schemaVersion!==1)return null;const {schemaVersion,...choice}=value;return {schemaVersion,...validateSetup(choice)};}catch{return null;}}
function writeInstallation(root,value){const result={schemaVersion:1,...validateSetup(value)};atomicJson(path.join(root,'.local/installation.json'),result);return result;}
function applyClientSettings(root,platform,value){const choice=validateSetup(value),file=path.join(root,'.local',platform==='win32'?'settings.json':'linux-settings.json');let current={};try{current=JSON.parse(fs.readFileSync(file,'utf8'));if(!current||typeof current!=='object'||Array.isArray(current))throw Error('Invalid settings.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const settings={...current,assistantName:choice.assistantName,url:choice.url};
 if(choice.tts!=='existing'){settings.voice=choice.tts==='none'?'off':'piper';settings.delivery='normal';}
 for(const key of ['wakeWord','cameraEnabled','cameraRecognize','cameraGreetings','live','microphoneEnabled','localDialogueEnabled','naturalConversation','monitoring','proactive','speakAlerts'])if(!(key in current))settings[key]=false;
 atomicJson(file,settings);return settings;
}
function setupFromArgs(args){
 const start=args.indexOf('--configure');if(start<0)return null;
 const names={'--assistant-name':'assistantName','--gateway':'url','--stt':'stt','--tts':'tts','--language':'language'},seen=new Set(),value={assistantName:'Hermes',url:'',stt:'none',tts:'none',language:'de'};
 for(let i=start+1;i<args.length;i+=2){const key=names[args[i]];if(!key||seen.has(key)||typeof args[i+1]!=='string'||args[i+1].startsWith('--'))throw Error('Invalid or duplicate setup option.');seen.add(key);value[key]=args[i+1];}
 return validateSetup(value);
}
module.exports={validateSetup,readInstallation,writeInstallation,applyClientSettings,setupFromArgs};
