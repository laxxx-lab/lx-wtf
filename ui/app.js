'use strict';
const $=id=>document.getElementById(id),api=window.hermes;
let expanded=false,settings={},sessionInfo=null,busy=false,phase='offline',level=0,replyNode=null,gatewayConnected=false,transcribing=false,liveRequest=0,captureSessionId=null;
const microphone=new Microphone(()=>navigator.mediaDevices.getUserMedia(microphoneConstraints(settings.microphoneDeviceId||'')));
let microphoneBound='',microphoneSwitch=Promise.resolve(true),micSilent=null;
let queueReview=null;
let handoffPaused=false,handoffResumeLive=false,handoffPresence=null,handoffListen=null;
function resumeHandoffListen(){
 const arrival=handoffListen;if(!arrival)return;
 if(privacyLocked||handoffPaused||!gatewayConnected||settings.standbyActive||arrival.sessionId!==sessionInfo?.id||arrival.request!==liveRequest||arrival.safety!==sensorControlGeneration){handoffListen=null;return;}
 if(!arrival.ready||!vadReady||busy||transcribing||ttsPending||audioNodes.length||audioContext&&speakingUntil>0&&audioContext.currentTime<speakingUntil+.4)return;
 handoffListen=null;if(!live)void toggleMic(true);
}
function renderHandoff(value){
 handoffPresence=value?.presence||null;const remote=handoffPresence?.remote===true,detail=$('handoff-detail'),button=$('handoff-notebook'),location=$('handoff-location'),recall=$('handoff-recall');
 if(detail)detail.textContent=value?.detail||(value?.available===true?'Gesprächsübergabe bereit':'Gesprächsübergabe noch nicht eingerichtet');
 const disabled=value?.available!==true||!gatewayConnected||!sessionInfo||privacyLocked||!!value?.pending;
 if(button){button.textContent=remote?'Hierher zurückholen':'Auf Notebook weiterarbeiten ↗';button.disabled=disabled||!remote&&handoffPaused;}
 if(location){location.hidden=!remote;location.textContent=remote?'Auf '+(handoffPresence.name||'anderem Gerät')+(handoffPresence.online?'':' · offline'):'';}
 if(recall){recall.hidden=!remote;recall.disabled=disabled;}
 $('mic').hidden=remote;
}
function setHandoffInput(paused){if(paused===handoffPaused)return;handoffPaused=paused;if(paused){sensorControlGeneration++;handoffResumeLive=live;cancelPushToTalk();void toggleMic(false).then(()=>{releaseMic();micMuted=true;});}else{const resume=handoffResumeLive;handoffResumeLive=false;if(resume&&!privacyLocked&&gatewayConnected)void toggleMic(true);else void armWake();}}
function renderBackgroundSummary(value){orbBackground=privacyLocked?{jobs:[]}:(value||{jobs:[]});const node=$('background-summary');if(!node)return;const count=privacyLocked?0:(value?.jobs||[]).filter(j=>['preparing','running','stopping','outcome-unknown'].includes(j.status)).length;node.hidden=!count;node.textContent=count+' Auftrag'+(count===1?'':'e')+' im Hintergrund · Du kannst weiter mit Lilith sprechen.';}
function renderQueueWarning(queue){
  queueReview=queue?.blocked&&queue.activeJobId?{method:'job-reconcile',id:queue.activeJobId}:queue?.held?{method:'job-resume'}:null;
  $('queue-warning').hidden=!queueReview;
  $('queue-warning-text').textContent=queue?.blocked?'Auftrag unterbrochen · Ergebnis noch unklar. Weitere Aufträge warten auf Prüfung.':queue?.held?'Warteschlange angehalten. Aufträge werden noch nicht gesendet.':'';
  $('queue-review').textContent=queue?.blocked?'Auftrag prüfen':'Warteschlange fortsetzen';
}
$('queue-review').onclick=async()=>{const review=queueReview;if(!review)return;const button=$('queue-review');button.disabled=true;try{renderQueueWarning(await invoke(review.method,review.id?{id:review.id}:{}));}catch(error){notice(error.message);}finally{button.disabled=false;}};
let audioContext=null,audioTime=0,pcmRemainder=null,audioNodes=[],audioGeneration=-1,speakingUntil=0;
let playbackGain=null,playbackDucked=false,naturalBarge=false,semanticEndTicket=0,semanticEndTimer=null,semanticEndStarted=0;
const drainedTurns=new Map(),turnAudioPending=new Map();
function notifyPlaybackDrained(){if(privacyLocked)return;for(const [id,value]of drainedTurns){if(audioNodes.some(node=>node.turnId===id)||(turnAudioPending.has(id)?turnAudioPending.get(id)>0:ttsPending>0))continue;void api.invoke('playback-drained',value).then(accepted=>{if(accepted&&drainedTurns.get(id)===value){drainedTurns.delete(id);turnAudioPending.delete(id);}}).catch(()=>{});}}
let orbVoiceHealth={state:'starting'};
let micFrameCount=0,micFrameAt=0,lastHealthHeartbeat=0;
let localConversationInfo={ready:false,turnDetector:{available:false}},localReplyNode=null,localReplyTurn=null;
function duckPlayback(enabled){playbackDucked=enabled;if(playbackGain){if(playbackGain.gain.setTargetAtTime)playbackGain.gain.setTargetAtTime(enabled?.15:1,audioContext.currentTime,.025);else playbackGain.gain.value=enabled?.15:1;}}
function cancelNaturalEndpoint(){semanticEndTicket++;clearTimeout(semanticEndTimer);semanticEndTimer=null;semanticEndStarted=0;}
function renderLocalConversation(){const node=$('local-conversation-status');if(node)node.textContent=privacyLocked?'Datenschutz aktiv':!settings.localDialogueEnabled?'Gespräche über Hermes':localConversationInfo.ready?'Lokales Gespräch bereit · Hermes übernimmt Aufgaben':'Lokales Gespräch wird vorbereitet · Hermes ist verfügbar';const end=$('natural-conversation-status');if(end)end.textContent=localConversationInfo.turnDetector?.available?'Satzende wird aus Sprache und Betonung erkannt.':'Silero-Satzenderkennung aktiv.';}
async function considerCaptureEnd(generation){
  const ticket=++semanticEndTicket,turnId=captureTurnId,request=liveRequest;
  const current=()=>ticket===semanticEndTicket&&capturing&&generation===captureGeneration&&turnId===captureTurnId&&request===liveRequest&&live&&!privacyLocked;
  if(!semanticEndStarted)semanticEndStarted=performance.now();
  // Re-arm Silero so speech resuming during inference can invalidate this endpoint.
  void api.invoke('vad-reset',generation).catch(()=>{});
  const tail=[];let count=0;for(let i=frames.length-1;i>=0&&count<32000;i--){tail.unshift(frames[i]);count+=frames[i].length;}
  const wav=wavBytes(tail);markVoice(turnId,'turn-predict-start');
  let result;try{result=await api.invoke('turn-predict',{generation,turnId,sessionId:captureSessionId,audio:base64(wav.slice(44))});}catch{result={available:false};}
  markVoice(turnId,'turn-predict-end');if(!current())return;
  if(!result?.available||result.complete||performance.now()-semanticEndStarted>=1200){cancelNaturalEndpoint();markVoice(turnId,'vad-end');void finishCapture();return;}
  semanticEndTimer=setTimeout(()=>{if(current())void considerCaptureEnd(generation);},300);
}
let micStream=null,micSource=null,micProcessor=null,micAnalyser=null,micMuted=true,live=false,capturing=false,speechStarted=false,frames=[],captureStart=0,lastSpeech=0,noiseFloor=.001,lastMicLevel=0,wakePreRoll=[];
let vadReady=false,captureGeneration=0;
const pushToTalk={sequence:0,held:null,finishing:null};
let capturePushToTalk=null,speechDictionaryEditor=null,speechDictionarySignature=null;
const voiceClockOrigin=Number.isFinite(performance.timeOrigin)?performance.timeOrigin:Date.now()-performance.now();
let voiceSequence=0,captureTurnId=null,voiceDispatch=null,audioTurnId=null,audioPurpose='reply',rejectedAudioGeneration=-1,bargeListening=false,bargePreRoll=[],bargeCandidateStart=0,captureInterrupt=null,bargeAwaitingTurn=false;
const voiceStageMarks=new Map();
let privacyLocked=false,wakeResuming=false,sensorControlGeneration=0,idleStandbyRecord=null;
let autoResumeTimer=null,interruptAt=0,ttsPending=0,awaitingResume=false,wakeReady=false,wakeFrames=[],wakeSamples=0,bargeFrames=0,lastClientState='',wakeSpeech=[],wakeSpeechStart=0,wakeLastSpeech=0,wakePauseUntil=0;
let orbBackground={jobs:[]},orbTimers={items:[]},lastCountdown='';
function renderOrbCountdown(now=Date.now()){
 const value=privacyLocked?null:HermesOrb.orbCountdown(orbTimers,now),signature=JSON.stringify(value&&[value.id,value.text,value.label,Math.floor(value.progress*100)]);if(signature===lastCountdown)return;lastCountdown=signature;
 const node=$('orb-countdown');if(!node)return;node.hidden=!value;if(!value)return;
 $('orb-countdown-label').textContent=value.label;$('orb-countdown-time').textContent=value.text;$('orb-countdown-progress').style.width=(value.progress*100)+'%';node.setAttribute?.('aria-label',value.label+' in '+value.text);
}
let orbColors=HermesOrb.normalizeOrbColors(),orbIntensity=1,orbSuccessUntil=0,orbAlertUntil=0,orbPreviewState=null,orbPreviewUntil=0,lastOrbAccent='',orbCameraLooking=false,orbScreenLooking=false;
const orbLabels={idle:'BEREIT',listening:'HÖRT ZU',speaking:'SPRICHT',thinking:'DENKT',working:'ARBEITET',looking:'SCHAUT',success:'ERLEDIGT',alert:'HINWEIS',error:'FEHLER',offline:'OFFLINE'};
const phases={offline:'OFFLINE',connecting:'VERBINDE',ready:'BEREIT',thinking:'DENKT',working:'ARBEITET',looking:'SCHAUT',transcribing:'ERKENNT SPRACHE',listening:'HÖRT ZU',speaking:'SPRICHT',approval:'FREIGABE',question:'RÜCKFRAGE',error:'HINWEIS'};
function notice(message){$('notice').hidden=false;$('notice').textContent=message;}
function acceptSettings(values){if($('idleStandbyMinutes')&&document.activeElement!==$('idleStandbyMinutes'))$('idleStandbyMinutes').value=values.idleStandbyMinutes??15;const oldMicrophone=settings.microphoneDeviceId||'';settings=privacyLocked?{...values,privacyLocked:true,wakeWord:false,cameraEnabled:false,screenEnabled:false,gesturesEnabled:false}:values;const held=pushToTalk.held||pushToTalk.finishing;if(held&&(!settings.pushToTalkEnabled||held.key!==settings.pushToTalkKey))cancelPushToTalk();syncSpeechSettings();if(oldMicrophone!==(settings.microphoneDeviceId||''))microphoneSwitch=reconnectMicrophone().catch(error=>{notice('Mikrofon: '+error.message);return false;});return settings;}
function syncSpeechSettings(){
  if($('pushToTalkEnabled')){$('pushToTalkEnabled').checked=settings.pushToTalkEnabled===true;$('pushToTalkEnabled').disabled=privacyLocked;}
  if($('pushToTalkKey'))$('pushToTalkKey').value=settings.pushToTalkKey||'F8';
  if($('directCommandsEnabled'))$('directCommandsEnabled').checked=settings.directCommandsEnabled!==false;for(const id of ['localDialogueEnabled','naturalConversation'])if($(id))$(id).checked=settings[id]!==false;
  const entries=settings.speechDictionary||[],signature=JSON.stringify(entries);
  if(speechDictionaryEditor&&signature!==speechDictionarySignature){speechDictionaryEditor.set(entries);speechDictionarySignature=signature;}
}
function voiceCaptureCurrent(request,sessionId,held=null){return !privacyLocked&&request===liveRequest&&sessionId===sessionInfo?.id&&(held?gatewayConnected&&settings.pushToTalkEnabled===true&&held.key===settings.pushToTalkKey&&(pushToTalk.held===held||pushToTalk.finishing===held):live);}
function visibleVoicePhase(){return phase==='ready'&&transcribing&&voiceDispatch&&voiceDispatch.turnId===captureTurnId&&voiceCaptureCurrent(voiceDispatch.request,voiceDispatch.sessionId,voiceDispatch.pushToTalk)?'thinking':phase;}
function clearSpeechCorrection(){const trace=$('speech-correction-trace');if(trace){trace.hidden=true;trace.open=false;}$('speech-correction-original')&&($('speech-correction-original').textContent='');$('speech-correction-text')&&($('speech-correction-text').textContent='');}
function renderSpeechCorrection(event){
  if(privacyLocked||(event.sessionId&&event.sessionId!==sessionInfo?.id)||(event.turnId&&event.turnId!==captureTurnId))return;
  const trace=$('speech-correction-trace');if(!trace)return;
  $('speech-correction-original').textContent=String(event.original||'').slice(0,3000);$('speech-correction-text').textContent=String(event.text||'').slice(0,3000);trace.hidden=false;trace.open=false;
}
function voiceNow(){return voiceClockOrigin+performance.now();}
function markVoice(turnId,stage,at=voiceNow()){
  if(privacyLocked||!turnId)return;
  let marks=voiceStageMarks.get(turnId);if(!marks){marks=new Set();voiceStageMarks.set(turnId,marks);while(voiceStageMarks.size>80)voiceStageMarks.delete(voiceStageMarks.keys().next().value);}
  if(marks.has(stage)&&stage!=='playback-end')return;marks.add(stage);
  void api.invoke('voice-timing',{turnId,stage,at}).catch(()=>{});
}
async function invoke(method,payload,dispatch=null){try{
  if(dispatch&&['submit','current-content-read','stop-task','system-report','intel-look','screen-look','camera-look','standby','workbench-show','workbench-hide','mode-run'].includes(method)){
    if(dispatch.turnId!==captureTurnId||!voiceCaptureCurrent(dispatch.request,dispatch.sessionId,dispatch.pushToTalk))throw Error('Sprachaufnahme wurde gestoppt.');
    if(payload&&typeof payload==='object'&&!Array.isArray(payload))payload={...payload,turnId:dispatch.turnId};
  }
  return await api.invoke(method,payload);
}catch(error){notice(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));throw error;}}
function sendVoiceCommand(text,sessionId,dispatch){
  // Keep this capture's guard across delayed intent checks, even after another turn starts.
  const controls=Object.create(workstationControls),camera=Object.create(cameraControls),scopedInvoke=(method,payload)=>invoke(method,payload,dispatch);
  controls.invoke=camera.invoke=scopedInvoke;controls.sendCamera=(text,id)=>camera.send(text,id);
  return controls.send(text,sessionId);
}
function renderState(data){if(data.voiceHealth)orbVoiceHealth=data.voiceHealth;if(data.localConversation){localConversationInfo=data.localConversation;renderLocalConversation();}if(data.timers)orbTimers=data.timers;if(data.background)renderBackgroundSummary(data.background);if(data.privacyLocked===true||data.settings?.privacyLocked===true)quiesceLocal();phase=data.status;busy=!!data.busy;sessionInfo=data.session||null;gatewayConnected=!!data.connected;const held=pushToTalk.held||pushToTalk.finishing;if(held&&(!gatewayConnected||held.sessionId!==sessionInfo?.id||(pushToTalk.held&&busy)))cancelPushToTalk();const shownPhase=visibleVoicePhase();$('phase').textContent=privacyLocked?'PRIVAT':phases[shownPhase]||shownPhase.toUpperCase();$('detail').textContent=privacyLocked?'Sensoren gesperrt':data.detail||'';$('connection').textContent=data.connected?'VERBUNDEN':'OFFLINE';$('connection').classList.toggle('online',!!data.connected);$('auth').hidden=!!data.connected;$('sessions').disabled=busy||transcribing;if(!gatewayConnected&&live)void toggleMic(false);if(data.handoff)renderHandoff(data.handoff);void armWake();}
function renderMetrics(sample){
  for(const [id,key] of [['cpu','cpuPercent'],['memory','memoryPercent'],['gpu','gpuPercent']]){const n=sample[key];$(id).textContent=Number.isFinite(n)?Math.round(n)+'%':'—';$(id+'-bar').style.width=Number.isFinite(n)?n+'%':'0%';}
  $('disk').textContent=Number.isFinite(sample.diskFreeGiB)?Math.round(sample.diskFreeGiB)+' GiB':'—';$('disk-total').textContent=Number.isFinite(sample.diskTotalGiB)?'von '+Math.round(sample.diskTotalGiB)+' GiB':'Nicht verfügbar';
}
function renderSessions(rows){const select=$('sessions');select.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='Gewünschte Session auswählen';select.append(blank);for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=(row.source==='telegram'?'Telegram · ':'')+row.title;select.append(option);}select.value=settings.sessionId||'';}
function addMessage(role,text){const view=$('transcript');view.querySelector('.empty')?.remove();const node=document.createElement('div');node.className='message '+role;const small=document.createElement('small');small.textContent=role==='user'?'DU':role==='alert'?'SYSTEMHINWEIS':'HERMES';const p=document.createElement('p');p.textContent=text;node.append(small,p);view.append(node);while(view.children.length>24)view.firstChild.remove();view.scrollTop=view.scrollHeight;return p;}
function context(){audioContext ||= new AudioContext({sampleRate:48000});if(audioContext.state==='suspended')audioContext.resume();return audioContext;}
function stopAudio(){duckPlayback(false);drainedTurns.clear();turnAudioPending.clear();for(const node of audioNodes){node.cancelled=true;try{node.source.stop();}catch{}try{node.source.disconnect();node.analyser.disconnect();}catch{}}audioNodes=[];audioTime=0;pcmRemainder=null;speakingUntil=0;level=0;}
function observePlayback(){
  if(!audioContext||audioContext.state!=='running'||privacyLocked)return;
  const output=audioContext.getOutputTimestamp?.(),current=Number.isFinite(output?.contextTime)&&output.contextTime>0?output.contextTime:audioContext.currentTime;
  const observedAt=Number.isFinite(output?.performanceTime)&&output.performanceTime>0?voiceClockOrigin+output.performanceTime:voiceNow();
  for(const node of audioNodes)if(!node.cancelled&&!node.played&&current>=node.start){node.played=true;markVoice(node.turnId,node.purpose==='acknowledgement'?'ack-playback-start':'playback-start',observedAt-Math.max(0,current-node.start)*1000);}
}
function appendPcm(encoded,turnId=audioTurnId){
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));let data=bytes;
  if(pcmRemainder!==null){data=new Uint8Array(bytes.length+1);data[0]=pcmRemainder;data.set(bytes,1);pcmRemainder=null;}
  if(data.length%2){pcmRemainder=data[data.length-1];data=data.slice(0,-1);}if(!data.length)return;
  markVoice(turnId,audioPurpose==='acknowledgement'?'ack-renderer-first-pcm':'renderer-first-pcm');
  const ctx=context(),audio=ctx.createBuffer(1,data.length/2,24000),floats=audio.getChannelData(0),view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  for(let i=0;i<floats.length;i++)floats[i]=view.getInt16(i*2,true)/32768;
  const source=ctx.createBufferSource(),analyser=ctx.createAnalyser();analyser.fftSize=1024;source.buffer=audio;source.connect(analyser);if(!playbackGain){playbackGain=ctx.createGain();playbackGain.gain.value=playbackDucked?.15:1;playbackGain.connect(ctx.destination);}analyser.connect(playbackGain);
  const when=Math.max(ctx.currentTime+.045,audioTime),node={source,analyser,start:when,end:when+audio.duration,turnId,purpose:audioPurpose,generation:audioGeneration,cancelled:false,played:false};audioTime=node.end;speakingUntil=node.end;audioNodes.push(node);source.onended=()=>{if(!node.cancelled){observePlayback();markVoice(node.turnId,node.purpose==='acknowledgement'?'ack-playback-end':'playback-end');}audioNodes=audioNodes.filter(x=>x!==node);source.disconnect();analyser.disconnect();if(!node.cancelled){drainedTurns.set(node.turnId,{turnId:node.turnId,generation:node.generation});while(drainedTurns.size>8)drainedTurns.delete(drainedTurns.keys().next().value);notifyPlaybackDrained();}};source.start(when);
}
function downsample(input,rate){const ratio=rate/16000,out=new Float32Array(Math.floor(input.length/ratio));for(let i=0;i<out.length;i++){const start=Math.floor(i*ratio),end=Math.min(input.length,Math.floor((i+1)*ratio));let sum=0;for(let j=start;j<end;j++)sum+=input[j];out[i]=sum/Math.max(1,end-start);}return out;}
function wavBytes(chunks){const length=chunks.reduce((sum,x)=>sum+x.length,0),bytes=new Uint8Array(44+length*2),view=new DataView(bytes.buffer);const word=(at,text)=>{for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);};word(0,'RIFF');view.setUint32(4,36+length*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,length*2,true);let n=44;for(const chunk of chunks)for(const x of chunk){view.setInt16(n,Math.max(-1,Math.min(1,x))*(x<0?32768:32767),true);n+=2;}return bytes;}
function base64(bytes){let text='';for(let start=0;start<bytes.length;start+=8192)text+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(text);}
function startCapture({barge=false,preRoll=[],pushToTalk:held=null}={}){
  if(handoffPaused||privacyLocked||(!live&&!held)||!micStream||capturing||transcribing||(!held&&(pushToTalk.held||pushToTalk.finishing)))return;
  if(!barge&&(busy||ttsPending||bargeAwaitingTurn||(audioContext&&speakingUntil>0&&audioContext.currentTime<speakingUntil+.4))){awaitingResume=true;return;}
  if(!held&&!vadReady){notice('Lokale Satzenderkennung ist noch nicht bereit.');return;}
  cancelNaturalEndpoint();naturalBarge=false;clearSpeechCorrection();capturing=true;speechStarted=!!held;bargeListening=barge;frames=preRoll.slice();captureSessionId=sessionInfo?.id;capturePushToTalk=held;
  captureTurnId='voice-'+Math.floor(voiceNow()).toString(36)+'-'+(++voiceSequence);captureInterrupt=null;
  captureStart=performance.now()-preRoll.reduce((sum,chunk)=>sum+chunk.length,0)/16;lastSpeech=captureStart;bargeCandidateStart=performance.now();
  markVoice(captureTurnId,'capture-start',voiceClockOrigin+captureStart);if(frames.length)markVoice(captureTurnId,'capture-first-frame',voiceClockOrigin+captureStart);
  const generation=++captureGeneration;if(!held){void api.invoke('vad-reset',generation).catch(error=>{if(generation===captureGeneration){notice(error.message);void toggleMic(false);}});for(const chunk of preRoll)feedVad(chunk);}
  if(!barge){phase='listening';$('phase').textContent=phases.listening;$('detail').textContent=held?'Sprechtaste gehalten · loslassen zum Senden':'Ich höre zu';}
}
function releasePushToTalkMic(){if(!live&&!(settings.wakeWord&&wakeReady)&&!pushToTalk.held){releaseMic();micMuted=true;}}
function cancelPushToTalk(){
  const held=pushToTalk.held||pushToTalk.finishing;if(!held)return;
  pushToTalk.held=null;pushToTalk.finishing=null;
  if(capturePushToTalk===held){markVoice(captureTurnId,'capture-discarded');capturing=false;speechStarted=false;frames=[];captureGeneration++;capturePushToTalk=null;captureTurnId=null;captureSessionId=null;}
  if(voiceDispatch?.pushToTalk===held)voiceDispatch=null;
  transcribing=false;$('sessions').disabled=busy;if(live)awaitingResume=true;releasePushToTalkMic();clearSpeechCorrection();
}
async function handlePushToTalk(event){
  if(!Number.isSafeInteger(event.sequence)||event.sequence<1||typeof event.pressed!=='boolean')return;
  if(!event.pressed){
    const held=pushToTalk.held;if(!held||held.sequence!==event.sequence)return;
    if(event.cancelled||capturePushToTalk!==held||!capturing){cancelPushToTalk();return;}
    pushToTalk.held=null;pushToTalk.finishing=held;
    const finishing=finishCapture();releasePushToTalkMic();await finishing;return;
  }
  if(event.sequence<=pushToTalk.sequence)return;pushToTalk.sequence=event.sequence;
  if(privacyLocked||settings.pushToTalkEnabled!==true)return;
  if(!gatewayConnected||!sessionInfo){notice('Sprechtaste: Bitte verbinden und eine Hermes-Session auswählen.');return;}
  if(pushToTalk.held||pushToTalk.finishing||transcribing||wakeResuming||busy||ttsPending||bargeAwaitingTurn||(audioContext&&speakingUntil>0&&audioContext.currentTime<speakingUntil+.4)||(capturing&&speechStarted)){
    notice('Sprechtaste: Bitte warten, bis der aktuelle Sprachauftrag beendet ist.');return;
  }
  const held={sequence:event.sequence,request:liveRequest,sessionId:sessionInfo.id,key:settings.pushToTalkKey};pushToTalk.held=held;
  if(capturing){markVoice(captureTurnId,'capture-discarded');capturing=false;speechStarted=false;frames=[];captureGeneration++;captureTurnId=null;}
  awaitingResume=false;wakeFrames=[];wakeSamples=0;wakeSpeech=[];wakeSpeechStart=0;wakePreRoll=[];bargePreRoll=[];bargeFrames=0;
  try{await ensureMic();if(pushToTalk.held!==held||!voiceCaptureCurrent(held.request,held.sessionId,held)||!micStream){if(pushToTalk.held===held)cancelPushToTalk();return;}startCapture({pushToTalk:held});if(!capturing)cancelPushToTalk();}
  catch(error){if(pushToTalk.held===held){notice('Sprechtaste · Mikrofon: '+error.message);cancelPushToTalk();}}
}
function discardBarge(){markVoice(captureTurnId,'capture-discarded');capturing=false;speechStarted=false;bargeListening=false;frames=[];bargePreRoll=[];bargeFrames=0;captureGeneration++;captureTurnId=null;captureInterrupt=null;}
function handleVad(event){
  if(event.type==='vad-ready'){vadReady=event.ready===true;if(!vadReady&&live){notice('Lokale Satzenderkennung ist nicht verfügbar.');void toggleMic(false);}return;}
  if(!capturing||!live||privacyLocked||capturePushToTalk||event.generation!==captureGeneration)return;
  if(event.type==='vad-speech'){
    cancelNaturalEndpoint();
    speechStarted=true;markVoice(captureTurnId,'vad-speech');
    if(bargeListening){
      if(settings.naturalConversation===true){naturalBarge=true;bargeListening=false;duckPlayback(true);return;}
      bargeListening=false;bargeAwaitingTurn=true;awaitingResume=false;interruptAt=performance.now();bargeFrames=0;bargePreRoll=[];
      markVoice(captureTurnId,'barge-confirmed');rejectedAudioGeneration=Math.max(rejectedAudioGeneration,audioGeneration);audioGeneration=-1;ttsPending=0;stopAudio();
      const request=liveRequest,turnId=captureTurnId;
      // Capture continues while Hermes acknowledges the interruption; dispatch waits below.
      captureInterrupt=invoke('interrupt',{turnId}).then(result=>{if(result?.ready===false)throw Error('Der unterbrochene Auftrag ist noch nicht bestätigt beendet.');return true;}).catch(error=>{if(request===liveRequest){markVoice(turnId,'failed');notice(error.message);}return false;});
    }
  }
  if(event.type==='vad-end'&&speechStarted){if(settings.naturalConversation===true&&localConversationInfo.turnDetector?.available){void considerCaptureEnd(event.generation);return;}markVoice(captureTurnId,'vad-end');void finishCapture();}
}
function feedVad(chunk){
  const bytes=new Uint8Array(chunk.length*2),view=new DataView(bytes.buffer),generation=captureGeneration;
  for(let i=0;i<chunk.length;i++)view.setInt16(i*2,Math.max(-1,Math.min(1,chunk[i]))*32767,true);
  void api.invoke('vad-feed',{generation,audio:base64(bytes)}).catch(error=>{if(generation===captureGeneration&&capturing){notice(error.message);void toggleMic(false);}});
}
async function finishCapture(){
  if(!capturing)return;cancelNaturalEndpoint();capturing=false;const chunks=frames,hadSpeech=speechStarted,turnId=captureTurnId,interruption=captureInterrupt,held=capturePushToTalk,natural=naturalBarge;naturalBarge=false;frames=[];speechStarted=false;bargeListening=false;
  markVoice(turnId,'capture-end');
  if(!hadSpeech||(held&&!chunks.length)){markVoice(turnId,'capture-discarded');if(held){if(pushToTalk.finishing===held)pushToTalk.finishing=null;capturePushToTalk=null;if(live)awaitingResume=true;}else if(live)setTimeout(()=>startCapture(),150);return;}
  transcribing=true;$('sessions').disabled=true;const sessionId=captureSessionId,request=liveRequest;
  const current=()=>captureTurnId===turnId&&voiceCaptureCurrent(request,sessionId,held);
  const report=clientState();void api.invoke('client-state',{...report,speaking:natural?report.speaking:false,listening:true}).catch(()=>{});
  try{
    voiceDispatch=Object.freeze({turnId,request,sessionId,pushToTalk:held});
    markVoice(turnId,'transcribe-start');const text=await invoke('transcribe',{audio:base64(wavBytes(chunks)),sessionId,turnId});markVoice(turnId,'transcribe-end');
    if(!current())return;
    if(natural){
      if(!text||VoiceInteraction.isBackchannel(text)){duckPlayback(false);awaitingResume=live;return;}
      bargeAwaitingTurn=true;rejectedAudioGeneration=Math.max(rejectedAudioGeneration,audioGeneration);audioGeneration=-1;ttsPending=0;stopAudio();
      const result=await invoke('interrupt',{turnId});if(!current())return;if(result?.ready!==true||busy){notice('Der vorige Gesprächszug ist noch nicht bestätigt beendet. Bitte den Sprachauftrag wiederholen.');await toggleMic(false);return;}bargeAwaitingTurn=false;
    }
    if(interruption){const ready=await interruption;if(!current())return;if(!ready||busy){notice('Der vorige Auftrag ist noch nicht beendet. Bitte den Sprachauftrag wiederholen.');await toggleMic(false);return;}bargeAwaitingTurn=false;}
    if(/^(ruhe|gespräch beenden)[.!?]?$/i.test(text)){await toggleMic(false);await invoke('interrupt');return;}
    const wake=text?await invoke('wake-match',text):null;
    if(!current())return;
    if(wake?.kind==='greet'){awaitingResume=live;await invoke('wake-greet',sessionId);}
    else if(text){markVoice(turnId,'dispatch-start');voiceDispatch=Object.freeze({turnId,request,sessionId,pushToTalk:held});await sendVoiceCommand(wake?.kind==='command'?wake.text:text,sessionId,voiceDispatch);}else{awaitingResume=live;}
  }catch{markVoice(turnId,'failed');if(current()){if(held)cancelPushToTalk();else await toggleMic(false);}}
  finally{const ownsTranscription=captureTurnId===turnId&&(!held||pushToTalk.finishing===held);if(voiceDispatch?.turnId===turnId)voiceDispatch=null;if(held&&pushToTalk.finishing===held){pushToTalk.finishing=null;capturePushToTalk=null;if(live)awaitingResume=true;releasePushToTalkMic();}if(request===liveRequest&&ownsTranscription){transcribing=false;$('sessions').disabled=busy;}}
}
function releaseMic(){cancelNaturalEndpoint();naturalBarge=false;duckPlayback(false);microphone.release();if(micProcessor){micProcessor.onaudioprocess=null;micProcessor.disconnect();micProcessor=null;}micSource?.disconnect();micAnalyser?.disconnect();micSilent?.disconnect?.();micSource=null;micAnalyser=null;micSilent=null;micStream=null;wakePreRoll=[];wakeSpeech=[];wakeSpeechStart=0;bargePreRoll=[];lastMicLevel=0;}
async function reconnectMicrophone(){
  cancelPushToTalk();liveRequest++;if(captureTurnId)markVoice(captureTurnId,'capture-discarded');
  capturing=false;speechStarted=false;frames=[];transcribing=false;captureGeneration++;captureTurnId=null;voiceDispatch=null;captureInterrupt=null;bargeListening=false;bargeAwaitingTurn=false;wakeFrames=[];wakeSamples=0;releaseMic();
  if(privacyLocked||!live&&!(settings.wakeWord&&wakeReady))return true;
  await ensureMic();if(live)startCapture();return !!micStream;
}
function quiesceLocal(){
  cancelPushToTalk();clearSpeechCorrection();
  sensorControlGeneration++;
  privacyLocked=true;renderBackgroundSummary({jobs:[]});settings={...settings,privacyLocked:true,wakeWord:false,cameraEnabled:false,screenEnabled:false,gesturesEnabled:false};
  liveRequest++;captureGeneration++;live=false;capturing=false;speechStarted=false;transcribing=false;awaitingResume=false;frames=[];captureSessionId=null;clearTimeout(autoResumeTimer);
  bargeListening=false;bargeAwaitingTurn=false;bargePreRoll=[];captureInterrupt=null;captureTurnId=null;capturePushToTalk=null;voiceDispatch=null;rejectedAudioGeneration=Math.max(rejectedAudioGeneration,audioGeneration);audioTurnId=null;
  audioGeneration=-1;ttsPending=0;stopAudio();releaseMic();micMuted=true;wakeFrames=[];wakeSamples=0;bargeFrames=0;
  cameraControls.controller.disable();cameraControls.settingRequest++;workstationControls.capture.cancel();gestureController.disable();orbCameraLooking=false;orbScreenLooking=false;renderBackgroundSummary(null);
  for(const id of ['camera-frame','camera-overlay']){$(id).width=0;$(id).height=0;}
  workstationControls.capture.canvas.width=0;workstationControls.capture.canvas.height=0;$('camera-description').textContent='';$('screen-description').textContent='';
  $('mic').classList.remove('active');$('mic').querySelector('span').textContent='Live starten';$('phase').textContent='PRIVAT';$('detail').textContent='Sensoren gesperrt';
  for(const id of ['wakeWord','cameraEnabled','screenEnabled','gesturesEnabled'])$(id).checked=false;
  if($('pushToTalkEnabled'))$('pushToTalkEnabled').disabled=true;
}
function syncCameraSettings(values){return cameraControls.sync(privacyLocked?{...values,cameraEnabled:false}:values);}
function feedWake(input,rate){
  const floats=downsample(input,rate);wakeFrames.push(floats);wakeSamples+=floats.length;
  if(wakeSamples<1280)return;
  const all=new Float32Array(wakeSamples);let offset=0;for(const frame of wakeFrames){all.set(frame,offset);offset+=frame.length;}
  const complete=Math.floor(all.length/1280)*1280,bytes=new Uint8Array(complete*2),view=new DataView(bytes.buffer);
  for(let i=0;i<complete;i++)view.setInt16(i*2,Math.max(-1,Math.min(1,all[i]))*32767,true);
  wakeFrames=[all.slice(complete)];wakeSamples=all.length-complete;
  void api.invoke('wake-feed',base64(bytes)).catch(()=>{});
}
async function ensureMic(){
  if(privacyLocked)throw new Error('Datenschutzmodus aktiv. Bitte zuerst lokal entsperren.');
  const requested=settings.microphoneDeviceId||'';
  if(requested&&settings.microphoneDeviceLabel){
    const generation=microphone.generation,selected=resolveMicrophoneDevice({deviceId:requested,label:settings.microphoneDeviceLabel},await navigator.mediaDevices.enumerateDevices());
    if(privacyLocked||generation!==microphone.generation||requested!==(settings.microphoneDeviceId||''))return;
    if(selected.deviceId!==requested){const data=await invoke('settings',{microphoneDeviceId:selected.deviceId,microphoneDeviceLabel:selected.label});acceptSettings(data.settings);await microphoneSwitch;return;}
  }
  if(micStream&&microphoneBound===requested&&!micStream.getTracks().some(track=>track.readyState==='ended'))return;
  if(micStream)releaseMic();
  const stream=await microphone.get();if(!stream||privacyLocked||requested!==(settings.microphoneDeviceId||'')||micStream===stream)return;
  const ctx=context();micStream=stream;microphoneBound=requested;micSource=ctx.createMediaStreamSource(micStream);micAnalyser=ctx.createAnalyser();micSource.connect(micAnalyser);micProcessor=ctx.createScriptProcessor(2048,1,1);micSource.connect(micProcessor);micSilent=ctx.createGain();micSilent.gain.value=0;micProcessor.connect(micSilent);micSilent.connect(ctx.destination);micMuted=false;noiseFloor=.001;
  stream.getAudioTracks?.()[0]?.addEventListener?.('ended',()=>{if(micStream===stream)microphoneSwitch=reconnectMicrophone().catch(error=>{notice('Mikrofon getrennt: '+error.message);return false;});},{once:true});
  void refreshMicrophones();
  micProcessor.onaudioprocess=event=>{
    const input=event.inputBuffer.getChannelData(0),rms=Math.sqrt(input.reduce((sum,x)=>sum+x*x,0)/input.length),now=performance.now();
    if(!privacyLocked){micFrameCount++;micFrameAt=Date.now();}lastMicLevel=rms;
    if(!speechStarted&&rms<noiseFloor*2)noiseFloor=.97*noiseFloor+.03*rms;
    if(privacyLocked)return;
    if(capturing){
      const chunk=downsample(input,ctx.sampleRate);markVoice(captureTurnId,'capture-first-frame');frames.push(chunk);if(!capturePushToTalk)feedVad(chunk);
      if(capturePushToTalk&&now-captureStart>30000){notice('Sprechtaste: Aufnahme nach 30 Sekunden abgebrochen.');cancelPushToTalk();}
      else if(bargeListening&&now-bargeCandidateStart>1200)discardBarge();else if(!capturePushToTalk&&now-captureStart>30000)void finishCapture();
    }
    else if(live&&!transcribing&&!bargeAwaitingTurn&&vadReady&&(busy||ttsPending||ctx.currentTime<speakingUntil)){
      const chunk=downsample(input,ctx.sampleRate);bargePreRoll.push(chunk);if(bargePreRoll.length>6)bargePreRoll.shift();
      bargeFrames=rms>Math.max(.035,noiseFloor*5)?bargeFrames+1:0;
      if(bargeFrames>=4&&now-interruptAt>1500){const preRoll=bargePreRoll;bargePreRoll=[];bargeFrames=0;startCapture({barge:true,preRoll});}
    }else if(!live&&!transcribing&&!pushToTalk.held&&!pushToTalk.finishing&&settings.wakeWord&&wakeReady&&!busy&&ctx.currentTime>=speakingUntil&&ttsPending===0){
      bargePreRoll=[];bargeFrames=0;
      feedWake(input,ctx.sampleRate);
      if(now>wakePauseUntil){
        const high=rms>speechThreshold(noiseFloor),chunk=downsample(input,ctx.sampleRate);
        if(high&&!wakeSpeechStart){wakeSpeechStart=now;wakeLastSpeech=now;wakeSpeech=wakePreRoll;wakePreRoll=[];}
        else if(!wakeSpeechStart){wakePreRoll.push(chunk);if(wakePreRoll.length>6)wakePreRoll.shift();}
        if(wakeSpeechStart){
          wakeSpeech.push(chunk);if(high)wakeLastSpeech=now;
          if(now-wakeLastSpeech>650||now-wakeSpeechStart>6000){
            const speech=wakeSpeech;wakeSpeech=[];wakeSpeechStart=0;wakePauseUntil=now+1200;
            void api.invoke('wake-utterance',base64(wavBytes(speech))).catch(()=>{});
          }
        }
      }
    }else{bargePreRoll=[];bargeFrames=0;}
  };
}
async function armWake(){if(handoffPaused){releaseMic();return;}if(pushToTalk.held)return;if(!privacyLocked&&settings.wakeWord&&wakeReady){try{await ensureMic();if(!live&&!busy&&!pushToTalk.finishing)$('detail').textContent=gatewayConnected?'Bereit · Hey Hermes / Hey Lilith':'Lokal bereit · Hermes offline';}catch(error){notice('Aktivierungswort-Mikrofon: '+error.message);}}else if(!live)releaseMic();}
async function toggleMic(force){
  handoffListen=null;
  cancelPushToTalk();
  const enable=typeof force==='boolean'?force:!live;
  const request=++liveRequest;
  const selectedSession=sessionInfo?.id,selectedSafety=sensorControlGeneration;
  if(!enable){live=false;capturing=false;speechStarted=false;frames=[];transcribing=false;awaitingResume=false;bargeListening=false;bargeAwaitingTurn=false;bargePreRoll=[];captureInterrupt=null;captureTurnId=null;voiceDispatch=null;captureGeneration++;clearTimeout(autoResumeTimer);if(privacyLocked||!settings.wakeWord){releaseMic();micMuted=true;}$('mic').classList.remove('active');$('mic').querySelector('span').textContent='Live starten';if(!busy&&gatewayConnected&&!privacyLocked){$('phase').textContent=phases.ready;$('detail').textContent=settings.wakeWord?'Bereit · Hey Hermes / Hey Lilith':'Mikrofon aus';}return;}
  if(handoffPaused){notice('Das Gespräch wird auf dem anderen Gerät fortgesetzt.');return;}if(privacyLocked){notice('Datenschutzmodus aktiv. Bitte zuerst lokal entsperren.');return;}
  if(!sessionInfo||!gatewayConnected){notice('Bitte zuerst verbinden und deine Hermes-Session auswählen.');if(!expanded){expanded=true;document.body.classList.add('expanded');await invoke('expand',true);}return;}
  if(!vadReady){notice('Lokale Satzenderkennung ist noch nicht bereit.');return;}
  try{
    await ensureMic();if(request!==liveRequest||!micStream||!vadReady||handoffPaused||privacyLocked||!gatewayConnected||settings.standbyActive&&!wakeResuming||sessionInfo?.id!==selectedSession||sensorControlGeneration!==selectedSafety)return;live=true;micMuted=false;
    $('mic').classList.add('active');$('mic').querySelector('span').textContent='Live aktiv';startCapture();
  }catch(error){notice('Mikrofon: '+error.message);await toggleMic(false);}
}
api.on(event=>{
  if(event.type==='handoff-listen'&&!privacyLocked&&!handoffPaused&&gatewayConnected&&!settings.standbyActive&&event.sessionId===sessionInfo?.id){handoffListen={sessionId:event.sessionId,turnId:event.turnId,request:liveRequest,safety:sensorControlGeneration,ready:false};}
  if(event.type==='handoff-listen-ready'&&handoffListen?.sessionId===event.sessionId&&handoffListen?.turnId===event.turnId){handoffListen.ready=true;resumeHandoffListen();}
  if(event.type==='handoff-state')renderHandoff(event.handoff);
  if(event.type==='handoff-input')setHandoffInput(event.passive===true);
  if(event.type==='handoff-history'&&!privacyLocked){$('transcript').replaceChildren();replyNode=null;for(const row of event.messages||[])if(['user','assistant'].includes(row.role)&&typeof row.text==='string')addMessage(row.role,row.text);}
  if(event.type==='job-update')renderQueueWarning(event.jobQueue);
  if(event.type==='timers-update'){orbTimers=event.timers||{items:[]};renderOrbCountdown();}
  if(event.type==='background-update')renderBackgroundSummary(event.background);
  if(event.type==='ptt-control')void handlePushToTalk(event).catch(error=>{notice(error.message);cancelPushToTalk();});
  if(event.type==='speech-correction')renderSpeechCorrection(event);
  if(event.type==='system-report')renderSystemReport(event.report);
  if(event.type==='local-reply'){replyNode=null;addMessage('assistant',event.text);}
  if(event.type.startsWith('vad-'))handleVad(event);
  if(event.type==='state')renderState(event);
  if(event.type==='telemetry')renderMetrics(event.sample);
  if(event.type==='sessions')renderSessions(event.sessions);
  if(event.type==='camera-config'){acceptSettings(event.settings);void syncCameraSettings(settings);}
  if(event.type==='camera-scene'&&!privacyLocked){cameraControls.scene(event.scene);addMessage('alert','Kamerablick: '+event.scene.description);}
  if(event.type==='camera-model')$('camera-description').textContent=event.error|| (event.ready?'Bereit für deinen Kamerablick.':'Die lokale Bildbeschreibung wird vorbereitet …');
  if(event.type==='camera-activity')orbCameraLooking=event.active===true;
  if(event.type==='screen-activity')orbScreenLooking=event.active===true;
  if(event.type==='screen-cancel'){workstationControls.capture.cancel();orbScreenLooking=false;}
  if(event.type==='screen-scene'&&!privacyLocked){workstationControls.scene(event.scene);addMessage('alert','Bildschirmblick: '+event.scene.description);}
  if(event.type==='settings-config'){acceptSettings(event.settings);$('speakAlerts').checked=!!settings.speakAlerts;void syncCameraSettings(settings);workstationControls.sync(settings);}
  if(event.type==='mode-active')workstationControls.modeStatus(event.mode);
  if(event.type==='camera-greeting')addMessage('assistant',event.text);
  if(event.type==='expanded'){expanded=event.expanded;document.body.classList.toggle('expanded',expanded);}
  if(event.type==='notice'){if(!String(event.message).startsWith('Auftrag vorgemerkt.'))orbAlertUntil=performance.now()+2400;notice(event.message);}
  if(event.type==='user'){replyNode=null;addMessage('user',event.text);}
  if(event.type==='bluetooth-update'&&event.bluetooth)renderBluetooth(event.bluetooth);
  if(event.type==='task-progress'&&!privacyLocked){addMessage('assistant',event.text);notice(event.text);}
  if(event.type==='task-acknowledgement'&&!privacyLocked)addMessage('assistant',event.text);
  if(event.type==='reply'){replyNode ||= addMessage('assistant','');replyNode.textContent=event.text;$('transcript').scrollTop=$('transcript').scrollHeight;}
  if(event.type==='local-dialogue-user'){addMessage('user',event.text);localReplyNode=null;localReplyTurn=event.turnId;}
  if(event.type==='local-dialogue-reply'&&event.turnId===localReplyTurn){localReplyNode ||= addMessage('assistant','');localReplyNode.textContent=event.text;$('transcript').scrollTop=$('transcript').scrollHeight;}
  if(event.type==='voice-health')orbVoiceHealth=event.voiceHealth||{state:'starting'};
  if(event.type==='local-dialogue-state'){localConversationInfo=event.localConversation||{ready:false};renderLocalConversation();}
  if(event.type==='local-dialogue-complete')notifyPlaybackDrained();
  if(event.type==='alert'){orbAlertUntil=performance.now()+3000;addMessage('alert',event.text);}
  if(event.type==='audio-start'&&!privacyLocked&&!bargeAwaitingTurn&&event.generation>rejectedAudioGeneration){audioGeneration=event.generation;audioTurnId=event.turnId||null;audioPurpose=event.purpose==='acknowledgement'?'acknowledgement':'reply';pcmRemainder=null;}
  if(event.type==='audio-chunk'&&!privacyLocked&&!bargeAwaitingTurn&&event.generation===audioGeneration&&event.generation>rejectedAudioGeneration)appendPcm(event.data,event.turnId||audioTurnId);
  if(event.type==='audio-stop'){
    handoffListen=null;
    const stopped=Number.isSafeInteger(event.stoppedGeneration)?event.stoppedGeneration:audioGeneration;rejectedAudioGeneration=Math.max(rejectedAudioGeneration,stopped);
    if(!Number.isSafeInteger(event.stoppedGeneration)||audioGeneration<=stopped){stopAudio();audioGeneration=-1;audioTurnId=null;}
  }
  if(event.type==='speech-pending'&&!privacyLocked&&!bargeAwaitingTurn&&(!Number.isSafeInteger(event.generation)||event.generation>rejectedAudioGeneration)){ttsPending=event.pending;if(event.turnId&&Number.isSafeInteger(event.turnPending))turnAudioPending.set(event.turnId,event.turnPending);notifyPlaybackDrained();if(ttsPending>0&&pushToTalk.held)cancelPushToTalk();if(ttsPending>0&&!speechStarted&&!bargeListening){capturing=false;if(live)awaitingResume=true;}}
  if(event.type==='wake-ready'){wakeReady=event.ready;void armWake();}
  if(event.type==='wake-detected'){
    if(handoffPaused||privacyLocked||!settings.wakeWord||live||transcribing||busy||wakeResuming||pushToTalk.held||pushToTalk.finishing)return;
    if(!gatewayConnected||!sessionInfo){wakeFrames=[];wakeSamples=0;wakeSpeech=[];wakeSpeechStart=0;wakePauseUntil=performance.now()+3000;notice(gatewayConnected?'Ich bin lokal bereit. Bitte eine Hermes-Session auswählen.':'Ich bin lokal bereit. Die Verbindung zu Hermes fehlt.');void api.invoke('wake-offline').catch(()=>{});return;}
    if(event.sessionId!==sessionInfo?.id)return;
    wakeFrames=[];wakeSamples=0;wakeSpeech=[];wakeSpeechStart=0;
    wakeResuming=true;const sessionId=event.sessionId;
    void invoke('wake-resume',{sessionId}).then(async()=>{
      if(handoffPaused||privacyLocked||!gatewayConnected||!live||!settings.wakeWord||sessionId!==sessionInfo?.id)return;
      if(capturing)markVoice(captureTurnId,'capture-discarded');capturing=false;speechStarted=false;frames=[];captureGeneration++;
      if(event.command){
        const dispatch=Object.freeze({turnId:'voice-'+Math.floor(voiceNow()).toString(36)+'-'+(++voiceSequence),request:liveRequest,sessionId,pushToTalk:null});
        captureTurnId=dispatch.turnId;captureSessionId=sessionId;voiceDispatch=dispatch;markVoice(dispatch.turnId,'dispatch-start');
        if(event.correction)renderSpeechCorrection({...event.correction,sessionId,turnId:dispatch.turnId});
        try{await sendVoiceCommand(event.command,sessionId,dispatch);}finally{if(voiceDispatch===dispatch)voiceDispatch=null;}
      }
      else{awaitingResume=true;await invoke('wake-greet',sessionId);}
    }).catch(()=>{}).finally(()=>{wakeResuming=false;});
  }
  if(event.type==='turn-end'){
    orbSuccessUntil=event.status==='complete'&&event.verification==='verified'?performance.now()+1800:0;
    $('approval').hidden=true;
    if(live)awaitingResume=true;
  }
  if(event.type==='toggle-mic')void toggleLiveButton().catch(()=>{});
  if(event.type==='mic-off'){settings.wakeWord=false;void invoke('settings',{wakeWord:false});void toggleMic(false);}
  if(event.type==='privacy-state'){if(event.locked)quiesceLocal();else{privacyLocked=false;settings={...settings,privacyLocked:false};syncSpeechSettings();$('phase').textContent=phases[phase]||phase.toUpperCase();$('detail').textContent='Entsperrt · Sensoren bleiben aus';}}
  if(event.type==='control-request')void applyControl(event);
  if(event.type==='approval'){$('approval').hidden=false;$('approval-command').textContent=event.approval.command||event.approval.description||'Hermes bittet um Freigabe.';}
  if(event.type==='clarify'){
    $('clarify').hidden=false;$('questions').replaceChildren();
    for(const q of event.clarification.questions){const label=document.createElement('label');label.textContent=q.question+(q.choices?.length?' ('+q.choices.join(' / ')+')':'');const input=document.createElement('input');input.name=q.qid;input.required=true;input.maxLength=10000;label.append(input);$('questions').append(label);}
  }
});
function clientState(){const speaking=!!audioContext&&speakingUntil>0&&audioContext.currentTime<speakingUntil+.4,source=cameraControls.source();return {privacyLocked,speaking,listening:(capturing&&speechStarted)||transcribing,live,microphoneActive:!!micStream,audioContextState:audioContext?.state||'none',wakeArmed:!!(!privacyLocked&&settings.wakeWord&&wakeReady&&!live&&!busy&&!pushToTalk.held&&!pushToTalk.finishing&&micStream&&audioContext?.state==='running'),cameraActive:cameraControls.controller.active,cameraDeviceId:source.deviceId,cameraLabel:source.label,micLevel:lastMicLevel,frameCount:privacyLocked?0:micFrameCount,frameAt:privacyLocked?0:micFrameAt,rendererAt:Date.now(),capturing:capturing&&speechStarted,transcribing,captureArmed:capturing,awaitingResume,vadReady,dispatchCurrent:!!voiceDispatch&&voiceDispatch.turnId===captureTurnId&&voiceCaptureCurrent(voiceDispatch.request,voiceDispatch.sessionId,voiceDispatch.pushToTalk),inputBusy:busy,inputTtsPending:ttsPending>0};}
async function applyControl(event){
  if(event.action==='standby'&&event.automatic&&(event.sessionId!==sessionInfo?.id||handoffPaused||privacyLocked||busy||capturing&&speechStarted||transcribing||ttsPending||audioNodes.length||lastIdleInteraction>event.idleAt)){
    await api.invoke('control-ack',{id:event.id,error:'Automatischer Standby durch neue Aktivität gestoppt.',cancelled:true});return;
  }
  const sensorAction=['privacy','stop','camera','live','standby','wake-resume','microphone','voice-health-repair'].includes(event.action),ticket=sensorAction?++sensorControlGeneration:sensorControlGeneration;
  try{
    if(event.action==='idle-standby-cancel'){
      const previous=idleStandbyRecord;idleStandbyRecord=null;
      if(event.settings)acceptSettings(event.settings);
      const owned=previous&&previous.ticket===sensorControlGeneration;
      if(owned)sensorControlGeneration++;
      if(owned&&event.restoreLive!==false&&previous.request===liveRequest&&!capturing&&!transcribing&&!pushToTalk.held&&!pushToTalk.finishing&&!privacyLocked&&!handoffPaused&&gatewayConnected&&event.sessionId===sessionInfo?.id&&previous.live&&!live)await toggleMic(true);
      await api.invoke('control-ack',{id:event.id,state:clientState()});return;
    }
    if(event.action==='privacy'||event.action==='stop'){
      if(event.action==='stop'||event.enabled)quiesceLocal();else{privacyLocked=false;settings={...settings,privacyLocked:false};syncSpeechSettings();$('phase').textContent=phases[phase]||phase.toUpperCase();$('detail').textContent='Entsperrt · Sensoren bleiben aus';}
      await api.invoke('control-ack',{id:event.id,state:clientState()});return;
    }
    if(event.action==='voice-health-repair'){
      if(privacyLocked)throw Error('Datenschutzmodus aktiv.');
      const device=settings.microphoneDeviceId,selected=sessionInfo?.id;
      if(event.sessionId&&event.sessionId!==selected)throw Error('Die Session hat sich geändert.');
      if(event.enabled==='microphone'){
        if(!(live||settings.wakeWord&&wakeReady)||transcribing||capturing&&speechStarted)throw Error('Mikrofon wird gerade benutzt oder ist absichtlich aus.');
        await microphoneSwitch;await reconnectMicrophone();
        if(!micStream)throw Error('Das gewählte Mikrofon ist noch nicht bereit.');
        const actual=micStream.getAudioTracks?.()[0]?.getSettings?.().deviceId;
        if(device&&!['default','communications'].includes(device)&&actual!==device)throw Error('Der gewählte Eingang konnte nicht bestätigt werden.');
      }else if(event.enabled==='audio-output'){
        if(!audioContext||audioContext.state==='closed')throw Error('Es gibt keine angehaltene Audioausgabe.');await audioContext.resume();if(audioContext.state!=='running')throw Error('Audioausgabe bleibt angehalten.');
      }else throw Error('Unbekannte Sprachreparatur.');
      if(ticket!==sensorControlGeneration||privacyLocked||device!==settings.microphoneDeviceId||selected!==sessionInfo?.id)throw Error('Sprachreparatur wurde gestoppt.');
      await api.invoke('control-ack',{id:event.id,state:clientState(),result:{attempted:true}});return;
    }
    if(handoffPaused&&['wake-resume','live'].includes(event.action)&&event.enabled!==false)throw Error('Dieses Gespräch gehört zum anderen Gerät.');if(privacyLocked&&['microphones','microphone'].includes(event.action))throw Error('Datenschutzmodus aktiv.');
    if(event.action==='microphones'){const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'&&validMicrophoneDeviceId(d.deviceId)&&validMicrophoneLabel(d.label)).map(d=>({deviceId:d.deviceId,label:d.label}));await api.invoke('control-ack',{id:event.id,state:clientState(),result:{devices,selected:{deviceId:settings.microphoneDeviceId||'',label:settings.microphoneDeviceLabel||''},active:!!micStream}});return;}
    if(privacyLocked&&(['look','screen','standby','wakewords','wake-resume'].includes(event.action)||(['camera','live'].includes(event.action)&&event.enabled)))throw new Error('Datenschutzmodus aktiv. Bitte zuerst lokal entsperren.');
    if(event.action==='standby'&&event.automatic)idleStandbyRecord={ticket,live,request:liveRequest+1};
    if(event.settings){acceptSettings(event.settings);for(const id of ['wakeWord','bareNames','cameraEnabled','cameraRecognize','cameraGreetings'])$(id).checked=!!settings[id];}
    let microphoneResult;
    if(event.action==='microphone'){await microphoneSwitch;const needed=live||settings.wakeWord&&wakeReady;if(needed&&!micStream)await reconnectMicrophone();if(needed&&!micStream)throw Error('Mikrofon konnte nicht verbunden werden.');if(ticket!==sensorControlGeneration||privacyLocked||settings.microphoneDeviceId!==event.enabled)throw Error('Mikrofonwechsel wurde gestoppt.');const track=micStream?.getAudioTracks?.()[0]||micStream?.getTracks?.()[0],actual=track?.getSettings?.().deviceId||null;if(micStream&&event.enabled&&!['default','communications'].includes(event.enabled)&&actual!==event.enabled)throw Error('Das gewünschte Mikrofon ist nicht aktiv.');microphoneResult={deviceId:settings.microphoneDeviceId||'',actualDeviceId:actual,label:track?.label||settings.microphoneDeviceLabel||'',active:!!micStream};}
    if(event.action==='camera')await syncCameraSettings(settings);
    if(event.action==='live')await toggleMic(event.enabled);
    if(event.action==='standby'){
      cameraControls.controller.disable();gestureController.disable();
      await toggleMic(false);
      const deadline=performance.now()+8000;while(settings.wakeWord&&!wakeReady&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
      if(event.automatic&&(ticket!==sensorControlGeneration||privacyLocked||handoffPaused||event.sessionId!==sessionInfo?.id||lastIdleInteraction>event.idleAt)){const error=Error('Automatischer Standby durch neue Aktivität gestoppt.');error.idleCancelled=true;throw error;}
      if(settings.wakeWord&&!wakeReady)throw new Error('Wakeword-Erkennung ist nicht bereit.');await armWake();
    }
    if(event.action==='wake-resume'){
      if(event.sessionId!==sessionInfo?.id)throw Error('Die Session hat sich geändert.');
      await syncCameraSettings(settings);
      if(ticket!==sensorControlGeneration||privacyLocked||event.sessionId!==sessionInfo?.id)throw Error('Aufwachen wurde gestoppt.');
      if(cameraControls.controller.active!==settings.cameraEnabled)throw Error('Die vorherige Kamera konnte nicht wieder gestartet werden.');
      await toggleMic(true);
      if(!live)throw Error('Live-Modus konnte nicht wieder gestartet werden.');
      await syncGestures();
    }
    if(event.action==='wakewords')await armWake();
    if(event.action==='camera'&&cameraControls.controller.active!==event.enabled)throw new Error('Kamerazustand wurde nicht erreicht.');
    if(event.action==='live'&&live!==event.enabled)throw new Error('Live-Modus wurde nicht erreicht.');
    if(event.action==='standby'&&(live||cameraControls.controller.active||(settings.wakeWord?!micStream||event.automatic&&!clientState().wakeArmed:!!micStream)))throw new Error('Standby wurde nicht erreicht.');
    let audioRoute;
    if(event.action==='audio-output'){
      if(privacyLocked)throw Error('Datenschutzmodus aktiv.');
      if(audioContext&&audioContext.state!=='closed'){
        if(typeof audioContext.setSinkId!=='function')throw Error('Audioausgabe kann nicht neu verbunden werden.');
        await audioContext.setSinkId({type:'none'});
        try{await audioContext.setSinkId('');}catch(error){await audioContext.setSinkId('').catch(()=>{});throw error;}
        audioRoute={systemDefault:audioContext.sinkId===''};
      }else audioRoute={systemDefault:true};
    }
    const result=event.action==='microphone'?microphoneResult:event.action==='audio-output'?audioRoute:event.action==='look'?cameraControls.capture():event.action==='screen'?await workstationControls.capture.capture(event.enabled):undefined;
    await api.invoke('control-ack',{id:event.id,state:clientState(),result});
  }catch(error){if(event.action==='wake-resume'&&ticket===sensorControlGeneration&&!handoffPaused){cameraControls.controller.disable();gestureController.disable();await toggleMic(false);}await api.invoke('control-ack',{id:event.id,error:String(error.message),cancelled:error.idleCancelled===true});}
}
let dragged=false,drag=null;
$('orb').addEventListener('pointerdown',event=>{const p=orbPointer(event);orbRenderer.pulse(p.x,p.y);drag={sx:event.screenX,sy:event.screenY,x:window.screenX,y:window.screenY};dragged=false;$('orb').setPointerCapture(event.pointerId);});
$('orb').addEventListener('pointermove',event=>{const p=orbPointer(event);orbRenderer.setPointer(p.x,p.y);if(!drag)return;const dx=event.screenX-drag.sx,dy=event.screenY-drag.sy;if(Math.abs(dx)+Math.abs(dy)>5){dragged=true;void api.invoke('move',{x:drag.x+dx,y:drag.y+dy});}});
$('orb').addEventListener('pointerup',()=>{drag=null;if(!dragged){expanded=!expanded;document.body.classList.toggle('expanded',expanded);void invoke('expand',expanded);}});
$('orb').addEventListener('pointerleave',()=>orbRenderer.setPointer(0,0));
$('orb').addEventListener('pointercancel',()=>{drag=null;orbRenderer.setPointer(0,0);});
$('collapse').onclick=()=>{expanded=false;document.body.classList.remove('expanded');void invoke('expand',false);};
async function toggleLiveButton(){if(!live&&settings.standbyActive)return invoke('wake-resume',{sessionId:sessionInfo?.id});return toggleMic();}
$('mic').onclick=()=>void toggleLiveButton().catch(()=>{});$('refresh').onclick=()=>void invoke('connect').catch(()=>{});$('login').onclick=()=>void invoke('login');
$('sessions').onchange=()=>{if($('sessions').value)void invoke('select',$('sessions').value).then(data=>{sessionInfo=data.session;acceptSettings(data.settings);renderState(data);void armWake();}).catch(()=>{});};
$('command').onsubmit=event=>{event.preventDefault();const text=$('text').value.trim();if(text)void workstationControls.send(text,sessionInfo?.id).then(()=>{$('text').value='';}).catch(()=>{});};
$('stop').onclick=()=>{quiesceLocal();void invoke('emergency-stop').catch(()=>{});};
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;$('settings').scrollIntoView({block:'nearest'});if(!$('settings').hidden){void cameraControls.refreshDevices();void cameraControls.refreshProfiles();void workstationControls.refreshSources();}};
$('audition').onclick=()=>{context();void invoke('audition',{voice:$('voice').value,delivery:$('delivery').value}).catch(()=>{});};
let availableVoiceProfiles=null,voiceSelectionGeneration=0;
function syncVoiceCatalog(profiles){
  if(!Array.isArray(profiles))return;
  availableVoiceProfiles=profiles;const current=$('voice').value,options=[];
  for(const profile of profiles){const option=document.createElement('option');option.value=profile.id;option.textContent=profile.label;if(profile.id==='reference')option.id='reference-voice-option';options.push(option);}
  $('voice').replaceChildren(...options);if(profiles.some(profile=>profile.id===current))$('voice').value=current;
}
function syncVoiceDelivery(){
  const profile=availableVoiceProfiles?.find(profile=>profile.id===$('voice').value),deliveries=profile?.deliveries||($('voice').value==='reference'?['normal']:['normal','whisper','power']);
  for(const option of $('delivery').options)option.disabled=!deliveries.includes(option.value);
  if(!deliveries.includes($('delivery').value))$('delivery').value=deliveries.includes('normal')?'normal':deliveries[0];
}
async function saveVoiceSelection(){
  syncVoiceDelivery();const ticket=++voiceSelectionGeneration;
  try{const data=await invoke('settings',{voice:$('voice').value,delivery:$('delivery').value});if(ticket!==voiceSelectionGeneration)return;acceptSettings(data.settings);if(data.voiceProfiles)syncVoiceCatalog(data.voiceProfiles);$('voice').value=settings.voice;$('delivery').value=settings.delivery;syncVoiceDelivery();notice('Stimme gewählt: '+(availableVoiceProfiles?.find(profile=>profile.id===settings.voice)?.label||settings.voice));}
  catch{if(ticket===voiceSelectionGeneration){$('voice').value=settings.voice;$('delivery').value=settings.delivery;syncVoiceDelivery();}}
}
$('voice').onchange=saveVoiceSelection;$('delivery').onchange=saveVoiceSelection;
$('approve').onclick=()=>void invoke('settings',{approvalChoice:'once'}).then(()=>{$('approval').hidden=true;});$('deny').onclick=()=>void invoke('settings',{approvalChoice:'deny'}).then(()=>{$('approval').hidden=true;});
$('clarify').onsubmit=event=>{event.preventDefault();const answers=Object.fromEntries(new FormData($('clarify')));void invoke('answer',answers).then(()=>{$('clarify').hidden=true;}).catch(()=>{});};
const cameraControls=new CameraControls({invoke,notice,getSession:()=>sessionInfo,onSettings:data=>{acceptSettings(data.settings);renderState(data);void syncCameraSettings(settings);}});
const workstationControls=new WorkstationControls({invoke,notice,getSession:()=>sessionInfo,sendCamera:(text,id)=>cameraControls.send(text,id),onSettings:data=>{acceptSettings(data.settings);renderState(data);void syncCameraSettings(settings);}});
if(window.SpeechDictionaryEditor&&$('speech-dictionary-editor')){speechDictionaryEditor=window.SpeechDictionaryEditor.mount($('speech-dictionary-editor'));syncSpeechSettings();}
function renderSystemReport(report){for(const link of report?.links||[]){const node=$(link.key==='gateway'?'system-gateway':'system-mcp');node.dataset.state=link.state;node.textContent=(link.key==='gateway'?'HERMES':'PC')+' · '+({online:'VERBUNDEN',offline:'UNTERBROCHEN',unknown:'NICHT GEPRÜFT'}[link.state]||'NICHT GEPRÜFT');}}
$('system-report-button').onclick=()=>void invoke('system-report',{speak:true,sessionId:sessionInfo?.id});
$('workbench-button').onclick=()=>void invoke('workbench-toggle');
let gestureRetryAt=0;
const gestureController=new GestureController({loadDetector:loadGestureDetector,onSpatial:value=>void api.invoke('gesture-action',value).catch(()=>{}),onAction:action=>void api.invoke('gesture-action',action).catch(error=>notice(error.message)),onState:value=>{if(value.error)gestureRetryAt=Date.now()+30000;$('gesture-status').textContent=value.status;void api.invoke('gesture-state',value).catch(()=>{});}});
async function syncGestures(){
  $('gesturesEnabled').checked=settings.gesturesEnabled===true;
  if(privacyLocked||!settings.gesturesEnabled||!cameraControls.controller.active){if(gestureController.active||gestureController.pending)gestureController.disable();$('gesture-status').textContent=!privacyLocked&&settings.gesturesEnabled?'Kamera einschalten, um Gesten zu nutzen.':'Gesten aus';return;}
  if(Date.now()<gestureRetryAt)return;
  await gestureController.enable(cameraControls.controller.video);
}
$('gesturesEnabled').onchange=()=>{gestureRetryAt=0;void invoke('settings',{gesturesEnabled:$('gesturesEnabled').checked}).then(data=>{acceptSettings(data.settings);void syncGestures();});};
setInterval(()=>void syncGestures(),500);
$('save').onclick=async()=>{try{const values={idleStandbyMinutes:$('idleStandbyMinutes')?.valueAsNumber??15,url:$('url').value,voice:$('voice').value,delivery:$('delivery').value,cameraDeviceId:$('cameraDeviceId').value,orbColors,orbIntensity,...workstationControls.values()};for(const id of ['monitoring','proactive','speakAlerts','autoStart','wakeWord','bareNames','cameraEnabled','cameraRecognize','cameraGreetings'])values[id]=$(id).checked;if($('pushToTalkEnabled'))values.pushToTalkEnabled=$('pushToTalkEnabled').checked;if($('pushToTalkKey'))values.pushToTalkKey=$('pushToTalkKey').value;if($('directCommandsEnabled'))values.directCommandsEnabled=$('directCommandsEnabled').checked;for(const id of ['localDialogueEnabled','naturalConversation'])if($(id))values[id]=$(id).checked;values.audioPreferences=audioOutputsReady?{headphones:$('audio-headphones').value,speakers:$('audio-speakers').value}:settings.audioPreferences||{};if(speechDictionaryEditor)values.speechDictionary=speechDictionaryEditor.value();const data=await invoke('settings',values);acceptSettings(data.settings);syncOrbSettings(settings);workstationControls.sync(settings);void syncCameraSettings(settings);void armWake();notice('Einstellungen gespeichert.');}catch(error){notice(error.message);}};
invoke('snapshot').then(data=>{renderQueueWarning(data.jobQueue);renderBackgroundSummary(data.background);acceptSettings(data.settings);sessionInfo=data.session;wakeReady=data.wakeReady;vadReady=data.vadReady===true;orbCameraLooking=data.camera?.looking===true;orbScreenLooking=data.screen?.looking===true;renderState(data);renderMetrics(data.sample);renderSessions(data.sessions);syncOrbSettings(settings);workstationControls.sync(settings);$('url').value=settings.url;if(data.voiceProfiles)syncVoiceCatalog(data.voiceProfiles);else $('reference-voice-option').hidden=!data.referenceVoiceReady;$('voice').value=settings.voice;$('delivery').value=settings.delivery||'normal';syncVoiceDelivery();for(const id of ['monitoring','proactive','speakAlerts','autoStart','wakeWord','bareNames'])$(id).checked=settings[id];cameraControls.profiles(data.camera?.profiles||[]);void syncCameraSettings(settings);void armWake();}).catch(()=>{});
setInterval(()=>{
  resumeHandoffListen();
  renderMicrophoneStatus();
  observePlayback();
  const speaking=!!audioContext&&speakingUntil>0&&audioContext.currentTime<speakingUntil+.4;
  if(awaitingResume&&live&&!wakeResuming&&!pushToTalk.held&&!pushToTalk.finishing&&!busy&&!capturing&&!transcribing&&!ttsPending&&!speaking){awaitingResume=false;startCapture();}
  const observed=clientState(),now=Date.now(),next=JSON.stringify({...observed,frameCount:0,frameAt:0,rendererAt:0});if(next!==lastClientState||now-lastHealthHeartbeat>=1000){lastClientState=next;lastHealthHeartbeat=now;void api.invoke('client-state',observed).catch(()=>{});}
},150);

const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const orbRenderer=new HermesOrb.OrbRenderer($('neural'),{reducedMotion:motionPreference.matches});
const orbPreviewRenderer=new HermesOrb.OrbRenderer($('orb-preview'),{reducedMotion:motionPreference.matches});
motionPreference.addEventListener?.('change',event=>{orbRenderer.reducedMotion=orbPreviewRenderer.reducedMotion=event.matches;});
function orbPointer(event){const rect=$('orb').getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*2-1,y:(event.clientY-rect.top)/rect.height*2-1};}
function syncOrbSettings(values){orbColors=HermesOrb.normalizeOrbColors(values.orbColors);orbIntensity=HermesOrb.normalizeOrbIntensity(values.orbIntensity);orbRenderer.setColors(orbColors);orbPreviewRenderer.setColors(orbColors);for(const key of Object.keys(orbColors))$('orb-color-'+key).value=orbColors[key];$('orb-intensity').value=orbIntensity;}
function previewOrb(state){orbPreviewState=state;orbPreviewUntil=performance.now()+3500;orbRenderer.pulse(0,0);orbPreviewRenderer.pulse(0,0);}
for(const key of Object.keys(orbColors)){
  $('orb-preview-'+key).onclick=()=>previewOrb(key);
  $('orb-color-'+key).addEventListener('input',event=>{orbColors=HermesOrb.normalizeOrbColors({...orbColors,[key]:event.target.value});orbRenderer.setColors(orbColors);orbPreviewRenderer.setColors(orbColors);previewOrb(key);});
}
$('orb-reset').onclick=()=>{syncOrbSettings({orbColors:HermesOrb.ORB_DEFAULTS,orbIntensity:1});previewOrb('idle');};
$('orb-intensity').addEventListener('input',event=>{orbIntensity=HermesOrb.normalizeOrbIntensity(Number(event.target.value));});
let lastDraw=0;
function draw(now){requestAnimationFrame(draw);if(now-lastDraw<16)return;lastDraw=now;
  observePlayback();renderOrbCountdown();
  let amplitude=0;const audio=contextWithoutCreating();
  if(audio){const active=audioNodes.find(node=>audio.currentTime>=node.start&&audio.currentTime<node.end);if(active){const values=new Uint8Array(active.analyser.fftSize);active.analyser.getByteTimeDomainData(values);const rms=Math.sqrt(values.reduce((sum,n)=>sum+((n-128)/128)**2,0)/values.length);amplitude=Math.sqrt(rms)*1.8;}else if(live&&micAnalyser){const values=new Uint8Array(micAnalyser.fftSize);micAnalyser.getByteTimeDomainData(values);amplitude=Math.sqrt(values.reduce((sum,n)=>sum+((n-128)/128)**2,0)/values.length)*4;}}
  if(capturing)amplitude=Math.max(amplitude,Math.sqrt(lastMicLevel)*3.2);
  level=.78*level+.22*Math.min(1,amplitude);const talking=!!audio&&audio.currentTime<speakingUntil,shownPhase=visibleVoicePhase();
  const healthAttention=!privacyLocked&&!busy&&!talking&&!capturing&&orbVoiceHealth.state==='degraded';
  const actual=HermesOrb.orbState({phase:healthAttention?'error':!live&&!busy&&shownPhase==='listening'?'ready':shownPhase,speaking:talking,capturing,looking:orbCameraLooking||orbScreenLooking,background:privacyLocked?null:orbBackground,now,successUntil:orbSuccessUntil,alertUntil:orbAlertUntil});
  const visual=now<orbPreviewUntil?orbPreviewState:actual;
  const backgroundPhase=HermesOrb.backgroundOrbState(orbBackground),backgroundLabel=['ready','listening'].includes(shownPhase)&&actual===backgroundPhase&&backgroundPhase?orbLabels[actual]+' IM HINTERGRUND':null;
  $('phase').textContent=privacyLocked?'PRIVAT':handoffPresence?.remote?'AWAY':healthAttention?'SPRACHE PRÜFEN':now<orbPreviewUntil?'VORSCHAU / '+orbLabels[visual]:backgroundLabel||(['success','alert','error','looking'].includes(actual)?orbLabels[actual]:actual==='idle'&&settings.standbyActive?'STANDBY':talking?phases.speaking:capturing?phases.listening:phases[shownPhase]||shownPhase.toUpperCase());
  if(lastOrbAccent!==orbColors[visual]){lastOrbAccent=orbColors[visual];document.documentElement.style.setProperty('--orb-accent',lastOrbAccent);}
  const orbAmplitude=now<orbPreviewUntil&&visual==='speaking'?.5+Math.sin(now*.01)*.3:level;
  orbRenderer.draw(now,{state:visual,amplitude:orbAmplitude,intensity:orbIntensity});
  if(!$('settings').hidden){orbPreviewRenderer.draw(now,{state:visual,amplitude:orbAmplitude,intensity:orbIntensity});$('orb-preview-name').textContent=(now<orbPreviewUntil?'VORSCHAU / ':'LIVE / ')+orbLabels[visual];}
}
function contextWithoutCreating(){return audioContext;}
requestAnimationFrame(draw);

