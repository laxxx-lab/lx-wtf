'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const id='Bluetooth#Bluetooth00:11:22:33:44:55-66:77:88:99:aa:bb',other='Bluetooth#Bluetooth00:11:22:33:44:55-66:77:88:99:aa:cc';
const device={id,name:'Test Soundbar',paired:true,connected:false,containerId:'11111111-2222-3333-4444-555555555555'};
const snapshot=()=>({radios:[{name:'Bluetooth',state:'On'}],devices:[device],observedAt:Date.now()});
test('Bluetooth intents are narrow, typed German requests with no negation, arbitrary operations or compound targets',()=>{
 const {bluetoothIntent}=require('../bluetooth.cjs');
 for(const [text,expected] of [['Schalte Bluetooth ein',{type:'bluetooth',action:'radio',enabled:true}],['Bluetooth aus',{type:'bluetooth',action:'radio',enabled:false}],['Suche Bluetooth-Geräte',{type:'bluetooth',action:'scan'}],['Verbinde Bluetooth mit Test Soundbar',{type:'bluetooth',action:'connect',name:'Test Soundbar'}],['Trenne Bluetooth von Test Soundbar',{type:'bluetooth',action:'disconnect',name:'Test Soundbar'}],['Kopple Bluetooth mit Test Soundbar',{type:'bluetooth',action:'pair',name:'Test Soundbar'}],['Audio über Bluetooth auf Test Soundbar',{type:'bluetooth',action:'audio',name:'Test Soundbar'}]])assert.deepEqual(bluetoothIntent(text),expected,text);
 for(const text of ['Was ist Bluetooth?','Schalte Bluetooth nicht aus','Verbinde Bluetooth mit Test und lösche Dateien','Bluetooth aus; calc','Öffne Bluetooth','Kopple alle Geräte'])assert.equal(bluetoothIntent(text),null,text);
});
test('catalog resolution pins the current endpoint, rejects stale or ambiguous names and does not guess an unavailable device',()=>{
 const {validateBluetoothSnapshot,resolveBluetoothDevice}=require('../bluetooth.cjs');const data=validateBluetoothSnapshot(snapshot());assert.equal(resolveBluetoothDevice('Soundbar',data).id,id);
 assert.throws(()=>resolveBluetoothDevice('Soundbar',{...data,devices:[device,{...device,id:other}]}),/Mehrere/);assert.throws(()=>resolveBluetoothDevice('Nicht da',data),/gefunden/);
 for(const value of [{...snapshot(),observedAt:1},{...snapshot(),devices:[{...device,id:';calc'}]},{...snapshot(),radios:[{name:'WLAN',state:'On'}]},{...snapshot(),devices:[device,device]}])assert.throws(()=>validateBluetoothSnapshot(value));
});
test('native action is completed only with matching fresh device identity and observed Windows result',async()=>{
 const {createBluetooth}=require('../bluetooth.cjs');let calls=[];
 const subject=createBluetooth({platform:'win32',runFile:async(exe,args,options)=>{calls.push({args,options});return {stdout:JSON.stringify({...snapshot(),accepted:true,verified:true,devices:[{...device,connected:true}],target:{...device,connected:true}})};}});
 const result=await subject.execute({type:'bluetooth',action:'connect',deviceId:id});assert.equal(result.verified,true);assert.equal(calls.length,1);assert.equal(calls[0].options.shell,false);
 const bad=createBluetooth({platform:'win32',runFile:async()=>({stdout:JSON.stringify({...snapshot(),accepted:true,verified:true,target:{...device,id:other,connected:true}})})});assert.equal((await bad.execute({type:'bluetooth',action:'connect',deviceId:id})).verified,false);
 const pending=createBluetooth({platform:'win32',runFile:async()=>({stdout:JSON.stringify({...snapshot(),accepted:true,verified:false,needsUser:true,target:device})})});assert.equal((await pending.execute({type:'bluetooth',action:'pair',deviceId:id})).status,'unverified');
});
test('Bluetooth audio uses physical container identity and requires both connection and verified audio routing',async()=>{
 const {createBluetooth}=require('../bluetooth.cjs');let routed=[];
 const audioId='{0.0.0.00000000}.{00000000-0000-0000-0000-000000000001}';
 const subject=createBluetooth({platform:'win32',runFile:async()=>({stdout:JSON.stringify({...snapshot(),accepted:true,verified:true,target:{...device,connected:true},devices:[{...device,connected:true}]})}),audio:{read:async()=>({devices:[{id:audioId,name:'Same friendly name',containerId:device.containerId}],defaults:{multimedia:audioId,console:audioId}}),switch:async target=>{routed.push(target);return {status:'completed',verified:true,evidence:{voiceSystemDefault:true}};}}});
 assert.equal((await subject.execute({type:'bluetooth',action:'audio',deviceId:id})).verified,true);assert.deepEqual(routed,[audioId]);
 const wrong=createBluetooth({platform:'win32',runFile:async()=>({stdout:JSON.stringify({...snapshot(),accepted:true,verified:true,target:{...device,connected:true},devices:[{...device,connected:true}]})}),audio:{read:async()=>({devices:[{id:audioId,name:device.name,containerId:'99999999-2222-3333-4444-555555555555'}]}),switch:async()=>{throw Error('wrong device');}}});assert.equal((await wrong.execute({type:'bluetooth',action:'audio',deviceId:id})).status,'unverified');
});
test('observation never connects, pairs or switches and rejected commands never invoke a shell',async()=>{
 const {createBluetooth}=require('../bluetooth.cjs');const calls=[];
 const subject=createBluetooth({platform:'win32',runFile:async(exe,args)=>{calls.push(args);return {stdout:JSON.stringify({...snapshot(),accepted:true})};}});
 await subject.observe({type:'bluetooth',action:'pair',deviceId:id});assert.equal(calls.length,1);assert.ok(calls[0].includes('read'));
 for(const cmd of [{type:'bluetooth',action:'remove',deviceId:id},{type:'bluetooth',action:'connect',deviceId:';calc'},{type:'bluetooth',action:'radio',enabled:'true'}])assert.equal((await subject.execute(cmd)).status,'failed');assert.equal(calls.length,1);
});
test('a lost reply after Bluetooth mutation is unknown and a cached connection flag is not fresh connection proof',async()=>{
 const {createBluetooth}=require('../bluetooth.cjs');let count=0;
 const failed=createBluetooth({platform:'win32',runFile:async()=>{count++;throw Error('timeout');}});assert.equal((await failed.execute({type:'bluetooth',action:'connect',deviceId:id})).status,'unverified');assert.equal(count,1);
 const cached=createBluetooth({platform:'win32',runFile:async()=>({stdout:JSON.stringify({...snapshot(),accepted:true,devices:[{...device,connected:true}]})})});assert.equal((await cached.observe({type:'bluetooth',action:'connect',deviceId:id})).verified,false);
});
test('direct Bluetooth commands resolve the endpoint before recording it and never send a raw target name to Windows',async()=>{
 const {createDirectCommands,validDirectCommand}=require('../direct-commands.cjs');let calls=[];
 const bluetooth={resolve:async name=>{assert.equal(name,'Test Soundbar');return device;},execute:async command=>{calls.push(command);return {status:'completed',verified:true};},observe:async()=>({status:'unverified',verified:false})};
 const direct=createDirectCommands({platform:'win32',bluetooth});const parsed=await direct.parse('Verbinde Bluetooth mit Test Soundbar');assert.deepEqual(parsed,{type:'bluetooth',action:'connect',deviceId:id});assert.equal(validDirectCommand(parsed),true);await direct.execute(parsed);assert.deepEqual(calls,[parsed]);
 assert.equal(validDirectCommand({type:'bluetooth',action:'connect',name:'Test Soundbar'}),false);assert.equal((await direct.execute({type:'bluetooth',action:'disconnect',deviceId:';calc'})).status,'failed');
});
test('natural device requests resolve only unique known Bluetooth devices and fall back for unrelated targets',async()=>{
 const {createDirectCommands}=require('../direct-commands.cjs');
 const direct=createDirectCommands({platform:'win32',bluetooth:{resolve:async name=>{if(name==='Soundbar')return device;throw Error('unknown');}}});
 for(const [text,action] of [['Verbinde die Soundbar','connect'],['Trenne meine Soundbar','disconnect'],['Kopple die Soundbar','pair'],['Ton auf die Soundbar','audio'],['Schalte die Audioausgabe auf die Soundbar um','audio']])assert.deepEqual(await direct.parse(text),{type:'bluetooth',action,deviceId:id},text);
 for(const text of ['Verbinde die Datenbank','Verbinde die Soundbar und den Controller','Trenne die Soundbar nicht','Ton auf die unbekannte Anlage','Kannst du die Soundbar verbinden?'])assert.equal(await direct.parse(text),null,text);
});
