const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function renderer(){
  const calls=[],elements=new Map(),intervals=[],handlers=[];
  const element=()=>({hidden:false,checked:false,value:'',options:[],children:[],dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector(){return {textContent:'',remove(){}};},getContext(){return {clearRect(){}};},scrollIntoView(){},replaceChildren(){},append(){}});
  const context=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,body:element(),documentElement:element()},navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};},async enumerateDevices(){return [];}}},matchMedia:()=>({matches:true}),requestAnimationFrame(){},setInterval(fn){intervals.push(fn);},clearInterval(){},setTimeout,clearTimeout,performance:{timeOrigin:1000000,now:()=>2000},btoa,atob,
    AudioContext:class{constructor(){this.state='running';this.currentTime=0;this.sampleRate=48000;this.destination={};}createMediaStreamSource(){return {connect(){},disconnect(){}};}createAnalyser(){return {fftSize:256,connect(){},disconnect(){}};}createScriptProcessor(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:0},connect(){}};}createBuffer(channels,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}};}},hermes:{on(fn){handlers.push(fn);},invoke(method,value){calls.push({method,value});return method==='snapshot'?new Promise(()=>{}):Promise.resolve();}}});
  vm.runInContext('globalThis.window=globalThis;',context);
  for(const file of ['gesture-controller.js','gesture-loader.js','microphone.js','camera.js','voice-interaction.js','camera-controls.js','speech-activity.js','screen-capture.js','workstation.js','orb.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui',file),'utf8'),context,{filename:file});
  return {context,calls,event:event=>handlers.forEach(fn=>fn(event)),run:code=>vm.runInContext(code,context),tick:()=>intervals.forEach(fn=>fn())};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('input diagnostics distinguish an armed silent capture from a stalled transcription',()=>{
 const r=renderer();r.run('live=true;capturing=true;speechStarted=false;vadReady=true;awaitingResume=false;');
 const armed=r.run('clientState()');assert.equal(armed.captureArmed,true);assert.equal(armed.capturing,false);assert.equal(armed.vadReady,true);
 r.run('capturing=false;transcribing=true;awaitingResume=true;');const stalled=r.run('clientState()');assert.equal(stalled.captureArmed,false);assert.equal(stalled.transcribing,true);assert.equal(stalled.awaitingResume,true);
});
test('a delayed automatic standby refuses fresh speech and preserves its captured PCM',async()=>{
 const r=renderer();r.run("sessionInfo={id:'runtime'};gatewayConnected=true;settings={wakeWord:true};wakeReady=true;vadReady=true;live=true;capturing=true;speechStarted=true;frames=[new Float32Array([.2])];captureTurnId='new-input';");
 await r.run("applyControl({id:'idle',action:'standby',automatic:true,idleAt:0,sessionId:'runtime',settings:{wakeWord:true,standbyActive:true,cameraEnabled:false}})");
 assert.equal(r.run('capturing'),true);assert.equal(r.run('frames.length'),1);assert.equal(r.run('captureTurnId'),'new-input');assert.equal(r.run('live'),true);assert.ok(r.calls.some(call=>call.method==='control-ack'&&call.value.error));
});
test('automatic standby rollback cannot cancel a newer recording or reopen a manually paused microphone',async()=>{
 for(const newer of ["capturing=true;speechStarted=true;frames=[new Float32Array([.2])]","liveRequest=2"]){
  const r=renderer();r.run("sessionInfo={id:'runtime'};gatewayConnected=true;settings={wakeWord:false};vadReady=true;liveRequest=1;live=false;idleStandbyRecord={ticket:sensorControlGeneration,live:true,request:1};");r.run(newer);
  await r.run("applyControl({id:'cancel',action:'idle-standby-cancel',restoreLive:true,sessionId:'runtime',settings:{wakeWord:false,standbyActive:false,cameraEnabled:false}})");
  assert.equal(r.run('live'),false);if(newer.includes('capturing')){assert.equal(r.run('capturing'),true);assert.equal(r.run('frames.length'),1);}
 }
});
test('automatic standby with disabled wakewords releases the microphone without enabling detection',async()=>{
 const r=renderer();r.run("sessionInfo={id:'runtime'};gatewayConnected=true;settings={wakeWord:false};wakeReady=true;vadReady=true;live=true;");await r.run('ensureMic()');
 await r.run("applyControl({id:'idle-off',action:'standby',automatic:true,idleAt:Date.now(),sessionId:'runtime',settings:{wakeWord:false,standbyActive:true,cameraEnabled:false}})");
 const ack=r.calls.find(call=>call.method==='control-ack'&&call.value.id==='idle-off');assert.equal(ack.value.error,undefined);assert.equal(r.run('live'),false);assert.equal(r.run('settings.wakeWord'),false);assert.equal(r.run('micStream'),null);assert.equal(ack.value.state.wakeArmed,false);
});

test('confirmed arrival opens Live after greeting playback drains without a wakeword',async()=>{
 const r=renderer();r.run("sessionInfo={id:'arrival-session',storedId:'stored',profile:'default'};gatewayConnected=true;vadReady=true;busy=false;settings={wakeWord:false,microphoneDeviceId:'saved-mic'};privacyLocked=false;handoffPaused=false;");
 r.event({type:'handoff-listen',sessionId:'arrival-session',turnId:'arrival-turn'});
 r.run("audioNodes=[{turnId:'arrival-turn'}];");r.event({type:'handoff-listen-ready',sessionId:'arrival-session',turnId:'arrival-turn'});r.tick();await settle();assert.equal(r.run('live'),false);
 r.run('audioNodes=[];');r.tick();await settle();assert.equal(r.run('live'),true);assert.equal(r.calls.some(row=>row.method==='wake-resume'),false);
});

test('arrival listening never reopens after manual pause, session change or privacy',async()=>{
 for(const stop of ["toggleMic(false)","sessionInfo={id:'other'}", "quiesceLocal()"]){
  const r=renderer();r.run("sessionInfo={id:'arrival-session'};gatewayConnected=true;vadReady=true;busy=false;settings={wakeWord:false};privacyLocked=false;handoffPaused=false;");r.event({type:'handoff-listen',sessionId:'arrival-session',turnId:'arrival-turn'});await r.run(stop);r.run('privacyLocked=false;');r.event({type:'handoff-listen-ready',sessionId:'arrival-session',turnId:'arrival-turn'});r.tick();await settle();assert.equal(r.run('live'),false,stop);
 }
 const r=renderer();r.run("sessionInfo={id:'own'};gatewayConnected=true;vadReady=true;privacyLocked=false;");r.event({type:'handoff-listen',sessionId:'foreign',turnId:'arrival'});r.event({type:'handoff-listen-ready',sessionId:'foreign',turnId:'arrival'});r.tick();await settle();assert.equal(r.run('live'),false);
});

test('an arrival with no greeting PCM can still open its microphone',async()=>{
 const r=renderer();r.run("sessionInfo={id:'arrival-session'};gatewayConnected=true;vadReady=true;busy=false;settings={wakeWord:false};privacyLocked=false;handoffPaused=false;audioContext=new AudioContext();speakingUntil=0;");
 r.event({type:'handoff-listen',sessionId:'arrival-session',turnId:'silent-greeting'});r.event({type:'handoff-listen-ready',sessionId:'arrival-session',turnId:'silent-greeting'});r.tick();await settle();assert.equal(r.run('live'),true);
});

