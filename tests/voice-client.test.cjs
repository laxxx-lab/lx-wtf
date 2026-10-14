const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {VoiceClient}=require('../voice-client.cjs');

test('voice selection lists installed identities and their actual styles without exposing reference data',()=>{
 const client=new VoiceClient({registry:[
  {name:'hermes-dark-normal',spk_b64:'private',ref_text:'private'},
  {name:'hermes-dark-whisper',spk_b64:'private'},
  {name:'hermes-reference-old-normal',display_name:'Bisherige Lilith-Stimme',spk_b64:'private'},
  {name:'hermes-lilith-studio-normal',display_name:'Lilith · Studio',rvq_b64:'private'},
  {name:'hermes-dark-normal-speaker'},
  {name:'bad-name'}
 ]});
 assert.deepEqual(client.profiles,[
  {id:'dark',label:'Samtig & kraftvoll',deliveries:['normal','whisper']},
  {id:'reference-old',label:'Bisherige Lilith-Stimme',deliveries:['normal']},
  {id:'lilith-studio',label:'Lilith · Studio',deliveries:['normal']}
 ]);
 assert.doesNotMatch(JSON.stringify(client.profiles),/private|spk_b64|rvq_b64|ref_text/);
});
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

test('a requested whisper keeps its style reference even for short replies and cannot fall back to normal speech',async()=>{
 const choices=[];let empty=false;
 const client=new VoiceClient({registry:[{name:'hermes-lilith-studio-whisper',spk_b64:'same-studio-speaker',rvq_b64:'whisper-style',ref_text:'Leise und verständlich.'}],fetcher:async(url,options)=>{
  if(url.endsWith('/voices'))return Response.json({});choices.push(JSON.parse(options.body).voice);return new Response(empty?Buffer.alloc(0):Buffer.alloc(120));
 }});
 await client.speech('Ich bin hier.','lilith-studio','whisper');assert.deepEqual(choices,['hermes-lilith-studio-whisper']);
 empty=true;await assert.rejects(client.speech('Ja?','lilith-studio','whisper'),/kein Audio/);assert.ok(choices.every(name=>name==='hermes-lilith-studio-whisper'));
});

test('German synthesis receives English wakeword pronunciation only for whole terms',async()=>{
 const packets=[],registry=[{name:'hermes-dark-normal',spk_b64:'fixed',rvq_b64:'fixed',ref_text:'Wakeword bleibt im Referenztext.'}];
 const client=new VoiceClient({registry,fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);packets.push({url,body});return url.endsWith('/voices')?Response.json({}):new Response(Buffer.alloc(120));
 }});
 for(const [text,want] of [
  ['Wakeword, wakewords, WAKE-WORD und Wake-Words.','Weik Wörd, Weik Wörds, Weik Wörd und Weik Wörds.'],
  ['Wakewordkennung, Vorwakewords, Wakewordä, Wakeword\u0301, _Wakeword, Wakeword2.','Wakewordkennung, Vorwakewords, Wakewordä, Wakeword\u0301, _Wakeword, Wakeword2.'],
  ['„Wakeword“: Hey Lilith bleibt dein Aktivierungswort.','„Weik Wörd“: Hey Lilith bleibt dein Aktivierungswort.']
 ]){
  await client.speech(text,'dark');const speech=packets.at(-1).body;assert.equal(speech.input,want);assert.equal(speech.language,'German');assert.equal(speech.voice,'hermes-dark-normal');
 }
 assert.equal(packets.find(packet=>packet.url.endsWith('/voices')).body.ref_text,registry[0].ref_text);
});
