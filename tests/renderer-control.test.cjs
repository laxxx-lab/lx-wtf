const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function renderer(){
  const calls=[],elements=new Map(),intervals=[],eventHandlers=[];
    const element=()=>({hidden:false,checked:false,value:'',options:[],children:[],dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector(){return {textContent:'',remove(){}};},getContext(){return {clearRect(){}};},scrollIntoView(){},replaceChildren(){},append(){}});
  const context=vm.createContext({
    document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,body:element(),documentElement:element()},
    navigator:{mediaDevices:{async getUserMedia(){throw new Error('Permission denied');},async enumerateDevices(){return [];}}},
    matchMedia:()=>({matches:true}),requestAnimationFrame(){},setInterval(fn){intervals.push(fn);},clearInterval(){},setTimeout,clearTimeout,performance,btoa,atob,
    AudioContext:class{constructor(){this.state='running';this.currentTime=0;this.sampleRate=48000;this.destination={};}createMediaStreamSource(){return {connect(){},disconnect(){}};}createAnalyser(){return {fftSize:256,connect(){},disconnect(){}};}createScriptProcessor(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:0},connect(){}};}createBuffer(){return {duration:.1,getChannelData:()=>new Float32Array(1)};}createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}};}},
    hermes:{on(fn){eventHandlers.push(fn);return ()=>{const at=eventHandlers.indexOf(fn);if(at>=0)eventHandlers.splice(at,1);};},invoke(method,value){calls.push({method,value});return method==='snapshot'?new Promise(()=>{}):Promise.resolve();}},
  });
  vm.runInContext('globalThis.window=globalThis;',context);
  for(const file of ['gesture-controller.js','gesture-loader.js','microphone.js','camera.js','voice-interaction.js','camera-controls.js','speech-activity.js','screen-capture.js','workstation.js','orb.js','app.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui',file),'utf8'),context,{filename:file});
  }
  return {context,calls,event:event=>eventHandlers.forEach(fn=>fn(event)),tick:()=>intervals.forEach(fn=>fn()),apply:event=>vm.runInContext(`applyControl(${JSON.stringify(event)})`,context)};
}

test('API live start without a selected session returns an error acknowledgment',async()=>{
  const r=renderer();await r.apply({id:1,action:'live',enabled:true,settings:{wakeWord:false,cameraEnabled:false}});
  const ack=r.calls.find(call=>call.method==='control-ack');
  assert.equal(ack.value.id,1);assert.ok(ack.value.error,'A refused microphone start must not acknowledge success');
});

test('API camera start with denied permission returns an error acknowledgment',async()=>{
  const r=renderer();await r.apply({id:2,action:'camera',enabled:true,settings:{wakeWord:false,cameraEnabled:true}});
  const ack=r.calls.find(call=>call.method==='control-ack');
  assert.equal(ack.value.id,2);assert.ok(ack.value.error,'A denied camera must not acknowledge success');
});