test('a delayed arrival microphone grant cannot cross session, connection, standby or safety changes',async()=>{
 for(const change of ["renderState({status:'offline',session:{id:'arrival'},connected:false,busy:false})", "renderState({status:'ready',session:{id:'other'},connected:true,busy:false})", "settings.standbyActive=true", "sensorControlGeneration++", "vadReady=false"]){
  const r=renderer();r.run("globalThis.grantMic=null;navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>grantMic=resolve);sessionInfo={id:'arrival'};gatewayConnected=true;vadReady=true;wakeReady=true;settings={wakeWord:true};privacyLocked=false;handoffPaused=false;busy=false;");
  r.event({type:'handoff-listen',sessionId:'arrival',turnId:'turn'});r.event({type:'handoff-listen-ready',sessionId:'arrival',turnId:'turn'});await settle();
  r.run(change);r.run('grantMic({getTracks:()=>[{stop(){}}]})');await settle();await settle();assert.equal(r.run('live'),false,change);assert.equal(r.run('capturing'),false,change);
 }
});

test('a remote offline owner remains named on the orb with an explicit recall action',async()=>{
 const r=renderer();r.run("orbRenderer.draw=()=>{};orbPreviewRenderer.draw=()=>{};");
 r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'selected'}});
 r.event({type:'handoff-input',passive:true});await settle();
 r.event({type:'handoff-state',handoff:{available:true,pending:null,presence:{remote:true,name:'lx-gaming-nb',online:false}}});
 r.run('draw(2000)');assert.equal(r.run("$('phase').textContent"),'AWAY');
 assert.match(r.run("$('handoff-location').textContent"),/lx-gaming-nb.*offline/);
 assert.equal(r.run("$('handoff-recall').hidden"),false);assert.equal(r.run("$('handoff-recall').disabled"),false);
 r.context.document.getElementById('handoff-recall').onclick();await settle();assert.ok(r.calls.some(row=>row.method==='recall'));assert.equal(r.calls.some(row=>row.method==='submit'),false);
 r.run('privacyLocked=true;');r.event({type:'handoff-state',handoff:{available:true,pending:null,presence:{remote:true,name:'lx-gaming-nb',online:false}}});assert.equal(r.run("$('handoff-recall').disabled"),true);
});

test('a ready handoff without a pending receipt shows availability instead of claiming setup is missing',()=>{
 const r=renderer();r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'selected'}});
 r.event({type:'handoff-state',handoff:{available:true,phase:'idle',detail:'',pending:null}});
 assert.equal(r.run("$('handoff-notebook').disabled"),false);
 assert.equal(r.run("$('handoff-detail').textContent"),'Gesprächsübergabe bereit');
 r.event({type:'handoff-state',handoff:{available:false,phase:'unavailable',detail:'Gesprächsübergabe am Gateway noch nicht verfügbar',pending:null}});
 assert.equal(r.run("$('handoff-notebook').disabled"),true);
 assert.match(r.run("$('handoff-detail').textContent"),/noch nicht verfügbar/);
});

test('handoff pauses only conversation input and leaves saved sensor preferences intact',async()=>{
 const r=renderer();r.run("settings={wakeWord:true,cameraEnabled:true,screenEnabled:true,gesturesEnabled:true};privacyLocked=false;live=false;");const before=r.run('JSON.stringify(settings)');
 r.event({type:'handoff-input',passive:true});await settle();assert.equal(r.run('handoffPaused'),true);assert.equal(r.run('JSON.stringify(settings)'),before);assert.equal(r.run('privacyLocked'),false);
 r.run('capturing=false;micStream={};live=true;startCapture();');assert.equal(r.run('capturing'),false);assert.equal(r.calls.some(call=>call.method==='settings'),false);
});
test('the notebook transfer button invokes the dedicated action without submitting a model prompt',async()=>{
 const r=renderer();r.context.document.getElementById('handoff-notebook').onclick();await settle();assert.ok(r.calls.some(call=>call.method==='handoff'&&call.value==='notebook'));assert.equal(r.calls.some(call=>call.method==='submit'),false);
});
test('a delayed wake event on the passive client never resumes the old conversation',async()=>{
 const r=renderer();r.run("settings={wakeWord:true,cameraEnabled:true,gesturesEnabled:true};privacyLocked=false;sessionInfo={id:'runtime'};gatewayConnected=true;busy=false;live=false;handoffPaused=true;");r.event({type:'wake-detected',sessionId:'runtime'});await settle();assert.equal(r.calls.some(call=>call.method==='wake-resume'),false);
});
test('a refused passive wake-resume control leaves the camera and gestures alone',async()=>{
 const r=renderer();r.run("settings={wakeWord:true,cameraEnabled:true,gesturesEnabled:true};privacyLocked=false;sessionInfo={id:'runtime'};gatewayConnected=true;live=false;handoffPaused=true;globalThis.disabled=0;cameraControls.controller.disable=()=>disabled++;gestureController.disable=()=>disabled++;");r.event({type:'control-request',id:'late-wake',action:'wake-resume',enabled:true,sessionId:'runtime'});await settle();assert.equal(r.run('disabled'),0);assert.ok(r.calls.some(call=>call.method==='control-ack'&&call.value.error));
});

test('installed alternative voices can be selected and saved directly without allowing uninstalled delivery styles',async()=>{
 const r=renderer(),voice=r.context.document.getElementById('voice'),delivery=r.context.document.getElementById('delivery');
 voice.replaceChildren=(...options)=>{voice.options=options;};delivery.options=['normal','whisper','power'].map(value=>({value,disabled:false}));
 r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});return Promise.resolve({settings:{voice:value?.voice,delivery:value?.delivery},voiceProfiles:[{id:'dark',label:'Samtig & kraftvoll',deliveries:['normal','whisper','power']},{id:'lilith-studio',label:'Lilith · Studio',deliveries:['normal']}]});};
 r.run("syncVoiceCatalog([{id:'dark',label:'Samtig & kraftvoll',deliveries:['normal','whisper','power']},{id:'lilith-studio',label:'Lilith · Studio',deliveries:['normal']}]);");
 assert.equal(voice.options.length,2);assert.equal(voice.options[1].textContent,'Lilith · Studio');
 voice.value='lilith-studio';delivery.value='whisper';await voice.onchange();
 const save=r.calls.find(call=>call.method==='settings');assert.equal(save.value.voice,'lilith-studio');assert.equal(save.value.delivery,'normal');assert.equal(delivery.options.find(o=>o.value==='whisper').disabled,true);
 voice.value='dark';delivery.value='normal';await voice.onchange();assert.ok(delivery.options.every(o=>o.disabled===false));
});

test('a studio profile with an installed whisper enables whisper while keeping projection unavailable',async()=>{
 const r=renderer(),voice=r.context.document.getElementById('voice'),delivery=r.context.document.getElementById('delivery');voice.replaceChildren=(...options)=>{voice.options=options;};delivery.options=['normal','whisper','power'].map(value=>({value,disabled:false}));
 const profiles=[{id:'lilith-studio',label:'Lilith · Studio',deliveries:['normal','whisper']}];r.context.profiles=profiles;r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});return Promise.resolve({settings:{voice:value.voice,delivery:value.delivery},voiceProfiles:profiles});};r.run('syncVoiceCatalog(profiles);');voice.value='lilith-studio';delivery.value='whisper';await delivery.onchange();
 assert.equal(r.calls.find(call=>call.method==='settings').value.delivery,'whisper');assert.equal(delivery.options.find(option=>option.value==='whisper').disabled,false);assert.equal(delivery.options.find(option=>option.value==='power').disabled,true);
});

