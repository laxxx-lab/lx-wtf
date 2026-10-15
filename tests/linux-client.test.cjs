'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validateLinuxSettings,linuxProjectPrompt,normalizeLinuxRegistry,requireLinuxAccess,linuxEngineSpecs,linuxGatewayMapping,requireLinuxReconnect,createLinuxTurnGate,requireLinuxApprovalOwner,linuxDeviceContext,readLinuxSession,writeLinuxSession,resolveLinuxSession}=require('../linux-client.cjs');
const {wavBytes,downsample,PcmDecoder}=require('../ui/linux-audio.js');
const {hasAudioSignal}=require('../transcription.cjs');
const {createProjectLibrary}=require('../project-library.cjs');
test('Linux settings reject remote inference endpoints and preserve an explicit unavailable microphone',()=>{
  assert.throws(()=>validateLinuxSettings({sttUrl:'https://example.com/inference'}),/lokal/i);
  assert.throws(()=>validateLinuxSettings({url:'https://user:password@example.com'}));
  const settings=validateLinuxSettings({url:'https://example.com',microphoneDeviceId:'missing123',microphoneDeviceLabel:'Notebook'});
  assert.equal(settings.microphoneDeviceId,'missing123');assert.equal(settings.sessionId,undefined);assert.equal(settings.privacyLocked,false);
});
test('Linux project prompt binds the selected root and redacted file before later project changes',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-linux-'));
  try{const a=path.join(folder,'one'),b=path.join(folder,'two');fs.mkdirSync(a);fs.mkdirSync(b);fs.writeFileSync(path.join(a,'note.md'),'token=supersecret\nUntrusted note');
    const library=createProjectLibrary({file:path.join(folder,'projects.json')});const id=library.add(a).activeId;
    const prompt=linuxProjectPrompt(library,{id,path:'note.md',text:'Fasse zusammen'});library.add(b);
    assert.ok(prompt.includes(a));assert.ok(prompt.includes('note.md'));assert.ok(prompt.includes('[redacted]'));assert.ok(!prompt.includes('supersecret'));assert.ok(!prompt.includes(b));assert.ok(prompt.includes('notebook'));assert.throws(()=>linuxProjectPrompt(library,{id,path:'../bad',text:'test'}));
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('Linux voice registry changes only local reference paths, preserving embedded reference audio',()=>{
  const data='data:audio/wav;base64,UklGRg==';const result=normalizeLinuxRegistry([{name:'hermes-reference-normal',ref_audio:data},{name:'hermes-dark-normal',ref_audio:'C:\\Voice\\voices\\fixed\\dark.wav'}],'/opt/lilith');
  assert.equal(result[0].ref_audio,data);assert.equal(result[1].ref_audio,'/opt/lilith/voices/fixed/dark.wav');
});
test('Notebook microphone PCM becomes a real 16kHz mono WAV accepted by shared transcription',()=>{
  const samples=Float32Array.from({length:48000},(_,i)=>Math.sin(i*.08)*.4),down=downsample(samples,48000);assert.equal(down.length,16000);
  const wav=Buffer.from(wavBytes([down]));assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt16LE(34),16);assert.equal(hasAudioSignal(wav),true);assert.equal(hasAudioSignal(Buffer.from(wavBytes([new Float32Array(16000)]))),false);
});
test('Streamed voice PCM joins split samples without corrupting signed little endian audio',()=>{
  const decoder=new PcmDecoder();assert.deepEqual(Array.from(decoder.push(Uint8Array.from([0]))),[]);assert.deepEqual(Array.from(decoder.push(Uint8Array.from([128,255,127]))),[-1,32767/32768]);decoder.push(Uint8Array.from([1]));decoder.reset();assert.deepEqual(Array.from(decoder.push(Uint8Array.from([0,0]))),[0]);
});
test('Notebook rejects recordings completed after privacy, session or transport changes',()=>{
  const current={privacyLocked:false,connected:true,sessionId:'notebook-session',generation:3},captured={sessionId:'notebook-session',generation:3};
  assert.equal(requireLinuxAccess(current,captured),true);
  for(const change of [{privacyLocked:true},{connected:false},{sessionId:'other'},{generation:4}])assert.throws(()=>requireLinuxAccess({...current,...change},captured));
});
test('Linux model processes bind only loopback and use native executable paths',()=>{
  const specs=linuxEngineSpecs('/opt/lilith');assert.equal(specs.length,2);assert.equal(specs[0].exe,'/opt/lilith/runtime/voice/build-linux/tts-server');assert.equal(specs[1].exe,'/opt/lilith/runtime/stt/build-linux/bin/whisper-server');
  for(const spec of specs){assert.equal(spec.args[spec.args.indexOf('--host')+1],'127.0.0.1');assert.ok(!spec.exe.endsWith('.exe'));assert.ok(spec.args.includes('German')||spec.args.includes('de'));}
});
test('Notebook DNS mapping targets one hostname and preserves normal lookups',async()=>{
  assert.throws(()=>linuxGatewayMapping('https://example.com','*=127.0.0.1'));assert.throws(()=>linuxGatewayMapping('https://example.com','other.com=127.0.0.1'));assert.throws(()=>linuxGatewayMapping('https://example.com','example.com=127.0.0.1, EXCLUDE *'));
  const mapping=linuxGatewayMapping('https://example.com','example.com=127.0.0.1');assert.equal(mapping.rule,'MAP example.com 127.0.0.1');
  const lookup=(host,options)=>new Promise((resolve,reject)=>mapping.socketOptions.lookup(host,options,(error,value,family)=>error?reject(error):resolve({value,family})));
  assert.deepEqual(await lookup('example.com',{}),{value:'127.0.0.1',family:4});assert.deepEqual(await lookup('example.com',{all:true}),{value:[{address:'127.0.0.1',family:4}],family:undefined});assert.equal((await lookup('localhost',{})).family>0,true);
});
test('Notebook can reconcile a busy disconnected session without replacing a live connected turn',()=>{
  assert.equal(requireLinuxReconnect({connected:false,busy:true}),true);assert.throws(()=>requireLinuxReconnect({connected:true,busy:true}));assert.equal(requireLinuxReconnect({connected:true,busy:false}),true);
});
test('Interrupted remote turns stay silent across late deltas and privacy unlock until terminal',()=>{
  const gate=createLinuxTurnGate();gate.suppress('active');
  for(const type of ['message.delta','message.interim','message.start','server-request'])assert.equal(gate.receive({session_id:'active',type}),false);
  assert.equal(gate.receive({session_id:'other',type:'message.delta'}),true);assert.equal(gate.receive({session_id:'active',type:'message.complete'}),false);assert.equal(gate.receive({session_id:'active',type:'message.delta'}),true);
  gate.suppress('active');gate.reconcile('active',true);assert.equal(gate.receive({session_id:'active',type:'message.delta'}),false);gate.reconcile('active',false);assert.equal(gate.receive({session_id:'active',type:'message.delta'}),true);
});
test('A renderer answer cannot use a stale approval after reconnect or session change',()=>{
  const scope={gatewayId:2,sessionId:'notebook',generation:4},approval={id:'request-8',scope},answer={approvalId:'request-8',scope};
  assert.equal(requireLinuxApprovalOwner(approval,answer,scope),true);
  for(const change of [{gatewayId:3},{sessionId:'other'},{generation:5}])assert.throws(()=>requireLinuxApprovalOwner(approval,answer,{...scope,...change}));assert.throws(()=>requireLinuxApprovalOwner(approval,{...answer,approvalId:'request-9'},scope));assert.throws(()=>requireLinuxApprovalOwner(null,answer,scope));
});
test('Notebook prompts cannot present VPS terminal facts as local capabilities when its MCP is unavailable',()=>{
  const unavailable=linuxDeviceContext('my-notebook',{configured:true,connected:false});
  assert.match(unavailable,/my-notebook/);assert.match(unavailable,/VPS-Hermes.*terminal.*VPS.*nicht.*Notebook/i);assert.match(unavailable,/lilith-zorin.*nicht verbunden/i);assert.match(unavailable,/nicht verfügbar/i);assert.match(unavailable,/keinen VPS-Fallback/i);
  const available=linuxDeviceContext('my-notebook',{configured:true,connected:true});assert.match(available,/system_status.*lilith-zorin/i);assert.match(available,/frisch/i);assert.match(available,/keine.*VPS.*Notebook/i);
});
test('Connected notebook context points the model to actual device tools and verified Lilith browser state',()=>{
  const context=linuxDeviceContext('notebook',{configured:true,connected:true});
  for(const tool of ['system_status','shell_run','desktop_screenshot','desktop_input','lilith_status','lilith_workbench','lilith_browser','lilith_clipboard_read','lilith_clipboard_write'])assert.ok(context.includes('mcp__lilith_zorin__'+tool),tool+' must be discoverable');
  assert.match(context,/hermes-linux-control/);assert.match(context,/URL.*Titel|Titel.*URL/);assert.match(context,/Werkzeug.*prüfen|prüfen.*Werkzeug/i);
  const unavailable=linuxDeviceContext('notebook',{configured:true,connected:false});assert.ok(!unavailable.includes('mcp__lilith_zorin__lilith_browser'));assert.match(unavailable,/nicht verbunden/);
});
test('Only an explicit locally persisted session from the same gateway and profile resumes',()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-session-')),file=path.join(folder,'linux-session.json');
  try{assert.equal(readLinuxSession(file),null);writeLinuxSession(file,{id:'notebook-chosen',profile:'default',title:'Mein Notebook'},'https://example.com');const record=readLinuxSession(file);
    assert.equal(record.id,'notebook-chosen');assert.equal(record.title,'Mein Notebook');const rows=[{id:'windows-default',profile:'default',title:'Windows'},{id:'notebook-chosen',profile:'default',title:'Mein Notebook'}];
    assert.equal(resolveLinuxSession(record,rows,'https://example.com').id,'notebook-chosen');assert.equal(resolveLinuxSession(record,rows,'https://other.example'),null);assert.equal(resolveLinuxSession(record,[{id:'notebook-chosen',profile:'other'}],'https://example.com'),null);assert.equal(resolveLinuxSession(null,rows,'https://example.com'),null);
    fs.writeFileSync(file,JSON.stringify({id:'bad/path',profile:'default',title:'Broken'}));assert.equal(readLinuxSession(file),null);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
