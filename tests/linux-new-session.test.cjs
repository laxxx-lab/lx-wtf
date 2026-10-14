'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){const root=path.resolve(__dirname,'..'),calls=[],saved=[],events=[];const context=vm.createContext({__dirname:root,process:{...process,argv:[...process.argv,'--linux-smoke']},Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortController,AbortSignal,fetch,console,require:name=>{
 if(name==='electron')return {app:{commandLine:{appendSwitch(){}},on(){},whenReady:()=>({then:()=>({catch(){}})}),requestSingleInstanceLock:()=>false,quit(){}},globalShortcut:{unregisterAll(){}}};
 if(name==='node:fs')return {...fs,mkdirSync(){},readFileSync(){throw Error('Isolated settings');},writeFileSync(_file,text){saved.push(text);}};
 return require(name.startsWith('./')?path.resolve(root,name):name);
}});vm.runInContext(fs.readFileSync(path.join(root,'linux-main.cjs'),'utf8'),context);context.calls=calls;context.events=events;
 vm.runInContext(`emit=event=>events.push(event);connected=true;conversation={session:{id:'pc-runtime',storedId:'pc-stored',profile:'default',title:'PC'},busy:true,selecting:false};handoff={canSubmit:()=>false,snapshot:()=>({presence:{remote:true},pending:null}),tick:async()=>{handoff.canSubmit=()=>true;}};gateway={request:async(method,params)=>{calls.push({method,params});return {session_id:'nb-runtime',stored_session_id:'nb-stored'};},json:async(route,options)=>options?{ok:true}:{id:'nb-stored',title:'Lilith · Notebook · '+new Date().toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),message_count:0}};`,context);
 return {calls,saved,events,run:s=>vm.runInContext(s,context)};
}
test('a passive notebook creates its own conversation while the selected PC conversation keeps running',async()=>{
 const f=fixture();assert.equal(f.run('canCreateSession()'),true);const previous=f.run('conversation');const result=await f.run('newDeviceSession()');assert.equal(previous.busy,true);assert.equal(previous.session.id,'pc-runtime');assert.equal(result.session.id,'nb-runtime');assert.equal(result.canSubmit,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].method,'session.create');assert.ok(!f.calls.some(c=>c.method==='session.interrupt'));assert.equal(f.run('creatingSession'),false);assert.ok(f.events.some(e=>e.type==='history'&&e.messages.length===0));
});
test('own running work, privacy, capture and unresolved handoff block session creation without a model call',async()=>{
 for(const block of ['config.privacyLocked=true','rendererInput.capturing=true','rendererInput.microphoneOpen=true','handoff.canSubmit=()=>true','handoff.snapshot=()=>({pending:{requestId:"unconfirmed"}})','creatingSession=true']){const f=fixture();f.run(block);await assert.rejects(f.run('newDeviceSession()'),/pausieren/);assert.equal(f.calls.length,0,block);}
});
test('creation blocks submissions and transcriptions until the new local identity is selected',async()=>{
 const f=fixture();f.run('creatingSession=true');assert.equal(f.run('snapshot().busy'),true);await assert.rejects(f.run("actions.submit({text:'Nicht ins alte Gespräch',captured:{sessionId:'pc-runtime',generation:0}})"),/gerade erstellt/);await assert.rejects(f.run("actions.transcribe({})"),/gerade erstellt/);assert.equal(f.calls.length,0);
});
test('a coordinator poll from the previous PC selection is followed by registration of the new notebook identity',async()=>{
 const f=fixture();f.run('globalThis.polls=0;handoff.tick=async()=>{polls++;if(polls===2)handoff.canSubmit=()=>true;};');const result=await f.run('newDeviceSession()');assert.equal(result.canSubmit,true);assert.equal(f.run('polls'),2);
});