test('health heartbeat counts silent real microphone callbacks and does not expose recorded content',async()=>{
 const r=renderer();r.run("settings={wakeWord:true};wakeReady=true;gatewayConnected=true;sessionInfo={id:'selected'};");await r.run('ensureMic()');r.context.quiet=new Float32Array(2048);r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>quiet}});');const state=r.run('clientState()');assert.equal(state.frameCount,1);assert.ok(state.frameAt>0);assert.equal(state.capturing,false);assert.equal(Object.hasOwn(state,'audio'),false);
});
test('automatic microphone recovery preserves the chosen input and all sensor preferences',async()=>{
 const r=renderer(),inputs=[];r.context.navigator.mediaDevices.getUserMedia=async c=>{inputs.push(c.audio.deviceId?.exact);const track={label:'Desk',getSettings:()=>({deviceId:'desk'}),stop(){},addEventListener(){}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};};
 r.run("settings={wakeWord:true,microphoneDeviceId:'desk',cameraEnabled:false};wakeReady=true;gatewayConnected=true;sessionInfo={id:'selected'};");await r.run('ensureMic()');await r.run("applyControl({id:43,action:'voice-health-repair',enabled:'microphone',sessionId:'selected'})");assert.deepEqual(inputs,['desk','desk']);assert.equal(r.run('live'),false);assert.equal(r.run('cameraControls.controller.active'),false);assert.equal(r.calls.find(c=>c.method==='control-ack'&&c.value.id===43)?.value.error,undefined);
 r.run('privacyLocked=true;');await r.run("applyControl({id:44,action:'voice-health-repair',enabled:'microphone',sessionId:'selected'})");assert.equal(inputs.length,2);assert.match(r.calls.find(c=>c.method==='control-ack'&&c.value.id===44).value.error,/Datenschutz/);
});

test('spoken shared attention preserves pointer selection through the workstation dispatcher',async()=>{
 const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='current-content-intent')return Promise.resolve({kind:'window',selection:'pointer',question:value});return Promise.resolve();};await r.run("workstationControls.send('Erklär mir das hier.','selected')");assert.equal(r.calls.find(c=>c.method==='current-content-read')?.value.selection,'pointer');
});

test('an idle orb shows measured speech trouble instead of ready and returns after recovery',()=>{
 const r=renderer();r.run('orbRenderer.draw=()=>{};orbPreviewRenderer.draw=()=>{};');r.event({type:'state',status:'ready',busy:false,connected:true,session:{id:'selected'}});r.event({type:'voice-health',voiceHealth:{state:'degraded',checks:[]}});r.run('draw(2000)');assert.match(r.run("$('phase').textContent"),/SPRACHE.*PRÜFEN/);r.event({type:'voice-health',voiceHealth:{state:'ready',checks:[]}});r.run('draw(2030)');assert.equal(r.run("$('phase').textContent"),'BEREIT');
});

test('local playback drains independently of queued audio from a different Hermes turn',async()=>{
 const r=renderer();
 r.event({type:'speech-pending',pending:2,turnId:'local',turnPending:1,generation:4});
 r.event({type:'audio-start',generation:4,turnId:'local'});r.event({type:'audio-chunk',generation:4,turnId:'local',data:Buffer.alloc(4800).toString('base64')});
 r.event({type:'speech-pending',pending:1,turnId:'local',turnPending:0,generation:4});
 r.event({type:'audio-start',generation:4,turnId:'hermes'});r.event({type:'audio-chunk',generation:4,turnId:'hermes',data:Buffer.alloc(4800).toString('base64')});
 r.run('audioNodes[0].source.onended();');await settle();
 assert.equal(r.run('audioNodes.length'),1);assert.ok(r.calls.some(c=>c.method==='playback-drained'&&c.value.turnId==='local'&&c.value.generation===4));
});
test('a queued waiting notice does not light an error-looking alert orb',()=>{
 const r=renderer();r.event({type:'notice',message:'Auftrag vorgemerkt. Die aktuelle Sprachausgabe läuft noch.'});assert.equal(r.run('orbAlertUntil'),0);
 r.event({type:'notice',message:'Mikrofon ist nicht verfügbar.'});assert.ok(r.run('orbAlertUntil')>0);
});
test('unknown queued work is visible and its review button observes instead of retrying or submitting it',async()=>{
 const r=renderer();const id='11111111-2222-4333-8444-555555555555';
 r.event({type:'job-update',jobQueue:{blocked:true,held:false,activeJobId:id,jobs:[]}});
 assert.equal(r.run("document.getElementById('queue-warning').hidden"),false);
 assert.match(r.run("document.getElementById('queue-warning-text').textContent"),/Ergebnis.*unklar/);
 assert.equal(r.calls.some(c=>c.method==='job-retry'||c.method==='job-reconcile'),false);
 await r.run("document.getElementById('queue-review').onclick()");
 assert.ok(r.calls.some(c=>c.method==='job-reconcile'&&c.value.id===id));assert.equal(r.calls.some(c=>c.method==='job-retry'||c.method==='submit'),false);
 r.event({type:'job-update',jobQueue:{blocked:false,held:false,jobs:[]}});assert.equal(r.run("document.getElementById('queue-warning').hidden"),true);
});
test('changing the chosen microphone restarts live capture on that exact input and discards the old partial recording',async()=>{
 const r=renderer(),acquisitions=[],stopped=[];
 r.context.navigator.mediaDevices.getUserMedia=async constraints=>{acquisitions.push(constraints);const id=constraints.audio.deviceId?.exact||'default';const track={readyState:'live',label:id,enabled:true,muted:false,addEventListener(){},stop(){this.readyState='ended';stopped.push(id);}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};};
 r.run("settings={wakeWord:true};wakeReady=true;vadReady=true;sessionInfo={id:'selected'};gatewayConnected=true;live=true;");await r.run('ensureMic();');r.run('startCapture();frames=[new Float32Array(1600)];speechStarted=true;');
 r.event({type:'settings-config',settings:{wakeWord:true,microphoneDeviceId:'desk-mic'}});await r.run('microphoneSwitch');
 assert.equal(acquisitions.length,2);assert.equal(acquisitions[1].audio.deviceId.exact,'desk-mic');assert.deepEqual(stopped,['default']);
 assert.equal(r.run('live&&capturing'),true);assert.equal(r.run('speechStarted'),false);assert.equal(r.run('frames.length'),0);assert.equal(r.calls.some(call=>call.method==='submit'||call.method==='transcribe'),false);
});
test('changing microphone settings during privacy does not open it, and an unavailable chosen input never falls back',async()=>{
 const r=renderer();let acquisitions=0;
 r.context.navigator.mediaDevices.getUserMedia=async()=>{acquisitions++;throw Error('input unavailable');};
 r.run('privacyLocked=true;');r.event({type:'settings-config',settings:{wakeWord:true,microphoneDeviceId:'desk-mic'}});await r.run('microphoneSwitch');assert.equal(acquisitions,0);
 r.run("privacyLocked=false;settings={wakeWord:true,microphoneDeviceId:'missing-mic'};wakeReady=true;");assert.equal(await r.run('reconnectMicrophone().catch(()=>false)'),false);assert.equal(acquisitions,1);assert.equal(r.run('micStream'),null);
});
async function prepareBarge(r){
  r.run("settings={wakeWord:false};sessionInfo={id:'selected'};gatewayConnected=true;vadReady=true;");await r.run('ensureMic()');r.run('live=true;busy=true;speakingUntil=10;audioGeneration=7;');
  r.context.input=new Float32Array(2048).fill(.08);
  for(let i=0;i<4;i++)r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');
}

