'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture({fileSystem={}}={}){
 const prompts=[],events=[],app={setPath(){},setName(){},setAppUserModelId(){},setLoginItemSettings(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false};
 const ctx=vm.createContext({__dirname:path.resolve(__dirname,'..'),process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app,ipcMain:{handle(){}},Notification:{isSupported:()=>false}};
  if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(){},readFileSync(){throw Error('test settings');},...fileSystem};
  if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));return require(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),ctx);ctx.prompts=prompts;ctx.events=events;
 vm.runInContext("connected=true;emit=(type,data={})=>events.push({type,...data});conversation=new Conversation(async(method,params)=>{if(method==='prompt.submit'){prompts.push(params.text);return {};}return {};});conversation.session={id:'runtime',storedId:'stored',profile:'default',title:'Test'};",ctx);
 return {ctx,prompts,events,run:s=>vm.runInContext(s,ctx)};
}
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
 const f=fixture();f.run("gateway={request:async()=>({running:false,session_id:'runtime'}),json:async()=>({messages:[{role:'user',content:prompts[0]}]})};conversation.request=async(method,params)=>{prompts.push(params.text);return new Promise(resolve=>{resolveSubmit=resolve;});};");
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
 const f=fixture();f.run("gateway={request:async()=>({running:false,session_id:'runtime'}),json:async()=>({messages:[{role:'user',content:prompts[0]}]})};conversation.request=async(method,params)=>{prompts.push(params.text);return new Promise((resolve,reject)=>{rejectSubmit=reject;});};");
 const pending=f.run("submit('Nenne 7 mal 8.',{speak:false})");const settled=Promise.allSettled([pending]);await new Promise(r=>setTimeout(r,0));
 f.run("gatewayEvent({type:'message.complete',session_id:'runtime',data:{status:'complete',text:'56'}})");await new Promise(r=>setTimeout(r,20));f.run("rejectSubmit(Error('Late timeout'))");assert.equal((await settled)[0].status,'fulfilled');
 assert.equal(f.run('tasks.view().status'),'agent-finished');assert.equal(f.run('status'),'ready');
});
test('a rejected routine name preserves the verified teaching steps',async()=>{
 const f=fixture();f.run("config.routines=[{id:'existing',name:'Test',instructions:'Prüfen.',verification:'Sichtbar.'}];teach.start({name:'Test'});teach.record({appId:'light',kind:'key',key:'Enter'});teach.confirm({index:0,verification:'Menü geöffnet'});");
 await assert.rejects(f.run("visualAction('teach-save',{verification:'Fertig sichtbar'})"),/eindeutig/);assert.equal(f.run('teach.snapshot().steps.length'),1);assert.equal(f.run('teach.snapshot().active'),true);
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
 const f=fixture();f.ctx.spoken=[];f.run("speak=text=>spoken.push(text);conversation.request=async(method,params)=>{if(method==='prompt.submit'){if(!spoken.includes('Okay.'))throw Error('Missing immediate acknowledgement');prompts.push(params.text);}return {};};");
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
