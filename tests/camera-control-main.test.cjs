const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture({singleInstance=false,dialog,transcript}={}){
  const captured=[],submitted=[],saved=[],events={},frame={image:'/9j/aGVsbG8=',source:{deviceId:'chosen',label:'HD Webcam C525'},capturedAt:new Date().toISOString()};
  const app={setPath(){},setName(){},setAppUserModelId(){},setLoginItemSettings(){},on(name,fn){events[name]=fn;},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>singleInstance,whenReady:()=>({then(){}})};
  const context=vm.createContext({__dirname:path.resolve(__dirname,'..'),process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
    if(name==='electron')return {app,dialog,ipcMain:{handle(){}},Notification:{isSupported:()=>false},screen:{getDisplayMatching:()=>context.fixtureDisplay},desktopCapturer:{getSources:async options=>{context.captureOptions=options;return context.fixtureSources||[];}}};
    if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(file,text){saved.push({file,text});},readFileSync(){throw new Error('No saved settings in test');}};
    if(name==='./system-monitor.cjs')return {createSystemSampler:()=>async()=>({}),germanAlert:()=>''};
    if(name==='./transcription.cjs'&&transcript!==undefined)return {...require('../transcription.cjs'),transcribeAudio:typeof transcript==='function'?transcript:async()=>transcript};
    if(name==='./context-observer.cjs'){const observer=require('../context-observer.cjs');return {...observer,readForegroundContext:async()=>context.fixtureForeground||{app:null,windowTitle:null,excluded:false}};}
    if(name==='./screen-service.cjs'){const service=require('../screen-service.cjs');return {...service,describeScreen:(image,question,options)=>service.describeScreen(image,question,{...options,fetcher:context.fetch})};}
    if(name==='./circle-interest.cjs')return {createCircleInterest:options=>{context.circleOptions=options;return {show:async()=>{assert.equal(options.allowed(),true);context.circleShown=true;return {ok:true};},clear(){context.circleCleared=true;}};}};
    if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));
    return require(name);
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),context);
  vm.runInContext('const originalSubmit=submit;',context);
  context.fixtureFrame=frame;context.fixtureService={request:async()=>({faces:[{name:'Patrik',box:[1,2,3,4]}]}),describe:async(image,question)=>{captured.push({image,question});return {description:'Eine Tasse.',held_object:'Tasse',uncertain:false};}};
  context.submitSpy=()=>{submitted.push(true);};context.activity=[];
  vm.runInContext("config.localDialogueEnabled=false;config.naturalConversation=false;config.cameraEnabled=true;config.cameraDeviceId='chosen';config.cameraRecognize=true;clientInfo.cameraActive=true;conversation={session:{id:'selected'},busy:true};getCameraService=()=>fixtureService;clientControl=async action=>{if(action!=='look')throw new Error('Must not open a camera');return fixtureFrame;};submit=submitSpy;emit=(type,data)=>{if(type==='camera-activity')activity.push(data.active);};",context);
  return {context,captured,submitted,saved,events,look:()=>vm.runInContext("lookCurrentCamera('Was halte ich in der Hand?')",context)};
}
test('recognized startup greeting waits for connection and attendance without being consumed by an old frame',()=>{
 const f=fixture();f.context.greeted=[];
 vm.runInContext("config.cameraGreetings=true;conversation.busy=false;voiceClient={};speak=text=>greeted.push(text);cameraGreetings=['Patrik'];cameraSeen.set('Patrik',Date.now()-10000);connected=false;",f.context);
 vm.runInContext('drainCameraGreetings()',f.context);assert.equal(f.context.greeted.length,0);assert.equal(vm.runInContext('cameraGreetings.length',f.context),1);
 vm.runInContext('connected=true;drainCameraGreetings()',f.context);assert.equal(vm.runInContext('cameraGreetings.length',f.context),1);
 vm.runInContext("cameraSeen.set('Patrik',Date.now());config.privacyLocked=true;drainCameraGreetings()",f.context);assert.equal(f.context.greeted.length,0);
 vm.runInContext('config.privacyLocked=false;drainCameraGreetings();drainCameraGreetings()',f.context);assert.equal(f.context.greeted.length,1);assert.match(f.context.greeted[0],/Patrik/);
});
test('transcription alone cannot leave main thinking when a bare wakeword or cancelled dispatch creates no job',async()=>{
 const f=fixture({transcript:'Lilith'}),wav=Buffer.alloc(44);wav.write('RIFF');f.context.qaAudio=wav.toString('base64');
 vm.runInContext('connected=true;conversation.busy=false;',f.context);
 const text=await vm.runInContext("registerHandlers().transcribe(null,{audio:qaAudio,sessionId:'selected'})",f.context);
 assert.equal(text,'Lilith');assert.equal(vm.runInContext('status',f.context),'ready');assert.equal(vm.runInContext('getJobs().list().length',f.context),0);
});
test('a late transcript cannot overwrite work that took ownership of the status',async()=>{
 let finish;const f=fixture({transcript:()=>new Promise(resolve=>finish=resolve)}),wav=Buffer.alloc(44);wav.write('RIFF');f.context.qaAudio=wav.toString('base64');
 vm.runInContext('connected=true;conversation.busy=false;',f.context);
 const pending=vm.runInContext("registerHandlers().transcribe(null,{audio:qaAudio,sessionId:'selected'})",f.context);
 vm.runInContext("conversation.busy=true;state('working','Synthetic tool');",f.context);finish('Lilith');await pending;
 assert.equal(vm.runInContext('status',f.context),'working');assert.equal(vm.runInContext('conversation.busy',f.context),true);
});
test('privacy rejects both capture and sensor settings before local or remote work starts',async()=>{
  const f=fixture();vm.runInContext('config.privacyLocked=true;config.screenEnabled=true;',f.context);
  await assert.rejects(f.look(),/Datenschutz/i);assert.equal(f.captured.length,0);
  await assert.rejects(vm.runInContext("registerHandlers().settings(null,{cameraEnabled:true})",f.context),/Datenschutz/i);
  await assert.rejects(vm.runInContext("registerHandlers().settings(null,{wakeWord:true})",f.context),/Datenschutz/i);
  await assert.rejects(vm.runInContext("lookCurrentScreen('Was steht dort?')",f.context),/Datenschutz/i);
});
test('privacy prevents a new visual marker before constructing an overlay',async()=>{
  const f=fixture();vm.runInContext('config.privacyLocked=true;',f.context);
  f.context.highlight={x:10,y:10,width:100,height:60,capturedAt:new Date().toISOString()};
  await assert.rejects(vm.runInContext('showHighlight(highlight)',f.context),/Datenschutz/i);
});
test('privacy gates ordinary Hermes submissions while explicit local unlock remains possible',async()=>{
  const f=fixture();f.context.prompts=[];
  vm.runInContext("submit=originalSubmit;config.privacyLocked=true;connected=true;conversation.busy=false;conversation.submit=async text=>prompts.push(text);",f.context);
  await assert.rejects(vm.runInContext("submit('Öffne Spotify.',{speak:false})",f.context),/Datenschutz/i);assert.equal(f.context.prompts.length,0);
});
test('task tracking does not label an accepted or merely completed tool as verified success',async()=>{
  const f=fixture();f.context.prompts=[];
  vm.runInContext("submit=originalSubmit;connected=true;conversation.busy=false;conversation.receive=()=>true;conversation.submit=async text=>prompts.push(text);",f.context);
  await vm.runInContext("submit('Öffne Spotify.',{speak:false})",f.context);
  f.context.start={type:'tool.start',session_id:'selected',data:{name:'SpotifyPlay',id:'play'}};vm.runInContext('gatewayEvent(start)',f.context);
  f.context.end={type:'tool.end',session_id:'selected',data:{name:'SpotifyPlay',id:'play',status:'complete',result:{accepted:true}}};vm.runInContext('gatewayEvent(end)',f.context);
  f.context.done={type:'message.complete',session_id:'selected',data:{status:'complete',text:'Erledigt.'}};vm.runInContext('gatewayEvent(done)',f.context);
  const view=vm.runInContext('tasks.view()',f.context);assert.equal(view.status,'agent-finished');assert.equal(view.verification,'unknown');
});
test('local standby can arm a wakeword when the gateway is unavailable',async()=>{
  const f=fixture();f.context.controls=[];
  vm.runInContext("connected=false;conversation.busy=false;clientControl=async action=>controls.push(action);actionHandlers={settings:async(_e,values)=>Object.assign(config,values)};",f.context);
  await vm.runInContext('enterStandby({announce:false})',f.context);assert.deepEqual(f.context.controls,['standby']);assert.equal(vm.runInContext('config.wakeWord',f.context),true);
});
test('privacy suppresses late remote reply content and refuses approving a pending remote action',async()=>{
  const f=fixture();f.context.published=[];f.context.responses=[];
  vm.runInContext("config.privacyLocked=true;conversation.receive=()=>true;emit=(type,data)=>published.push({type,...data});approval={id:'approval'};gateway={respond:(...args)=>responses.push(args)};",f.context);
  f.context.delta={type:'message.delta',data:{text:'PRIVATE CONTENT'}};vm.runInContext('gatewayEvent(delta)',f.context);
  f.context.done={type:'message.complete',data:{status:'complete',text:'PRIVATE CONTENT'}};vm.runInContext('gatewayEvent(done)',f.context);
  assert.ok(!JSON.stringify(f.context.published).includes('PRIVATE CONTENT'));
  vm.runInContext("approval={id:'approval'}",f.context);
  await assert.rejects(vm.runInContext("registerHandlers().settings(null,{approvalChoice:'once'})",f.context),/Datenschutz/i);assert.equal(f.context.responses.length,0);
});
test('monitor vision checks fresh sensitive foreground metadata even with context recording off',async()=>{
  const f=fixture();f.context.fixtureSources=[{id:'screen:1:0',name:'Monitor 1',display_id:'1'}];f.context.fixtureDisplay={id:1,workArea:{x:0,y:0,width:1920,height:1080}};f.context.fixtureForeground={excluded:true,reason:'sensitive-window'};f.context.screenCaptured=[];
  vm.runInContext("config.screenEnabled=true;config.contextEnabled=false;config.screenSourceId='current-monitor';win={getBounds:()=>({x:0,y:0,width:190,height:230})};clientControl=async()=>screenCaptured.push(true);",f.context);
  await assert.rejects(vm.runInContext("lookCurrentScreen('Was steht da?')",f.context),/sensibel|sensibles/i);assert.equal(f.context.screenCaptured.length,0);
});
test('unlock does not replay remote output from the interrupted turn before its terminal event',async()=>{
  const f=fixture();f.context.published=[];f.context.calls=[];
  vm.runInContext("conversation.receive=()=>true;connected=true;gateway={request:async()=>({})};clientControl=async()=>{};emit=(type,data)=>published.push({type,...data});speak=text=>calls.push(text);",f.context);
  await vm.runInContext('setPrivacy(true)',f.context);await vm.runInContext('setPrivacy(false)',f.context);
  f.context.delta={type:'message.delta',session_id:'selected',data:{text:'OLD PRIVATE ANSWER'}};vm.runInContext('gatewayEvent(delta)',f.context);
  f.context.done={type:'message.complete',session_id:'selected',data:{status:'complete',text:'OLD PRIVATE ANSWER'}};vm.runInContext('gatewayEvent(done)',f.context);
  assert.ok(!JSON.stringify(f.context.published).includes('OLD PRIVATE ANSWER'));assert.equal(f.context.calls.length,0);
});
test('privacy confirmation requires every reported sensor and live input to actually be inactive',async()=>{
  const f=fixture();f.context.pendingRejected=false;
  vm.runInContext("pendingControls.set(77,{action:'privacy',enabled:true,timer:null,reject:()=>pendingRejected=true,resolve:()=>{}})",f.context);
  await vm.runInContext("registerHandlers()['control-ack'](null,{id:77,state:{privacyLocked:true,microphoneActive:true,cameraActive:false,live:false,wakeArmed:false}})",f.context);
  assert.equal(f.context.pendingRejected,true);
});
test('a remote turn starting while private stays suppressed through terminal even after unlock',async()=>{
  const f=fixture();f.context.published=[];
  vm.runInContext("conversation.busy=false;conversation.receive=event=>{if(event.type==='message.start')conversation.busy=true;return true;};clientControl=async()=>{};emit=(type,data)=>published.push({type,...data});",f.context);
  await vm.runInContext('setPrivacy(true)',f.context);
  f.context.start={type:'message.start',session_id:'selected',data:{}};vm.runInContext('gatewayEvent(start)',f.context);
  await vm.runInContext('setPrivacy(false)',f.context);
  f.context.delta={type:'message.delta',session_id:'selected',data:{text:'PRIVATE TURN STARTED EXTERNALLY'}};vm.runInContext('gatewayEvent(delta)',f.context);
  assert.ok(!JSON.stringify(f.context.published).includes('PRIVATE TURN STARTED EXTERNALLY'));
});
test('spoken Lagebild opens locally with a brief acknowledgment so live capture can resume',async()=>{
  const f=fixture();f.context.spoken=[];f.context.shown=[];
  vm.runInContext("submit=originalSubmit;ensureWorkbench=()=>({show:async tab=>shown.push(tab)});speak=text=>spoken.push(text);",f.context);
  await vm.runInContext("submit('Zeige das Lagebild.')",f.context);assert.deepEqual(f.context.shown,['context']);assert.equal(f.context.spoken.length,1);assert.equal(f.submitted.length,0);
});

