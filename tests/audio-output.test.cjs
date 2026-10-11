'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const id=n=>'{0.0.0.00000000}.{00000000-0000-0000-0000-'+String(n).padStart(12,'0')+'}';
const devices=[{id:id(1),name:'Kopfhörer (Test Headset)',formFactor:5},{id:id(2),name:'Lautsprecher (Test Soundcard)',formFactor:1}];
function subject(){return require('../audio-output.cjs');}
test('German output requests select a fixed alias, not an arbitrary command or unrelated microphone',()=>{
 const {audioOutputIntent}=subject();for(const [text,target] of [['Wechsle die Audioausgabe auf Boxen.','speakers'],['Schalte den Ton von Kopfhörer auf die Boxen','speakers'],['Bitte stelle die Ausgabe auf Kopfhörer','headphones'],['Audio auf Lautsprecher','speakers'],['Nutze das Headset','headphones']])assert.deepEqual(audioOutputIntent(text),{type:'audio.output',target},text);
 for(const text of ['Wechsle die Ausgabe nicht auf Boxen','Was sind Kopfhörer?','Schalte das Mikrofon auf Headset','Wechsle auf Boxen und öffne Spotify','Wechsle die Ausgabe auf Boxen; calc','Wie wechsle ich auf Boxen?',null])assert.equal(audioOutputIntent(text),null,String(text));
});
test('target selection is fresh and exact, with preferences resolving multiple speaker endpoints',()=>{
 const {resolveAudioOutput}=subject(),snapshot={devices};assert.equal(resolveAudioOutput('headphones',snapshot,{}).id,id(1));assert.equal(resolveAudioOutput('speakers',snapshot,{}).id,id(2));assert.equal(resolveAudioOutput(id(2),snapshot,{}).id,id(2));
 const many={devices:[...devices,{id:id(3),name:'Lautsprecher (Other)',formFactor:1}]};assert.throws(()=>resolveAudioOutput('speakers',many,{}),/Mehrere|auswählen/);assert.equal(resolveAudioOutput('speakers',many,{speakers:id(3)}).id,id(3));assert.throws(()=>resolveAudioOutput('speakers',snapshot,{speakers:id(9)}),/verfügbar/);assert.throws(()=>resolveAudioOutput('C:\\bad',snapshot,{}));
});
test('audio snapshots reject stale, capture, malformed and duplicate endpoint identities',()=>{
 const {validateAudioSnapshot}=subject();const valid={devices,defaults:{console:id(1),multimedia:id(1),communications:id(1)},observedAt:Date.now()};assert.equal(validateAudioSnapshot(valid).devices.length,2);
 for(const value of [{...valid,observedAt:1},{...valid,devices:[...devices,devices[0]]},{...valid,devices:[{id:'{0.0.1.00000000}.'+id(1),name:'Mic',formFactor:5}]},{...valid,devices:[{...devices[0],name:'x\ncmd'}]}])assert.throws(()=>validateAudioSnapshot(value));
});
test('native switch is accepted only with verified render defaults, and observation never switches',async()=>{
 const {createAudioOutputs}=subject(),calls=[];const before={console:id(1),multimedia:id(1),communications:id(1)};
 const backend=createAudioOutputs({platform:'win32',runFile:async(exe,args,opts)=>{calls.push({exe,args,opts});const switching=args.includes('switch');return {stdout:JSON.stringify({devices,defaults:switching?{...before,console:id(2),multimedia:id(2)}:before,before,accepted:true,observationOnly:!switching,observedAt:Date.now()})};}});
 const read=await backend.read();assert.equal(read.defaults.multimedia,id(1));const result=await backend.switch(id(2));assert.equal(result.status,'completed');assert.equal(result.verified,true);assert.equal(result.evidence.after.communications,id(1));assert.equal(calls.filter(c=>c.args.includes('switch')).length,1);assert.equal(calls.every(c=>c.opts.shell===false&&c.opts.windowsHide===true),true);
 await backend.observe(id(2));assert.equal(calls.filter(c=>c.args.includes('switch')).length,1);
});
test('uncertain effects remain unverified and never replay the switch or infer success from an accepted call',async()=>{
 const {createAudioOutputs}=subject();let switches=0;const backend=createAudioOutputs({platform:'win32',runFile:async(exe,args)=>{if(args.includes('switch')){switches++;return {stdout:JSON.stringify({devices,defaults:{console:id(1),multimedia:id(1),communications:id(1)},accepted:true,observedAt:Date.now()})};}return {stdout:JSON.stringify({devices,defaults:{console:id(1),multimedia:id(1),communications:id(1)},accepted:true,observedAt:Date.now()})};}});
 const result=await backend.switch(id(2));assert.equal(result.status,'unverified');assert.equal(result.verified,false);assert.equal(switches,1);
});
test('cancel and platform gates reject audio mutation without dispatch',async()=>{
 const {createAudioOutputs}=subject();let calls=0;const backend=createAudioOutputs({platform:'linux',runFile:async()=>{calls++;}});await assert.rejects(backend.read(),/Windows/);assert.equal(calls,0);const controller=new AbortController();controller.abort();const windows=createAudioOutputs({platform:'win32',runFile:async()=>{calls++;}});await assert.rejects(windows.read({signal:controller.signal}));assert.equal(calls,0);
});

test('direct jobs pin an output identity before dispatch and refuse ambiguous aliases',async()=>{
 const {createDirectCommands,validDirectCommand}=require('../direct-commands.cjs');let resolved=0,switched=[];
 const audio={resolve:async target=>{resolved++;if(target==='speakers')throw Error('Mehrere Ausgabegeräte');return devices[0];},switch:async target=>{switched.push(target);return {status:'completed',verified:true};},observe:async()=>({status:'completed',verified:true})};
 const direct=createDirectCommands({platform:'win32',audio});
 const command=await direct.parse('Audio auf Kopfhörer');assert.deepEqual(command,{type:'audio.output',target:id(1)});assert.equal(validDirectCommand(command),true);await direct.execute(command);assert.deepEqual(switched,[id(1)]);
 const ambiguous=await direct.parse('Audio auf Boxen');assert.equal(ambiguous.target,'speakers');assert.equal((await direct.execute(ambiguous)).status,'failed');assert.deepEqual(switched,[id(1)]);assert.equal(resolved,2);
 assert.equal(validDirectCommand({type:'audio.output',target:';powershell'}),false);
});
