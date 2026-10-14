'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough,Writable}=require('node:stream');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {TurnDetector}=require('../turn-detector.cjs');

const audio=Buffer.alloc(16000).toString('base64');
function worker(respond){
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.killed=false;
  child.stdin=new Writable({write(data,_encoding,done){respond(JSON.parse(data),child);done();}});
  child.kill=()=>{child.killed=true;child.emit('exit',0);return true;};
  process.nextTick(()=>child.stdout.write(JSON.stringify({type:'ready',model:'turn-detector-v1-mini',threshold:0.245})+'\n'));
  return child;
}
function result(child,message,probability=0.7){child.stdout.write(JSON.stringify({type:'prediction',id:message.id,generation:message.generation,probability,elapsedMs:12})+'\n');}
test('uses calibrated German threshold and returns request identity without audio in snapshot',async()=>{
  let input;const detector=new TurnDetector({spawn:()=>worker((message,child)=>{input=message;result(child,message,0.3);})});
  await detector.start();const prediction=await detector.predict({audio,sampleRate:16000,generation:7,requestId:'turn-a'});
  assert.equal(prediction.available,true);assert.equal(prediction.complete,true);assert.equal(prediction.generation,7);assert.equal(prediction.requestId,'turn-a');assert.equal(input.sampleRate,16000);
  assert.equal(JSON.stringify(detector.snapshot()).includes(audio),false);detector.stop();
});
test('rejects malformed, oversized, odd PCM and invalid identities before sending to worker',async()=>{
  let calls=0;const detector=new TurnDetector({spawn:()=>worker(()=>calls++)});await detector.start();
  for(const value of [{audio:'???'},{audio:Buffer.alloc(3).toString('base64')},{audio:Buffer.alloc(960002).toString('base64')},{sampleRate:24000},{generation:-1},{generation:'2'},{requestId:'a'.repeat(129)}]){
    const prediction=await detector.predict({audio,sampleRate:16000,generation:1,...value});assert.equal(prediction.available,false);assert.equal(prediction.reason,'invalid-input');
  }
  assert.equal(calls,0);detector.stop();
});
test('missing or crashed model returns explicit Silero fallback',async()=>{
  const missing=new TurnDetector({spawn:()=>{throw Error('missing');}});assert.equal((await missing.start()).available,false);
  assert.equal((await missing.predict({audio,generation:1})).available,false);
  let child;const detector=new TurnDetector({spawn:()=>child=worker(()=>{})});await detector.start();const prediction=detector.predict({audio,generation:1});child.emit('exit',1);
  assert.equal((await prediction).reason,'worker-exit');assert.equal(detector.snapshot().available,false);detector.stop();
});
test('deadline kills stalled worker and never interprets a fallback as complete',async()=>{
  let child;const detector=new TurnDetector({deadlineMs:25,spawn:()=>child=worker(()=>{})});await detector.start();
  const prediction=await detector.predict({audio,generation:1});assert.equal(prediction.reason,'timeout');assert.equal(prediction.probability,null);assert.equal(prediction.complete,false);assert.equal(child.killed,true);detector.stop();
});
test('invalidation suppresses stale inference; queued requests do not grow',async()=>{
  let child,input;const detector=new TurnDetector({spawn:()=>child=worker(message=>input=message)});await detector.start();
  const first=detector.predict({audio,generation:3});assert.equal((await detector.predict({audio,generation:4})).reason,'busy');
  detector.invalidate();assert.equal((await first).reason,'invalidated');assert.equal((await detector.predict({audio,generation:4})).reason,'busy');
  result(child,input);const next=detector.predict({audio,generation:4});result(child,input,0.1);assert.equal((await next).complete,false);detector.stop();
});
test('wrong identity cannot resolve current request and invalid probability fails safely',async()=>{
  let child,input;const detector=new TurnDetector({spawn:()=>child=worker(message=>input=message)});await detector.start();
  const current=detector.predict({audio,generation:3});result(child,{...input,generation:2},1);result(child,{...input,id:'stale'},1);
  result(child,input,2);assert.equal((await current).reason,'invalid-result');detector.stop();
});
test('stop settles in-flight prediction and startup failure is bounded',async()=>{
  const detector=new TurnDetector({spawn:()=>worker(()=>{})});await detector.start();const current=detector.predict({audio,generation:1});detector.stop();assert.equal((await current).reason,'stopped');
  const cold=new TurnDetector({startupTimeoutMs:20,spawn:()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>true;return child;}});
  assert.equal((await cold.start()).reason,'startup-timeout');cold.stop();
});
test('native Windows model returns a bounded local probability when explicitly enabled',{
  skip:process.env.HERMES_TEST_LOCAL_TURN!=='1'
},async()=>{
  const setup=spawnSync('powershell.exe',['-NoProfile','-File',path.resolve(__dirname,'../scripts/setup-turn-detector.ps1'),'-CheckOnly'],{encoding:'utf8'});
  assert.equal(setup.status,0,setup.stderr);assert.equal(JSON.parse(setup.stdout).available,true);
  const detector=new TurnDetector();
  try{
    assert.equal((await detector.start()).available,true);
    const prediction=await detector.predict({audio:Buffer.alloc(960000).toString('base64'),generation:42,requestId:'synthetic-silence'});
    assert.equal(prediction.available,true);assert.ok(prediction.probability>=0&&prediction.probability<=1);assert.equal(prediction.generation,42);
  }finally{detector.stop();}
});
test('setup check does not download or create runtime when interpreter is missing',{skip:process.platform!=='win32'},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-turn-check-'));
  try{
    const check=spawnSync('powershell.exe',['-NoProfile','-File',path.resolve(__dirname,'../scripts/setup-turn-detector.ps1'),'-Root',root,'-CheckOnly'],{encoding:'utf8'});
    assert.notEqual(check.status,0);assert.match(check.stderr,/Turn-Detektor-Python fehlt/);assert.equal(fs.existsSync(path.join(root,'runtime')),false);
  }finally{fs.rmdirSync(root);}
});