test('natural dialogue ducks confirmed speech without aborting Hermes before knowing the utterance',async()=>{
 const r=renderer();await prepareBarge(r);r.run('settings.naturalConversation=true;');const generation=r.calls.find(c=>c.method==='vad-reset').value;r.event({type:'vad-speech',generation});
 assert.equal(r.calls.filter(c=>c.method==='interrupt').length,0);assert.equal(r.run('speakingUntil'),10);assert.equal(r.run('naturalBarge'),true);assert.equal(r.run('playbackDucked'),true);
});

test('a short mhm resumes playback without sending a new task or cancelling the working agent',async()=>{
 const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='snapshot')return new Promise(()=>{});if(method==='transcribe')return Promise.resolve('Mhm.');return Promise.resolve();};
 await prepareBarge(r);r.run('settings.naturalConversation=true;');const generation=r.calls.find(c=>c.method==='vad-reset').value;r.event({type:'vad-speech',generation});r.event({type:'vad-end',generation});await settle();await settle();
 assert.equal(r.calls.filter(c=>c.method==='interrupt'||c.method==='submit').length,0);assert.equal(r.run('playbackDucked'),false);assert.equal(r.run('speakingUntil'),10);
});

test('a genuine interruption waits for the previous turn to end before dispatching',async()=>{
 const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='snapshot')return new Promise(()=>{});if(method==='transcribe')return Promise.resolve('Hallo Lilith');if(method==='interrupt'){r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'selected'}});return Promise.resolve({ready:true});}return Promise.resolve();};
 await prepareBarge(r);r.run('settings.naturalConversation=true;');const generation=r.calls.find(c=>c.method==='vad-reset').value;r.event({type:'vad-speech',generation});r.event({type:'vad-end',generation});await settle();await settle();
 const interrupts=r.calls.filter(c=>c.method==='interrupt');assert.equal(interrupts.length,1);assert.equal(interrupts[0].value.conversationOnly,undefined);assert.equal(r.calls.filter(c=>c.method==='submit').length,1);assert.equal(r.run('busy'),false);
});

test('privacy invalidates a pending semantic endpoint before transcription can begin',async()=>{
 const r=renderer();let prediction;r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='snapshot')return new Promise(()=>{});if(method==='turn-predict')return new Promise(resolve=>prediction=resolve);return Promise.resolve();};
 r.run("settings={wakeWord:false,naturalConversation:true};localConversationInfo={turnDetector:{available:true}};sessionInfo={id:'selected'};gatewayConnected=true;vadReady=true;");await r.run('ensureMic()');r.run('live=true;startCapture();frames=[new Float32Array(1600).fill(.1)];speechStarted=true;');const generation=r.run('captureGeneration');r.event({type:'vad-end',generation});await settle();assert.equal(typeof prediction,'function');r.run('quiesceLocal()');prediction({available:true,complete:true});await settle();
 assert.equal(r.calls.filter(c=>c.method==='transcribe'||c.method==='submit').length,0);
});

test('loud playback residual cannot interrupt until local VAD confirms speech, retaining the opening PCM',async()=>{
  const r=renderer();await prepareBarge(r);
  assert.equal(r.calls.filter(call=>call.method==='interrupt').length,0,'RMS alone must not interrupt');
  const reset=r.calls.find(call=>call.method==='vad-reset');assert.ok(reset,'Candidate speech must be checked by neural VAD');
  r.event({type:'vad-speech',generation:reset.value-1});assert.equal(r.calls.filter(call=>call.method==='interrupt').length,0);
  r.event({type:'vad-speech',generation:reset.value});
  assert.equal(r.calls.filter(call=>call.method==='interrupt').length,1);
  assert.ok(r.run('frames.reduce((sum,chunk)=>sum+chunk.length,0)')>=2700,'Opening speech retained before confirmation');
  assert.equal(r.run('speakingUntil'),0);
  r.event({type:'vad-speech',generation:reset.value});assert.equal(r.calls.filter(call=>call.method==='interrupt').length,1);
  await settle();
});

test('late PCM and start events from an interrupted generation never revive playback',async()=>{
  const r=renderer();await prepareBarge(r);const generation=r.calls.find(call=>call.method==='vad-reset')?.value;
  r.event({type:'vad-speech',generation});r.event({type:'audio-start',generation:7,turnId:'old'});r.event({type:'audio-chunk',generation:7,turnId:'old',data:'AAAAAA=='});
  assert.equal(r.run('audioNodes.length'),0);
  r.event({type:'audio-stop',stoppedGeneration:7});r.event({type:'audio-start',generation:7,turnId:'old'});r.event({type:'audio-chunk',generation:7,data:'AAAAAA=='});
  assert.equal(r.run('audioNodes.length'),0);
  await settle();
});
test('start audio is marked separately and cannot finish the task or skew reply latency',async()=>{
 const r=renderer();r.event({type:'audio-start',generation:1,turnId:'ack-timing',purpose:'acknowledgement'});r.event({type:'audio-chunk',generation:1,turnId:'ack-timing',data:Buffer.alloc(4800).toString('base64')});r.run('audioContext.currentTime=.06;observePlayback();');
 assert.ok(r.calls.some(call=>call.method==='voice-timing'&&call.value.stage==='ack-playback-start'));assert.equal(r.calls.some(call=>call.method==='voice-timing'&&['playback-start','renderer-first-pcm'].includes(call.value.stage)),false);
 r.run('audioNodes[0].source.onended();');assert.ok(r.calls.some(call=>call.method==='voice-timing'&&call.value.stage==='ack-playback-end'));assert.equal(r.calls.some(call=>call.method==='voice-timing'&&call.value.stage==='playback-end'),false);
 r.event({type:'audio-start',generation:1,turnId:'ack-timing',purpose:'reply'});r.event({type:'audio-chunk',generation:1,turnId:'ack-timing',data:Buffer.alloc(4800).toString('base64')});r.run('audioContext.currentTime=.3;observePlayback();');assert.ok(r.calls.some(call=>call.method==='voice-timing'&&call.value.stage==='playback-start'));
});

test('confirmed barge-in transcribes once and waits for the interrupted turn before submitting',async()=>{
  const r=renderer();let terminal,transcribedAudio;
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='snapshot')return new Promise(()=>{});if(method==='interrupt')return new Promise(resolve=>terminal=resolve);if(method==='transcribe'){transcribedAudio=value.audio;return Promise.resolve('Erkläre mir Regenbögen.');}return Promise.resolve();};
  await prepareBarge(r);const generation=r.calls.find(call=>call.method==='vad-reset')?.value;r.event({type:'vad-speech',generation});
  r.event({type:'vad-end',generation});r.event({type:'vad-end',generation});await settle();
  assert.equal(r.calls.filter(call=>call.method==='transcribe').length,1);
  assert.equal(r.calls.filter(call=>call.method==='submit').length,0);
  assert.ok(Buffer.from(transcribedAudio,'base64').length>5000);
  r.run('busy=false;');terminal({ready:true});await settle();
  const submits=r.calls.filter(call=>call.method==='submit');assert.equal(submits.length,1);
  assert.equal(submits[0].value.sessionId,'selected');assert.ok(submits[0].value.turnId);
});

