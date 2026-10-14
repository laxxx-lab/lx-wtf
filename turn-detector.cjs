'use strict';
const path=require('node:path');
const {spawn}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const MAX_PCM_BYTES=16000*2*30;
// Calibrated v1-mini German threshold, LiveKit agents/inference/eot/languages.py.
const GERMAN_THRESHOLD=0.245;

class TurnDetector{
  constructor({root=__dirname,pythonPath,deadlineMs=500,startupTimeoutMs=20000,threshold=GERMAN_THRESHOLD,spawn:spawnWorker=spawn}={}){
    this.root=root;this.pythonPath=pythonPath||path.join(root,'runtime/voice/venv/Scripts/python.exe');this.spawn=spawnWorker;
    this.deadlineMs=Math.max(10,Math.min(2000,Number(deadlineMs)||500));this.startupTimeoutMs=Math.max(10,Math.min(30000,Number(startupTimeoutMs)||20000));
    this.threshold=Number.isFinite(threshold)&&threshold>=0&&threshold<=1?threshold:GERMAN_THRESHOLD;
    this.child=null;this.available=false;this.reason='not-started';this.pending=null;this.sequence=0;this.lastElapsedMs=null;this.starting=null;this.readyResolve=null;
  }
  snapshot(){return {available:this.available,model:'turn-detector-v1-mini',backend:'livekit-local-inference',language:'de',threshold:this.threshold,pending:!!this.pending,elapsedMs:this.lastElapsedMs,reason:this.available?null:this.reason};}
  start(){
    if(this.available)return Promise.resolve(this.snapshot());if(this.starting)return this.starting;
    this.starting=new Promise(resolve=>{this.readyResolve=resolve;});
    const starting=this.starting;this.reason='starting';
    this.startupTimer=setTimeout(()=>this._fail('startup-timeout'),this.startupTimeoutMs);
    try{
      const child=this.spawn(this.pythonPath,['-u',path.join(this.root,'scripts/turn_detector.py'),'--packages',path.join(this.root,'runtime/turn/python')],{cwd:this.root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
      this.child=child;let buffer='';
      child.stdout.on('data',chunk=>{
        if(this.child!==child)return;buffer+=chunk.toString('utf8');
        if(buffer.length>4096){this._fail('invalid-result');return;}
        let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);try{this._message(JSON.parse(line));}catch{this._fail('invalid-result');return;}}
      });
      // Drain without retaining private diagnostics or forwarding exception text.
      child.stderr.on('data',()=>{});child.on('error',()=>{if(this.child===child)this._fail('worker-error');});
      child.stdin.on('error',()=>{if(this.child===child)this._fail('worker-error');});
      child.on('exit',()=>{if(this.child===child)this._fail('worker-exit');});
    }catch{this._fail('worker-unavailable');}
    return starting;
  }
  _started(){clearTimeout(this.startupTimer);const resolve=this.readyResolve;this.readyResolve=null;this.starting=null;resolve?.(this.snapshot());}
  _message(message){
    if(message.type==='ready'&&!this.available){this.available=true;this.reason=null;this._started();return;}
    if(message.type==='unavailable'){this._fail('model-unavailable');return;}
    const pending=this.pending;
    if(message.type!=='prediction'||!pending||message.id!==pending.id||message.generation!==pending.generation)return;
    const probability=message.probability;
    if(!Number.isFinite(probability)||probability<0||probability>1){this._settle(pending,this._fallback(pending,'invalid-result'));return;}
    this.lastElapsedMs=Math.round(performance.now()-pending.started);
    this._settle(pending,{available:true,probability,complete:probability>=this.threshold,elapsedMs:this.lastElapsedMs,generation:pending.generation,requestId:pending.requestId});
  }
  _fallback(value,reason){return {available:false,probability:null,complete:false,elapsedMs:value.started===undefined?0:Math.round(performance.now()-value.started),generation:value.generation,requestId:value.requestId,reason};}
  predict(value={}){
    const {audio,sampleRate=16000,generation,requestId}=value||{};
    const identity={generation,requestId};
    if(sampleRate!==16000||!Number.isSafeInteger(generation)||generation<0||requestId!==undefined&&(typeof requestId!=='string'||!requestId.length||requestId.length>128)||typeof audio!=='string'||!audio.length||audio.length>Math.ceil(MAX_PCM_BYTES/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audio))return Promise.resolve(this._fallback(identity,'invalid-input'));
    const bytes=Buffer.from(audio,'base64');
    if(bytes.length<2||bytes.length>MAX_PCM_BYTES||bytes.length%2||bytes.toString('base64')!==audio)return Promise.resolve(this._fallback(identity,'invalid-input'));
    if(!this.available||!this.child?.stdin.writable)return Promise.resolve(this._fallback(identity,this.reason||'unavailable'));
    if(this.pending)return Promise.resolve(this._fallback(identity,'busy'));
    const id=String(++this.sequence);
    return new Promise(resolve=>{
      const pending={...identity,requestId:requestId||id,id,resolve,started:performance.now(),settled:false};this.pending=pending;
      pending.timer=setTimeout(()=>this._fail('timeout'),this.deadlineMs);
      try{this.child.stdin.write(JSON.stringify({id,generation,sampleRate,audio})+'\n');}catch{this._fail('worker-error');}
    });
  }
  _settle(pending,result){clearTimeout(pending.timer);if(this.pending===pending)this.pending=null;if(!pending.settled){pending.settled=true;pending.resolve(result);}}
  invalidate(){
    const pending=this.pending;
    // Keep the slot occupied until the old native call finishes, preventing an unbounded queue.
    if(pending&&!pending.settled){pending.settled=true;pending.resolve(this._fallback(pending,'invalidated'));}
  }
  _fail(reason){
    this.available=false;this.reason=reason;const child=this.child;this.child=null;
    if(this.pending)this._settle(this.pending,this._fallback(this.pending,reason));this._started();
    try{child?.stdin.end();child?.kill();}catch{}
  }
  stop(){this._fail('stopped');}
}
module.exports={TurnDetector,MAX_PCM_BYTES,GERMAN_THRESHOLD};
