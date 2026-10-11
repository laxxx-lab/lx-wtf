const {test}=require('node:test');const assert=require('node:assert/strict');
const {Microphone}=require('../ui/microphone.js');
test('a permission grant after microphone-off stops its tracks',async()=>{
  let grant,stopped=false;
  const device=new Microphone(()=>new Promise(resolve=>{grant=resolve;}));
  const pending=device.get();device.release();grant({getTracks:()=>[{stop:()=>{stopped=true;}}]});
  assert.equal(await pending,null);assert.equal(stopped,true);assert.equal(device.stream,null);
});
test('microphone selection pins the requested input without falling back to a different Windows default',()=>{
 const {microphoneConstraints,validMicrophoneDeviceId}=require('../ui/microphone.js');
 assert.deepEqual(microphoneConstraints('').audio,{echoCancellation:true,noiseSuppression:true,autoGainControl:true});
 assert.deepEqual(microphoneConstraints('chosen-input').audio.deviceId,{exact:'chosen-input'});
 assert.equal(microphoneConstraints('communications').video,false);
 for(const id of [null,{},'x'.repeat(257),'bad\ninput','https://example.com']){assert.equal(validMicrophoneDeviceId(id),false);assert.throws(()=>microphoneConstraints(id));}
});
test('an ended microphone stream is released and reacquired instead of reported as active',async()=>{
 let calls=0,stops=0;const device=new Microphone(async()=>{calls++;return {getTracks:()=>[{readyState:calls===1?'ended':'live',stop:()=>stops++}]};});
 const first=await device.get(),second=await device.get();assert.notEqual(first,second);assert.equal(calls,2);assert.equal(stops,1);
});
test('concurrent microphone callers share the same acquisition and release',async()=>{
  let grant,calls=0;const stream={getTracks:()=>[]};
  const device=new Microphone(()=>{calls++;return new Promise(resolve=>{grant=resolve;});});
  const a=device.get(),b=device.get();grant(stream);
  assert.equal(await a,stream);assert.equal(await b,stream);assert.equal(calls,1);
});