test('privacy during a confirmed interruption discards the capture and all late work',async()=>{
  const r=renderer();let terminal;
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='interrupt')return new Promise(resolve=>terminal=resolve);return method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  await prepareBarge(r);const generation=r.calls.find(call=>call.method==='vad-reset')?.value;r.event({type:'vad-speech',generation});r.run('quiesceLocal();');r.event({type:'vad-end',generation});terminal({ready:true});await settle();
  assert.equal(r.calls.some(call=>call.method==='transcribe'||call.method==='submit'),false);
  assert.equal(r.run('frames.length'),0);assert.equal(r.run('audioNodes.length'),0);assert.equal(r.run('live'),false);
});

test('renderer playback timing follows the running output clock rather than PCM scheduling',()=>{
  const r=renderer();r.event({type:'audio-start',generation:1,turnId:'timing-1'});r.event({type:'audio-chunk',generation:1,turnId:'timing-1',data:Buffer.alloc(4800).toString('base64')});
  assert.equal(r.calls.some(call=>call.method==='voice-timing'&&call.value.stage==='playback-start'),false);
  r.run("audioContext.state='suspended';audioContext.currentTime=.05;");r.tick();
  assert.equal(r.calls.some(call=>call.method==='voice-timing'&&call.value.stage==='playback-start'),false);
  r.run("audioContext.state='running';audioContext.currentTime=.05;");r.tick();
  const start=r.calls.find(call=>call.method==='voice-timing'&&call.value.stage==='playback-start');assert.equal(start?.value.turnId,'timing-1');
  r.run('audioNodes[0].source.onended();');assert.ok(r.calls.find(call=>call.method==='voice-timing'&&call.value.stage==='playback-end'));
});

test('capture timing reaches the submitted turn without transcript or PCM in telemetry',async()=>{
  const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});return method==='transcribe'?Promise.resolve('Das ist private Sprache.'):method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  r.run("live=true;micStream={};sessionInfo={id:'selected'};vadReady=true;startCapture();frames=[new Float32Array(1600).fill(.08)];speechStarted=true;");await r.run('finishCapture()');
  const timing=r.calls.filter(call=>call.method==='voice-timing');assert.ok(timing.length>=4);
  const transcribe=r.calls.find(call=>call.method==='transcribe'),submit=r.calls.find(call=>call.method==='submit');assert.equal(submit?.value.turnId,transcribe.value.turnId);
  for(const call of timing){assert.deepEqual(Object.keys(call.value).sort(),['at','stage','turnId']);assert.equal(call.value.turnId,transcribe.value.turnId);assert.ok(call.value.at>=1000000);}
  assert.doesNotMatch(JSON.stringify(timing),/private|audio|Sprache/);
});

test('an unconfirmed barge candidate expires without interrupting or transcribing',async()=>{
  const r=renderer();await prepareBarge(r);assert.equal(r.run('capturing'),true);
  const old=r.calls.find(call=>call.method==='vad-reset').value;r.context.performance.now=()=>3400;
  r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');
  assert.equal(r.run('capturing'),false);assert.equal(r.run('frames.length'),0);
  r.event({type:'vad-speech',generation:old});r.event({type:'vad-end',generation:old});await settle();
  assert.equal(r.calls.some(call=>call.method==='interrupt'||call.method==='transcribe'||call.method==='submit'),false);
  assert.ok(r.calls.some(call=>call.method==='voice-timing'&&call.value.stage==='capture-discarded'));
});

test('an unknown interrupt result never reroutes captured speech into the still-running turn',async()=>{
  const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='interrupt')return Promise.resolve({ready:false,unknown:true});if(method==='transcribe')return Promise.resolve('Noch ein Auftrag.');return method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  await prepareBarge(r);const generation=r.calls.find(call=>call.method==='vad-reset').value;r.event({type:'vad-speech',generation});r.event({type:'vad-end',generation});await settle();
  assert.equal(r.calls.filter(call=>call.method==='transcribe').length,1);assert.equal(r.calls.some(call=>call.method==='submit'),false);assert.equal(r.run('live'),false);
});

test('changing the pinned session during transcription discards the original speech command',async()=>{
  const r=renderer();let transcript;r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return new Promise(resolve=>transcript=resolve);return method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  r.run("live=true;micStream={};sessionInfo={id:'selected'};vadReady=true;startCapture();frames=[new Float32Array(1600).fill(.08)];speechStarted=true;");const pending=r.run('finishCapture()');r.run("sessionInfo={id:'different'};");transcript('Öffne die Datei.');await pending;
  assert.equal(r.calls.some(call=>call.method==='submit'),false);
});

test('barge pre-roll never carries playback audio across an idle gap into a later sentence',async()=>{
  const r=renderer();r.run("settings={wakeWord:false};sessionInfo={id:'selected'};gatewayConnected=true;vadReady=true;");await r.run('ensureMic()');
  r.context.input=new Float32Array(2048).fill(.02);r.run('live=true;busy=true;speakingUntil=10;');
  for(let i=0;i<2;i++)r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');
  r.run('busy=false;speakingUntil=0;micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});busy=true;');r.context.input.fill(.08);
  for(let i=0;i<4;i++)r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');
  assert.ok(r.run('frames[0][0]')>.07,'Only the new speech opening belongs in its pre-roll');
});

function preparePushToTalk(r,{live=false,wake=false}={}){
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});return method==='transcribe'?Promise.resolve('Erkläre mir Regenbögen.'):method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  r.run(`settings={pushToTalkEnabled:true,pushToTalkKey:'F8',wakeWord:${wake},standbyActive:${wake},cameraEnabled:false,standbyCameraEnabled:true};sessionInfo={id:'selected'};gatewayConnected=true;wakeReady=${wake};vadReady=true;live=${live};`);
  r.context.input=new Float32Array(2048).fill(.08);
}
const ptt=(r,pressed,sequence=1,extra={})=>r.event({type:'ptt-control',pressed,sequence,at:1002000,...extra});

test('held push-to-talk records without wake or VAD and dispatches once immediately on release',async()=>{
  const r=renderer();preparePushToTalk(r);r.run('vadReady=false;');
  ptt(r,true);await settle();
  assert.equal(r.run('capturing'),true);assert.equal(r.run('live'),false);
  r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');
  r.event({type:'vad-end',generation:r.run('captureGeneration')});await settle();
  assert.equal(r.calls.some(call=>call.method==='transcribe'),false,'Only key release ends an explicit recording');
  ptt(r,false);ptt(r,false);await settle();
  const transcriptions=r.calls.filter(call=>call.method==='transcribe'),submits=r.calls.filter(call=>call.method==='submit');
  assert.equal(transcriptions.length,1);assert.equal(submits.length,1);assert.equal(submits[0].value.sessionId,'selected');
  assert.ok(Buffer.from(transcriptions[0].value.audio,'base64').length>1000);assert.equal(submits[0].value.turnId,transcriptions[0].value.turnId);
  assert.equal(r.run('micStream'),null);assert.equal(r.run('live'),false);
  r.event({type:'turn-end',status:'complete'});r.tick();assert.equal(r.run('capturing'),false);
});

