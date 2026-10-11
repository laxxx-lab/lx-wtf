const test=require('node:test'),assert=require('node:assert/strict');
const {ScreenCapture}=require('../ui/screen-capture.js');
function fixture(getUserMedia){const tracks=[{stopped:false,stop(){this.stopped=true;}}],stream={getTracks:()=>tracks},video={readyState:2,videoWidth:1920,videoHeight:1080,srcObject:null,async play(){}};
  const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/aGVsbG8='};
  const capture=new ScreenCapture({getUserMedia:getUserMedia||(async()=>stream),video,canvas});return {capture,stream,tracks,canvas};}
test('one selected desktop source is captured without audio and tracks stop immediately after the frame',async()=>{
  let constraints;const f=fixture(async value=>{constraints=value;return f.stream;});const frame=await f.capture.capture('window:123:0');
  assert.equal(constraints.audio,false);assert.equal(constraints.video.mandatory.chromeMediaSourceId,'window:123:0');
  assert.equal(frame.sourceId,'window:123:0');assert.equal(frame.image,'/9j/aGVsbG8=');assert.ok(frame.capturedAt);assert.equal(f.tracks[0].stopped,true);assert.equal(f.canvas.width,1440);
});
test('a cancelled capture stops a late permission grant and never publishes its screenshot',async()=>{
  let resolve;const f=fixture(()=>new Promise(done=>resolve=done));const pending=f.capture.capture('screen:0:0');f.capture.cancel();resolve(f.stream);
  await assert.rejects(pending,/abgebrochen/);assert.equal(f.tracks[0].stopped,true);
});

test('cancellation releases a pending permission request without waiting for the grant',async()=>{
  const f=fixture(()=>new Promise(()=>{}));const pending=f.capture.capture('screen:0:0');f.capture.cancel();await assert.rejects(pending,/abgebrochen/);assert.equal(f.capture.pending,false);
});
