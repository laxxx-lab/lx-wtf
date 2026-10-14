'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const {createSessionHandoff,handoffRequest}=require('../session-handoff.cjs');
const python=process.env.LILITH_HANDOFF_PYTHON||'python',installed=spawnSync(python,['-c','import fastapi,uvicorn'],{stdio:'ignore'}).status===0;
test('two clients transfer and recall online or offline through the real HTTP router and SQLite owner', {skip:!installed,timeout:30000},async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-handoff-http-')),child=spawn(python,['-u',path.join(__dirname,'session-handoff-http.fixture.py'),path.join(folder,'ownership.sqlite3')],{stdio:['ignore','pipe','ignore']});let pc,nb;
 try{
  const port=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('HTTP fixture did not start')),5000);child.once('error',reject);child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.trim()).port);}});});
  const gateway={url:'http://127.0.0.1:'+port,fetcher:(url,options)=>fetch(url,{...options,headers:{...options.headers,Cookie:'handoff_fixture=fixture'}})};
  // Poll the local server until startup has completed; no external network or real session data.
  for(let attempt=0;attempt<30;attempt++){try{await fetch(gateway.url+'/docs');break;}catch{await new Promise(resolve=>setTimeout(resolve,20));}}
  const state=kind=>({profile:'default',session:{id:kind==='windows'?'qa-pc':'qa-notebook',profile:'default',title:'QA'},busy:false,privacyLocked:false,connected:true,generation:1,gatewayUrl:gateway.url});const pcState=state('windows'),nbState=state('notebook'),selected=[],history=[],transferred=[];
  const make=(kind,current)=>createSessionHandoff({kind,name:kind,stateFile:path.join(folder,kind+'.json'),request:payload=>handoffRequest(gateway,payload),getState:()=>current,selectSession:async session=>{selected.push({kind,session});current.session=session;},showHistory:async session=>history.push({kind,id:session.id}),onTransferred:session=>transferred.push({kind,id:session.id})});pc=make('windows',pcState);nb=make('notebook',nbState);
  await pc.tick();await nb.tick();assert.equal(pc.canSubmit(pcState.session),true);
  await pc.requestTransfer('notebook');assert.equal(pc.canSubmit(pcState.session),false);await nb.tick();await pc.tick();
  assert.equal(nbState.session.id,'qa-pc');assert.equal(nb.canSubmit(nbState.session),true);assert.equal(pc.canSubmit(pcState.session),false);assert.deepEqual(history,[{kind:'notebook',id:'qa-pc'}]);assert.deepEqual(transferred,[{kind:'windows',id:'qa-pc'}]);
  await nb.requestTransfer('windows');await pc.tick();await nb.tick();assert.equal(pc.canSubmit(pcState.session),true);assert.equal(nb.canSubmit(nbState.session),false);assert.equal(selected.length,2);assert.equal(history.length,2);
  await nb.requestRecall();assert.equal(nb.snapshot().pending.role,'target');await pc.tick();await nb.tick();await pc.tick();assert.equal(nb.canSubmit(nbState.session),true);assert.equal(pc.canSubmit(pcState.session),false);
  await pc.requestRecall();await nb.tick();await pc.tick();await nb.tick();assert.equal(pc.canSubmit(pcState.session),true);assert.equal(nb.canSubmit(nbState.session),false);
  pc.close();await new Promise(resolve=>setTimeout(resolve,8100));await nb.tick();assert.equal(nb.snapshot().presence.remote,true);assert.equal(nb.snapshot().presence.online,false);
  await nb.requestRecall();assert.equal(nb.snapshot().pending,null);assert.equal(nb.canSubmit(nbState.session),true);assert.equal(nb.snapshot().phase,'committed');
  pc=make('windows',pcState);await pc.tick();assert.equal(pc.canSubmit(pcState.session),false);assert.equal(pc.snapshot().presence.name,'notebook');assert.equal(history.length,5);
 }finally{pc?.close();nb?.close();child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});fs.rmSync(folder,{recursive:true,force:true});}
});