test('privacy lock and unlock while the intelligence workbench opens cannot resume an old voice request',async()=>{
  const f=fixture();let release,entered;
  const opening=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  f.context.prompts=[];f.context.showGate=async()=>{entered();await opening;};
  vm.runInContext("submit=originalSubmit;connected=true;conversation.busy=false;conversation.submit=async text=>prompts.push(text);osiris.query=async()=>({kind:'earthquakes',items:[],title:'Erdbeben'});ensureWorkbench=()=>({present:showGate});",f.context);
  const pending=vm.runInContext("registerHandlers()['intel-look'](null,{question:'Wo war das stärkste Erdbeben heute?',request:{kind:'earthquakes'},sessionId:'selected'})",f.context);
  await started;await vm.runInContext('setPrivacy(true)',f.context);await vm.runInContext('setPrivacy(false)',f.context);release();
  await assert.rejects(pending,/gestoppt|ersetzt|Datenschutz/i);
  assert.equal(f.context.prompts.length,0);
});

test('a privacy stop while choosing a graph project discards the late directory selection',async()=>{
  let release,entered;
  const selection=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  const f=fixture({dialog:{showOpenDialog:async()=>{entered();return selection;}}});
  const pending=vm.runInContext("graphAction('graph-pick')",f.context);
  await started;await vm.runInContext('setPrivacy(true)',f.context);await vm.runInContext('setPrivacy(false)',f.context);
  release({canceled:false,filePaths:[path.resolve(__dirname,'..')]});
  await assert.rejects(pending,/gestoppt|ersetzt|Datenschutz/i);
  assert.equal(vm.runInContext('config.graphProjectRoot',f.context),null);
});

