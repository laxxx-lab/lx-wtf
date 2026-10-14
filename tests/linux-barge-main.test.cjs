'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-barge-')),events=[],requests=[],transcriptions=[],app={commandLine:{appendSwitch(){}},requestSingleInstanceLock:()=>false,quit(){},on(){}};
 const context=vm.createContext({__dirname:root,process:{...process,argv:[...process.argv,'--linux-smoke']},Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app};
  if(name==='./transcription.cjs')return {transcribeAudio:async(bytes,options)=>{transcriptions.push({bytes,options});return 'Neue Frage';}};
  if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));return require(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../linux-main.cjs'),'utf8'),context);Object.assign(context,{events,requests});
 vm.runInContext("emit=event=>events.push(event);connected=true;generation=7;conversation=new Conversation(async(method,params)=>{requests.push({method,params});return {};});conversation.session={id:'runtime',storedId:'stored',profile:'default'};conversation.busy=true;conversation.remoteRunning=true;",context);
 return {context,events,requests,transcriptions,run:code=>vm.runInContext(code,context),close(){fs.rmSync(root,{recursive:true,force:true});}};
}
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
test('Linux spoken replacement preserves capture generation and waits for actual terminal after stop acceptance',async()=>{
 const f=fixture();try{let resolved=false;const stopping=f.run("actions.interrupt({bargeIn:true,captured:{sessionId:'runtime',generation:7}})").then(value=>{resolved=true;return value;});await flush();assert.equal(resolved,false);assert.equal(f.run('generation'),7);assert.equal(f.requests.filter(r=>r.method==='session.interrupt').length,1);
  f.run("gatewayEvent({type:'message.complete',session_id:'runtime',data:{status:'interrupted'}})");const result=await stopping;assert.equal(result.ready,true);assert.equal(result.busy,false);assert.equal(result.generation,7);assert.equal(f.run('conversation.session.storedId'),'stored');
 }finally{f.close();}
});
test('Linux spoken interruption cannot claim ready from busy=false without a terminal event',async()=>{
 const f=fixture();try{f.run('conversation.interrupt=async()=>{conversation.busy=false;};');const result=await f.run("actions.interrupt({bargeIn:true,captured:{sessionId:'runtime',generation:7}})");assert.equal(result.ready,false);assert.equal(f.run('generation'),7);}finally{f.close();}
});
test('Linux cancelled preparation releases output suppression for the replacement turn',async()=>{
 const f=fixture();try{f.run('conversation.preparing=true;conversation.remoteRunning=false;conversation.interrupt=async()=>{conversation.submissionGeneration++;conversation.preparing=false;conversation.busy=false;};');const result=await f.run("actions.interrupt({bargeIn:true,captured:{sessionId:'runtime',generation:7}})");assert.equal(result.ready,true);assert.equal(f.run("turnGate.receive({type:'message.start',session_id:'runtime'})"),true);}finally{f.close();}
});
test('Linux spoken interruption rejects stale capture before touching the remote job or audio',async()=>{
 const f=fixture();try{await assert.rejects(f.run("actions.interrupt({bargeIn:true,captured:{sessionId:'other',generation:7}})"),/Session|Aufnahme/);assert.equal(f.requests.length,0);assert.equal(f.events.some(e=>e.type==='audio-stop'),false);}finally{f.close();}
});
test('Linux interruption cancelled by privacy cannot authorize a replacement',async()=>{
 const f=fixture();try{const stopping=f.run("actions.interrupt({bargeIn:true,captured:{sessionId:'runtime',generation:7}})");await flush();f.run("config.privacyLocked=true;generation++;gatewayEvent({type:'message.complete',session_id:'runtime',data:{status:'interrupted'}})");const result=await stopping;assert.equal(result.ready,false);}finally{f.close();}
});
test('Linux permits bounded barge transcription during foreground work while ordinary busy capture stays refused',async()=>{
 const f=fixture();try{f.context.wav=Buffer.alloc(44).toString('base64');await assert.rejects(f.run("actions.transcribe({audio:wav,captured:{sessionId:'runtime',generation:7}})"),/Auftrag/);const text=await f.run("actions.transcribe({audio:wav,bargeIn:true,captured:{sessionId:'runtime',generation:7}})");assert.equal(text,'Neue Frage');assert.equal(f.transcriptions.length,1);assert.equal(f.run('conversation.busy'),true);assert.equal(f.run('generation'),7);}finally{f.close();}
});
