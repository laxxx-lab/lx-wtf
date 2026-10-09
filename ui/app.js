'use strict';
const $=id=>document.getElementById(id),api=window.hermes;
let expanded=false,settings={},sessionInfo=null,busy=false,phase='offline',level=0,replyNode=null,gatewayConnected=false,transcribing=false,liveRequest=0,captureSessionId=null;
const microphone=new Microphone(()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}));
let audioContext=null,audioTime=0,pcmRemainder=null,audioNodes=[],audioGeneration=-1,speakingUntil=0;
let micStream=null,micSource=null,micProcessor=null,micAnalyser=null,micMuted=true,live=false,capturing=false,speechStarted=false,frames=[],captureStart=0,lastSpeech=0,noiseFloor=.005;
let autoResumeTimer=null,interruptAt=0,ttsPending=0,awaitingResume=false,wakeReady=false,wakeFrames=[],wakeSamples=0,bargeFrames=0,lastClientState='',wakeSpeech=[],wakeSpeechStart=0,wakeLastSpeech=0,wakePauseUntil=0;
const phases={offline:'OFFLINE',connecting:'VERBINDE',ready:'BEREIT',thinking:'DENKT',working:'ARBEITET',transcribing:'ERKENNT SPRACHE',listening:'HÖRT ZU',speaking:'SPRICHT',approval:'FREIGABE',question:'RÜCKFRAGE',error:'HINWEIS'};
function notice(message){$('notice').hidden=false;$('notice').textContent=message;}
async function invoke(method,payload){try{return await api.invoke(method,payload);}catch(error){notice(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));throw error;}}
function renderState(data){phase=data.status;busy=!!data.busy;sessionInfo=data.session||null;gatewayConnected=!!data.connected;$('phase').textContent=phases[phase]||phase.toUpperCase();$('detail').textContent=data.detail||'';$('connection').textContent=data.connected?'VERBUNDEN':'OFFLINE';$('connection').classList.toggle('online',!!data.connected);$('auth').hidden=!!data.connected;$('sessions').disabled=busy||transcribing;if(!gatewayConnected&&live)void toggleMic(false);void armWake();}
function renderMetrics(sample){
  for(const [id,key] of [['cpu','cpuPercent'],['memory','memoryPercent']]){const n=sample[key];$(id).textContent=Number.isFinite(n)?Math.round(n)+'%':'—';$(id+'-bar').style.width=Number.isFinite(n)?n+'%':'0%';}
  $('disk').textContent=Number.isFinite(sample.diskFreeGiB)?Math.round(sample.diskFreeGiB)+' GiB':'—';$('disk-total').textContent=Number.isFinite(sample.diskTotalGiB)?'von '+Math.round(sample.diskTotalGiB)+' GiB':'Nicht verfügbar';
}
function renderSessions(rows){const select=$('sessions');select.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='Gewünschte Session auswählen';select.append(blank);for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=(row.source==='telegram'?'Telegram · ':'')+row.title;select.append(option);}select.value=settings.sessionId||'';}
function addMessage(role,text){const view=$('transcript');view.querySelector('.empty')?.remove();const node=document.createElement('div');node.className='message '+role;const small=document.createElement('small');small.textContent=role==='user'?'DU':role==='alert'?'SYSTEMHINWEIS':'HERMES';const p=document.createElement('p');p.textContent=text;node.append(small,p);view.append(node);while(view.children.length>24)view.firstChild.remove();view.scrollTop=view.scrollHeight;return p;}
function context(){audioContext ||= new AudioContext({sampleRate:48000});if(audioContext.state==='suspended')audioContext.resume();return audioContext;}
function stopAudio(){for(const node of audioNodes){try{node.source.stop();}catch{}try{node.source.disconnect();node.analyser.disconnect();}catch{}}audioNodes=[];audioTime=0;pcmRemainder=null;speakingUntil=0;level=0;}
function appendPcm(encoded){
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));let data=bytes;
  if(pcmRemainder!==null){data=new Uint8Array(bytes.length+1);data[0]=pcmRemainder;data.set(bytes,1);pcmRemainder=null;}
  if(data.length%2){pcmRemainder=data[data.length-1];data=data.slice(0,-1);}if(!data.length)return;
  const ctx=context(),audio=ctx.createBuffer(1,data.length/2,24000),floats=audio.getChannelData(0),view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  for(let i=0;i<floats.length;i++)floats[i]=view.getInt16(i*2,true)/32768;
  const source=ctx.createBufferSource(),analyser=ctx.createAnalyser();analyser.fftSize=256;source.buffer=audio;source.connect(analyser);analyser.connect(ctx.destination);
  const when=Math.max(ctx.currentTime+.045,audioTime),node={source,analyser,start:when,end:when+audio.duration};audioTime=node.end;speakingUntil=node.end;audioNodes.push(node);source.start(when);source.onended=()=>{audioNodes=audioNodes.filter(x=>x!==node);source.disconnect();analyser.disconnect();};
}
function downsample(input,rate){const ratio=rate/16000,out=new Float32Array(Math.floor(input.length/ratio));for(let i=0;i<out.length;i++){const start=Math.floor(i*ratio),end=Math.min(input.length,Math.floor((i+1)*ratio));let sum=0;for(let j=start;j<end;j++)sum+=input[j];out[i]=sum/Math.max(1,end-start);}return out;}
function wavBytes(chunks){const length=chunks.reduce((sum,x)=>sum+x.length,0),bytes=new Uint8Array(44+length*2),view=new DataView(bytes.buffer);const word=(at,text)=>{for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);};word(0,'RIFF');view.setUint32(4,36+length*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,length*2,true);let n=44;for(const chunk of chunks)for(const x of chunk){view.setInt16(n,Math.max(-1,Math.min(1,x))*(x<0?32768:32767),true);n+=2;}return bytes;}
function base64(bytes){let text='';for(let start=0;start<bytes.length;start+=8192)text+=String.fromCharCode(...bytes.subarray(start,start+8192));return btoa(text);}
function startCapture(){if(!live||!micStream)return;capturing=true;speechStarted=false;frames=[];captureSessionId=sessionInfo?.id;captureStart=performance.now();lastSpeech=captureStart;phase='listening';$('phase').textContent=phases.listening;$('detail').textContent='Ich höre zu';}
async function finishCapture(){
  if(!capturing)return;capturing=false;const chunks=frames;frames=[];
  if(!speechStarted){if(live)setTimeout(startCapture,150);return;}
  transcribing=true;$('sessions').disabled=true;const sessionId=captureSessionId,request=liveRequest;void api.invoke('client-state',{speaking:false,listening:true}).catch(()=>{});
  try{
    const text=await invoke('transcribe',{audio:base64(wavBytes(chunks)),sessionId});
    if(!live||request!==liveRequest)return;
    if(/^(stopp?|ruhe|gespräch beenden)[.!?]?$/i.test(text)){await toggleMic(false);await invoke('interrupt');return;}
    if(text){await invoke('submit',{text,sessionId});}else{startCapture();}
  }catch{if(request===liveRequest)await toggleMic(false);}
  finally{if(request===liveRequest){transcribing=false;$('sessions').disabled=busy;}}
}
function releaseMic(){microphone.release();if(micProcessor){micProcessor.onaudioprocess=null;micProcessor.disconnect();micProcessor=null;}micSource?.disconnect();micAnalyser?.disconnect();micSource=null;micAnalyser=null;micStream=null;}
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
  if(micStream)return;
  const stream=await microphone.get();if(!stream||micStream===stream)return;
  const ctx=context();micStream=stream;micSource=ctx.createMediaStreamSource(micStream);micAnalyser=ctx.createAnalyser();micSource.connect(micAnalyser);micProcessor=ctx.createScriptProcessor(2048,1,1);micSource.connect(micProcessor);const silent=ctx.createGain();silent.gain.value=0;micProcessor.connect(silent);silent.connect(ctx.destination);micMuted=false;noiseFloor=.005;
  micProcessor.onaudioprocess=event=>{
    const input=event.inputBuffer.getChannelData(0),rms=Math.sqrt(input.reduce((sum,x)=>sum+x*x,0)/input.length),now=performance.now();
    if(!speechStarted&&rms<noiseFloor*2)noiseFloor=.97*noiseFloor+.03*rms;
    if(capturing){frames.push(downsample(input,ctx.sampleRate));const threshold=Math.max(.012,noiseFloor*3.5);if(rms>threshold){speechStarted=true;lastSpeech=now;}if((speechStarted&&now-lastSpeech>950)||(now-captureStart>30000))void finishCapture();}
    else if(live&&(busy||ctx.currentTime<speakingUntil)){
      bargeFrames=rms>Math.max(.035,noiseFloor*5)?bargeFrames+1:0;
      if(bargeFrames>=4&&now-interruptAt>1500){interruptAt=now;bargeFrames=0;stopAudio();void invoke('interrupt').then(startCapture).catch(()=>{});}
    }else if(!live&&settings.wakeWord&&wakeReady&&!busy&&ctx.currentTime>=speakingUntil&&ttsPending===0){
      feedWake(input,ctx.sampleRate);
      if(now>wakePauseUntil){
        const high=rms>Math.max(.012,noiseFloor*3.5);
        if(high&&!wakeSpeechStart){wakeSpeechStart=now;wakeLastSpeech=now;wakeSpeech=[];}
        if(wakeSpeechStart){
          wakeSpeech.push(downsample(input,ctx.sampleRate));if(high)wakeLastSpeech=now;
          if(now-wakeLastSpeech>650||now-wakeSpeechStart>6000){
            const speech=wakeSpeech;wakeSpeech=[];wakeSpeechStart=0;wakePauseUntil=now+1200;
            void api.invoke('wake-utterance',base64(wavBytes(speech))).catch(()=>{});
          }
        }
      }
    }
  };
}
async function armWake(){if(settings.wakeWord&&wakeReady&&sessionInfo&&gatewayConnected){try{await ensureMic();if(!live&&!busy)$('detail').textContent='Bereit · Hey Hermes / Hey Lilith';}catch(error){notice('Aktivierungswort-Mikrofon: '+error.message);}}else if(!live)releaseMic();}
async function toggleMic(force){
  const enable=typeof force==='boolean'?force:!live;
  const request=++liveRequest;
  if(!enable){live=false;capturing=false;transcribing=false;awaitingResume=false;clearTimeout(autoResumeTimer);if(!settings.wakeWord||!gatewayConnected){releaseMic();micMuted=true;}$('mic').classList.remove('active');$('mic').querySelector('span').textContent='Live starten';if(!busy&&gatewayConnected){$('phase').textContent=phases.ready;$('detail').textContent=settings.wakeWord?'Bereit · Hey Hermes / Hey Lilith':'Mikrofon aus';}return;}
  if(!sessionInfo){notice('Bitte zuerst verbinden und deine Hermes-Session auswählen.');if(!expanded){expanded=true;document.body.classList.add('expanded');await invoke('expand',true);}return;}
  try{
    await ensureMic();if(request!==liveRequest||!micStream)return;live=true;micMuted=false;
    $('mic').classList.add('active');$('mic').querySelector('span').textContent='Live aktiv';startCapture();
  }catch(error){notice('Mikrofon: '+error.message);await toggleMic(false);}
}
api.on(event=>{
  if(event.type==='state')renderState(event);
  if(event.type==='telemetry')renderMetrics(event.sample);
  if(event.type==='sessions')renderSessions(event.sessions);
  if(event.type==='expanded'){expanded=event.expanded;document.body.classList.toggle('expanded',expanded);}
  if(event.type==='notice')notice(event.message);
  if(event.type==='user'){replyNode=null;addMessage('user',event.text);}
  if(event.type==='reply'){replyNode ||= addMessage('assistant','');replyNode.textContent=event.text;$('transcript').scrollTop=$('transcript').scrollHeight;}
  if(event.type==='alert')addMessage('alert',event.text);
  if(event.type==='audio-start'){audioGeneration=event.generation;pcmRemainder=null;}
  if(event.type==='audio-chunk'&&event.generation===audioGeneration)appendPcm(event.data);
  if(event.type==='audio-stop')stopAudio();
  if(event.type==='speech-pending'){ttsPending=event.pending;if(ttsPending>0&&!speechStarted){capturing=false;if(live)awaitingResume=true;}}
  if(event.type==='wake-ready'){wakeReady=event.ready;void armWake();}
  if(event.type==='wake-detected'){
    if(!settings.wakeWord||!gatewayConnected||live||transcribing||busy||event.sessionId!==sessionInfo?.id)return;
    wakeFrames=[];wakeSamples=0;wakeSpeech=[];wakeSpeechStart=0;
    void toggleMic(true).then(()=>{if(event.command&&live&&settings.wakeWord&&event.sessionId===sessionInfo?.id){capturing=false;void invoke('submit',{text:event.command,sessionId:event.sessionId}).catch(()=>{});}});
  }
  if(event.type==='turn-end'){
    $('approval').hidden=true;
    if(live)awaitingResume=true;
  }
  if(event.type==='toggle-mic')void toggleMic().catch(()=>{});
  if(event.type==='mic-off'){settings.wakeWord=false;void invoke('settings',{wakeWord:false});void toggleMic(false);}
  if(event.type==='approval'){$('approval').hidden=false;$('approval-command').textContent=event.approval.command||event.approval.description||'Hermes bittet um Freigabe.';}
  if(event.type==='clarify'){
    $('clarify').hidden=false;$('questions').replaceChildren();
    for(const q of event.clarification.questions){const label=document.createElement('label');label.textContent=q.question+(q.choices?.length?' ('+q.choices.join(' / ')+')':'');const input=document.createElement('input');input.name=q.qid;input.required=true;input.maxLength=10000;label.append(input);$('questions').append(label);}
  }
});
let dragged=false,drag=null;
$('orb').addEventListener('pointerdown',event=>{drag={sx:event.screenX,sy:event.screenY,x:window.screenX,y:window.screenY};dragged=false;$('orb').setPointerCapture(event.pointerId);});
$('orb').addEventListener('pointermove',event=>{if(!drag)return;const dx=event.screenX-drag.sx,dy=event.screenY-drag.sy;if(Math.abs(dx)+Math.abs(dy)>5){dragged=true;void api.invoke('move',{x:drag.x+dx,y:drag.y+dy});}});
$('orb').addEventListener('pointerup',()=>{drag=null;if(!dragged){expanded=!expanded;document.body.classList.toggle('expanded',expanded);void invoke('expand',expanded);}});
$('collapse').onclick=()=>{expanded=false;document.body.classList.remove('expanded');void invoke('expand',false);};
$('mic').onclick=()=>void toggleMic();$('refresh').onclick=()=>void invoke('connect').catch(()=>{});$('login').onclick=()=>void invoke('login');
$('sessions').onchange=()=>{if($('sessions').value)void invoke('select',$('sessions').value).then(data=>{sessionInfo=data.session;settings=data.settings;renderState(data);void armWake();}).catch(()=>{});};
$('command').onsubmit=event=>{event.preventDefault();const text=$('text').value.trim();if(text)void invoke('submit',text).then(()=>{$('text').value='';}).catch(()=>{});};
$('stop').onclick=()=>{stopAudio();void toggleMic(false);void invoke('interrupt').catch(()=>{});};
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;$('settings').scrollIntoView({block:'nearest'});};
$('audition').onclick=()=>{context();void invoke('audition',{voice:$('voice').value,delivery:$('delivery').value});};
$('approve').onclick=()=>void invoke('settings',{approvalChoice:'once'}).then(()=>{$('approval').hidden=true;});$('deny').onclick=()=>void invoke('settings',{approvalChoice:'deny'}).then(()=>{$('approval').hidden=true;});
$('clarify').onsubmit=event=>{event.preventDefault();const answers=Object.fromEntries(new FormData($('clarify')));void invoke('answer',answers).then(()=>{$('clarify').hidden=true;}).catch(()=>{});};
$('save').onclick=async()=>{try{const values={url:$('url').value,voice:$('voice').value,delivery:$('delivery').value};for(const id of ['monitoring','proactive','speakAlerts','autoStart','wakeWord','bareNames'])values[id]=$(id).checked;const data=await invoke('settings',values);settings=data.settings;void armWake();notice('Einstellungen gespeichert.');}catch{}};
invoke('snapshot').then(data=>{settings=data.settings;sessionInfo=data.session;wakeReady=data.wakeReady;renderState(data);renderMetrics(data.sample);renderSessions(data.sessions);$('url').value=settings.url;$('voice').value=settings.voice;$('delivery').value=settings.delivery||'normal';for(const id of ['monitoring','proactive','speakAlerts','autoStart','wakeWord','bareNames'])$(id).checked=settings[id];void armWake();}).catch(()=>{});
setInterval(()=>{
  const speaking=!!audioContext&&audioContext.currentTime<speakingUntil;
  if(awaitingResume&&live&&!busy&&!capturing&&!transcribing&&!ttsPending&&!speaking){awaitingResume=false;startCapture();}
  const next=JSON.stringify({speaking,listening:(capturing&&speechStarted)||transcribing});if(next!==lastClientState){lastClientState=next;void api.invoke('client-state',JSON.parse(next)).catch(()=>{});}
},150);

