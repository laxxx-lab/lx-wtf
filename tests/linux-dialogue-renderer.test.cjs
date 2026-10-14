'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const audio=require('../ui/linux-audio.js'),microphone=require('../ui/microphone.js');
const flush=async()=>{for(let n=0;n<5;n++)await new Promise(resolve=>setImmediate(resolve));};
function fixture({failMic=false,delayedMic=false}={}){
 const elements=new Map(),calls=[],processors=[],players=[],gains=[];let callback,opens=0,resolveMic;
 function element(){const classes=new Set();return {dataset:{},value:'',children:[],classList:{contains:x=>classes.has(x),add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,on){on??=!classes.has(x);on?classes.add(x):classes.delete(x);}},setAttribute(){},replaceChildren(){this.children=[];},add(){},append(){},querySelector(){return null;},querySelectorAll(){return [];},focus(){}};}
 const $=id=>{if(!elements.has(id)){const node=element();node.click=function(){return this.handlers?.click?.({});};node.addEventListener=function(type,fn){(this.handlers||={})[type]=fn;};elements.set(id,node);}return elements.get(id);};
 let state={connected:true,canSubmit:true,generation:7,status:'ready',session:{id:'runtime',storedId:'stored',profile:'default'},settings:{},sttReady:true,voiceReady:true,busy:false,handoff:{available:true}};
 class Context{constructor(){this.sampleRate=48000;this.state='running';this.currentTime=0;this.destination={};}createGain(){const gain={gain:{value:1},connect(){}};gains.push(gain);return gain;}createMediaStreamSource(){return {connect(){},disconnect(){}};}createScriptProcessor(){const p={connect(){},disconnect(){}};processors.push(p);return p;}createBuffer(_channels,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}createBufferSource(){const n={connect(){},disconnect(){},stop(){this.stopped=true;},start(){}};players.push(n);return n;}async resume(){}}
 const track={readyState:'live',stop(){},addEventListener(type,fn){this[type]=fn;}},stream={getTracks:()=>[track]};
 const context=vm.createContext({window:{LinuxAudio:audio,VoiceInteraction:require('../ui/voice-interaction.js'),HermesOrb:{...require('../ui/orb.js'),OrbRenderer:class{},orbState:()=>''},lilith:{on(fn){callback=fn;},async invoke(method,value){calls.push({method,value});if(method==='snapshot')return state;if(method==='wake-resume'){state={...state,standby:{active:false}};return state;}if(method==='transcribe')return 'Ein wirklicher Sprachzug';if(method==='submit')return {ok:true};return {};}},addEventListener(){}},document:{body:element(),getElementById:$,createElement:element},navigator:{mediaDevices:{enumerateDevices:async()=>[],getUserMedia:async()=>{opens++;if(failMic)throw Error('Mikrofon verweigert');if(delayedMic)return new Promise(resolve=>resolveMic=()=>resolve(stream));return stream;}}},...microphone,AudioContext:Context,Option:class{},matchMedia:()=>({matches:false}),requestAnimationFrame(){},Uint8Array,Float32Array,DataView,Set,console,atob:x=>Buffer.from(x,'base64').toString('binary'),btoa:x=>Buffer.from(x,'binary').toString('base64')});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/linux.js'),'utf8'),context);
 return {context,$,calls,processors,players,gains,track,get opens(){return opens;},releaseMic:()=>resolveMic?.(),event:event=>callback(event),state:patch=>{state={...state,...patch};callback({type:'state',snapshot:state});},listen:()=>callback({type:'handoff-listen',sessionId:'runtime',storedSessionId:'stored',profile:'default',generation:7}),ready:()=>callback({type:'handoff-listen-ready',sessionId:'runtime',storedSessionId:'stored',profile:'default',generation:7}),pcm(amplitude,count){for(let i=0;i<count;i++)processors.at(-1).onaudioprocess?.({inputBuffer:{getChannelData:()=>Float32Array.from({length:4096},(_,at)=>Math.sin(at*.1)*amplitude)},outputBuffer:{getChannelData:()=>new Float32Array(4096)}});}};
}
async function answering(f){await flush();f.listen();f.ready();await flush();f.state({busy:true});f.event({type:'audio-queued',generation:2});f.event({type:'audio-start',generation:2});f.event({type:'audio-chunk',generation:2,data:Buffer.alloc(4800,1).toString('base64')});await flush();}
test('Linux live barge listens during a reply and waits for confirmed terminal before replacement',async()=>{
 const f=fixture();let terminal;const original=f.context.window.lilith.invoke;
 f.context.window.lilith.invoke=(method,value)=>{if(method==='interrupt'){f.calls.push({method,value});return new Promise(resolve=>terminal=resolve);}return original(method,value);};
 await answering(f);f.pcm(.1,6);f.pcm(0,10);await flush();assert.equal(f.calls.filter(c=>c.method==='transcribe').length,1);assert.equal(f.calls.find(c=>c.method==='transcribe').value.bargeIn,true);
 assert.equal(f.calls.filter(c=>c.method==='interrupt').length,1);assert.equal(f.calls.some(c=>c.method==='submit'),false);assert.equal(f.players[0].stopped,true);
 f.event({type:'audio-start',generation:2});f.event({type:'audio-chunk',generation:2,data:'AAAAAA=='});await flush();assert.equal(f.players.length,1);
 f.state({busy:false});terminal({ready:true,busy:false,generation:7});await flush();assert.equal(f.calls.filter(c=>c.method==='submit').length,1);assert.equal(f.calls.find(c=>c.method==='submit').value.captured.generation,7);
});
test('Linux live mhm restores ducked reply without stopping its job',async()=>{
 const f=fixture(),original=f.context.window.lilith.invoke;f.context.window.lilith.invoke=(method,value)=>method==='transcribe'?(f.calls.push({method,value}),Promise.resolve('Mhm.')):original(method,value);
 await answering(f);f.pcm(.1,6);assert.equal(f.gains[0].gain.value,.18);f.pcm(0,10);await flush();assert.equal(f.gains[0].gain.value,1);assert.equal(f.calls.some(c=>c.method==='interrupt'||c.method==='submit'),false);assert.notEqual(f.players[0].stopped,true);
});
test('Linux low playback residual and a short click never transcribe or stop foreground work',async()=>{
 const f=fixture();await answering(f);f.pcm(.02,20);f.pcm(.1,1);f.pcm(0,10);await flush();assert.equal(f.calls.some(c=>['transcribe','interrupt','submit'].includes(c.method)),false);assert.equal(f.gains[0].gain.value,1);assert.notEqual(f.players[0].stopped,true);
});
test('Linux unconfirmed barge stop cannot dispatch or silently reopen live',async()=>{
 const f=fixture(),original=f.context.window.lilith.invoke;f.context.window.lilith.invoke=(method,value)=>method==='interrupt'?(f.calls.push({method,value}),Promise.resolve({ready:false,busy:true})):original(method,value);
 await answering(f);f.pcm(.1,6);f.pcm(0,10);await flush();assert.equal(f.calls.filter(c=>c.method==='interrupt').length,1);assert.equal(f.calls.some(c=>c.method==='submit'),false);assert.equal(f.$('record').textContent,'● Sprechen');
});
test('Linux privacy during barge stop discards the delayed replacement',async()=>{
 const f=fixture();let terminal;const original=f.context.window.lilith.invoke;f.context.window.lilith.invoke=(method,value)=>method==='interrupt'?new Promise(resolve=>terminal=resolve):original(method,value);
 await answering(f);f.pcm(.1,6);f.pcm(0,10);await flush();assert.equal(typeof terminal,'function');f.state({privacyLocked:true,generation:8});terminal({ready:true,busy:false,generation:7});await flush();assert.equal(f.calls.some(c=>c.method==='submit'),false);
});
test('handoff waits for greeting PCM playback to drain, then live idle remains available for transfer',async()=>{
 const f=fixture();await flush();f.listen();f.event({type:'audio-queued',generation:0});f.event({type:'audio-start',generation:0});f.event({type:'audio-chunk',generation:0,data:Buffer.from([0,100,0,100]).toString('base64')});f.event({type:'audio-end',generation:0});f.event({type:'audio-idle',generation:0});f.ready();await flush();assert.equal(f.opens,0);assert.equal(f.players.length,1);f.players[0].onended();await flush();assert.equal(f.opens,1);assert.equal(f.calls.filter(x=>x.method==='input-state').at(-1).value.capturing,false);assert.equal(f.$('record').textContent,'■ Gespräch pausieren');
 f.pcm(0,1500);await flush();assert.equal(f.calls.some(x=>x.method==='transcribe'),false);
});

