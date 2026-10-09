const {test}=require('node:test');const assert=require('node:assert/strict');
const {Microphone}=require('../ui/microphone.js');
test('a permission grant after microphone-off stops its tracks',async()=>{
  let grant,stopped=false;
  const device=new Microphone(()=>new Promise(resolve=>{grant=resolve;}));
  const pending=device.get();device.release();grant({getTracks:()=>[{stop:()=>{stopped=true;}}]});
  assert.equal(await pending,null);assert.equal(stopped,true);assert.equal(device.stream,null);
});
test('concurrent microphone callers share the same acquisition and release',async()=>{
  let grant,calls=0;const stream={getTracks:()=>[]};
  const device=new Microphone(()=>{calls++;return new Promise(resolve=>{grant=resolve;});});
  const a=device.get(),b=device.get();grant(stream);
  assert.equal(await a,stream);assert.equal(await b,stream);assert.equal(calls,1);
});
