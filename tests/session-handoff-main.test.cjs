'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const requests=[],prompts=[],events=[];let options;
 const controller={start(){},close(){},tick:async()=>{},canSubmit:()=>true,snapshot:()=>({available:true,phase:'ready',pending:null,passive:false,clients:[]}),requestTransfer:async target=>{requests.push(target);return {phase:'waiting'};},requestRecall:async()=>{requests.push('recall');return {phase:'waiting'};}};
 const app={setPath(){},setName(){},setAppUserModelId(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false};
 const context=vm.createContext({__dirname:path.resolve(__dirname,'..'),process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,performance,fetch,console,require:name=>{if(name==='electron')return {app,ipcMain:{handle(){}},Notification:{isSupported:()=>false}};if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(){},readFileSync(){throw Error('fixture settings');}};if(name==='./session-handoff.cjs')return {...require('../session-handoff.cjs'),createSessionHandoff:value=>{options=value;return controller;}};if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));return require(name);}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),context);Object.assign(context,{events,prompts});
 vm.runInContext("actionHandlers=registerHandlers();connected=true;config.directCommandsEnabled=false;emit=(type,data={})=>events.push({type,...data});speak=()=>{};conversation=new Conversation(async(method,params)=>{if(method==='config.get')return {value:'none'};if(method==='prompt.submit')prompts.push(params);return {};});conversation.session={id:'runtime',storedId:'stored',profile:'default',title:'Fixture'};pumpJobs=async()=>{};",context);
 return {requests,prompts,events,controller,get options(){return options;},run:code=>vm.runInContext(code,context)};
}
test('an explicit desktop change uses the handoff controller without submitting a Hermes prompt or queue job',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");assert.deepEqual(f.requests,['notebook']);assert.equal(f.run('getJobs().list().length'),0);assert.equal(f.prompts.length,0);assert.equal(f.options.getState().session.id,'stored');
});

test('the reported natural Notebook switch reaches handoff before Hermes or local dialogue',async()=>{
 const f=fixture();await f.run("submit('Lass uns mal auf dem Notebook weiterarbeiten, bitte.',{speak:false})");
 assert.deepEqual(f.requests,['notebook']);assert.equal(f.prompts.length,0);assert.equal(f.run('getJobs().list().length'),0);
});

test('the reported Gaming PC work request recalls the selected conversation without Hermes or queue jobs',async()=>{
 const f=fixture();await f.run("submit('ich will wieder auf dem gaming pc arbeiten',{speak:false})");
 assert.deepEqual(f.requests,['recall']);assert.equal(f.prompts.length,0);assert.equal(f.run('getJobs().list().length'),0);assert.equal(f.options.getState().session.id,'stored');
});

test('a passive PC can explicitly recall via its button or local text without a model prompt',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.controller.canSubmit=()=>false;
 await f.run('actionHandlers.recall()');await f.run("submit('Hol Lilith hierher zurück',{speak:false})");await f.run("submit('Ich wechsel zurück an den PC',{speak:false})");
 assert.deepEqual(f.requests,['notebook','recall','recall','recall']);assert.equal(f.prompts.length,0);assert.equal(f.run('getJobs().list().length'),0);
 assert.equal(f.options.name,require('node:os').hostname());
});
test('a passive source cannot feed the local dialogue or new queue jobs but local stop remains reachable',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.controller.canSubmit=()=>false;await assert.rejects(f.run("submit('Fasse diesen Text zusammen',{speak:false})"),/übergeben|Gerät|Übergabe/i);assert.equal(f.run('getJobs().list().length'),0);
 f.run('globalThis.stopped=false;stopCurrentTask=async()=>{stopped=true;};');await f.run("submit('Stopp',{speak:false})");assert.equal(f.run('stopped'),true);
});
test('a confirmed transfer silences only this conversation without resetting saved sensor preferences',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");const before=f.run('JSON.stringify(config)');await f.options.onTransferred({id:'stored',profile:'default'});assert.equal(f.run('JSON.stringify(config)'),before);assert.equal(f.run('conversation.session.storedId'),'stored');assert.ok(f.events.some(event=>event.type==='handoff-input'&&event.passive===true));
});
test('handoff selects the matching profile when stored identifiers occur in several profiles',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.run("sessionRows=[{id:'target',profile:'other',title:'Other'},{id:'target',profile:'default',title:'Target'}];recoverBackgroundSession=async()=>{};conversation.request=async()=>({session_id:'target-runtime',running:false});");
 await f.options.selectSession({id:'target',profile:'default',title:'Target'});assert.equal(f.run('conversation.session.profile'),'default');
});

