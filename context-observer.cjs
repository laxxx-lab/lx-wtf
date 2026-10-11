'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {StringDecoder}=require('node:string_decoder');
const {redactContext}=require('./context-journal.cjs');
const runFile=promisify(execFile);
const SENSITIVE_APP=/(?:^|[^a-z])(1password|bitwarden|keepass(?:xc)?|lastpass|dashlane|nordpass|enpass)(?:$|[^a-z])/i;
const SENSITIVE_TITLE=/passw[oö]r(?:d|t)|kennwort|secret vault|password vault|anmeld(?:ung|en)|sign[ -]?in|log[ -]?in|authenticat|authentifiz|banking|bankkonto|payment|zahlung|credit card|kreditkarte|private browsing|incognito|inkognito|inprivate/i;

async function readForegroundContext({platform=process.platform,runFile:run=runFile,now=Date.now}={}){
  const unknown=()=>({app:null,windowTitle:null,pid:null,timestamp:now(),excluded:false});
  if(platform!=='win32')return unknown();
  try{
    const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const {stdout}=await run(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'scripts/foreground_context.ps1')],{windowsHide:true,timeout:4000,maxBuffer:32*1024,encoding:'utf8'});
    const data=JSON.parse(stdout.replace(/^\uFEFF/,''));
    if(!data||typeof data.app!=='string'||!data.app.trim()||typeof data.windowTitle!=='string'||!Number.isInteger(data.pid)||data.pid<=0)return unknown();
    if(SENSITIVE_APP.test(data.app)||SENSITIVE_TITLE.test(data.windowTitle))return {...unknown(),excluded:true,reason:'sensitive-window'};
    return {app:redactContext(data.app,80),windowTitle:redactContext(data.windowTitle,180),pid:data.pid,timestamp:now(),excluded:false};
  }catch{return unknown();}
}
function logPath(value){
  if(typeof value!=='string'||!path.isAbsolute(value)||/^[\\/]{2}|^[a-z][a-z0-9+.-]*:\/\//i.test(value)||value.replace(/^[a-z]:/i,'').includes(':')||!['.log','.txt'].includes(path.extname(value).toLowerCase()))throw new TypeError('Log watcher requires absolute local .log or .txt files without alternate streams.');
  return path.resolve(value);
}
function classify(line){
  const signal=line.replace(/\b(?:0|no|zero)\s+(?:failed|failures?|errors?)\b/gi,'');
  if(/\b(?:build|compil(?:e|ation)|tests?|test suite|npm|webpack|vite|tsc)\b.*\b(?:failed|failure|error|errors)\b|\b(?:BUILD|TESTS?) FAILED\b|\b(?:npm\s+ERR!|error TS\d+|FAIL\s+\S+\.(?:test|spec)\.)/i.test(signal))return 'build-error';
  if(/\b(?:build|compil(?:e|ation)|tests?|test suite)\b.*\b(?:succeeded|successful|successfully|passed)\b|\b(?:all tests passed|BUILD SUCCESS|compiled successfully)\b/i.test(line))return 'build-success';
  return null;
}
function createLogWatcher({paths=[],onEvent=()=>{},onError=()=>{},now=Date.now}={}){
  if(!Array.isArray(paths)||paths.length>16)throw new TypeError('At most 16 explicit log paths are allowed.');
  const states=[...new Set(paths.map(logPath))].map(file=>({file,offset:null,identity:null,partial:'',decoder:new StringDecoder('utf8'),last:null,error:null}));
  let closed=false,pending=null;
  function error(state,code){if(closed||state.error===code)return;state.error=code;try{onError({source:state.file,code:typeof code==='string'?code:'read-failed',timestamp:now()});}catch{}}
  async function read(state){
    let handle;
    try{
      const before=await fs.lstat(state.file);
      if(closed)return [];
      if(!before.isFile()||before.isSymbolicLink())throw Object.assign(new Error('Not a regular local file'),{code:'INVALID_LOG_FILE'});
      handle=await fs.open(state.file,'r');
      const stat=await handle.stat();
      if(closed)return [];
      const identity=stat.dev+':'+stat.ino+':'+stat.birthtimeMs;
      state.error=null;
      if(state.offset===null||state.identity!==identity){state.identity=identity;state.offset=stat.size;state.partial='';state.decoder=new StringDecoder('utf8');state.last=null;return [];}
      if(stat.size<state.offset){state.offset=0;state.partial='';state.decoder=new StringDecoder('utf8');state.last=null;}
      if(stat.size===state.offset)return [];
      let start=state.offset,skipPartial=false;
      if(stat.size-start>16*1024){start=stat.size-16*1024;state.partial='';state.decoder=new StringDecoder('utf8');skipPartial=true;}
      const buffer=Buffer.alloc(stat.size-start);
      const {bytesRead}=await handle.read(buffer,0,buffer.length,start);
      if(closed)return [];
      state.offset=start+bytesRead;
      let text=state.decoder.write(buffer.subarray(0,bytesRead));
      if(skipPartial){const end=text.indexOf('\n');text=end<0?'':text.slice(end+1);}
      const lines=(state.partial+text).split(/\r?\n/);state.partial=lines.pop().slice(-450);
      const emitted=[];
      for(const line of lines){
        const type=classify(line);if(!type)continue;
        const summary=redactContext(line),time=now();if(!summary)continue;
        if(state.last&&state.last.type===type&&time-state.last.time<60000)continue;
        state.last={type,time};
        const event={type,summary,source:state.file,timestamp:time};emitted.push(event);
        if(closed)return [];try{onEvent({...event});}catch{}
      }
      return emitted;
    }catch(err){error(state,err.code);return [];}
    finally{if(handle)await handle.close().catch(()=>{});}
  }
  return {
    poll(){if(closed)return Promise.resolve([]);if(pending)return pending;pending=(async()=>{const events=[];for(const state of states){if(closed)break;events.push(...await read(state));}return closed?[]:events;})().finally(()=>{pending=null;});return pending;},
    close(){closed=true;for(const state of states)state.partial='';}
  };
}
module.exports={readForegroundContext,createLogWatcher};