test('API camera and live off acknowledge their actual inactive states',async()=>{
  const r=renderer();
  for(const [id,action]of [[3,'camera'],[4,'live']]){
    await r.apply({id,action,enabled:false,settings:{wakeWord:false,cameraEnabled:false}});
    const ack=r.calls.find(call=>call.method==='control-ack'&&call.value.id===id);
    assert.equal(ack.value.error,undefined);
    assert.equal(ack.value.state[action==='camera'?'cameraActive':'live'],false);
  }
});
test('standby closes actual camera tracks and gesture processing while leaving the wake microphone armed',async()=>{
 const r=renderer();let stopped=0;r.context.cameraTrack={stop(){stopped++;}};
 vm.runInContext("cameraControls.controller.stream={getTracks:()=>[cameraTrack]};settings={wakeWord:true,cameraEnabled:true};wakeReady=true;micStream={};audioContext=new AudioContext();live=true;gestureController.active=true;",r.context);
 await r.apply({id:50,action:'standby',settings:{wakeWord:true,cameraEnabled:false,standbyActive:true}});const ack=r.calls.find(c=>c.method==='control-ack'&&c.value.id===50);assert.equal(ack.value.error,undefined);assert.equal(ack.value.state.live,false);assert.equal(ack.value.state.cameraActive,false);assert.equal(ack.value.state.wakeArmed,true);assert.equal(stopped,1);assert.equal(vm.runInContext('gestureController.active',r.context),false);
});
test('wake camera restoration failure does not start live and returns an error acknowledgment',async()=>{
 const r=renderer();vm.runInContext("settings={wakeWord:true};wakeReady=true;gatewayConnected=true;sessionInfo={id:'selected'};vadReady=true;",r.context);
 await r.apply({id:51,action:'wake-resume',enabled:true,sessionId:'selected',settings:{wakeWord:true,cameraEnabled:true,cameraDeviceId:'chosen'}});const ack=r.calls.find(c=>c.method==='control-ack'&&c.value.id===51);assert.ok(ack.value.error);assert.equal(vm.runInContext('live',r.context),false);assert.equal(vm.runInContext('cameraControls.controller.active',r.context),false);
});
test('wake restoration reopens the selected camera and starts live, while a previously off camera stays off',async()=>{
 for(const enabled of [true,false]){
  const r=renderer();const requests=[];r.context.navigator.mediaDevices.getUserMedia=async value=>{requests.push(value);return {getTracks:()=>[{stop(){}}],getVideoTracks:()=>[{label:'Chosen',getSettings:()=>({deviceId:'chosen'})}]};};
  vm.runInContext("settings={wakeWord:true};wakeReady=true;gatewayConnected=true;sessionInfo={id:'selected'};vadReady=true;micStream={};audioContext=new AudioContext();cameraControls.controller.video.play=async()=>{};cameraControls.controller.onFrame=null;",r.context);
  await r.apply({id:52,action:'wake-resume',enabled:true,sessionId:'selected',settings:{wakeWord:true,cameraEnabled:enabled,cameraDeviceId:'chosen'}});const ack=r.calls.find(c=>c.method==='control-ack'&&c.value.id===52);assert.equal(ack.value.error,undefined);assert.equal(ack.value.state.live,true);assert.equal(ack.value.state.cameraActive,enabled);assert.equal(requests.length,enabled?1:0);if(enabled)assert.equal(requests[0].video.deviceId.exact,'chosen');
  vm.runInContext('cameraControls.controller.disable();',r.context);
 }
});
test('a new standby while camera restoration is pending cancels the old wake without reopening live',async()=>{
 const r=renderer();let release,stopped=0;r.context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>release=resolve);
 vm.runInContext("wakeReady=true;gatewayConnected=true;sessionInfo={id:'selected'};vadReady=true;micStream={};audioContext=new AudioContext();cameraControls.controller.video.play=async()=>{};cameraControls.controller.onFrame=null;",r.context);
 const pending=r.apply({id:53,action:'wake-resume',enabled:true,sessionId:'selected',settings:{wakeWord:true,cameraEnabled:true,cameraDeviceId:'chosen'}});await new Promise(r=>setImmediate(r));
 await r.apply({id:54,action:'standby',settings:{wakeWord:true,cameraEnabled:false,standbyActive:true}});release({getTracks:()=>[{stop(){stopped++;}}]});await pending;
 assert.equal(vm.runInContext('live',r.context),false);assert.equal(vm.runInContext('cameraControls.controller.active',r.context),false);assert.equal(stopped,1);assert.ok(r.calls.find(c=>c.method==='control-ack'&&c.value.id===53).value.error);
});
test('wakeword restores standby sensors before greeting or forwarding the command',async()=>{
 const r=renderer();const order=[];r.context.hermes.invoke=async(method,value)=>{r.calls.push({method,value});order.push(method);if(method==='wake-resume')vm.runInContext('live=true;',r.context);};
 vm.runInContext("settings={wakeWord:true,standbyActive:true};wakeReady=true;gatewayConnected=true;sessionInfo={id:'selected'};vadReady=true;micStream={};",r.context);
 r.event({type:'wake-detected',phrase:'hey lilith',sessionId:'selected'});await new Promise(r=>setImmediate(r));assert.equal(order[0],'wake-resume');assert.ok(order.indexOf('wake-greet')>order.indexOf('wake-resume'));
});

test('a wake-only utterance in actual live capture calls the greeting without sending an agent prompt',async()=>{
  const r=renderer();
  r.context.hermes.invoke=(method,value)=>{
    r.calls.push({method,value});
    if(method==='transcribe')return Promise.resolve('Hey Lilith.');
    if(method==='wake-match')return Promise.resolve(require('../wake-flow.cjs').wakeDecision(value,true));
    return Promise.resolve();
  };
  vm.runInContext("live=true;capturing=true;speechStarted=true;captureSessionId='selected';sessionInfo={id:'selected'};frames=[new Float32Array(1600).fill(.08)];",r.context);
  await vm.runInContext('finishCapture()',r.context);
  assert.equal(r.calls.find(call=>call.method==='wake-greet')?.value,'selected');
  assert.equal(r.calls.some(call=>call.method==='submit'),false);
  assert.equal(vm.runInContext('awaitingResume',r.context),true);
});

