'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture({fileSystem={},clipboardSource={}}={}){
 const prompts=[],events=[],app={setPath(){},setName(){},setAppUserModelId(){},setLoginItemSettings(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false};
 const ctx=vm.createContext({__dirname:path.resolve(__dirname,'..'),process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app,clipboard:clipboardSource,ipcMain:{handle(){}},Notification:{isSupported:()=>false}};
  if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(){},readFileSync(){throw Error('test settings');},...fileSystem};
  if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));return require(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),ctx);ctx.prompts=prompts;ctx.events=events;
 vm.runInContext("let fixtureReasoning='none';connected=true;emit=(type,data={})=>events.push({type,...data});conversation=new Conversation(async(method,params)=>{if(method==='config.get')return {value:fixtureReasoning};if(method==='config.set'){fixtureReasoning=params.value;return {key:'reasoning',value:fixtureReasoning};}if(method==='prompt.submit'){prompts.push(params.text);return {};}return {};});conversation.session={id:'runtime',storedId:'stored',profile:'default',title:'Test'};",ctx);
 return {ctx,prompts,events,run:s=>vm.runInContext(s,ctx)};
}
test('desktop gestures route only after explicit activation and block privacy standby camera loss and foreign ownership',()=>{
 const f=fixture();f.run("globalThis.desktopPackets=[];desktopGestures.handle=value=>desktopPackets.push(value);config.desktopGesturesEnabled=true;config.gesturesEnabled=true;config.cameraEnabled=true;clientInfo.cameraActive=true;");
 const invoke=()=>f.run("registerHandlers()['gesture-action'](null,{kind:'pointer',x:.4,y:.5,pinching:false,scrolling:true,generation:1,sequence:1,at:Date.now()})");
 invoke();assert.equal(f.run('desktopPackets.length'),1);assert.equal(f.run('desktopPackets[0].scrolling'),true);
 for(const guard of ['config.privacyLocked=true','config.standbyActive=true','clientInfo.cameraActive=false','ownsConversationInput=()=>false']){const g=fixture();g.run("globalThis.desktopPackets=[];desktopGestures.handle=value=>desktopPackets.push(value);config.desktopGesturesEnabled=true;config.gesturesEnabled=true;config.cameraEnabled=true;clientInfo.cameraActive=true;"+guard);g.run("registerHandlers()['gesture-action'](null,{kind:'pointer',x:.4,y:.5,pinching:true,generation:1,sequence:1,at:Date.now()})");assert.equal(g.run('desktopPackets.length'),0);}
});
test('desktop activation and deactivation preserve the independent workbench gesture preference',async()=>{
 const f=fixture();f.run("config.gesturesEnabled=false;config.desktopGesturesEnabled=false;syncStartup=()=>{};");await f.run("registerHandlers().settings(null,{desktopGesturesEnabled:true})");assert.equal(f.run('config.desktopGesturesEnabled'),true);assert.equal(f.run('config.gesturesEnabled'),false);await f.run("registerHandlers().settings(null,{desktopGesturesEnabled:false})");assert.equal(f.run('config.gesturesEnabled'),false);
});
test('explicit clipboard writes verify native content and block privacy, standby and a remote session',async()=>{
 let text='Old';const f=fixture({clipboardSource:{readText:()=>text,writeText:value=>{text=value}}});f.ctx.clipboardValue={action:'write',text:'New text'};
 const result=await f.run('apiClipboard(clipboardValue)');assert.equal(result.verified,true);assert.equal(text,'New text');assert.equal(result.text,undefined);
 for(const guard of ['config.privacyLocked=true','config.standbyActive=true','ownsConversationInput=()=>false']){
  const g=fixture({clipboardSource:{readText:()=>text,writeText:value=>{text=value}}});g.ctx.clipboardValue={action:'write',text:'Blocked'};g.run(guard);await assert.rejects(g.run('apiClipboard(clipboardValue)'));assert.equal(text,'New text');
 }
});
test('clipboard reads are bounded untrusted observations, never included in status',async()=>{
 const f=fixture({clipboardSource:{readText:()=> 'abcdef'}});const result=await f.run("apiClipboard({action:'read',maxChars:3})");assert.equal(result.text,'abc');assert.equal(result.truncated,true);assert.equal(result.untrusted,true);assert.equal(JSON.stringify(f.run('controlStatus()')).includes('abcdef'),false);
});
test('restart recovery uses the real owned reconciliation and never infers action success',async()=>{
 const f=fixture();f.run("globalThis.job=getJobs().enqueue({text:'Originalauftrag',sessionId:'stored',profile:'default',speak:false});getJobs().claim({sessionId:'stored'});getJobs().unknown(job.id,'App neu gestartet');scheduleJobs=()=>{};gateway={request:async()=>({running:false,session_id:'restored-runtime'}),json:async()=>({session_id:'stored',profile:'default',messages:[{role:'user',content:'[Lilith-Auftrag: '+job.id+']\\nOriginalauftrag'}]})};");
 await f.run('recoverInterruptedJob()');assert.equal(f.run('getJobs().active()'),null);assert.equal(f.run('getJobs().list()[0].status'),'paused');assert.equal(f.run('getJobs().list()[0].verified'),false);assert.equal(f.run('conversation.session.id'),'restored-runtime');assert.equal(f.prompts.length,0);
});
test('a correlated running job reconnects after recovery without dispatching it again',async()=>{
 const f=fixture();f.run("globalThis.job=getJobs().enqueue({text:'Originalauftrag',sessionId:'stored',profile:'default',speak:false});getJobs().claim({sessionId:'stored'});getJobs().unknown(job.id,'App neu gestartet');scheduleJobs=()=>{};gateway={request:async()=>({running:true,session_id:'restored-runtime'}),json:async()=>({session_id:'stored',messages:[{role:'user',content:'[Lilith-Auftrag: '+job.id+']\\nOriginalauftrag'}]})};");
 await f.run('recoverInterruptedJob()');assert.equal(f.run('getJobs().active().status'),'running');assert.equal(f.run('conversation.busy'),true);assert.equal(f.run('getJobs().active().attempts'),1);assert.equal(f.prompts.length,0);
});
test('restart recovery parks stopped uncertain work without replay and releases later jobs',async()=>{
 const f=fixture();f.run("globalThis.job=getJobs().enqueue({text:'Originalauftrag',sessionId:'stored',profile:'default',speak:false});getJobs().claim({sessionId:'stored'});getJobs().unknown(job.id,'App neu gestartet');globalThis.later=getJobs().enqueue({text:'Nächster Auftrag',sessionId:'stored',profile:'default',speak:false});globalThis.recoveryChecks=0;jobAction=async()=>{recoveryChecks++;getJobs().reconcile(job.id,{remoteRunning:false,verified:false});};");
 await f.run('recoverInterruptedJob()');assert.equal(f.run('recoveryChecks'),1);assert.equal(f.run('getJobs().active()'),null);assert.equal(f.run('getJobs().list()[0].status'),'paused');assert.equal(f.run('getJobs().list()[1].status'),'queued');assert.equal(f.prompts.length,0);
});
test('restart recovery is single flight, bounded and respects privacy and foreign ownership',async()=>{
 const f=fixture();f.run("globalThis.job=getJobs().enqueue({text:'Originalauftrag',sessionId:'stored',profile:'default',speak:false});getJobs().claim({sessionId:'stored'});getJobs().unknown(job.id,'App neu gestartet');globalThis.checks=0;globalThis.resolveCheck=null;jobAction=()=>{checks++;return new Promise(resolve=>resolveCheck=resolve)};config.privacyLocked=true;");
 await f.run('recoverInterruptedJob()');assert.equal(f.run('checks'),0);f.run("config.privacyLocked=false;conversation.session.storedId='foreign'");await f.run('recoverInterruptedJob()');assert.equal(f.run('checks'),0);
 f.run("conversation.session.storedId='stored'");const first=f.run('recoverInterruptedJob()');await f.run('recoverInterruptedJob()');assert.equal(f.run('checks'),1);f.run('resolveCheck()');await first;await f.run('recoverInterruptedJob()');assert.equal(f.run('checks'),1);
});
test('control status exposes only content-free capture readiness flags',()=>{
 const f=fixture();f.run("registerHandlers()['client-state'](null,{live:true,captureArmed:true,awaitingResume:true,vadReady:true,transcribing:true,dispatchCurrent:false,inputBusy:false,inputTtsPending:false,transcript:'private'})");
 const live=f.run('controlStatus().live');assert.equal(live.captureArmed,true);assert.equal(live.transcribing,true);assert.equal(live.awaitingResume,true);assert.equal(live.dispatchCurrent,false);assert.equal(live.transcript,undefined);
});
test('answer formulation stays thinking even with reasoning disabled; tools alone switch to working',async()=>{
 const f=fixture();await f.run("submit('Eine kurze Testfrage.',{speak:false})");
 assert.equal(f.run('conversation.reasoningState.effective'),'none');assert.equal(f.run('status'),'thinking');
 f.run("gatewayEvent({type:'message.start',session_id:'runtime',data:{}})");assert.equal(f.run('status'),'thinking');
 f.run("gatewayEvent({type:'tool.start',session_id:'runtime',data:{name:'test',tool_call_id:'call-1'}})");assert.equal(f.run('status'),'working');
 f.run("gatewayEvent({type:'tool.end',session_id:'runtime',data:{name:'test',tool_call_id:'call-1'}})");assert.equal(f.run('status'),'thinking');
});
test('idle standby defaults to fifteen minutes, resets on interaction, and never interrupts work',async()=>{
 const f=fixture();assert.equal(f.run('config.idleStandbyMinutes'),15);
 f.run('globalThis.idleNow=0;idleStandby=createIdleStandby({now:()=>idleNow});globalThis.entries=0;enterStandby=async()=>{entries++};');
 f.run('idleNow=900000;conversation.busy=true;');await f.run('checkIdleStandby()');assert.equal(f.run('entries'),0);
 f.run('conversation.busy=false;idleNow=1800000;');await f.run('checkIdleStandby()');assert.equal(f.run('entries'),1);
 f.run('idleNow=1900000;registerHandlers().activity();idleNow=2700000;');await f.run('checkIdleStandby()');assert.equal(f.run('entries'),1);
 f.run('config.idleStandbyMinutes=0;idleNow=999999999;');await f.run('checkIdleStandby()');assert.equal(f.run('entries'),1);
});
test('invalid idle preference is rejected before other saved preferences can change',async()=>{
 const f=fixture();await assert.rejects(f.run('registerHandlers().settings(null,{idleStandbyMinutes:-1,monitoring:false})'),/Standby/);
 assert.equal(f.run('config.monitoring'),true);assert.equal(f.run('config.idleStandbyMinutes'),15);
 await f.run('registerHandlers().settings(null,{idleStandbyMinutes:0})');assert.equal(f.run('config.idleStandbyMinutes'),0);
});
test('automatic standby cancels delayed settings when new input or session identity arrives',async()=>{
 for(const change of ["registerHandlers().activity()","clientInfo.capturing=true","conversation.busy=true","conversation.session={id:'new',storedId:'new',profile:'default'}","safetyGeneration++"]){
  const f=fixture({fileSystem:{existsSync:()=>false}});f.run("globalThis.idleNow=0;idleStandby=createIdleStandby({now:()=>idleNow});config.cameraEnabled=true;config.wakeWord=false;globalThis.controls=[];globalThis.stops=0;stopSpeech=()=>stops++;actionHandlers={settings:async(_e,values)=>{Object.assign(config,values);if(values.cameraEnabled===false)await new Promise(resolve=>{globalThis.finishSettings=resolve});}};clientControl=async action=>controls.push(action);idleNow=900000;");
  const pending=f.run('checkIdleStandby()');f.run(change+';finishSettings();');await pending;
  assert.equal(f.run('stops'),0,change);assert.equal(f.run("controls.includes('standby')"),false,change);assert.equal(f.run('config.standbyActive'),false,change);assert.equal(f.run('config.cameraEnabled'),change==='safetyGeneration++'?false:true,change);if(change!=='safetyGeneration++')assert.equal(f.run('config.wakeWord'),false,change);
 }
});
test('automatic standby cancels a pending renderer control without overwriting newer camera preference',async()=>{
 const f=fixture({fileSystem:{existsSync:()=>false}});f.run("globalThis.idleNow=0;idleStandby=createIdleStandby({now:()=>idleNow});config.cameraEnabled=true;config.wakeWord=false;actionHandlers=registerHandlers();globalThis.controls=[];clientControl=async action=>{controls.push(action);if(action==='standby')await new Promise(resolve=>{globalThis.finishControl=resolve});};idleNow=900000;");
 const pending=f.run('checkIdleStandby()');await new Promise(resolve=>setImmediate(resolve));
 await f.run('actionHandlers.settings(null,{cameraEnabled:false,wakeWord:false})');f.run('clientInfo.capturing=true;finishControl();');await pending;
 assert.equal(f.run('config.standbyActive'),false);assert.equal(f.run('config.cameraEnabled'),false);assert.equal(f.run('config.wakeWord'),false);assert.ok(f.run("controls.includes('idle-standby-cancel')"));
});
test('automatic standby preserves disabled wakewords and accepts a quiet microphone-off confirmation',async()=>{
 const f=fixture({fileSystem:{existsSync:()=>false}});f.run("globalThis.idleNow=0;idleStandby=createIdleStandby({now:()=>idleNow});config.cameraEnabled=true;config.wakeWord=false;actionHandlers=registerHandlers();globalThis.stops=0;stopSpeech=()=>stops++;clientControl=async()=>{};idleNow=900000;");await f.run('checkIdleStandby()');
 assert.equal(f.run('config.standbyActive'),true);assert.equal(f.run('config.cameraEnabled'),false);assert.equal(f.run('config.standbyCameraEnabled'),true);assert.equal(f.run('config.wakeWord'),false);assert.equal(f.run('stops'),0);
 f.run("globalThis.confirmed=false;pendingControls.set(91,{action:'standby',resolve:()=>confirmed=true,reject:()=>confirmed=false});registerHandlers()['control-ack'](null,{id:91,state:{live:false,cameraActive:false,microphoneActive:false,wakeArmed:false}})");assert.equal(f.run('confirmed'),true);
});
test('busy PC commands queue durably without a second remote submit',async()=>{
 const f=fixture();await f.run("submit('Öffne Spotify.',{speak:false})");await f.run("submit('Suche einen Song.',{speak:false})");
 assert.equal(f.prompts.length,1);assert.match(f.prompts[0],/Lilith-Auftrag: [a-f0-9-]{36}/);assert.deepEqual(Array.from(f.run('getJobs().list().map(j=>j.status)')),['running','queued']);
});
test('privacy pauses queued work and marks active remote result unknown',async()=>{
 const f=fixture();await f.run("submit('Öffne Spotify.',{speak:false})");await f.run("setPrivacy(true)");
 const state=f.run('getJobs().snapshot()');assert.equal(state.held,true);assert.equal(state.blocked,true);await assert.rejects(f.run("submit('Weiter.',{speak:false})"),/Datenschutz/);assert.equal(f.prompts.length,1);
});
test('uncorrelated terminal events do not release another queued PC command',async()=>{
 const f=fixture();await f.run("submit('Erste Aufgabe.',{speak:false})");await f.run("submit('Zweite Aufgabe.',{speak:false})");
 f.run("gateway={request:async()=>({running:false,session_id:'runtime'}),json:async()=>({messages:[{role:'user',content:'Andere Aufgabe'}]})};gatewayEvent({type:'message.complete',session_id:'runtime',data:{status:'complete',text:'Fertig.'}})");
 await new Promise(r=>setTimeout(r,20));assert.equal(f.prompts.length,1);assert.equal(f.run('getJobs().snapshot().blocked'),true);
});
test('telemetry and stale spatial packets contain no task content and cannot unlock sensors',async()=>{
 const f=fixture();const actions=f.run('registerHandlers()');await actions['voice-timing'](null,{turnId:'turn-1',stage:'dispatch-start',at:Date.now(),text:'secret'});
 assert.ok(!JSON.stringify(f.run('voiceTiming.snapshot()')).includes('secret'));f.run('config.privacyLocked=true;config.gesturesEnabled=true;config.cameraEnabled=true;clientInfo.cameraActive=true;');
 await actions['gesture-action'](null,{kind:'pointer',x:.5,y:.5,pinching:true,generation:1,sequence:1,at:Date.now()});assert.equal(f.events.some(e=>e.type==='gesture-update'),false);
});
test('detailed device-status requests withhold speech until the final reply',async()=>{
 const f=fixture();f.ctx.spoken=[];f.run('speak=text=>spoken.push(text);');await f.run("submit('Erkläre mir den Zustand meines PCs.')");
 f.run("gatewayEvent({type:'message.delta',session_id:'runtime',data:{text:'Dein PC läuft perfekt. '}})");assert.equal(f.ctx.spoken.length,0);
});
test('reconciliation cannot overwrite a session selected during a pending remote read',async()=>{
 const f=fixture();await f.run("submit('Auftrag A.',{speak:false})");f.run("getJobs().unknown(getJobs().active().id);conversation.busy=false;gateway={request:()=>new Promise(resolve=>{resolveResume=resolve}),json:async()=>({messages:[{role:'user',content:'Andere Aufgabe'}]})};");
 const pending=f.run("jobAction('job-reconcile',{id:getJobs().active().id})");await new Promise(r=>setTimeout(r,0));
 f.run("conversation.session={id:'runtime-B',storedId:'stored-B',profile:'default',title:'Session B'};resolveResume({running:false,session_id:'runtime-A'});");
 await assert.rejects(pending,/Session/);assert.equal(f.run('conversation.session.id'),'runtime-B');assert.equal(f.run('getJobs().snapshot().blocked'),true);
});
test('a terminal event before prompt acknowledgment leaves the client ready',async()=>{
 const f=fixture();f.run("gateway={request:async()=>({running:false,session_id:'runtime'}),json:async()=>({messages:[{role:'user',content:prompts[0]}]})};conversation.request=async(method,params)=>{if(method==='config.get')return {value:fixtureReasoning};if(method==='config.set'){fixtureReasoning=params.value;return {key:'reasoning',value:fixtureReasoning};}prompts.push(params.text);return new Promise(resolve=>{resolveSubmit=resolve;});};");
 const pending=f.run("submit('Nenne 7 mal 8.',{speak:false})");await new Promise(r=>setTimeout(r,0));
 f.run("gatewayEvent({type:'message.complete',session_id:'runtime',data:{status:'complete',text:'56'}})");await new Promise(r=>setTimeout(r,20));assert.equal(f.run('status'),'ready');
 f.run('resolveSubmit({});');await pending;assert.equal(f.run('status'),'ready');assert.equal(f.run('getJobs().list()[0].status'),'agent-finished');
});
test('a reconciled runtime rekey updates the voice renderer before the next capture',async()=>{
 const f=fixture();f.ctx.stateIds=[];f.run("const oldEmit=emit;emit=(type,data={})=>{if(type==='state')stateIds.push(data.session?.id);oldEmit(type,data);};gateway={request:async()=>({running:false,session_id:'runtime-new'}),json:async()=>({messages:[{role:'user',content:prompts[0]}]})};");await f.run("submit('Eine Testfrage.',{speak:false})");
 f.run("gatewayEvent({type:'message.complete',session_id:'runtime',data:{status:'complete',text:'Fertig.'}})");await new Promise(r=>setTimeout(r,25));
 assert.equal(f.run('conversation.session.id'),'runtime-new');assert.equal(f.ctx.stateIds.at(-1),'runtime-new');assert.equal(f.run('getJobs().active()'),null);
});
test('a late failed acknowledgment cannot replace a correlated completed result with an error',async()=>{
 const f=fixture();f.run("gateway={request:async()=>({running:false,session_id:'runtime'}),json:async()=>({messages:[{role:'user',content:prompts[0]}]})};conversation.request=async(method,params)=>{if(method==='config.get')return {value:fixtureReasoning};if(method==='config.set'){fixtureReasoning=params.value;return {key:'reasoning',value:fixtureReasoning};}prompts.push(params.text);return new Promise((resolve,reject)=>{rejectSubmit=reject;});};");
 const pending=f.run("submit('Nenne 7 mal 8.',{speak:false})");const settled=Promise.allSettled([pending]);await new Promise(r=>setTimeout(r,0));
 f.run("gatewayEvent({type:'message.complete',session_id:'runtime',data:{status:'complete',text:'56'}})");await new Promise(r=>setTimeout(r,20));f.run("rejectSubmit(Error('Late timeout'))");assert.equal((await settled)[0].status,'fulfilled');
 assert.equal(f.run('tasks.view().status'),'agent-finished');assert.equal(f.run('status'),'ready');
});
test('a rejected routine name preserves the verified teaching steps',async()=>{
 const f=fixture();f.run("config.routines=[{id:'existing',name:'Test',instructions:'Prüfen.',verification:'Sichtbar.'}];teach.start({name:'Test'});teach.record({appId:'light',kind:'key',key:'Enter'});teach.confirm({index:0,verification:'Menü geöffnet'});");
 await assert.rejects(f.run("visualAction('teach-save',{verification:'Fertig sichtbar'})"),/eindeutig/);assert.equal(f.run('teach.snapshot().steps.length'),1);assert.equal(f.run('teach.snapshot().active'),true);
});
test('a normal completion during interruption cannot leave the old final voice queued',async()=>{
 const f=fixture();f.run("conversation.busy=true;conversation.remoteRunning=true;conversation.speakReply=true;conversation.request=async()=>({});globalThis.oldFinalPcmPending=0;speak=()=>{ttsPending++;oldFinalPcmPending=speechGeneration;};");
 const pending=f.run("registerHandlers().interrupt(null,{turnId:'barge-1'})");f.run("gatewayEvent({type:'message.complete',session_id:'runtime',data:{status:'complete',text:'Alte Abschlussantwort'}})");const result=await pending;assert.equal(result.ready,true);assert.ok(f.run('oldFinalPcmPending')>0);assert.equal(f.run('ttsPending'),0);assert.ok(f.run('speechGeneration>oldFinalPcmPending'));
});
test('disconnect after an interrupt request never reports confirmed readiness',async()=>{
 const f=fixture();f.run('conversation.busy=true;conversation.request=async()=>({});');const pending=f.run("registerHandlers().interrupt(null,{turnId:'barge-1'})");
 setTimeout(()=>f.run('connected=false;conversation.busy=false;'),5);const result=await pending;assert.equal(result.ready,false);assert.equal(result.unknown,true);
});
test('a proven direct command uses the serial queue and needs no Hermes prompt',async()=>{
 const f=fixture();f.ctx.nativeCalls=[];f.run("directController={parse:async()=>({type:'volume',action:'set',value:25}),execute:async c=>{nativeCalls.push(c);return {status:'completed',message:'Lautstärke ist bei 25 Prozent.',evidence:{accepted:true}}}};");
 await f.run("submit('Lautstärke auf 25 Prozent',{speak:false})");assert.equal(f.prompts.length,0);assert.equal(f.ctx.nativeCalls.length,1);assert.equal(f.run('getJobs().list()[0].status'),'completed');assert.equal(f.run('getJobs().list()[0].verified'),true);
 assert.equal(f.events.filter(e=>e.type==='state').at(-1).busy,false);
});
test('uncertain native effects block further work and never fall back to Hermes',async()=>{
 const f=fixture();f.run("directController={parse:async()=>({type:'spotify',action:'play'}),execute:async()=>({status:'unverified',message:'Nicht bestätigt.'})};");
 await f.run("submit('Spiele Spotify',{speak:false})");await f.run("submit('Zweiter Auftrag',{speak:false})");assert.equal(f.prompts.length,0);assert.equal(f.run('getJobs().snapshot().blocked'),true);assert.equal(f.run('getJobs().list()[1].status'),'queued');
});
test('Spotify without a published Windows media session is delegated before any native playback attempt',async()=>{
 const f=fixture();f.run("directController={parse:async()=>({type:'spotify',action:'play'}),observe:async()=>({status:'failed',evidence:{accepted:false,error:'Keine eindeutige Spotify-Sitzung in Windows SMTC.'}}),execute:async()=>{throw Error('must not attempt playback')}};");
 await f.run("submit('Spiele Spotify',{speak:false})");assert.equal(f.prompts.length,1);assert.equal(f.run('getJobs().active().executor'),'hermes');assert.equal(f.events.some(e=>e.type==='local-reply'),false);
});
test('privacy during native execution aborts and suppresses late confirmation',async()=>{
 const f=fixture();f.run("directController={parse:async()=>({type:'volume',action:'mute'}),execute:()=>new Promise(resolve=>{resolveNative=resolve;})};");
 const pending=f.run("submit('Ton aus',{speak:false})");await new Promise(r=>setTimeout(r,0));await f.run('setPrivacy(true)');f.run("resolveNative({status:'completed',message:'Ton aus.'})");await pending;
 assert.equal(f.run('getJobs().snapshot().blocked'),true);assert.equal(f.events.some(e=>e.type==='local-reply'&&e.text==='Ton aus.'),false);
});
test('dictionary edits are validated before changing any runtime setting',async()=>{
 const f=fixture();f.run("config.speechDictionary=[];config.directCommandsEnabled=true;");
 await assert.rejects(f.run("registerHandlers().settings(null,{directCommandsEnabled:false,speechDictionary:[{word:'A',heardAs:['gleich']},{word:'B',heardAs:['gleich']}]})"));assert.equal(f.run('config.directCommandsEnabled'),true);
 await f.run("registerHandlers().settings(null,{speechDictionary:[{word:'LightCraft',heardAs:['leicht kraft']}]})");assert.equal(f.run('config.speechDictionary[0].word'),'LightCraft');
});
test('accepted standby wake commands use the same correction while dictionary aliases cannot invent a wake phrase',()=>{
 const f=fixture();f.run("config.speechDictionary=[{word:'LightCraft',heardAs:['leicht kraft']},{word:'Hey Lilith',heardAs:['Vielen Dank']}];");
 const wake=f.run("recognizeWakeCommand('Hey Lilith öffne leicht kraft')");assert.equal(wake.command,'öffne LightCraft');assert.equal(wake.correction.original,'öffne leicht kraft');assert.equal(f.run("recognizeWakeCommand('Vielen Dank öffne leicht kraft')"),null);
});
test('a failed session change restores the hotkey for the retained session',async()=>{
 const f=fixture();f.run("sessionRows=[{id:'target',title:'Target',profile:'default'}];conversation.select=async()=>{throw Error('Resume failed')};hookSynced=false;syncPushToTalk=()=>{hookSynced=true};");
 await assert.rejects(f.run("selectSession('target')"),/Resume failed/);assert.equal(f.run('hookSynced'),true);
});
test('cancelling a local task retires its ledger and permits a consciously reconciled next task',async()=>{
 const f=fixture();f.run("directController={parse:async()=>({type:'volume',action:'mute'}),execute:()=>new Promise(resolve=>{resolveNative=resolve;}),observe:async()=>({status:'completed',message:'Ton aus.'})};");
 const first=f.run("submit('Ton aus',{speak:false})");await new Promise(r=>setTimeout(r,0));await f.run("jobAction('job-cancel',{id:getJobs().active().id})");f.run("resolveNative({status:'unverified',message:'Abbruch.'})");await first;
 assert.notEqual(f.run('tasks.view().status'),'running');await f.run("jobAction('job-reconcile',{id:getJobs().active().id})");
 f.run("directController.execute=async()=>({status:'completed',message:'Ton aus.'});");await f.run("submit('Ton aus',{speak:false})");assert.equal(f.run('localCommandRunning'),false);assert.equal(f.run('getJobs().list().at(-1).status'),'completed');
});
test('a voice job starts once before the remote call, without waiting for acknowledgement speech',async()=>{
 const f=fixture();f.ctx.spoken=[];f.run("speak=text=>spoken.push(text);conversation.request=async(method,params)=>{if(method==='config.get')return {value:fixtureReasoning};if(method==='config.set'){fixtureReasoning=params.value;return {key:'reasoning',value:fixtureReasoning};}if(method==='prompt.submit'){if(!spoken.includes('Okay.'))throw Error('Missing immediate acknowledgement');prompts.push(params.text);}return {};};");
 await f.run("submit('Öffne Spotify',{turnId:'voice-start-1'})");assert.deepEqual(f.ctx.spoken,['Okay.']);assert.equal(f.prompts.length,1);assert.equal(f.events.filter(e=>e.type==='task-acknowledgement').length,1);
 f.run("gatewayEvent({type:'message.start',session_id:'runtime',data:{}});gatewayEvent({type:'tool.start',session_id:'runtime',data:{name:'WindowRead',id:'tool-1'}})");assert.deepEqual(f.ctx.spoken,['Okay.']);assert.equal(f.run('taskStartAnnouncement?.turnId'),'voice-start-1');
});
test('queued jobs are acknowledged when they begin, not while another task is still running',async()=>{
 const f=fixture();f.ctx.spoken=[];f.run("speak=text=>spoken.push(text);conversation.busy=true;");await f.run("submit('Öffne Spotify',{turnId:'voice-queued'})");assert.equal(f.ctx.spoken.length,0);f.run('conversation.busy=false;');await f.run('pumpJobs()');assert.deepEqual(f.ctx.spoken,['Okay.']);
});
test('an acknowledged inspection shares its turn with dispatch and does not restart or repeat speech',async()=>{
 const f=fixture();f.ctx.spoken=[];f.run("speak=text=>spoken.push(text);prepareTaskTurn('inspect-turn',true);announceTaskStart('Prüfe die Verbindung',{kind:'inspect'});ttsPending=1;clientSpeaking=true;");const generation=f.run('speechGeneration');
 await f.run("submit('Prüfe die Verbindung',{turnId:'inspect-turn'})");assert.equal(f.prompts.length,1);assert.deepEqual(f.ctx.spoken,['Alles klar, ich schaue es mir an.']);assert.equal(f.run('speechGeneration'),generation);
});
test('text jobs, stopped jobs, disabled privacy and direct completed controls do not add extra voice starts',async()=>{
 const f=fixture();f.ctx.spoken=[];f.run('speak=text=>spoken.push(text);');await f.run("submit('Analysiere das Projekt',{speak:false})");assert.equal(f.ctx.spoken.length,0);f.run('config.privacyLocked=true;');assert.equal(f.run("announceTaskStart('Öffne Spotify')"),false);assert.equal(f.ctx.spoken.length,0);
});
test('a direct voice action begins alongside its acknowledgement and speaks the real result separately',async()=>{
 const f=fixture();f.ctx.spoken=[];f.run("speak=text=>spoken.push(text);directController={parse:async()=>({type:'volume',action:'mute'}),execute:async()=>{if(spoken[0]!=='Okay.')throw Error('Start absent');return {status:'completed',message:'Ton ist aus.',evidence:{accepted:true}}}};");await f.run("submit('Ton aus',{turnId:'direct-voice'})");assert.deepEqual(f.ctx.spoken,['Okay.','Ton ist aus.']);assert.equal(f.prompts.length,0);assert.equal(f.run('getJobs().list()[0].verified'),true);
});
test('an interrupted acknowledgement cannot resume or exempt a different pending voice turn',async()=>{
 const f=fixture();f.ctx.spoken=[];f.run("speak=text=>spoken.push(text);prepareTaskTurn('old',true);announceTaskStart('Prüfe die Verbindung');stopSpeech();ttsPending=1;clientSpeaking=true;");await f.run("submit('Öffne Spotify',{turnId:'new'})");assert.equal(f.prompts.length,0);assert.equal(f.run('hasCurrentStartAnnouncement()'),false);assert.equal(f.run('getJobs().list()[0].status'),'queued');
});
test('start PCM is cached only for its exact fixed voice and reused without another synthesis',async()=>{
 const files=new Map(),f=fixture({fileSystem:{existsSync:file=>files.has(file),statSync:file=>({size:files.get(file)?.length||0}),readFileSync:file=>{if(files.has(file))return files.get(file);throw Error('No fixture settings');},writeFileSync:(file,data)=>files.set(file,data)}});f.ctx.syntheses=0;
 f.run("voiceClient={registry:[{name:'hermes-dark-normal',spk_b64:'fixture-A'}],speech:async()=>{syntheses++;return {ok:true,body:(async function*(){yield Buffer.alloc(2400);yield Buffer.alloc(2400);})()};}};prepareTaskTurn('cache-one');announceTaskStart('Öffne Spotify');");await f.run('speechChain');const first=f.run("startAnnouncementCache('Okay.')");assert.equal(files.get(first).length,4800);assert.equal(f.ctx.syntheses,1);
 f.run("prepareTaskTurn('cache-two');announceTaskStart('Öffne Spotify');");await f.run('speechChain');assert.equal(f.ctx.syntheses,1);assert.equal(f.events.filter(e=>e.type==='audio-start'&&e.purpose==='acknowledgement').length,2);
 f.run("voiceClient.registry[0].spk_b64='fixture-B';");assert.notEqual(f.run("startAnnouncementCache('Okay.')"),first);
});
test('cancelled start synthesis cannot cache or deliver PCM after its speech generation was revoked',async()=>{
 const files=new Map(),f=fixture({fileSystem:{existsSync:()=>false,writeFileSync:(file,data)=>files.set(file,data)}});let released,entered;const gate=new Promise(r=>{released=r;}),ready=new Promise(r=>{entered=r;});f.ctx.fixtureBody=(async function*(){entered();await gate;yield Buffer.alloc(2400);})();
 f.run("voiceClient={registry:[],speech:async()=>({ok:true,body:fixtureBody})};prepareTaskTurn('cancel-cache');announceTaskStart('Öffne Spotify');");const pending=f.run('speechChain');await ready;f.run('stopSpeech();');released();await pending;assert.equal([...files.keys()].some(file=>file.includes('start-announcements')),false);assert.equal(f.events.filter(e=>e.type==='audio-chunk').length,0);
});