test('an explicitly associated activity guide clears when its tool ends',async()=>{
  const f=fixture();f.context.guideVisible=false;
  vm.runInContext("emit=()=>{};conversation.receive=()=>true;guideController={show:async()=>{guideVisible=true;return {visible:true};},clear(){guideVisible=false;},snapshot:()=>({visible:guideVisible,purpose:'activity'})};tasks.start({title:'Current task',sessionId:'selected'});tasks.toolStart({id:'manual-guide-tool',name:'WindowRead',sessionId:'selected'});",f.context);
  await vm.runInContext("showGuidance({purpose:'activity',pid:123,windowId:'456',windowRect:{x:0,y:0,width:300,height:200},observedAt:new Date().toISOString(),taskId:tasks.view().id,toolCallId:'manual-guide-tool'})",f.context);
  assert.equal(f.context.guideVisible,true);
  f.context.toolEnd={type:'tool.end',session_id:'selected',data:{name:'WindowRead',id:'manual-guide-tool',status:'complete'}};
  vm.runInContext('gatewayEvent(toolEnd)',f.context);
  assert.equal(vm.runInContext('tasks.view().tools[0].status',f.context),'complete');
  assert.equal(f.context.guideVisible,false);
});
test('a current camera look is allowed within the requesting Hermes turn and returns text only',async()=>{
  const f=fixture(),observation=await f.look();
  assert.equal(observation.description,'Eine Tasse.');assert.equal(observation.source.label,'HD Webcam C525');assert.equal(observation.faces[0].name,'Patrik');
  assert.equal(f.captured.length,1);assert.equal(f.submitted.length,0);assert.ok(!JSON.stringify(observation).includes(f.context.fixtureFrame.image));
  assert.deepEqual(f.context.activity,[true,false]);
});
test('an off camera is not enabled or replaced to satisfy a look',async()=>{
  const f=fixture();vm.runInContext('config.cameraEnabled=false;',f.context);
  await assert.rejects(async()=>f.look(),/Kamera/i);assert.equal(f.captured.length,0);
});
test('a mismatched source or stale frame cannot be described as the selected camera',async()=>{
  for(const mode of ['source','time']){
    const f=fixture();if(mode==='source')f.context.fixtureFrame.source.deviceId='different';else f.context.fixtureFrame.capturedAt='2020-01-01T00:00:00Z';
    await assert.rejects(async()=>f.look(),/Quelle|Aufnahme/);assert.equal(f.captured.length,0);
  }
});
test('camera-off or device switch while vision is pending suppresses a late result',async()=>{
  const f=fixture();let release;f.context.fixtureService.describe=()=>new Promise(resolve=>release=resolve);
  const looking=f.look();await new Promise(resolve=>setImmediate(resolve));
  vm.runInContext('cameraGeneration++;config.cameraEnabled=false;',f.context);
  release({description:'Old frame',held_object:null,uncertain:false});
  await assert.rejects(looking);assert.equal(f.submitted.length,0);
});

