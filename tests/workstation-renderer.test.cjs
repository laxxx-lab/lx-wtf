const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {currentContentIntent}=require('../current-content.cjs');

function workstation(respond=()=>undefined){
  const calls=[],notices=[],elements=new Map();
  const ids=new Set([...fs.readFileSync(path.join(__dirname,'../ui/index.html'),'utf8').matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  const element=()=>({value:'',checked:false,disabled:false,textContent:'',options:[],replaceChildren(){this.options=[];},append(option){this.options.push(option);}});
  const document={getElementById(id){if(!ids.has(id))return null;if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
  const context=vm.createContext({document,ScreenCapture:class{cancel(){}},hermes:{on(){}}});
  vm.runInContext('window=globalThis;',context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/workstation.js'),'utf8'),context);
  const controls=new context.WorkstationControls({invoke:async(method,payload)=>{calls.push({method,payload});return respond(method,payload);},notice:message=>notices.push(message),getSession:()=>({id:'selected'}),sendCamera:async(text,sessionId)=>{calls.push({method:'camera-fallback',payload:{text,sessionId}});},onSettings(){}});
  return {controls,calls,notices,get:id=>document.getElementById(id)};
}

test('ordinary stop wins before any content, system or camera detector',async()=>{
  const r=workstation(method=>method==='stop-intent');
  await r.controls.send('Stopp bitte.','selected');
  assert.deepEqual(r.calls.map(call=>call.method),['stop-intent','stop-task']);
  assert.deepEqual({...r.calls[1].payload},{sessionId:'selected',speak:true});
});

test('clipboard and current window commands use requested text before screen or camera vision',async()=>{
  for(const [text,kind]of [['Fasse das Kopierte zusammen.','clipboard'],['Erkläre dieses Fenster.','window']]){
    const r=workstation((method,payload)=>method==='current-content-intent'?currentContentIntent(payload):method==='screen-intent'?true:method==='screen-look'?{source:{name:'Monitor'},description:'Vision response'}:undefined);
    await r.controls.send(text,'selected');
    const read=r.calls.find(call=>call.method==='current-content-read');
    assert.ok(read,text);assert.deepEqual({...read.payload},{kind,question:text,sessionId:'selected'});
    assert.equal(r.calls.some(call=>['screen-intent','camera-fallback','system-intent'].includes(call.method)),false);
  }
});

test('an unrelated command still reaches the camera and normal submit flow',async()=>{
  const r=workstation();await r.controls.send('Erkläre Regenbögen.','selected');
  assert.deepEqual(r.calls.at(-1),{method:'camera-fallback',payload:{text:'Erkläre Regenbögen.',sessionId:'selected'}});
});

test('profile editor copies old defaults and round trips folders and named sites without splitting URL pipes',()=>{
  const r=workstation(),settings={modes:[{id:'gaming',name:'Gaming',apps:['app:SpotifyAB.SpotifyMusic!Spotify'],instructions:''}]};
  r.controls.sync(settings);
  assert.ok(r.get('mode-folders'),'The folder editor must be visible in settings');assert.ok(r.get('mode-sites'),'The website editor must be visible in settings');
  assert.equal(r.get('mode-folders').value,'');assert.equal(r.get('mode-sites').value,'');
  r.get('mode-folders').value='C:\\Projects\nD:\\Documents';
  r.get('mode-sites').value='Projekt | https://example.com/a|b\nhttps://example.org/x|https://example.net\nhttp://localhost:8080';
  const mode=r.controls.values().modes[0];
  assert.deepEqual(Array.from(mode.folders),['C:\\Projects','D:\\Documents']);
  assert.deepEqual(JSON.parse(JSON.stringify(mode.sites)),[{name:'Projekt',url:'https://example.com/a|b'},{name:'',url:'https://example.org/x|https://example.net'},{name:'',url:'http://localhost:8080'}]);
  assert.deepEqual(Array.from(mode.apps),['app:SpotifyAB.SpotifyMusic!Spotify']);
  r.controls.renderMode();assert.equal(r.get('mode-sites').value,'Projekt | https://example.com/a|b\nhttps://example.org/x|https://example.net\nhttp://localhost:8080');
  assert.equal(settings.modes[0].folders,undefined);
});

test('synchronized nested profile sites are independent from saved settings',()=>{
  const r=workstation(),settings={modes:[{id:'gaming',name:'Gaming',apps:[],folders:['C:\\Projects'],sites:[{name:'Docs',url:'https://example.com'}],instructions:''}]};
  r.controls.sync(settings);r.controls.modes[0].folders.push('D:\\Documents');r.controls.modes[0].sites[0].name='Changed';
  assert.deepEqual(settings.modes[0].folders,['C:\\Projects']);assert.equal(settings.modes[0].sites[0].name,'Docs');
});

test('folder picker adds unique selections up to eight and keeps typed folders',async()=>{
  const r=workstation(method=>method==='mode-folder-pick'?['C:\\Projects','D:\\Documents',...Array.from({length:8},(_,i)=>`C:\\Folder-${i}`)]:undefined);
  r.controls.sync({modes:[{id:'gaming',name:'Gaming',apps:[],instructions:''}]});assert.ok(r.get('mode-folders'));assert.ok(r.get('mode-folder-pick'));r.get('mode-folders').value='C:\\Projects';
  await r.get('mode-folder-pick').onclick();
  assert.equal(r.controls.modes[0].folders.length,8);assert.deepEqual(Array.from(r.controls.modes[0].folders).slice(0,2),['C:\\Projects','D:\\Documents']);
});

test('mode status exposes folder or website failures and never treats launch acceptance as verified readiness',async()=>{
  const result={id:'work',name:'Arbeit',ok:false,apps:[],folders:[{path:'D:\\Missing',accepted:false,verified:false,error:'Ordner fehlt'}],sites:[{url:'https://example.com',accepted:true,verified:false,error:''}]};
  const r=workstation(()=>result);await r.controls.run('work');
  assert.match(r.get('mode-status').textContent,/Aktionen|Öffnen|fehlgeschlagen/);assert.doesNotMatch(r.get('mode-status').textContent,/Programmstart/);
  assert.match(r.notices.at(-1),/Ordner fehlt/);
  result.ok=true;result.folders=[];await r.controls.run('work');
  assert.match(r.get('mode-status').textContent,/angefordert/i);assert.doesNotMatch(r.get('mode-status').textContent,/aktiv|bereit|bestätigt/i);
});