// A projected Fibonacci sphere. Edges connect neighboring neurons; real audio drives radius and light.
const canvas=$('neural'),ctx=canvas.getContext('2d'),points=[],edges=[],N=130;
for(let i=0;i<N;i++){const y=1-2*(i+.5)/N,r=Math.sqrt(1-y*y),a=i*2.399963;points.push({x:Math.cos(a)*r,y,z:Math.sin(a)*r});}
for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){const a=points[i],b=points[j];if((a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2<.14)edges.push([i,j]);}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let lastDraw=0;
function draw(now){requestAnimationFrame(draw);if(now-lastDraw<33)return;lastDraw=now;
  let amplitude=0;const audio=contextWithoutCreating();
  if(audio){const active=audioNodes.find(node=>audio.currentTime>=node.start&&audio.currentTime<node.end);if(active){const values=new Uint8Array(128);active.analyser.getByteTimeDomainData(values);amplitude=Math.sqrt(values.reduce((sum,n)=>sum+((n-128)/128)**2,0)/128)*3;}else if(live&&micAnalyser){const values=new Uint8Array(micAnalyser.fftSize);micAnalyser.getByteTimeDomainData(values);amplitude=Math.sqrt(values.reduce((sum,n)=>sum+((n-128)/128)**2,0)/values.length)*4;}}
  level=.75*level+.25*Math.min(1,amplitude);const talking=audio&&audio.currentTime<speakingUntil;
  if(talking)$('phase').textContent=phases.speaking;else if(capturing)$('phase').textContent=phases.listening;else $('phase').textContent=phases[phase]||phase.toUpperCase();
  ctx.clearRect(0,0,400,400);const t=reduced?0:now*.00018,radius=119+level*19,color=phase==='approval'?'255,189,112':phase==='offline'?'92,139,147':'112,242,224';
  const glow=ctx.createRadialGradient(200,200,10,200,200,181);glow.addColorStop(0,`rgba(${color},${.06+level*.09})`);glow.addColorStop(.55,`rgba(${color},.018)`);glow.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=glow;ctx.fillRect(0,0,400,400);
  const p=points.map((v,i)=>{const a=t*.7,x=v.x*Math.cos(a)+v.z*Math.sin(a),z=-v.x*Math.sin(a)+v.z*Math.cos(a),y=v.y;const tilt=.25,sY=y*Math.cos(tilt)-z*Math.sin(tilt),sZ=y*Math.sin(tilt)+z*Math.cos(tilt),perspective=1/(1-sZ*.2);const pulse=reduced?1:1+Math.sin(now*.0015+i*.6)*.008+level*.015*Math.sin(i);return{x:200+x*radius*perspective*pulse,y:200+sY*radius*perspective*pulse,z:sZ};});
  ctx.lineWidth=.7;for(const [i,j]of edges){const a=p[i],b=p[j];ctx.strokeStyle=`rgba(${color},${.06+(a.z+b.z+2)/4*.21+level*.06})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  p.sort((a,b)=>a.z-b.z);for(const a of p){ctx.fillStyle=`rgba(${color},${.25+(a.z+1)*.33})`;ctx.shadowColor=`rgba(${color},.4)`;ctx.shadowBlur=a.z>.3?5:0;ctx.beginPath();ctx.arc(a.x,a.y,1+(a.z+1)*.65+level*.5,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;
  for(let ring=0;ring<2;ring++){ctx.strokeStyle=`rgba(${color},.12)`;ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(200,200,157+ring*10,151+ring*9,ring*.4,0,Math.PI*2);ctx.stroke();}
  ctx.strokeStyle=`rgba(${color},.7)`;ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(200,200,163,t*2,t*2+.22);ctx.stroke();
}
function contextWithoutCreating(){return audioContext;}
requestAnimationFrame(draw);