let audioOutputsReady=false;
async function refreshAudioOutputs(){
 try{
  const data=await invoke('audio-outputs');
  for(const [id,current,alias] of [['audio-output-target',data.defaults.multimedia,null],['audio-headphones',settings.audioPreferences?.headphones||'','headphones'],['audio-speakers',settings.audioPreferences?.speakers||'','speakers']]){
   const select=$(id);select.replaceChildren();if(alias)select.append(new Option('Automatisch bei eindeutigem Treffer',''));
   for(const device of data.devices)select.append(new Option(device.name,device.id));
   if(current&&!data.devices.some(device=>device.id===current))select.append(new Option('Gespeichertes Gerät ist gerade nicht verfügbar',current));select.value=current||'';
  }
  audioOutputsReady=true;
  $('audio-output-status').textContent='„Boxen“ und „Kopfhörer“ zuordnen und Einstellungen speichern. Sprachbefehl: „Wechsle die Audioausgabe auf Boxen.“';
 }catch(error){$('audio-output-status').textContent=error.message;}
}
$('audio-refresh').onclick=()=>void refreshAudioOutputs();
$('settings-toggle').addEventListener('click',()=>void refreshAudioOutputs());
$('audio-apply').onclick=async()=>{const button=$('audio-apply');button.disabled=true;try{const result=await invoke('audio-output',{target:$('audio-output-target').value});notice(result.message);if(result.verified)await refreshAudioOutputs();}catch(error){notice(error.message);}finally{button.disabled=false;}};