test('Linux standby stops real renderer tracks and an explicit orb click resumes live without opening the panel',async()=>{
 const f=fixture();let stops=0;f.track.stop=()=>stops++;await flush();f.listen();f.ready();await flush();assert.equal(f.opens,1);
 f.event({type:'standby-state',active:true,generation:8});f.state({standby:{active:true},generation:8});await flush();assert.ok(stops>0);assert.equal(f.$('phase').textContent,'Standby');assert.equal(f.$('record').textContent,'● Aufwachen');f.ready();await flush();assert.equal(f.opens,1);
 f.$('orb-toggle').click();await flush();assert.equal(f.calls.filter(x=>x.method==='wake-resume').length,1);assert.equal(f.opens,2);assert.equal(f.$('record').textContent,'■ Gespräch pausieren');assert.equal(f.calls.some(x=>x.method==='panel'),false);
});

test('Linux standby fences a late microphone permission and never starts capture from stale handoff readiness',async()=>{
 const f=fixture({delayedMic:true});await flush();f.listen();f.ready();await flush();assert.equal(f.opens,1);f.event({type:'standby-state',active:true,generation:8});f.state({standby:{active:true},generation:8});f.releaseMic();f.ready();await flush();assert.equal(f.processors.length,0);assert.equal(f.opens,1);
});