test('orb color settings are saved with bounded motion while retaining camera and session preferences',async()=>{
  const f=fixture();
  const result=await vm.runInContext("registerHandlers().settings(null,{orbColors:{idle:'#ffaa33',thinking:'url(secret)'},orbIntensity:99})",f.context);
  const saved=JSON.parse(f.saved.find(item=>item.file.endsWith('settings.json')).text);
  assert.equal(saved.orbColors.idle,'#ffaa33');assert.equal(saved.orbColors.thinking,'#ffc078');assert.equal(saved.orbIntensity,2.4);
  assert.equal(saved.cameraEnabled,true);assert.equal(saved.cameraDeviceId,'chosen');assert.equal(result.settings.orbColors.idle,saved.orbColors.idle);
});

test('standby enables wakewords, confirms live off and gives only a brief local reply',async()=>{
  const f=fixture();f.context.spoken=[];f.context.controls=[];
  vm.runInContext("connected=true;config.wakeWord=false;conversation.busy=false;actionHandlers={settings:async(_e,values)=>Object.assign(config,values)};clientControl=async(action)=>controls.push(action);speak=text=>spoken.push(text);",f.context);
  await vm.runInContext("enterStandby({sessionId:'selected'})",f.context);
  assert.equal(vm.runInContext('config.wakeWord',f.context),true);assert.deepEqual(f.context.controls,['standby']);assert.deepEqual(f.context.spoken,['Ich gehe in den Standby.']);assert.equal(f.submitted.length,0);
});
test('standby remembers camera preference once, switches it off and wake resumes the same camera only if it was enabled',async()=>{
 for(const enabled of [true,false]){
  const f=fixture();f.context.controls=[];
  vm.runInContext("connected=true;conversation.busy=false;config.cameraEnabled="+enabled+";config.cameraDeviceId='chosen';actionHandlers={settings:async(_e,values)=>Object.assign(config,values)};clientControl=async(action)=>{controls.push({action,camera:config.cameraEnabled});clientInfo.live=action==='wake-resume';clientInfo.cameraActive=action==='wake-resume'&&config.cameraEnabled;};",f.context);
  await vm.runInContext('enterStandby({announce:false})',f.context);assert.equal(vm.runInContext('config.cameraEnabled',f.context),false);assert.equal(vm.runInContext('config.standbyCameraEnabled',f.context),enabled);
  await vm.runInContext('enterStandby({announce:false})',f.context);assert.equal(vm.runInContext('config.standbyCameraEnabled',f.context),enabled);
  await vm.runInContext("resumeStandby({sessionId:'selected'})",f.context);assert.equal(vm.runInContext('config.cameraEnabled',f.context),enabled);assert.equal(vm.runInContext('config.standbyActive',f.context),false);assert.equal(vm.runInContext('config.cameraDeviceId',f.context),'chosen');assert.equal(f.context.controls.at(-1).action,'wake-resume');
 }
});
test('a camera-off choice during standby and a privacy lock both revoke the remembered camera restart',async()=>{
 const f=fixture();vm.runInContext("connected=true;conversation.busy=false;config.cameraEnabled=true;actionHandlers=registerHandlers();clientControl=async()=>{};",f.context);
 await vm.runInContext('enterStandby({announce:false})',f.context);assert.equal(vm.runInContext('config.standbyCameraEnabled',f.context),true);
 await vm.runInContext("actionHandlers.settings(null,{cameraEnabled:false})",f.context);assert.equal(vm.runInContext('config.standbyCameraEnabled',f.context),false);
 vm.runInContext('config.standbyCameraEnabled=true;',f.context);await vm.runInContext('setPrivacy(true)',f.context);assert.equal(vm.runInContext('config.standbyActive',f.context),false);assert.equal(vm.runInContext('config.standbyCameraEnabled',f.context),false);await assert.rejects(vm.runInContext("resumeStandby({sessionId:'selected'})",f.context),/Datenschutz/);
});
test('failed or stale wake restoration stays in standby with camera off',async()=>{
 const f=fixture();vm.runInContext("connected=true;conversation.busy=false;config.standbyActive=true;config.standbyCameraEnabled=true;config.cameraEnabled=false;actionHandlers={settings:async(_e,values)=>Object.assign(config,values)};clientControl=async()=>{throw Error('Permission denied');};",f.context);
 await assert.rejects(vm.runInContext("resumeStandby({sessionId:'other'})",f.context),/Session/);assert.equal(vm.runInContext('config.cameraEnabled',f.context),false);
 await assert.rejects(vm.runInContext("resumeStandby({sessionId:'selected'})",f.context),/Permission/);assert.equal(vm.runInContext('config.standbyActive',f.context),true);assert.equal(vm.runInContext('config.cameraEnabled',f.context),false);
});