function renderMicrophoneStatus(){
 const track=micStream?.getAudioTracks?.()[0],active=track?.readyState==='live';
 $('microphone-meter').value=active?Math.min(1,lastMicLevel*8):0;
 $('microphone-status').textContent=active?(track.label+(track.muted?' · liefert derzeit kein Signal':' · aktiv')):settings.wakeWord||live?'Kein Mikrofonzugriff'+(settings.microphoneDeviceLabel?' · '+settings.microphoneDeviceLabel:''):'Mikrofon aus';
}
async function refreshMicrophones(){
 try{
  const chosen=settings.microphoneDeviceId||'',devices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='audioinput'&&device.deviceId!=='default'&&device.deviceId!=='communications');
  const select=$('microphone-device');select.replaceChildren(new Option('Windows-Standard',''));
  for(const device of devices)select.append(new Option(device.label||'Mikrofon',device.deviceId));
  if(chosen&&!devices.some(device=>device.deviceId===chosen))select.append(new Option('Gespeichertes Mikrofon · derzeit nicht verfügbar',chosen));
  select.value=chosen;renderMicrophoneStatus();
 }catch(error){$('microphone-status').textContent=error.message;}
}
$('microphone-refresh').onclick=()=>void refreshMicrophones();
$('settings-toggle').addEventListener('click',()=>void refreshMicrophones());
$('microphone-device').onchange=async()=>{
 const select=$('microphone-device');select.disabled=true;
 try{const device=(await navigator.mediaDevices.enumerateDevices()).find(item=>item.kind==='audioinput'&&item.deviceId===select.value);const data=await invoke('settings',{microphoneDeviceId:select.value,microphoneDeviceLabel:device?.label||''});acceptSettings(data.settings);const applied=await microphoneSwitch;await refreshMicrophones();if(applied)notice(micStream?'Mikrofon: '+micStream.getAudioTracks()[0].label:'Mikrofon gespeichert. Aufnahme ist ausgeschaltet.');}
 catch(error){notice('Mikrofon: '+error.message);}finally{select.disabled=false;}
};
navigator.mediaDevices.addEventListener?.('devicechange',()=>{void refreshMicrophones();if(!privacyLocked&&(live||settings.wakeWord&&wakeReady)&&!micStream)microphoneSwitch=reconnectMicrophone().catch(error=>{notice('Mikrofon: '+error.message);return false;});});

