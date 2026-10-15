'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {validateLinuxSettings}=require('../linux-client.cjs');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-idle-')),events=[];let time=0;
 class Clock extends Date{static now(){return time;}}
 const app={commandLine:{appendSwitch(){}},requestSingleInstanceLock:()=>false,quit(){}};
 const context=vm.createContext({__dirname:root,process:{...process,platform:'linux',argv:[...process.argv,'--linux-smoke']},Date:Clock,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app};if(name==='./idle-standby.cjs'){const module=require('../idle-standby.cjs');return {...module,createIdleStandby:()=>module.createIdleStandby({now:Clock.now})};}if(name==='./session-handoff.cjs')return {...require('../session-handoff.cjs'),createSessionHandoff:options=>{context.handoffOptions=options;return {start(){},canSubmit:()=>true,snapshot:()=>({})};}};if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));return require(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../linux-main.cjs'),'utf8'),context);
 context.events=events;vm.runInContext("emit=event=>events.push(event);connected=true;conversation={session:{id:'runtime',storedId:'stored',profile:'default',title:'Selected'},busy:false};",context);
 return {root,events,run:code=>vm.runInContext(code,context),time:value=>time=value,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('Linux validates and preserves default fifteen minute idle timeout and explicit off',()=>{
 assert.equal(validateLinuxSettings().idleStandbyMinutes,15);
 for(const value of [0,1,15,1440])assert.equal(validateLinuxSettings({idleStandbyMinutes:value}).idleStandbyMinutes,value);
 for(const value of [-1,1441,1.5,'15',null])assert.throws(()=>validateLinuxSettings({idleStandbyMinutes:value}));
});
test('explicit Linux standby closes local speech without sending a model request',async()=>{
 const f=fixture();try{f.run("rendererInput={capturing:false,speaking:true,live:true,microphoneOpen:true};speechPending=1;conversation.submit=()=>{throw Error('Must not submit')};");
  await f.run("submit('Lilith, geh bitte in den Standby.',{captured:{sessionId:'runtime',generation:0}})");assert.equal(f.run('standbyActive'),true);assert.equal(f.run('speechPending'),0);assert.equal(f.run('rendererInput.microphoneOpen'),false);assert.equal(f.run('conversation.session.storedId'),'stored');
 }finally{f.close();}
});
test('manual Linux standby protects a running task and refuses stale captured ownership',async()=>{
 const f=fixture();try{f.run('conversation.busy=true;');assert.throws(()=>f.run('actions.standby()'),/Auftrag/);assert.equal(f.run('standbyActive'),false);f.run('conversation.busy=false;');await assert.rejects(f.run("submit('Standby',{captured:{sessionId:'other',generation:0}})"),/Aufnahme|Session/);assert.equal(f.run('standbyActive'),false);}finally{f.close();}
});
test('Linux idle pauses a silent open live microphone while preserving session and preferences',()=>{
 const f=fixture();try{
  assert.equal(f.run('typeof idleStandbyTick'),'function');
  f.run("config.microphoneDeviceId='chosen';rendererInput={capturing:false,speaking:false,live:true,microphoneOpen:true};");
  f.time(899999);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),false);
  f.time(900000);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),true);
  assert.equal(f.run('config.privacyLocked'),false);assert.equal(f.run('config.microphoneDeviceId'),'chosen');assert.equal(f.run('conversation.session.storedId'),'stored');assert.ok(f.events.some(event=>event.type==='standby-state'&&event.active));
  f.run("actions['wake-resume']()");assert.equal(f.run('snapshot().standby.active'),false);
 }finally{f.close();}
});
test('Linux ongoing work, playback and actual capture defer standby for a full idle period',()=>{
 for(const busy of ['conversation.busy=true','transcribing=true','speechPending=1','rendererInput.speaking=true','rendererInput.capturing=true']){
  const f=fixture();try{
   assert.equal(f.run('typeof idleStandbyTick'),'function');f.run(busy);f.time(900000);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),false);
   f.run('conversation.busy=false;transcribing=false;speechPending=0;rendererInput.speaking=false;rendererInput.capturing=false');f.time(1799999);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),false);f.time(1800000);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),true);
  }finally{f.close();}
 }
});
test('Linux health and snapshots do not reset inactivity while accepted activity does',()=>{
 const f=fixture();try{
  assert.equal(f.run('typeof idleStandbyTick'),'function');f.time(600000);f.run('snapshot();update();actions.activity()');f.time(900000);f.run('snapshot();update();idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),false);f.time(1500000);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),true);
 }finally{f.close();}
});
test('Linux disabled timeout and unavailable owner cannot enter automatic standby',()=>{
 for(const change of ['config.idleStandbyMinutes=0','config.privacyLocked=true','connected=false','handoff={canSubmit:()=>false,snapshot:()=>({})}','handoff={canSubmit:()=>true,snapshot:()=>({pending:{session:{id:"stored",profile:"default"}}})}']){
  const f=fixture();try{assert.equal(f.run('typeof idleStandbyTick'),'function');f.run(change);f.time(86400000);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),false);}finally{f.close();}
 }
});