test('push-to-talk in standby reuses the wake microphone and preserves camera restoration preference',async()=>{
  const r=renderer();preparePushToTalk(r,{wake:true});await r.run('ensureMic()');const stream=r.run('micStream');
  let acquisitions=0;r.context.navigator.mediaDevices.getUserMedia=async()=>{acquisitions++;throw new Error('Should reuse wake stream');};
  ptt(r,true);await settle();assert.equal(r.run('capturing'),true);r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();
  assert.equal(acquisitions,0);assert.equal(r.run('micStream'),stream);assert.equal(r.run('live'),false);
  assert.equal(r.run('settings.standbyActive'),true);assert.equal(r.run('settings.standbyCameraEnabled'),true);assert.equal(r.run('cameraControls.controller.active'),false);
  assert.equal(r.calls.some(call=>call.method==='wake-resume'),false);
});

test('a release before microphone permission arrives stops the grant without capture or transcription',async()=>{
  const r=renderer();preparePushToTalk(r);let grant,stops=0;
  r.context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>grant=resolve);
  ptt(r,true);assert.equal(typeof grant,'function','A press must request microphone permission');ptt(r,false);grant({getTracks:()=>[{stop(){stops++;}}]});await settle();
  assert.equal(stops,1);assert.equal(r.run('micStream'),null);assert.equal(r.run('capturing'),false);
  assert.equal(r.calls.some(call=>call.method==='transcribe'||call.method==='submit'),false);
});

test('stale key edges cannot finish a newer held recording',async()=>{
  const r=renderer();preparePushToTalk(r);ptt(r,true,1);await settle();ptt(r,false,1,{cancelled:true});
  ptt(r,true,2);await settle();ptt(r,false,1);ptt(r,true,1);await settle();
  assert.equal(r.run('capturing'),true);assert.equal(r.calls.some(call=>call.method==='transcribe'),false);
  r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false,2);await settle();
  assert.equal(r.calls.filter(call=>call.method==='submit').length,1);
});

test('privacy cancels held speech and late transcription without dispatch or microphone reopening',async()=>{
  const r=renderer();preparePushToTalk(r);let transcript;
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});return method==='transcribe'?new Promise(resolve=>transcript=resolve):method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  ptt(r,true);await settle();assert.equal(r.run('capturing'),true);r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();
  r.event({type:'privacy-state',locked:true});transcript('Öffne die Datei.');await settle();ptt(r,true,2);await settle();
  assert.equal(r.calls.some(call=>call.method==='submit'),false);assert.equal(r.run('micStream'),null);assert.equal(r.run('frames.length'),0);assert.equal(r.run('live'),false);
});

test('a session change while a key is held cancels rather than transcribing into either session',async()=>{
  const r=renderer();preparePushToTalk(r);ptt(r,true);await settle();assert.equal(r.run('capturing'),true);r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');
  r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'different'}});ptt(r,false);await settle();
  assert.equal(r.run('capturing'),false);assert.equal(r.run('micStream'),null);assert.equal(r.calls.some(call=>call.method==='transcribe'||call.method==='submit'),false);
});

test('disconnect during delayed push-to-talk transcription prevents dispatch',async()=>{
  const r=renderer();preparePushToTalk(r);let transcript;
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});return method==='transcribe'?new Promise(resolve=>transcript=resolve):method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  ptt(r,true);await settle();assert.equal(r.run('capturing'),true);r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();
  r.event({type:'state',status:'offline',connected:false,busy:false,session:{id:'selected'}});transcript('Noch ein Auftrag.');await settle();
  assert.equal(r.calls.some(call=>call.method==='submit'),false);assert.equal(r.run('micStream'),null);
});

test('busy push-to-talk is refused with a notice and never interrupts an unknown running turn',async()=>{
  const r=renderer();preparePushToTalk(r);r.run('busy=true;');ptt(r,true);await settle();ptt(r,false);await settle();
  assert.equal(r.run('micStream'),null);assert.equal(r.run('capturing'),false);
  assert.equal(r.calls.some(call=>['interrupt','transcribe','submit'].includes(call.method)),false);assert.match(r.run("$('notice').textContent"),/Auftrag|beschäftigt|beendet/i);
});

test('held push-to-talk suspends live automatic capture and resumes live after the dispatched turn',async()=>{
  const r=renderer();preparePushToTalk(r,{live:true});await r.run('ensureMic()');r.run('startCapture();');
  ptt(r,true);await settle();r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();
  assert.equal(r.run('live'),true);assert.ok(r.run('micStream'));assert.equal(r.calls.filter(call=>call.method==='submit').length,1);
  r.run('busy=true;');r.tick();assert.equal(r.run('capturing'),false);
  r.run('busy=false;');r.event({type:'turn-end',status:'complete'});r.tick();assert.equal(r.run('capturing'),true);
});

test('a stale transcription failure cannot cancel a newer push-to-talk capture',async()=>{
  const r=renderer();preparePushToTalk(r);let fail;
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});return method==='transcribe'?new Promise((_resolve,reject)=>fail=reject):method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  ptt(r,true);await settle();r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();
  r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'different'}});
  ptt(r,true,2);await settle();assert.equal(r.run('capturing'),true);fail(new Error('Previous transcription cancelled'));await settle();
  assert.equal(r.run('capturing'),true);assert.ok(r.run('micStream'));assert.equal(r.calls.some(call=>call.method==='submit'),false);
  ptt(r,false,2,{cancelled:true});
});

test('a cancelled voice dispatch cannot submit when its delayed local intent check resolves',async()=>{
  const r=renderer();preparePushToTalk(r);let intent;
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return Promise.resolve('Öffne die Datei.');if(method==='system-intent')return new Promise(resolve=>intent=resolve);return method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  ptt(r,true);await settle();r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();assert.equal(typeof intent,'function');
  r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'different'}});intent(false);await settle();
  assert.equal(r.calls.some(call=>call.method==='submit'),false);
});

test('a transcribed voice request keeps thinking visible while local dispatch waits',async()=>{
  const r=renderer();preparePushToTalk(r);let transcript,intent;
  r.context.orbStates=[];r.run('orbRenderer.draw=(_now,value)=>orbStates.push(value.state);orbPreviewRenderer.draw=()=>{};');
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return new Promise(resolve=>transcript=resolve);if(method==='system-intent')return new Promise(resolve=>intent=resolve);return method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'selected'}});
  ptt(r,true);await settle();r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});draw(2000)');assert.equal(r.run("$('phase').textContent"),'HÖRT ZU');
  ptt(r,false);await settle();r.event({type:'state',status:'transcribing',connected:true,busy:false,session:{id:'selected'}});r.run('draw(2030)');assert.equal(r.run("$('phase').textContent"),'ERKENNT SPRACHE');
  r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'selected'}});assert.equal(r.run("$('phase').textContent"),'DENKT');
  transcript('Öffne die Datei.');await settle();assert.equal(typeof intent,'function');
  r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'selected'}});assert.equal(r.run("$('phase').textContent"),'DENKT');
  r.run('draw(2060)');assert.equal(r.run("$('phase').textContent"),'DENKT');assert.equal(r.context.orbStates.at(-1),'thinking');assert.equal(r.run('busy'),false);assert.equal(r.run('phase'),'ready');
  intent(false);await settle();assert.equal(r.calls.filter(call=>call.method==='submit').length,1);r.run('draw(2090)');assert.equal(r.run("$('phase').textContent"),'BEREIT');assert.equal(r.context.orbStates.at(-1),'idle');
});