test('verified incoming history activates the PC orb without expanding it or changing saved preferences',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");
 f.run("globalThis.opened=false;expand=value=>opened=value;win={showInactive:()=>{shown=true}};globalThis.shown=false;gateway={request:async()=>({messages:[{role:'user',text:'Hello'}]})};");const before=f.run('JSON.stringify(config)');
 await f.options.showHistory({id:'stored',profile:'default'});assert.equal(f.run('opened'),false);assert.equal(f.run('shown'),true);assert.equal(f.run('JSON.stringify(config)'),before);assert.ok(f.events.some(row=>row.type==='handoff-history'));
});
test('an owned incoming handoff wakes idle PC camera before greeting and leaves Live for greeting completion',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");
 f.run("config.standbyActive=true;config.standbyCameraEnabled=true;config.cameraEnabled=false;globalThis.controls=[];globalThis.spoken=[];clientControl=async action=>controls.push(action);speak=text=>spoken.push(text);globalThis.finishGreeting=null;speechChain=new Promise(resolve=>finishGreeting=resolve);");
 assert.equal(f.options.getState().privacyLocked,false);await f.options.onReceived({id:'stored',profile:'default'});
 assert.equal(f.run('config.standbyActive'),false);assert.equal(f.run('config.cameraEnabled'),true);assert.equal(f.run('spoken.length'),1);assert.deepEqual(Array.from(f.run('controls')),['camera']);assert.equal(f.events.filter(row=>row.type==='handoff-listen-ready').length,0);
 f.run('finishGreeting()');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.events.filter(row=>row.type==='handoff-listen-ready').length,1);
});
test('privacy while incoming idle camera restoration waits suppresses late greeting and Live',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");
 f.run("config.standbyActive=true;config.standbyCameraEnabled=true;config.cameraEnabled=false;globalThis.spoken=[];speak=text=>spoken.push(text);clientControl=()=>new Promise(resolve=>{globalThis.finishCamera=resolve});");
 const pending=f.options.onReceived({id:'stored',profile:'default'});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.run('typeof finishCamera'),'function');f.run('config.privacyLocked=true;safetyGeneration++;finishCamera();');await pending;
 assert.equal(f.run('spoken.length'),0);assert.equal(f.events.filter(row=>row.type==='handoff-listen').length,0);
});
test('failed incoming idle camera restoration keeps standby camera off without greeting',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.run("config.standbyActive=true;config.standbyCameraEnabled=true;config.cameraEnabled=false;globalThis.spoken=[];speak=text=>spoken.push(text);clientControl=async()=>{throw Error('Camera unavailable')}");
 await assert.rejects(f.options.onReceived({id:'stored',profile:'default'}),/Camera unavailable/);assert.equal(f.run('config.standbyActive'),true);assert.equal(f.run('config.cameraEnabled'),false);assert.equal(f.run('config.standbyCameraEnabled'),true);assert.equal(f.run('spoken.length'),0);
});

test('the PC greets a confirmed owned arrival locally without another Hermes prompt',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.run("globalThis.spoken=[];speak=text=>spoken.push(text);");const before=f.run('JSON.stringify(config)');
 await f.options.onReceived?.({id:'stored',profile:'default'});assert.equal(f.run('spoken.length'),1);assert.ok(f.events.some(row=>row.type==='local-reply'));assert.equal(f.prompts.length,0);assert.equal(f.run('JSON.stringify(config)'),before);
 f.controller.canSubmit=()=>false;await f.options.onReceived?.({id:'stored',profile:'default'});assert.equal(f.run('spoken.length'),1);
 f.controller.canSubmit=()=>true;f.run('config.privacyLocked=true;');await f.options.onReceived?.({id:'stored',profile:'default'});assert.equal(f.run('spoken.length'),1);
});

test('PC arrival listening is announced before greeting and released after its own speech chain',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.run("globalThis.finishGreeting=null;speechChain=new Promise(resolve=>finishGreeting=resolve);speak=()=>{};");
 f.options.onReceived({id:'stored',profile:'default'});assert.equal(f.events.filter(row=>row.type==='handoff-listen').length,1);assert.equal(f.events.filter(row=>row.type==='handoff-listen-ready').length,0);
 f.run('finishGreeting()');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.events.filter(row=>row.type==='handoff-listen-ready').length,1);assert.equal(f.prompts.length,0);
});

test('stopped greeting cannot later auto-open PC listening',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.run("globalThis.finishGreeting=null;speechChain=new Promise(resolve=>finishGreeting=resolve);speak=()=>{};");f.options.onReceived({id:'stored',profile:'default'});f.run('speechGeneration++;finishGreeting()');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.events.filter(row=>row.type==='handoff-listen-ready').length,0);
});
test('local stop on a passive source never interrupts the notebook owner of the shared runtime',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.controller.canSubmit=()=>false;f.run("globalThis.remote=[];conversation.request=async(method)=>{remote.push(method);return {};};gatewayEvent({type:'message.start',session_id:'runtime',data:{}});");
 assert.equal(f.run('conversation.busy'),true);await f.run('actionHandlers.interrupt(null)');assert.equal(f.run("remote.includes('session.interrupt')"),false);
});
test('a passive source cannot resume standby and change its sensors through a late wake request',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.controller.canSubmit=()=>false;f.run("globalThis.controls=[];clientControl=async action=>{controls.push(action);return {};};");await assert.rejects(f.run("resumeStandby({sessionId:'runtime'})"),/übergeben|Gerät|Übergabe/i);assert.equal(f.run('controls.length'),0);
});
test('passive wake IPC neither feeds the detector nor greets for the old session',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.controller.canSubmit=()=>false;f.run("globalThis.greetings=[],feeds=[];speak=text=>greetings.push(text);config.wakeWord=true;wakeReady=true;wakeChild={stdin:{writable:true,writableLength:0,write:bytes=>feeds.push(bytes)}};");
 f.run("actionHandlers['wake-feed'](null,'AAA=');actionHandlers['wake-greet'](null,'runtime');");assert.equal(f.run('greetings.length'),0);assert.equal(f.run('feeds.length'),0);
});
test('a passive conversation does not request microphone recovery against the preserved wakeword preference',async()=>{
 const f=fixture();await f.run("submit('Ich wechsel aufs Notebook',{speak:false})");f.controller.canSubmit=()=>false;f.run('config.wakeWord=true;clientInfo.live=false;');assert.equal(f.run('voiceHealthSample().expectedMicrophone'),false);assert.equal(f.run('config.wakeWord'),true);
});