test('Linux microphone start counts as activity while silent input heartbeats do not',()=>{
 const f=fixture();try{
  f.time(600000);f.run("actions['input-state']({sessionId:'runtime',generation:0,capturing:false,speaking:false,live:true,microphoneOpen:true})");
  f.time(900000);f.run("actions['input-state']({sessionId:'runtime',generation:0,capturing:false,speaking:false,live:true,microphoneOpen:true});idleStandbyTick()");assert.equal(f.run('snapshot().standby.active'),false);
  f.time(1500000);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),true);
 }finally{f.close();}
});

test('Linux standby keeps handoff available and arrival resumes locally without expanding the panel',()=>{
 const f=fixture();try{
  f.run('createHandoff()');f.time(900000);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),true);assert.equal(f.run('handoffOptions.getState().privacyLocked'),false);
  f.run("handoffOptions.onReceived({id:'stored',profile:'default'})");assert.equal(f.run('snapshot().standby.active'),false);assert.ok(f.events.some(event=>event.type==='handoff-listen'));assert.equal(f.run('panelOpen'),false);
 }finally{f.close();}
});

test('Linux saving off survives validation and status queries without changing device preferences',async()=>{
 const f=fixture();try{
  f.run("config.microphoneDeviceId='chosen'");await f.run('actions.settings({idleStandbyMinutes:0})');
  const saved=JSON.parse(fs.readFileSync(path.join(f.root,'.local/linux-settings.json'),'utf8'));assert.equal(saved.idleStandbyMinutes,0);assert.equal(saved.microphoneDeviceId,'chosen');f.time(86400000);f.run('idleStandbyTick()');assert.equal(f.run('snapshot().standby.active'),false);
 }finally{f.close();}
});

test('Linux thinking spans submission and formulation while concurrent real tools retain working',async()=>{
 const f=fixture();try{
  f.run("conversation.receive=()=>true;conversation.submit=async()=>{conversation.busy=true;}");await f.run("submit('Erkläre eine Sache')");assert.equal(f.run('status'),'thinking');
  f.run("gatewayEvent({type:'message.start',data:{}})");assert.equal(f.run('status'),'thinking');
  f.run("gatewayEvent({type:'tool.start',data:{tool_call_id:'a',name:'Suche'}});gatewayEvent({type:'tool.start',data:{tool_call_id:'b',name:'Lesen'}});gatewayEvent({type:'tool.end',data:{tool_call_id:'a',name:'Suche'}})");assert.equal(f.run('status'),'working');
  f.run("gatewayEvent({type:'tool.end',data:{tool_call_id:'b',name:'Lesen'}});gatewayEvent({type:'message.delta',data:{text:'Die Antwort wird formuliert.'}})");assert.equal(f.run('status'),'thinking');
  f.run("conversation.busy=false;gatewayEvent({type:'message.complete',data:{text:'Fertig.'}})");assert.equal(f.run('status'),'ready');
 }finally{f.close();}
});