test('an accepted wake command shows thinking during intent routing even without transcription',()=>{
 const r=renderer();r.run("orbRenderer.draw=()=>{};orbPreviewRenderer.draw=()=>{};live=true;gatewayConnected=true;sessionInfo={id:'selected'};captureTurnId='wake-command';voiceDispatch={turnId:captureTurnId,request:liveRequest,sessionId:'selected',pushToTalk:null};transcribing=false;phase='ready';");
 r.run('draw(2000)');assert.equal(r.run("$('phase').textContent"),'DENKT');
 r.run('liveRequest++;draw(2030)');assert.equal(r.run("$('phase').textContent"),'BEREIT');
});

test('a typed command during a delayed voice check keeps its own input identity',async()=>{
  const r=renderer();preparePushToTalk(r);let intent;
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return Promise.resolve('Öffne die Datei.');if(method==='system-intent'&&value==='Öffne die Datei.')return new Promise(resolve=>intent=resolve);return method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  ptt(r,true);await settle();r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();assert.equal(typeof intent,'function');
  await r.run("workstationControls.send('Das ist ein Textauftrag.','selected')");
  const typed=r.calls.find(call=>call.method==='submit');assert.equal(typed.value.text,'Das ist ein Textauftrag.');assert.equal(typed.value.turnId,undefined);
  r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'different'}});intent(false);await settle();
});

test('spoken normal stop keeps live and camera available while stopping the task in the captured turn',async()=>{
  const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return Promise.resolve('Stopp.');if(method==='stop-intent')return Promise.resolve(true);if(method==='stop-task'){r.event({type:'speech-pending',pending:1});r.event({type:'speech-pending',pending:0});}return Promise.resolve();};
  r.run("live=true;micStream={};vadReady=true;sessionInfo={id:'selected'};captureSessionId='selected';captureTurnId='voice-stop';capturing=true;speechStarted=true;frames=[new Float32Array(1600).fill(.08)];cameraControls.controller.stream={getTracks:()=>[]};");
  await r.run('finishCapture()');r.tick();
  const stop=r.calls.find(call=>call.method==='stop-task');assert.ok(stop);
  assert.deepEqual({...stop.value},{sessionId:'selected',speak:true,turnId:'voice-stop'});
  assert.equal(r.calls.some(call=>['emergency-stop','interrupt','submit'].includes(call.method)),false);
  assert.equal(r.run('live'),true);assert.equal(r.run('privacyLocked'),false);assert.equal(r.run('cameraControls.controller.active'),true);assert.equal(r.run('capturing'),true);
});

test('current content dispatch carries the immutable captured voice turn instead of expanding the transcript',async()=>{
  const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return Promise.resolve('Erkläre dieses Fenster.');if(method==='current-content-intent')return Promise.resolve({kind:'window',question:value});return Promise.resolve();};
  r.run("live=true;sessionInfo={id:'selected'};captureSessionId='selected';captureTurnId='voice-window';capturing=true;speechStarted=true;frames=[new Float32Array(1600).fill(.08)];");
  await r.run('finishCapture()');
  const read=r.calls.find(call=>call.method==='current-content-read');assert.ok(read);
  assert.deepEqual({...read.value},{kind:'window',question:'Erkläre dieses Fenster.',sessionId:'selected',turnId:'voice-window'});
  assert.equal(r.calls.some(call=>['screen-look','camera-look','submit'].includes(call.method)),false);
});

test('an older live turn cannot read content or stop a task after a newer capture starts in the same session',async()=>{
  for(const route of ['content','stop']){
    const r=renderer();let detection;
    r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return Promise.resolve(route==='stop'?'Stopp bitte.':'Fasse das Kopierte zusammen.');if(method===(route==='stop'?'stop-intent':'current-content-intent'))return new Promise(resolve=>detection=resolve);return Promise.resolve();};
    r.run("live=true;sessionInfo={id:'selected'};captureSessionId='selected';captureTurnId='old-turn';capturing=true;speechStarted=true;frames=[new Float32Array(1600).fill(.08)];");
    const pending=r.run('finishCapture()');await settle();assert.equal(typeof detection,'function');
    r.run("captureTurnId='new-turn';");detection(route==='stop'?true:{kind:'clipboard',question:'Fasse das Kopierte zusammen.'});await pending;
    assert.equal(r.calls.some(call=>['current-content-read','stop-task','submit'].includes(call.method)),false,route);
    assert.equal(r.run('live'),true,'A stale failure must leave the newer live capture available');assert.equal(r.run('captureTurnId'),'new-turn');
  }
});

test('a cancelled push-to-talk content read cannot enter the newly selected session',async()=>{
  const r=renderer();preparePushToTalk(r);let detection;
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return Promise.resolve('Fasse das Kopierte zusammen.');if(method==='current-content-intent')return new Promise(resolve=>detection=resolve);return Promise.resolve();};
  ptt(r,true);await settle();r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();assert.equal(typeof detection,'function');
  r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'different'}});detection({kind:'clipboard',question:'Fasse das Kopierte zusammen.'});await settle();
  assert.equal(r.calls.some(call=>['current-content-read','submit'].includes(call.method)),false);assert.equal(r.run('micStream'),null);
});

test('wake command waits for standby restoration then sends content with its own frozen voice turn',async()=>{
  const r=renderer();let detection;
  r.context.hermes.invoke=async(method,value)=>{r.calls.push({method,value});if(method==='wake-resume'){await r.run('toggleMic(true)');return;}if(method==='current-content-intent')return new Promise(resolve=>detection=resolve);};
  r.run("settings={wakeWord:true,standbyActive:true};sessionInfo={id:'selected'};gatewayConnected=true;vadReady=true;wakeReady=true;");
  r.event({type:'wake-detected',sessionId:'selected',command:'Erkläre dieses Fenster.'});await settle();
  assert.equal(typeof detection,'function');assert.equal(r.run('wakeResuming'),true);assert.equal(r.run('Object.isFrozen(voiceDispatch)'),true);
  const turnId=r.run('captureTurnId');assert.match(turnId,/^voice-/);r.run('awaitingResume=true;');r.tick();assert.equal(r.run('capturing'),false,'A delayed wake command owns the microphone until its route is resolved');
  detection({kind:'window',question:'Erkläre dieses Fenster.'});await settle();
  const read=r.calls.find(call=>call.method==='current-content-read');assert.ok(read);assert.deepEqual({...read.value},{kind:'window',question:'Erkläre dieses Fenster.',sessionId:'selected',turnId});
  assert.ok(r.calls.findIndex(call=>call.method==='wake-resume')<r.calls.findIndex(call=>call.method==='current-content-intent'));assert.equal(r.calls.some(call=>['submit','screen-look'].includes(call.method)),false);assert.equal(r.run('wakeResuming'),false);
  r.tick();assert.equal(r.run('capturing'),true,'Live listening resumes after the wake command finishes');
});