test('simple voice turns withhold streamed process narration and speak the verified final result once',()=>{
  const f=fixture();f.context.spoken=[];
  vm.runInContext("compactReply=true;conversation.receive=()=>true;conversation.speakReply=true;speak=text=>spoken.push(text);",f.context);
  f.context.delta={type:'message.delta',data:{text:'Ich werde zuerst Spotify suchen. '}};
  vm.runInContext('gatewayEvent(delta)',f.context);assert.equal(f.context.spoken.length,0);
  f.context.done={type:'message.complete',data:{status:'complete',text:'Ich habe XY auf Spotify gestartet.'}};
  vm.runInContext('gatewayEvent(done)',f.context);assert.deepEqual(f.context.spoken,['Ich habe XY auf Spotify gestartet.']);
});

test('a failed voice turn announces failure once and resumes the turn lifecycle',()=>{
  const f=fixture();f.context.spoken=[];f.context.published=[];f.context.stops=[];
  vm.runInContext("conversation.receive=()=>true;conversation.speakReply=true;conversation.error='Spotify nicht erreichbar';speak=text=>spoken.push(text);stopSpeech=()=>stops.push(true);emit=(type,data)=>published.push({type,...data});",f.context);
  f.context.failed={type:'error',data:{message:'Spotify nicht erreichbar'}};vm.runInContext('gatewayEvent(failed)',f.context);
  assert.equal(f.context.spoken.length,1);assert.match(f.context.spoken[0],/fehlgeschlagen/i);
  assert.ok(f.context.published.some(e=>e.type==='turn-end'&&e.status==='error'));
  f.context.done={type:'message.complete',data:{status:'error',error:'Spotify nicht erreichbar'}};vm.runInContext('gatewayEvent(done)',f.context);
  assert.equal(f.context.spoken.length,1);assert.equal(f.context.stops.length,1);
});

test('text-only turns and explicit interruption do not receive a spoken failure announcement',()=>{
  for(const mode of ['text','interrupt']){
    const f=fixture();f.context.spoken=[];
    vm.runInContext("conversation.receive=()=>true;speak=text=>spoken.push(text);",f.context);
    vm.runInContext(`conversation.speakReply=${mode!=='text'};`,f.context);
    f.context.done={type:'message.complete',data:{status:mode==='interrupt'?'interrupted':'error',error:'Fehler'}};
    vm.runInContext('gatewayEvent(done)',f.context);assert.equal(f.context.spoken.length,0);
  }
});

test('an empty completed voice turn explains the missing reply instead of silently showing success',()=>{
  const f=fixture();f.context.spoken=[];
  vm.runInContext("conversation.receive=()=>true;conversation.speakReply=true;speak=text=>spoken.push(text);",f.context);
  f.context.done={type:'message.complete',data:{status:'complete',text:''}};vm.runInContext('gatewayEvent(done)',f.context);
  assert.equal(f.context.spoken.length,1);assert.match(f.context.spoken[0],/Abschlussantwort/i);
  assert.equal(vm.runInContext('status',f.context),'error');
});

test('the first failed gateway connection is retried after login, before any successful connection',async()=>{
  const f=fixture();f.context.retries=[];
  vm.runInContext("connected=false;everConnected=false;pendingReconnect=false;config.monitoring=false;connect=async()=>retries.push(true);",f.context);
  await vm.runInContext('tick()',f.context);assert.equal(f.context.retries.length,1);
});

test('a second launch with Login actually opens login in the existing instance',async()=>{
  const f=fixture({singleInstance:true});f.context.loginCalls=[];
  vm.runInContext('expand=()=>{};login=async()=>loginCalls.push(true);',f.context);
  f.events['second-instance'](null,['electron','Voice','--login']);
  assert.equal(f.context.loginCalls.length,1);
  f.events['second-instance'](null,['electron','Voice']);assert.equal(f.context.loginCalls.length,1);
});