test('live capture waits for neural speech events rather than extending on constant room noise',async()=>{
  const r=renderer();r.context.now=0;r.context.performance={now:()=>r.context.now};
  vm.runInContext("live=true;micStream={};sessionInfo={id:'selected'};vadReady=true;startCapture();",r.context);
  const reset=r.calls.find(call=>call.method==='vad-reset');assert.ok(reset,'Capture must reset the speech detector');
  const generation=reset.value;
  r.context.event={type:'vad-speech',generation:generation-1};r.context.now=1000;
  vm.runInContext('handleVad(event)',r.context);assert.equal(vm.runInContext('speechStarted',r.context),false);
  r.context.event={type:'vad-speech',generation};vm.runInContext('handleVad(event)',r.context);
  assert.equal(vm.runInContext('speechStarted',r.context),true);
  r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return Promise.resolve('');return Promise.resolve();};
  vm.runInContext('frames=[new Float32Array(1600).fill(.004)];',r.context);
  r.context.event={type:'vad-end',generation};vm.runInContext('handleVad(event)',r.context);
  assert.equal(vm.runInContext('capturing',r.context),false);
  assert.equal(r.calls.filter(call=>call.method==='transcribe').length,1);
});

test('a live wake phrase with a command sends only the command to the pinned session',async()=>{
  const r=renderer();
  r.context.hermes.invoke=(method,value)=>{
    r.calls.push({method,value});
    if(method==='transcribe')return Promise.resolve('Hey Hermes, Kamera aus.');
    if(method==='wake-match')return Promise.resolve(require('../wake-flow.cjs').wakeDecision(value,true));
    return Promise.resolve();
  };
  vm.runInContext("live=true;capturing=true;speechStarted=true;captureSessionId='selected';sessionInfo={id:'selected'};frames=[new Float32Array(1600).fill(.08)];",r.context);
  await vm.runInContext('finishCapture()',r.context);
  const submitted=r.calls.find(call=>call.method==='submit');
  assert.equal(submitted?.value.text,'Kamera aus.');assert.equal(submitted?.value.sessionId,'selected');
  assert.equal(r.calls.some(call=>call.method==='wake-greet'),false);
});

test('control look captures the existing selected stream and never submits a recursive agent turn',async()=>{
  const r=renderer();
  vm.runInContext("cameraControls.controller.stream={getVideoTracks:()=>[{label:'HD Webcam C525',getSettings:()=>({deviceId:'chosen-camera'})}]};cameraControls.controller.capture=()=>'/9j/aGVsbG8=';",r.context);
  await r.apply({id:5,action:'look'});
  const ack=r.calls.find(call=>call.method==='control-ack');
  assert.equal(ack.value.result?.image,'/9j/aGVsbG8=');
  assert.equal(ack.value.result?.source.label,'HD Webcam C525');
  assert.equal(ack.value.result?.source.deviceId,'chosen-camera');
  assert.ok(ack.value.result?.capturedAt);
  assert.equal(r.calls.some(call=>call.method==='submit'||call.method==='camera-look'),false);
});

test('spoken standby is handled locally instead of submitting an agent instruction',async()=>{
  const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='transcribe')return Promise.resolve('Geh in den Standby.');return Promise.resolve();};
  vm.runInContext("live=true;capturing=true;speechStarted=true;captureSessionId='selected';sessionInfo={id:'selected'};frames=[new Float32Array(1600).fill(.08)];",r.context);
  await vm.runInContext('finishCapture()',r.context);
  assert.equal(r.calls.find(call=>call.method==='standby')?.value.sessionId,'selected');assert.equal(r.calls.some(call=>call.method==='submit'),false);
});

test('local system and workbench voice commands resume live listening after their spoken acknowledgment',async()=>{
  for(const text of ['Systemstatus','Öffne die Werkstatt.']){
    const r=renderer();r.context.hermes.invoke=(method,value)=>{
      r.calls.push({method,value});if(method==='transcribe')return Promise.resolve(text);if(method==='system-intent')return Promise.resolve(text==='Systemstatus');
      if(method==='system-report'||method==='workbench-show'){r.event({type:'speech-pending',pending:1});r.event({type:'speech-pending',pending:0});}
      return Promise.resolve();
    };
    vm.runInContext("live=true;micStream={};vadReady=true;capturing=true;speechStarted=true;captureSessionId='selected';sessionInfo={id:'selected'};frames=[new Float32Array(1600).fill(.08)];",r.context);
    await vm.runInContext('finishCapture()',r.context);r.tick();
    assert.equal(vm.runInContext('capturing',r.context),true,text);assert.equal(r.calls.some(c=>c.method==='submit'),false);
  }
});

