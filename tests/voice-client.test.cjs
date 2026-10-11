const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {VoiceClient}=require('../voice-client.cjs');
test('consecutive sentences and styles use registered identities without redesigning the voice',async t=>{
  const packets=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const part of req)body+=part;
    packets.push({route:req.url,body:JSON.parse(body)});
    if(req.url==='/v1/audio/voices'){res.setHeader('Content-Type','application/json');res.end('{}');}
    else{res.setHeader('Content-Type','audio/pcm');res.end(Buffer.alloc(120));}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const registry=[{name:'hermes-dark-normal',spk_b64:'same-speaker',rvq_b64:'normal',ref_text:'Ich bin da.'},{name:'hermes-dark-whisper',spk_b64:'same-speaker',rvq_b64:'quiet',ref_text:'Ich bin da.'}];
  const client=new VoiceClient({url:`http://127.0.0.1:${server.address().port}`,registry});
  for(const [text,style] of [['Ich prüfe jetzt den ersten Auftrag für dich.','normal'],['Danach kümmere ich mich um deinen zweiten Auftrag.','normal'],['Ich spreche diesen vollständigen Satz jetzt leise.','whisper']]){
    const response=await client.speech(text,'dark',style);assert.equal((await response.arrayBuffer()).byteLength,120);
  }
  assert.equal(packets.filter(x=>x.route==='/v1/audio/voices').length,4);
  const speech=packets.filter(x=>x.route==='/v1/audio/speech').map(x=>x.body);
  assert.deepEqual(speech.map(x=>x.voice),['hermes-dark-normal','hermes-dark-normal','hermes-dark-whisper']);
  assert.ok(speech.every(x=>!x.instructions));
  await assert.rejects(client.speech('Hallo','unknown','normal'),/Stimme/);
});
test('an empty synthesis is retried with the same voice instead of silently dropping the sentence',async()=>{
  const attempts=[];
  const client=new VoiceClient({registry:[{name:'hermes-dark-normal',spk_b64:'fixed',rvq_b64:'fixed',ref_text:'Ich bin da.'}],fetcher:async(url,options)=>{
    if(url.endsWith('/voices'))return Response.json({});
    attempts.push(JSON.parse(options.body));
    return new Response(attempts.length===1?Buffer.alloc(0):Buffer.alloc(120));
  }});
  assert.equal((await (await client.speech('Ich bin hier und kümmere mich um deinen Auftrag.','dark')).arrayBuffer()).byteLength,120);
  assert.equal(attempts.length,2);assert.equal(attempts[0].voice,'hermes-dark-normal');assert.equal(attempts[1].voice,'hermes-dark-normal-speaker');
});
test('a very short reply uses the fixed speaker without a long ICL context',async()=>{
  let chosen;
  const client=new VoiceClient({registry:[{name:'hermes-dark-normal',spk_b64:'fixed',rvq_b64:'fixed',ref_text:'Ich bin da.'}],fetcher:async(url,options)=>{
    if(url.endsWith('/voices'))return Response.json({});
    chosen=JSON.parse(options.body).voice;return new Response(Buffer.alloc(120));
  }});
  await client.speech('Ja?','dark');assert.equal(chosen,'hermes-dark-normal-speaker');
});