test('local status reports never submit an agent turn or overwrite a running HUD',async()=>{
  const f=fixture();f.context.spoken=[];
  vm.runInContext("sample={cpuPercent:10,memoryPercent:40,timestamp:Date.now()};speak=t=>spoken.push(t);",f.context);
  const r=await vm.runInContext("registerHandlers()['system-report'](null,{speak:true,sessionId:'selected'})",f.context);
  assert.match(r.text,/CPU 10/);assert.equal(f.submitted.length,0);assert.equal(f.context.spoken.length,0,'Do not interrupt an active turn');
  vm.runInContext('conversation.busy=false;',f.context);
  await vm.runInContext("registerHandlers()['system-report'](null,{speak:true,sessionId:'selected'})",f.context);
  assert.equal(f.context.spoken.length,1);
});

test('silent text submissions bypass voice prompting and voice-only brevity',async()=>{
  const f=fixture();f.context.prompts=[];
  vm.runInContext("submit=originalSubmit;connected=true;conversation.busy=false;conversation.submit=async(text,options)=>prompts.push({text,options});",f.context);
  await vm.runInContext("submit('Erkläre mein Projekt vollständig.',{speak:false,sessionId:'selected'})",f.context);
  const prompt=f.context.prompts[0].text;assert.doesNotMatch(prompt,/\[Hermes Voice: Diese Antwort wird laut gesprochen/);assert.equal(require('../reply.cjs').visibleHandoffHistory([{role:'user',text:prompt}])[0].text,'Erkläre mein Projekt vollständig.');assert.equal(vm.runInContext('compactReply',f.context),false);
});

test('camera display requests carry the existing Home Assistant playback contract into the actual Hermes prompt',async()=>{
 const f=fixture();f.context.prompts=[];
 vm.runInContext("submit=originalSubmit;connected=true;conversation.busy=false;conversation.submit=async(text,options)=>prompts.push({text,options});",f.context);
 await vm.runInContext("submit('Nee, ich meine über Home Assistant die Ringkamera an der Haustür. Die will ich als Livebild sehen.',{speak:true,sessionId:'selected'})",f.context);
 assert.equal(f.context.prompts.length,1);const prompt=f.context.prompts[0].text;
 assert.match(prompt,/lilith-device/);assert.match(prompt,/device_status/);
 assert.match(prompt,/show_camera/);assert.match(prompt,/result\.verified=true/);
 assert.match(prompt,/Kommunikationsfehler.*keine.*Anmeldefehler/i);assert.match(prompt,/Keine Webcam/i);
 assert.equal(f.captured.length,0,'A home-camera display request must not capture the local webcam');
});
test('queued user work chooses thinking from the visible request, not generated prompt context',async()=>{
 for(const [text,effort] of [['Öffne Spotify und spiele Musik.','none'],['Analysiere die Ursache des Abbruchs.','medium'],['Denke gründlich nach und plane die Architektur.','high'],['Kannst du mir '+('folgende Inhalte '.repeat(40)),'medium']]){
  const f=fixture();f.context.userRequest=text;f.context.dispatched=[];
  vm.runInContext("submit=originalSubmit;connected=true;conversation.busy=false;conversation.submit=async(text,options)=>{dispatched.push({text,options});};",f.context);
  await vm.runInContext("submit(userRequest,{speak:false})",f.context);
  assert.equal(f.context.dispatched.length,1);assert.equal(f.context.dispatched[0].options.reasoningEffort,effort);
  assert.equal(f.context.dispatched[0].options.isCurrent(),true);vm.runInContext('config.privacyLocked=true;',f.context);assert.equal(f.context.dispatched[0].options.isCurrent(),false);
 }
});

test('speech audio is bounded and generation-scoped before reaching the local worker',()=>{
  const f=fixture();f.context.packets=[];
  vm.runInContext("vadReady=true;vadChild={stdin:{writable:true,writableLength:0,write:line=>packets.push(JSON.parse(line))}};",f.context);
  vm.runInContext('feedSpeechDetector(7,true)',f.context);
  vm.runInContext("feedSpeechDetector({generation:6,audio:'AAA='})",f.context);assert.equal(f.context.packets.length,1);
  vm.runInContext("feedSpeechDetector({generation:7,audio:'AAA='})",f.context);assert.equal(f.context.packets.length,2);
  assert.throws(()=>vm.runInContext("feedSpeechDetector({generation:7,audio:Buffer.alloc(8194).toString('base64')})",f.context),/Sprachaudio/);
  assert.throws(()=>vm.runInContext("feedSpeechDetector({generation:7,audio:Buffer.alloc(1).toString('base64')})",f.context),/Sprachaudio/);
  vm.runInContext('vadChild.stdin.writableLength=65537',f.context);
  assert.throws(()=>vm.runInContext('feedSpeechDetector(8,true)',f.context),/überlastet/);
});

test('compact final results are spoken once even when the gateway reuses an unspoken interim',()=>{
  for(const flag of ['response_reused','response_previewed']){
    const f=fixture();f.context.spoken=[];vm.runInContext("compactReply=true;conversation.receive=()=>true;conversation.speakReply=true;speak=text=>spoken.push(text);",f.context);
    f.context.interim={type:'message.interim',data:{text:'Spotify ist gestartet.',already_streamed:false}};vm.runInContext('gatewayEvent(interim)',f.context);
    f.context.done={type:'message.complete',data:{status:'complete',[flag]:true}};vm.runInContext('gatewayEvent(done)',f.context);
    assert.deepEqual(f.context.spoken,['Spotify ist gestartet.']);
  }
});

test('a queued second submission cannot clear the active compact speech policy',async()=>{
  const f=fixture();f.context.spoken=[];
  vm.runInContext("submit=originalSubmit;compactReply=true;conversation.busy=true;conversation.submit=async()=>{throw new Error('Ein Auftrag läuft.');};conversation.receive=()=>true;conversation.speakReply=true;speak=text=>spoken.push(text);",f.context);
  await vm.runInContext("submit('Erkläre Spotify')",f.context);assert.equal(vm.runInContext('getJobs().list()[0].status',f.context),'queued');
  assert.equal(vm.runInContext('compactReply',f.context),true);
  f.context.delta={type:'message.delta',data:{text:'Ich werde zuerst Spotify suchen.'}};vm.runInContext('gatewayEvent(delta)',f.context);assert.equal(f.context.spoken.length,0);
});

test('opening an existing app a second time can exit before Electron readiness without accessing global shortcuts',()=>{
  const f=fixture();assert.doesNotThrow(()=>f.events['before-quit']());
});

test('collapsing docks above the taskbar on the current monitor, including negative monitor coordinates',()=>{
  for(const area of [{x:0,y:0,width:1920,height:1040},{x:-1920,y:120,width:1920,height:1040},{x:2560,y:-200,width:1600,height:860}]){
    const f=fixture(),bounds={x:area.x+350,y:area.y+100,width:460,height:740};f.context.fixtureDisplay={workArea:area};
    f.context.fixtureWindow={getBounds:()=>bounds,setBounds:value=>Object.assign(bounds,value),isDestroyed:()=>false,isVisible:()=>true,setAlwaysOnTop(){},moveTop(){}};
    vm.runInContext('win=fixtureWindow;expand(false);',f.context);
    assert.deepEqual(bounds,{x:area.x+area.width-228-12,y:area.y+area.height-276-12,width:228,height:276});
  }
});

test('HUD observes real tool starts and ends and treats a failed turn as failure',()=>{
  const f=fixture();vm.runInContext("conversation.receive=()=>true;startHud('Starte Spotify');",f.context);
  f.context.toolStart={type:'tool.start',session_id:'selected',data:{name:'Windows-MCP',id:'call-1'}};vm.runInContext('gatewayEvent(toolStart)',f.context);
  assert.equal(vm.runInContext("hudActivity.view().steps[0].status",f.context),'running');
  f.context.toolEnd={type:'tool.end',session_id:'selected',data:{name:'Windows-MCP',id:'call-1'}};vm.runInContext('gatewayEvent(toolEnd)',f.context);
  assert.equal(vm.runInContext('hudActivity.view().completedTools',f.context),1);
  f.context.done={type:'message.complete',session_id:'selected',data:{status:'error',error:'Spotify nicht erreichbar'}};vm.runInContext('gatewayEvent(done)',f.context);
  assert.equal(vm.runInContext('hudActivity.view().state',f.context),'error');
});

test('screen inspection uses the selected source, returns text only and does not recurse into Hermes',async()=>{
  const f=fixture();f.context.fixtureSources=[{id:'window:123:0',name:'Testfenster',display_id:''}];
  f.context.fixtureScreenFrame={image:f.context.fixtureFrame.image,sourceId:'window:123:0',capturedAt:new Date().toISOString()};
  f.context.fixtureService.ensureVision=async()=>{};f.context.fixtureService.abort=new AbortController();
  f.context.fetch=async()=>Response.json({message:{content:'{"description":"Ein Testfenster.","uncertain":false}'}});
  vm.runInContext("config.screenEnabled=true;config.screenSourceId='window:123:0';clientControl=async action=>{if(action!=='screen')throw new Error('Wrong capture');return fixtureScreenFrame;};",f.context);
  const observed=await vm.runInContext("lookCurrentScreen('Was siehst du?')",f.context);
  assert.equal(observed.description,'Ein Testfenster.');assert.equal(observed.source.name,'Testfenster');assert.ok(!JSON.stringify(observed).includes(f.context.fixtureScreenFrame.image));assert.equal(f.submitted.length,0);
  assert.equal(f.context.captureOptions.thumbnailSize.width,0,'Listing source metadata must not capture other windows');
});

test('disabled screen inspection does not enumerate or capture windows',async()=>{
  const f=fixture();await assert.rejects(vm.runInContext("lookCurrentScreen('Was siehst du?')",f.context),/aktivieren/);assert.equal(f.context.captureOptions,undefined);
});
test('explicit circle selection opens with general screen inspection off without enabling it',async()=>{
 const f=fixture();vm.runInContext('connected=true;conversation.busy=false;config.screenEnabled=false;',f.context);
 await vm.runInContext('showCircle()',f.context);assert.equal(f.context.circleShown,true);assert.equal(vm.runInContext('config.screenEnabled',f.context),false);
 vm.runInContext('config.privacyLocked=true;',f.context);assert.equal(f.context.circleOptions.allowed(),false);await assert.rejects(vm.runInContext('showCircle()',f.context),/Datenschutz/);
 vm.runInContext('config.privacyLocked=false;connected=false;',f.context);assert.equal(f.context.circleOptions.allowed(),false);await assert.rejects(vm.runInContext('showCircle()',f.context),/Session/);
 vm.runInContext('connected=true;conversation.busy=true;',f.context);await assert.rejects(vm.runInContext('showCircle()',f.context),/Auftrag/);
});
test('a circle crop works with general screen inspection off and Hermes receives only text in the same session',async()=>{
 const f=fixture();f.context.fixtureService.ensureVision=async()=>{};f.context.fixtureService.abort=new AbortController();
 f.context.fetch=async(_url,options)=>{f.context.visionBody=JSON.parse(options.body);return Response.json({message:{content:JSON.stringify({description:'Ein Diagramm mit drei Knoten.',text:'Drei Knoten',uncertain:false})}});};
 f.context.circlePayload={image:f.context.fixtureFrame.image,question:'Erklär das Diagramm.',sessionId:'selected',source:{id:'screen:1:0',name:'Monitor · markierter Bereich'},capturedAt:new Date().toISOString()};
 f.context.submitSpy=(text,options)=>f.submitted.push({text,options});
 vm.runInContext("connected=true;config.screenEnabled=false;conversation.busy=false;submit=submitSpy;ensureWorkbench=()=>({show:async()=>{}});",f.context);
 await vm.runInContext('askCircle(circlePayload)',f.context);assert.deepEqual(f.context.visionBody.messages.at(-1).images,[f.context.circlePayload.image]);assert.equal(f.submitted.length,1);assert.match(f.submitted[0].text,/drei Knoten/);assert.ok(!f.submitted[0].text.includes(f.context.circlePayload.image));assert.equal(f.submitted[0].options.sessionId,'selected');
});
test('stopping, privacy, disconnecting or switching sessions during a one-shot circle suppresses late submission',async()=>{
 for(const change of ['cancelScreen();','config.privacyLocked=true;','connected=false;','conversation.session={id:"other"};']){
  const f=fixture();let release,entered;const started=new Promise(r=>entered=r);f.context.fixtureService.ensureVision=async()=>{};f.context.fixtureService.abort=new AbortController();
  f.context.fetch=async()=>{entered();return new Promise(r=>release=()=>r(Response.json({message:{content:'{"description":"Spätes Ergebnis","text":"Spätes Ergebnis","uncertain":false}'}})));};
  f.context.circlePayload={image:f.context.fixtureFrame.image,question:'Was ist das?',sessionId:'selected',source:{id:'screen:1:0',name:'Monitor'},capturedAt:new Date().toISOString()};vm.runInContext('connected=true;config.screenEnabled=false;conversation.busy=false;',f.context);
  const pending=vm.runInContext('askCircle(circlePayload)',f.context);const rejection=assert.rejects(pending,/abgebrochen|Datenschutz/);await started;vm.runInContext(change,f.context);release();await rejection;assert.equal(f.submitted.length,0);
 }
});

test('invalid mode configuration is rejected before changing capture settings',async()=>{
  const f=fixture();await assert.rejects(vm.runInContext("registerHandlers().settings(null,{screenEnabled:true,modes:[{id:'gaming',apps:['evil.ps1']}]})",f.context));assert.equal(vm.runInContext('config.screenEnabled',f.context),false);
});

test('a rejected gateway submission ends the HUD instead of leaving an endless busy card',async()=>{
  const f=fixture();vm.runInContext("submit=originalSubmit;connected=true;conversation.busy=false;conversation.submit=async()=>{throw new Error('Gateway closed');};",f.context);
  await assert.rejects(vm.runInContext("submit('Öffne Spotify.')",f.context),/Gateway closed/);
  assert.equal(vm.runInContext('hudActivity.view().state',f.context),'error');
});

test('an API mode change cannot replace or finish the currently running agent task',async()=>{
  const f=fixture();vm.runInContext("actionHandlers={settings:async()=>{}};startHud('Aktueller Agentenauftrag');",f.context);
  await vm.runInContext("activateMode('gaming')",f.context);
  assert.equal(vm.runInContext('hudActivity.view().title',f.context),'Aktueller Agentenauftrag');assert.equal(vm.runInContext('hudActivity.view().state',f.context),'busy');
});

test('a mode with only whitespace instructions still performs its configured final standby',async()=>{
  const f=fixture();f.context.standbyCalls=[];
  vm.runInContext("conversation.busy=false;actionHandlers={settings:async()=>{}};config.modes=normalizeModes([{id:'gaming',standby:true,instructions:'   '}]);enterStandby=async()=>standbyCalls.push(true);",f.context);
  await vm.runInContext("activateMode('gaming',{submitInstructions:true})",f.context);assert.equal(f.context.standbyCalls.length,1);assert.equal(f.submitted.length,0);
});

test('an installed reference voice is selectable and uses its actual supported natural delivery',async()=>{
  const f=fixture();f.context.referenceRegistry=[{name:'hermes-reference-normal'}];
  vm.runInContext('voiceClient=new VoiceClient({registry:referenceRegistry});',f.context);
  const result=await vm.runInContext("registerHandlers().settings(null,{voice:'reference',delivery:'power'})",f.context);
  assert.equal(result.settings.voice,'reference');assert.equal(result.settings.delivery,'normal');assert.equal(result.referenceVoiceReady,true);
  assert.throws(()=>vm.runInContext("registerHandlers().audition(null,{voice:'reference',delivery:'whisper'})",f.context),/Sprechweise/);
});

test('a missing imported profile cannot silently select a nonexistent clone',async()=>{
  const f=fixture();await assert.rejects(vm.runInContext("registerHandlers().settings(null,{voice:'reference'})",f.context),/Referenzstimme/);
});
