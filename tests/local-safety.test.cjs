const test=require('node:test'),assert=require('node:assert/strict');
const {LocalSafety}=require('../local-safety.cjs');

test('privacy closes the gate synchronously before asynchronous sensor shutdown',async()=>{
  let finish;
  const events=[];
  const safety=new LocalSafety({quiesce:()=>new Promise(resolve=>{finish=resolve;}),stop:()=>({remoteStop:'unavailable'}),onChange:value=>events.push(value)});
  const pending=safety.lock();
  assert.equal(safety.locked,true);
  assert.equal(safety.snapshot().reason,'privacy');
  assert.equal(events[0].locked,true);
  finish();
  assert.equal((await pending).locked,true);
});

test('a failed sensor shutdown keeps privacy locked and still stops output',async()=>{
  let stopped=false;
  const safety=new LocalSafety({quiesce:()=>{throw new Error('camera shutdown failed');},stop:()=>{stopped=true;return {remoteStop:'requested'};}});
  const result=await safety.lock();
  assert.equal(result.locked,true);
  assert.equal(stopped,true);
  assert.equal(result.remoteStop,'requested');
  assert.ok(result.errors.some(error=>error.includes('camera shutdown failed')));
});

test('repeated locks share shutdown and unlocking never restores sensors',async()=>{
  let finish,stops=0,quiesces=0;
  const safety=new LocalSafety({quiesce:()=>{quiesces++;return new Promise(resolve=>{finish=resolve;});},stop:()=>{stops++;}});
  const first=safety.lock(),second=safety.lock();
  assert.throws(()=>safety.unlock(),/noch|läuft|progress/i);
  finish();await Promise.all([first,second]);
  assert.equal(stops,1);assert.equal(quiesces,1);
  assert.equal(safety.unlock().locked,false);
  assert.equal(stops,1);assert.equal(quiesces,1);
});

test('emergency stop remains latched and does not imply remote process termination',async()=>{
  const safety=new LocalSafety({quiesce:()=>{},stop:()=>({remoteStop:'requested'})});
  const result=await safety.emergencyStop();
  assert.equal(result.locked,true);
  assert.equal(result.reason,'emergency');
  assert.equal(result.remoteStop,'requested');
  assert.equal(result.remoteProcessesStopped,false);
});

test('a failed remote interrupt is reported while local shutdown remains effective',async()=>{
  let sensorsOff=false;
  const safety=new LocalSafety({quiesce:()=>{sensorsOff=true;},stop:()=>{throw new Error('gateway offline');}});
  const result=await safety.emergencyStop();
  assert.equal(sensorsOff,true);
  assert.equal(result.locked,true);
  assert.equal(result.remoteStop,'failed');
  assert.equal(result.remoteProcessesStopped,false);
});

test('persisted privacy starts with the gate closed and can only be explicitly unlocked',()=>{
  let sensorCalls=0;
  const safety=new LocalSafety({initialLocked:true,quiesce:()=>{sensorCalls++;}});
  assert.equal(safety.snapshot().locked,true);
  assert.equal(safety.snapshot().reason,'privacy');
  assert.equal(sensorCalls,0);
  assert.equal(safety.unlock().locked,false);
  assert.equal(sensorCalls,0);
});

test('a failing status publisher cannot prevent local sensor and action shutdown',async()=>{
  let sensorsOff=false,outputOff=false;
  const safety=new LocalSafety({quiesce:()=>{sensorsOff=true;},stop:()=>{outputOff=true;},onChange:()=>{throw new Error('disk unavailable');}});
  const result=await safety.lock();
  assert.equal(sensorsOff,true);assert.equal(outputOff,true);assert.equal(result.locked,true);
  assert.ok(result.errors.some(error=>error.includes('disk unavailable')));
});

test('emergency stop retries the remote interruption while privacy remains latched',async()=>{
  let stops=0,quiesces=0;
  const safety=new LocalSafety({quiesce:()=>{quiesces++;},stop:()=>({remoteStop:++stops===1?'failed':'requested'})});
  assert.equal((await safety.lock()).remoteStop,'failed');
  const result=await safety.emergencyStop();
  assert.equal(stops,2);assert.equal(quiesces,1);
  assert.equal(result.locked,true);assert.equal(result.reason,'emergency');assert.equal(result.remoteStop,'requested');
});

test('a persisted privacy lock still permits a fresh bounded emergency interruption attempt',async()=>{
  let finish,stops=0;
  const safety=new LocalSafety({initialLocked:true,stop:()=>{stops++;return new Promise(resolve=>{finish=resolve;});}});
  const first=safety.emergencyStop(),second=safety.emergencyStop();
  assert.equal(safety.locked,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(stops,1);assert.throws(()=>safety.unlock(),/läuft noch/);
  finish({remoteStop:'requested'});const [a,b]=await Promise.all([first,second]);
  assert.equal(a.locked,true);assert.equal(b.remoteStop,'requested');
});