test('delayed wake command cannot read or submit after its session or live capture is cancelled',async()=>{
  for(const cancel of ['session','stop','privacy']){
    const r=renderer();let detection;
    r.context.hermes.invoke=async(method,value)=>{r.calls.push({method,value});if(method==='wake-resume'){await r.run('toggleMic(true)');return;}if(method==='current-content-intent')return new Promise(resolve=>detection=resolve);};
    r.run("settings={wakeWord:true,standbyActive:true};sessionInfo={id:'selected'};gatewayConnected=true;vadReady=true;wakeReady=true;");
    r.event({type:'wake-detected',sessionId:'selected',command:'Fasse das Kopierte zusammen.'});await settle();assert.equal(typeof detection,'function');
    if(cancel==='session')r.event({type:'state',status:'ready',connected:true,busy:false,session:{id:'different'}});
    else if(cancel==='stop')await r.run('toggleMic(false)');else r.event({type:'privacy-state',locked:true});
    detection({kind:'clipboard',question:'Fasse das Kopierte zusammen.'});await settle();
    assert.equal(r.calls.some(call=>['current-content-read','submit'].includes(call.method)),false,cancel);assert.equal(r.run('wakeResuming'),false);
  }
});

test('a wake restoration completing after a session change never forwards the old command',async()=>{
  const r=renderer();let restored;r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='wake-resume')return new Promise(resolve=>restored=resolve);return Promise.resolve();};
  r.run("settings={wakeWord:true};sessionInfo={id:'selected'};gatewayConnected=true;vadReady=true;wakeReady=true;");
  r.event({type:'wake-detected',sessionId:'selected',command:'Erkläre Regenbögen.'});await settle();
  r.run("sessionInfo={id:'different'};live=true;");restored();await settle();
  assert.equal(r.calls.some(call=>['stop-intent','current-content-intent','submit'].includes(call.method)),false);
});

test('changing the configured key discards held PCM and its later release',async()=>{
  const r=renderer();preparePushToTalk(r);ptt(r,true);await settle();r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');
  r.event({type:'settings-config',settings:{pushToTalkEnabled:true,pushToTalkKey:'F9',wakeWord:false,cameraEnabled:false}});ptt(r,false);await settle();
  assert.equal(r.run('capturing'),false);assert.equal(r.run('micStream'),null);assert.equal(r.calls.some(call=>call.method==='transcribe'||call.method==='submit'),false);
});

test('a push-to-talk transcription error preserves the previously active live mode',async()=>{
  const r=renderer();preparePushToTalk(r,{live:true});await r.run('ensureMic()');
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});return method==='transcribe'?Promise.reject(new Error('STT unavailable')):method==='snapshot'?new Promise(()=>{}):Promise.resolve();};
  ptt(r,true);await settle();r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');ptt(r,false);await settle();
  assert.equal(r.run('live'),true);assert.ok(r.run('micStream'));assert.equal(r.calls.some(call=>call.method==='submit'),false);r.tick();assert.equal(r.run('capturing'),true);
});

test('the correction trace keeps only the latest bounded text and privacy clears it without another turn',()=>{
  const r=renderer();r.run("sessionInfo={id:'selected'};captureTurnId='current';");
  r.event({type:'speech-correction',sessionId:'selected',turnId:'current',original:'Lillis'.repeat(700),text:'Lilith',changes:[{from:'Lillis',to:'Lilith'}]});
  assert.equal(r.run("$('speech-correction-trace').hidden"),false);assert.equal(r.run("$('speech-correction-trace').open"),false);
  assert.equal(r.run("$('speech-correction-original').textContent.length"),3000);assert.equal(r.run("$('speech-correction-text').textContent"),'Lilith');
  r.event({type:'speech-correction',sessionId:'different',turnId:'old',original:'old',text:'stale'});assert.equal(r.run("$('speech-correction-text').textContent"),'Lilith');
  r.event({type:'privacy-state',locked:true});assert.equal(r.run("$('speech-correction-trace').hidden"),true);assert.equal(r.run("$('speech-correction-original').textContent"),'');
  r.event({type:'speech-correction',sessionId:'selected',turnId:'current',original:'late',text:'late'});assert.equal(r.run("$('speech-correction-text').textContent"),'');
  assert.equal(r.calls.some(call=>call.method==='submit'),false);
});
test('the small orb labels a background thinker accurately without blocking new speech',()=>{const r=renderer();r.run("orbRenderer.draw=()=>{};orbPreviewRenderer.draw=()=>{};");r.event({type:'state',status:'ready',busy:false,connected:true,session:{id:'selected'}});r.event({type:'background-update',background:{jobs:[{status:'running',children:[{status:'running',phase:'thinking'}]}]}});r.run('draw(2000)');assert.match(r.run("document.getElementById('phase').textContent"),/DENKT/);assert.equal(r.run('busy'),false);r.run('capturing=true;draw(2030)');assert.match(r.run("document.getElementById('phase').textContent"),/HÖRT ZU/);});
test('microphone controls list real input IDs and acknowledge actual switch without enabling camera or changing Live',async()=>{const r=renderer(),acquired=[];r.context.navigator.mediaDevices.enumerateDevices=async()=>[{kind:'audioinput',deviceId:'headset',label:'Headset'},{kind:'audioinput',deviceId:'desk',label:'Tischmikrofon'}];r.context.navigator.mediaDevices.getUserMedia=async c=>{const id=c.audio.deviceId?.exact||'default';acquired.push(id);const track={readyState:'live',label:id,getSettings:()=>({deviceId:id}),stop(){this.readyState='ended';},addEventListener(){}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};};r.run("settings={wakeWord:true,microphoneDeviceId:'headset'};wakeReady=true;vadReady=true;gatewayConnected=true;sessionInfo={id:'selected'};");await r.run('ensureMic()');await r.run("applyControl({id:10,action:'microphones'})");const list=r.calls.find(c=>c.method==='control-ack'&&c.value.id===10);assert.equal(list.value.result.devices.length,2);await r.run("applyControl({id:11,action:'microphone',enabled:'desk',settings:{wakeWord:true,microphoneDeviceId:'desk'}})");const ack=r.calls.find(c=>c.method==='control-ack'&&c.value.id===11);assert.equal(ack.value.error,undefined);assert.equal(ack.value.result.deviceId,'desk');assert.equal(ack.value.state.microphoneActive,true);assert.equal(r.run('live'),false);assert.equal(r.run('cameraControls.controller.active'),false);assert.deepEqual(acquired,['headset','desk']);});
test('countdown renderer hides cancellation and privacy immediately without agent state changes',()=>{const r=renderer(),now=Date.now();r.event({type:'timers-update',timers:{items:[{id:'timer',kind:'alarm',startedAt:now,dueAt:now+60000}]}});assert.equal(r.run("document.getElementById('orb-countdown').hidden"),false);assert.match(r.run("document.getElementById('orb-countdown-time').textContent"),/01:00/);assert.equal(r.run('busy'),false);r.event({type:'timers-update',timers:{items:[]}});assert.equal(r.run("document.getElementById('orb-countdown').hidden"),true);r.event({type:'timers-update',timers:{items:[{id:'timer',kind:'alarm',startedAt:now,dueAt:now+60000}]}});r.run('privacyLocked=true;renderOrbCountdown()');assert.equal(r.run("document.getElementById('orb-countdown').hidden"),true);});