test('a stopped Linux wake request cannot reopen live from its late IPC reply',async()=>{
 const f=fixture();await flush();f.state({standby:{active:true}});let release;const original=f.context.window.lilith.invoke;
 f.context.window.lilith.invoke=(method,value)=>method==='wake-resume'?new Promise(resolve=>release=async()=>resolve(await original(method,value))):original(method,value);
 f.$('orb-toggle').click();await flush();f.$('stop').click();release();await flush();assert.equal(f.opens,0);
});

test('Linux renderer shows transcription then thinking continuously until the submitted turn is accepted',async()=>{
 const f=fixture();await flush();let finishStt,finishSubmit;const original=f.context.window.lilith.invoke;
 f.context.window.lilith.invoke=(method,value)=>method==='transcribe'?new Promise(resolve=>finishStt=()=>resolve('Ein Auftrag')):method==='submit'?new Promise(resolve=>finishSubmit=()=>resolve({ok:true})):original(method,value);
 f.$('record').click();await flush();f.$('record').click();await flush();assert.equal(f.$('phase').textContent,'Ich höre genauer hin.');finishStt();await flush();assert.equal(f.$('phase').textContent,'Ich denke nach.');f.state({status:'thinking',busy:true});finishSubmit();await flush();assert.equal(f.$('phase').textContent,'Ich denke nach.');
});
test('live captures one utterance then keeps its microphone available across model and TTS playback',async()=>{
 const f=fixture();await flush();f.listen();f.ready();await flush();f.pcm(0,5);f.pcm(.1,6);assert.equal(f.calls.filter(x=>x.method==='input-state').at(-1).value.capturing,true);f.pcm(0,10);await flush();assert.equal(f.calls.filter(x=>x.method==='transcribe').length,1);assert.equal(f.calls.filter(x=>x.method==='submit').length,1);
 f.state({busy:true});await flush();const before=f.opens;f.event({type:'audio-queued',generation:1});f.event({type:'audio-start',generation:1});f.event({type:'audio-chunk',generation:1,data:Buffer.from([0,100]).toString('base64')});await flush();f.state({busy:false});f.event({type:'audio-end',generation:1});f.event({type:'audio-idle',generation:1});await flush();assert.equal(f.opens,before);f.players.at(-1).onended();await flush();assert.equal(f.opens,before);assert.equal(f.calls.filter(c=>c.method==='input-state').at(-1).value.microphoneOpen,true);
});
test('manual pause, stop, owner/privacy/identity changes and late permission never reopen live',async()=>{
 for(const cancel of [f=>f.$('record').click(),f=>f.$('stop').click(),f=>f.$('privacy').click(),f=>f.state({canSubmit:false}),f=>f.state({privacyLocked:true}),f=>f.state({connected:false}),f=>f.state({generation:8}),f=>f.state({session:{id:'runtime',storedId:'stored',profile:'other'}})]){
  const f=fixture();await flush();f.listen();cancel(f);f.ready();f.state({busy:false});await flush();assert.equal(f.opens,0);
 }
 const f=fixture({delayedMic:true});await flush();f.listen();f.ready();await flush();assert.equal(f.opens,1);f.$('stop').click();f.releaseMic();await flush();assert.equal(f.processors.length,0);assert.equal(f.opens,1);
});
test('busy greeting waits for completion, then established live stays armed across queued TTS gaps',async()=>{
 const f=fixture();await flush();f.listen();f.state({busy:true});f.ready();await flush();assert.equal(f.opens,0);f.state({busy:false});await flush();assert.equal(f.opens,1);
 f.event({type:'audio-queued',generation:2});f.event({type:'audio-start',generation:2});f.event({type:'audio-end',generation:2});await flush();assert.equal(f.opens,1);f.state({busy:false});await flush();assert.equal(f.opens,1);f.event({type:'audio-idle',generation:2});await flush();assert.equal(f.opens,1);assert.equal(f.calls.filter(c=>c.method==='input-state').at(-1).value.microphoneOpen,true);
});
test('a duplicate handoff notification after manual pause cannot reopen the microphone',async()=>{
 const f=fixture();await flush();f.listen();f.ready();await flush();assert.equal(f.opens,1);f.$('record').click();f.listen();f.ready();await flush();assert.equal(f.opens,1);
});
test('microphone refusal is visible without retries, and a stale handoff event cannot start capture',async()=>{
 const f=fixture({failMic:true});await flush();f.listen();f.ready();await flush();assert.equal(f.opens,1);assert.match(f.$('notice').textContent,/Mikrofon verweigert/);f.state({busy:false});f.ready();await flush();assert.equal(f.opens,1);
 const stale=fixture();await flush();stale.event({type:'handoff-listen',sessionId:'runtime',storedSessionId:'stored',profile:'other',generation:7});stale.ready();await flush();assert.equal(stale.opens,0);
});
test('a disconnected microphone cancels live visibly and never retries its handoff',async()=>{
 const f=fixture();await flush();f.listen();f.ready();await flush();assert.equal(f.opens,1);assert.equal(typeof f.track.ended,'function');f.track.ended();f.state({busy:false});f.listen();f.ready();await flush();assert.equal(f.opens,1);assert.match(f.$('notice').textContent,/Mikrofon.*getrennt/);assert.equal(f.$('record').textContent,'● Sprechen');
});
test('manual push recording still transcribes and submits only when pressed again',async()=>{
 const f=fixture();await flush();f.$('record').click();await flush();f.pcm(.1,6);f.pcm(0,10);await flush();assert.equal(f.calls.some(x=>x.method==='transcribe'),false);f.$('record').click();await flush();assert.equal(f.calls.filter(x=>x.method==='submit').length,1);
});
test('PCM endpoint ignores silence/clicks, preserves preroll and bounds each utterance',()=>{
 assert.equal(typeof audio.SpeechSegmenter,'function');const segment=new audio.SpeechSegmenter();const silence=new Float32Array(1600),speech=Float32Array.from({length:1600},(_,i)=>Math.sin(i*.1)*.1);
 for(let i=0;i<1500;i++)assert.equal(segment.push(silence),null);assert.equal(segment.active,false);segment.push(speech);for(let i=0;i<10;i++)assert.equal(segment.push(silence),null);assert.equal(segment.active,false);
 segment.push(silence);for(let i=0;i<5;i++)assert.equal(segment.push(speech),null);let result;for(let i=0;i<10&&!result;i++)result=segment.push(silence);assert.ok(result);const wav=Buffer.from(audio.wavBytes(result));assert.ok(wav.length>44+speech.length*2*5);assert.equal(require('../transcription.cjs').hasAudioSignal(wav),true);assert.ok(result.reduce((n,c)=>n+c.length,0)<=16000*2);
 let bounded=null;for(let i=0;i<1200&&!bounded;i++)bounded=segment.push(speech);assert.ok(bounded,'Continuous voiced input must have a finite segment limit');assert.equal(bounded.reduce((n,c)=>n+c.length,0),16000*120);
});