test('privacy locally shuts down all sensors and rejects reopening while offline',async()=>{
  const r=renderer();
  let micStopped=false,cameraStopped=false;
  r.context.micTrack={stop(){micStopped=true;}};r.context.cameraTrack={stop(){cameraStopped=true;}};
  vm.runInContext("settings={wakeWord:true,cameraEnabled:true,screenEnabled:true,gesturesEnabled:true};microphone.stream={getTracks:()=>[micTrack]};micStream=microphone.stream;cameraControls.controller.stream={getTracks:()=>[cameraTrack]};live=true;capturing=true;gatewayConnected=false;",r.context);
  await r.apply({id:20,action:'privacy',enabled:true});
  const ack=r.calls.find(call=>call.method==='control-ack'&&call.value.id===20);
  assert.equal(ack.value.state.privacyLocked,true);
  assert.equal(ack.value.state.live,false);assert.equal(ack.value.state.microphoneActive,false);assert.equal(ack.value.state.cameraActive,false);
  assert.equal(micStopped,true);assert.equal(cameraStopped,true);
  await r.apply({id:21,action:'look'});
  assert.ok(r.calls.find(call=>call.method==='control-ack'&&call.value.id===21).value.error);
  await r.apply({id:22,action:'live',enabled:true});
  assert.ok(r.calls.find(call=>call.method==='control-ack'&&call.value.id===22).value.error);
});

test('a microphone grant arriving after privacy lock is stopped before use',async()=>{
  const r=renderer();let grant,stopped=false;
  r.context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{grant=resolve;});
  const pending=vm.runInContext('ensureMic()',r.context);
  await r.apply({id:23,action:'privacy',enabled:true});
  grant({getTracks:()=>[{stop(){stopped=true;}}]});await pending;
  assert.equal(stopped,true);assert.equal(vm.runInContext('micStream',r.context),null);
});

test('privacy unlock leaves previous camera, screen and microphone off until explicitly enabled',async()=>{
  const r=renderer();
  vm.runInContext('settings={wakeWord:true,cameraEnabled:true,screenEnabled:true};',r.context);
  await r.apply({id:24,action:'privacy',enabled:true});
  await r.apply({id:25,action:'privacy',enabled:false});
  r.event({type:'state',status:'offline',connected:false,busy:false});
  const state=vm.runInContext('clientState()',r.context);
  assert.equal(state.privacyLocked,false);assert.equal(state.microphoneActive,false);assert.equal(state.cameraActive,false);
  assert.equal(vm.runInContext('settings.screenEnabled',r.context),false);
  assert.equal(r.calls.some(call=>call.method==='submit'),false);
});

test('offline standby keeps local wakeword listening without entering live or submitting',async()=>{
  const r=renderer();
  vm.runInContext("settings={wakeWord:true};wakeReady=true;sessionInfo=null;gatewayConnected=false;micStream={};audioContext={state:'running',currentTime:0};",r.context);
  await vm.runInContext('armWake()',r.context);
  assert.equal(vm.runInContext('clientState().wakeArmed',r.context),true);
  r.event({type:'wake-detected',phrase:'hey lilith',sessionId:null});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('live',r.context),false);
  assert.equal(r.calls.some(call=>call.method==='submit'),false);
  assert.equal(r.calls.filter(call=>call.method==='wake-offline').length,1);
});

test('offline live start is refused even when a remembered session exists',async()=>{
  const r=renderer();
  vm.runInContext("sessionInfo={id:'remembered'};gatewayConnected=false;vadReady=true;micStream={};",r.context);
  await r.apply({id:26,action:'live',enabled:true});
  assert.equal(vm.runInContext('live',r.context),false);
  assert.ok(r.calls.find(call=>call.method==='control-ack'&&call.value.id===26).value.error);
});

test('emergency stop discards delayed speech chunks and wakeword rearming',async()=>{
  const r=renderer();
  vm.runInContext('settings={wakeWord:true};wakeReady=true;audioGeneration=7;live=true;capturing=true;',r.context);
  await r.apply({id:27,action:'stop'});
  r.event({type:'audio-start',generation:8});r.event({type:'audio-chunk',generation:8,data:'AAAAAA=='});
  r.event({type:'wake-ready',ready:true});
  assert.equal(vm.runInContext('audioContext',r.context),null);
  assert.equal(vm.runInContext('clientState().privacyLocked',r.context),true);
  assert.equal(vm.runInContext('clientState().wakeArmed',r.context),false);
});

