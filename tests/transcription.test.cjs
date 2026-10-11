const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {transcribeAudio}=require('../transcription.cjs');
function wav(signal){
  const b=Buffer.alloc(44+16000*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);
  for(let i=0;i<16000;i++)b.writeInt16LE(signal?Math.round(Math.sin(i*.08)*4000):0,44+i*2);
  return b;
}
test('silence is discarded before a hallucinating recognizer can submit thank-you',async()=>{
  let called=false;
  const text=await transcribeAudio(wav(false),{fetcher:async()=>{called=true;return Response.json({text:'Vielen Dank.'});}});
  assert.equal(text,'');assert.equal(called,false);
});
test('speech requests use neural VAD and preserve a genuinely spoken thank-you',async t=>{
  let payload='';
  const server=http.createServer(async(req,res)=>{
    for await(const part of req)payload+=part.toString();
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({text:' Vielen Dank. ',segments:[{text:' Vielen Dank.',avg_logprob:-.2,no_speech_prob:.01}]}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  assert.equal(await transcribeAudio(wav(true),{url:`http://127.0.0.1:${server.address().port}/inference`}), 'Vielen Dank.');
  assert.match(payload,/name="vad"\r\n\r\ntrue/);
  assert.match(payload,/verbose_json/);
  assert.ok(/name="no_language_probabilities"\r\n\r\ntrue/.test(payload),'Empty VAD results must not enter unsafe language detection');
});
test('noise without speech and unreliable segments do not become commands',async()=>{
  for(const result of [{text:'',segments:[]},{text:'Amen.',segments:[{text:'Amen.',avg_logprob:-1.5,no_speech_prob:.01}]}]){
    assert.equal(await transcribeAudio(wav(true),{fetcher:async()=>Response.json(result)}),'');
  }
});
