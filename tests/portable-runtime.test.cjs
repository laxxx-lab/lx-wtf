const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runtime=()=>require('../portable-runtime.cjs');
test('portable choices select independent engines and leave native installs intact',()=>{
 const root=path.join(os.tmpdir(),'hermes voice test'),legacy=[{name:'voice',exe:'native-voice'},{name:'stt',exe:'native-stt'},{name:'live',exe:'native-chat'}];
 assert.deepEqual(runtime().selectEngineSpecs(root,'win32',legacy,null),legacy);
 const selected=runtime().selectEngineSpecs(root,'win32',legacy,{stt:'base',tts:'none',language:'de'});
 assert.deepEqual(selected.map(x=>x.name),['stt','live']);assert.match(selected[0].exe,/runtime.public.venv.Scripts.python.exe$/);assert.equal(selected[0].args.includes('127.0.0.1'),false);assert.ok(selected[0].args.includes('8871'));assert.match(selected[0].readyFile,/whisper-base.model.bin$/);
 const mixed=runtime().selectEngineSpecs(root,'linux',legacy,{stt:'none',tts:'existing',language:'de'});assert.deepEqual(mixed,[legacy[0],legacy[2]]);
 assert.equal(runtime().selectEngineSpecs(root,'darwin',legacy,{stt:'small',tts:'none',language:'en'})[0].exe,path.join(root,'runtime/public/venv/bin/python'));
});
test('portable voice uses its public profile, handles abort and sends existing PCM protocol',async()=>{
 let sent;const client=runtime().createPortableVoiceClient({tts:'de_DE-thorsten-medium'},async(url,options)=>{sent={url,body:JSON.parse(options.body),signal:options.signal};return new Response(new Uint8Array([1,0,2,0]),{headers:{'Content-Type':'application/octet-stream'}});});
 assert.deepEqual(client.profiles,[{id:'piper',label:'Piper · Thorsten',deliveries:['normal']}]);
 const control=new AbortController();const r=await client.speech('Hallo','piper','normal',control.signal);assert.equal(r.ok,true);assert.equal((await r.arrayBuffer()).byteLength,4);assert.equal(sent.url,'http://127.0.0.1:8870/v1/audio/speech');assert.equal(sent.body.input,'Hallo');assert.equal(sent.body.response_format,'pcm');assert.equal(sent.signal,control.signal);await assert.rejects(client.speech('Test','piper','whisper'),/Sprechweise/);
 control.abort();await assert.rejects(client.speech('Test','piper','normal',control.signal));assert.equal(runtime().createPortableVoiceClient({tts:'none'}),null);
});
test('installation selection is read from local metadata without discovering private voices',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-install-choice-'));try{assert.equal(runtime().readPortableInstallation(root),null);fs.mkdirSync(path.join(root,'.local'));fs.writeFileSync(path.join(root,'.local/installation.json'),JSON.stringify({schemaVersion:1,assistantName:'Athena',url:'https://hermes.example',stt:'base',tts:'none',language:'de'}));assert.equal(runtime().readPortableInstallation(root).stt,'base');}finally{fs.rmSync(root,{recursive:true});}
});
test('portable speech readiness requires the selected backend identity',async()=>{
 const {engineResponseReady}=runtime(),spec={portable:true,name:'voice'};
 assert.equal(await engineResponseReady(spec,Response.json({ready:true})),false);
 assert.equal(await engineResponseReady(spec,Response.json({ready:true,backend:'hermes-voice-portable',kind:'stt'})),false);
 assert.equal(await engineResponseReady(spec,Response.json({ready:true,backend:'hermes-voice-portable',kind:'voice'})),true);
 assert.equal(await engineResponseReady({name:'voice'},new Response('ok')),true);
});

test('portable speech matches the backend 4000 character bound before making a request',async()=>{
 let calls=0;const client=runtime().createPortableVoiceClient({tts:'de_DE-thorsten-medium'},async()=>{calls++;return new Response();});await client.speech('a'.repeat(4000),'piper');await assert.rejects(client.speech('a'.repeat(4001),'piper'),/Sprachtext/);assert.equal(calls,1);
});
