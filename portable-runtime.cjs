'use strict';
const fs=require('node:fs'),path=require('node:path');
function readPortableInstallation(root){
 const file=path.join(root,'.local/installation.json');if(!fs.existsSync(file))return null;
 return require('./setup-options.cjs').readInstallation(root);
}
function portablePython(root,platform=process.platform){return path.join(root,'runtime/public/venv',platform==='win32'?'Scripts/python.exe':'bin/python');}
function selectEngineSpecs(root,platform,legacy,installation=readPortableInstallation(root)){
 if(!installation)return legacy;
 const specs=[],python=portablePython(root,platform),script=path.join(root,'scripts/portable_speech.py');
 for(const [key,name,port]of [['tts','voice',8870],['stt','stt',8871]]){
  const choice=installation[key];if(choice==='none')continue;
  if(choice==='existing'){const existing=legacy.find(value=>value.name===name);if(existing)specs.push(existing);continue;}
  const model=path.join(root,'runtime/public/models',key==='stt'?'whisper-'+choice:choice+'.onnx');
  specs.push({name,port,health:'/health',cwd:root,exe:python,args:[script,'--kind',name==='voice'?'voice':'stt','--model',model,'--port',String(port),'--language',installation.language||'de'],portable:true,readyFile:key==='stt'?path.join(model,'model.bin'):model});
 }
 return [...specs,...legacy.filter(spec=>!['voice','stt'].includes(spec.name))];
}
function createPortableVoiceClient(installation,fetcher=fetch){
 if(!installation||['none','existing'].includes(installation.tts))return null;
 const label=installation.tts==='de_DE-thorsten-medium'?'Piper · Thorsten':'Piper · Lessac';
 return {registry:[],profiles:[{id:'piper',label,deliveries:['normal']}],prepare:async()=>{},
  async speech(text,voice,delivery='normal',signal){
   if(voice!=='piper'||delivery!=='normal')throw Error('Diese Stimme oder Sprechweise ist nicht installiert.');
   if(typeof text!=='string'||!text.trim()||text.length>4000)throw Error('Ungültiger Sprachtext.');
   signal?.throwIfAborted();
   return fetcher('http://127.0.0.1:8870/v1/audio/speech',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({input:text,voice:'piper',response_format:'pcm'})});
  }
 };
}
async function engineResponseReady(spec,response){if(!response.ok)return false;if(!spec.portable)return true;try{const value=await response.json();return value.ready===true&&value.backend==='hermes-voice-portable'&&value.kind===(spec.name==='voice'?'voice':'stt');}catch{return false;}}
module.exports={readPortableInstallation,portablePython,selectEngineSpecs,createPortableVoiceClient,engineResponseReady};