let bluetoothBusy=false;
function renderBluetooth(data){
 const select=$('bluetooth-device'),selected=select.value,state=data.radios?.length===1?data.radios[0].state:null;select.replaceChildren();
 for(const device of data.devices||[])select.append(new Option(device.name+' · '+(device.paired?(state==='On'&&device.connected?'Windows: verbunden':'Gekoppelt'):'Neu gefunden'),device.id));
 if((data.devices||[]).some(device=>device.id===selected))select.value=selected;
 $('bluetooth-status').textContent=state==='On'?'Bluetooth an':state==='Off'?'Bluetooth aus':'Bluetooth-Adapter nicht eindeutig verfügbar';
 $('bluetooth-status').textContent+=' · '+(data.devices?.length||0)+' Geräte';
}
async function refreshBluetooth(){try{renderBluetooth(await invoke('bluetooth-devices'));}catch(error){$('bluetooth-status').textContent=error.message;}}
async function changeBluetooth(action,enabled){
 if(bluetoothBusy)return;bluetoothBusy=true;const buttons=['on','off','scan','connect','disconnect','pair','audio','refresh'].map(id=>$('bluetooth-'+id));buttons.forEach(button=>button.disabled=true);
 try{
  const command={type:'bluetooth',action};if(action==='radio')command.enabled=enabled;else if(action!=='scan')command.deviceId=$('bluetooth-device').value;
  $('bluetooth-status').textContent=action==='scan'?'Suche nach Bluetooth-Geräten …':'Windows führt die Geräteaktion aus …';
  const result=await invoke('bluetooth',command);if(result.snapshot)renderBluetooth(result.snapshot);notice(result.message);
  if(result.verified&&action==='audio')await refreshAudioOutputs();
 }catch(error){notice(error.message);$('bluetooth-status').textContent=error.message;}finally{bluetoothBusy=false;buttons.forEach(button=>button.disabled=false);}
}
$('bluetooth-refresh').onclick=()=>void refreshBluetooth();
$('settings-toggle').addEventListener('click',()=>void refreshBluetooth());
$('bluetooth-on').onclick=()=>void changeBluetooth('radio',true);$('bluetooth-off').onclick=()=>void changeBluetooth('radio',false);
for(const action of ['scan','connect','disconnect','pair','audio'])$('bluetooth-'+action).onclick=()=>void changeBluetooth(action);

const handoffButton=$('handoff-notebook');if(handoffButton)handoffButton.onclick=()=>void invoke(handoffPresence?.remote?'recall':'handoff',handoffPresence?.remote?undefined:'notebook').then(renderHandoff).catch(()=>{});
const recallButton=$('handoff-recall');if(recallButton)recallButton.onclick=()=>void invoke('recall').then(renderHandoff).catch(()=>{});

let lastIdleInteraction=0;
for(const type of ['pointerdown','keydown'])document.addEventListener?.(type,()=>{const now=Date.now();if(now-lastIdleInteraction<1000)return;lastIdleInteraction=now;void invoke('activity').catch(()=>{});},{passive:true});