test('a camera grant arriving after privacy lock stops its tracks and cannot acknowledge camera-on',async()=>{
  const r=renderer();let grant,stopped=false;
  r.context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{grant=resolve;});
  const pending=r.apply({id:28,action:'camera',enabled:true,settings:{cameraEnabled:true,cameraDeviceId:'chosen-camera'}});
  await r.apply({id:29,action:'privacy',enabled:true});
  grant({getTracks:()=>[{stop(){stopped=true;}}]});await pending;
  assert.equal(stopped,true);assert.equal(vm.runInContext('cameraControls.controller.active',r.context),false);
  assert.ok(r.calls.find(call=>call.method==='control-ack'&&call.value.id===28).value.error);
});

test('a stale camera configuration cannot reopen the camera during privacy',async()=>{
  const r=renderer();let acquisitions=0;
  r.context.navigator.mediaDevices.getUserMedia=async()=>{acquisitions++;throw new Error('should stay closed');};
  await r.apply({id:30,action:'privacy',enabled:true});
  r.event({type:'camera-config',settings:{cameraEnabled:true,wakeWord:true}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(acquisitions,0);assert.equal(vm.runInContext('clientState().cameraActive',r.context),false);
});

test('privacy clears cached sensor descriptions and frame canvases',async()=>{
  const r=renderer();
  vm.runInContext("$('camera-description').textContent='private room';$('screen-description').textContent='password';$('camera-frame').width=960;workstationControls.capture.canvas.width=1440;",r.context);
  await r.apply({id:31,action:'privacy',enabled:true});
  assert.equal(vm.runInContext("$('camera-description').textContent",r.context),'');
  assert.equal(vm.runInContext("$('screen-description').textContent",r.context),'');
  assert.equal(vm.runInContext("$('camera-frame').width",r.context),0);
  assert.equal(vm.runInContext('workstationControls.capture.canvas.width',r.context),0);
});

test('late settings and vision results do not restore private sensors after unlocking',async()=>{
  const r=renderer();let acquisitions=0;
  r.context.navigator.mediaDevices.getUserMedia=async()=>{acquisitions++;throw new Error('should stay closed');};
  vm.runInContext('wakeReady=true;',r.context);
  await r.apply({id:32,action:'privacy',enabled:true});
  r.event({type:'camera-config',settings:{cameraEnabled:true,wakeWord:true,screenEnabled:true}});
  r.event({type:'camera-scene',scene:{description:'late private image'}});
  r.event({type:'screen-scene',scene:{description:'late password',source:{name:'private'}}});
  await r.apply({id:33,action:'privacy',enabled:false});
  r.event({type:'state',status:'offline',connected:false,busy:false});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(acquisitions,0);
  assert.equal(vm.runInContext("$('camera-description').textContent",r.context),'');
  assert.equal(vm.runInContext("$('screen-description').textContent",r.context),'');
});

test('an unverified agent finish never lights the orb as a confirmed success',()=>{
  const r=renderer();
  r.event({type:'turn-end',status:'complete',verification:'unknown'});
  assert.equal(vm.runInContext('orbSuccessUntil',r.context),0);
  r.event({type:'turn-end',status:'complete',verification:'verified'});
  assert.ok(vm.runInContext('orbSuccessUntil',r.context)>performance.now());
  r.event({type:'turn-end',status:'complete',verification:'unknown'});
  assert.equal(vm.runInContext('orbSuccessUntil',r.context),0,'A previous confirmed result must not color the next unverified finish');
});

test('failed and interrupted turns cannot light the success orb even if a prior tool was verified',()=>{
  const r=renderer();
  for(const status of ['error','interrupted']){
    r.event({type:'turn-end',status:'complete',verification:'verified'});
    r.event({type:'turn-end',status,verification:'verified'});
    assert.equal(vm.runInContext('orbSuccessUntil',r.context),0,status);
  }
});

test('a wakeword without a selected session gives a local explanation instead of staying silent',async()=>{
  const r=renderer();
  vm.runInContext("settings={wakeWord:true};wakeReady=true;gatewayConnected=true;sessionInfo=null;",r.context);
  r.event({type:'wake-detected',phrase:'hey lilith',sessionId:null});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(r.calls.filter(call=>call.method==='wake-offline').length,1);
  assert.equal(vm.runInContext('live',r.context),false);assert.equal(r.calls.some(call=>call.method==='submit'),false);
  assert.match(vm.runInContext("$('notice').textContent",r.context),/Session/i);
});
