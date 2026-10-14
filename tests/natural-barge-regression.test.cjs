'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function renderer(){
 const calls=[],elements=new Map(),handlers=[];
 const element=()=>({hidden:false,checked:false,value:'',options:[],children:[],dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},addEventListener(){},querySelector(){return {textContent:'',remove(){}};},getContext(){return {clearRect(){}};},scrollIntoView(){},replaceChildren(){},append(){}});
 const context=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,body:element(),documentElement:element()},navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};},async enumerateDevices(){return [];}}},matchMedia:()=>({matches:true}),requestAnimationFrame(){},setInterval(){},clearInterval(){},setTimeout,clearTimeout,performance:{timeOrigin:1000000,now:()=>2000},btoa,atob,
  AudioContext:class{constructor(){this.state='running';this.currentTime=0;this.sampleRate=48000;this.destination={};}createMediaStreamSource(){return {connect(){},disconnect(){}};}createAnalyser(){return {fftSize:256,connect(){},disconnect(){}};}createScriptProcessor(){return {connect(){},disconnect(){}};}createGain(){return {gain:{value:0},connect(){}};}createBuffer(channels,length,rate){return {duration:length/rate,getChannelData:()=>new Float32Array(length)};}createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}};}},hermes:{on(fn){handlers.push(fn);},invoke(method,value){calls.push({method,value});return method==='snapshot'?new Promise(()=>{}):Promise.resolve();}}});
 vm.runInContext('globalThis.window=globalThis;',context);
 for(const file of ['gesture-controller.js','gesture-loader.js','microphone.js','camera.js','voice-interaction.js','camera-controls.js','speech-activity.js','screen-capture.js','workstation.js','orb.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui',file),'utf8'),context,{filename:file});
 return {context,calls,event:event=>handlers.forEach(fn=>fn(event)),run:code=>vm.runInContext(code,context)};
}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
async function barge(r){
 r.run("settings={wakeWord:false,naturalConversation:true};sessionInfo={id:'selected'};gatewayConnected=true;vadReady=true;");await r.run('ensureMic()');r.run('live=true;busy=true;speakingUntil=10;audioGeneration=7;');
 r.context.input=new Float32Array(2048).fill(.08);for(let i=0;i<4;i++)r.run('micProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>input}});');
 const generation=r.calls.find(c=>c.method==='vad-reset').value;r.event({type:'vad-speech',generation});r.event({type:'vad-end',generation});await settle();
}
test('natural nonbackchannel barge stops the foreground turn and waits for its terminal acknowledgement',async()=>{
 const r=renderer();let terminal;
 r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='snapshot')return new Promise(()=>{});if(method==='transcribe')return Promise.resolve('Erkläre mir bitte den Regenbogen.');if(method==='interrupt')return new Promise(resolve=>terminal=resolve);return Promise.resolve();};
 await barge(r);const interrupt=r.calls.find(c=>c.method==='interrupt');assert.ok(interrupt);assert.notEqual(interrupt.value.conversationOnly,true,'A new conversational turn must request a terminal interruption, not only stop audio');
 assert.equal(r.run('speakingUntil'),0,'Old audio must stop before the remote terminal acknowledgement');assert.equal(r.calls.some(c=>c.method==='submit'),false);
 r.event({type:'audio-start',generation:7,turnId:'old'});r.event({type:'audio-chunk',generation:7,data:'AAAAAA=='});assert.equal(r.run('audioNodes.length'),0);
 r.run('busy=false;');terminal({ready:true});await settle();const submits=r.calls.filter(c=>c.method==='submit');assert.equal(submits.length,1);assert.equal(submits[0].value.sessionId,'selected');
});
test('natural barge cannot queue a replacement when the remote turn is still busy despite an accepted stop',async()=>{
 const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='snapshot')return new Promise(()=>{});if(method==='transcribe')return Promise.resolve('Eine neue Frage.');if(method==='interrupt')return Promise.resolve({ready:true});return Promise.resolve();};
 await barge(r);assert.equal(r.calls.some(c=>c.method==='submit'),false);assert.equal(r.run('live'),false);
});
test('natural barge discards its replacement on an unconfirmed stop',async()=>{
 const r=renderer();r.context.hermes.invoke=(method,value)=>{r.calls.push({method,value});if(method==='snapshot')return new Promise(()=>{});if(method==='transcribe')return Promise.resolve('Eine neue Frage.');if(method==='interrupt')return Promise.resolve({ready:false,unknown:true});return Promise.resolve();};
 await barge(r);assert.equal(r.calls.some(c=>c.method==='submit'),false);assert.equal(r.run('live'),false);
});
