'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const options=require('../setup-options.cjs');
const choice={assistantName:'Hermes',url:'https://hermes.example',stt:'base',tts:'de_DE-thorsten-medium',language:'de'};
test('validates bounded public choices and rejects unexpected or secret input',()=>{
 assert.deepEqual(options.validateSetup(choice),choice);
 for(const patch of [{assistantName:''},{assistantName:'a'.repeat(81)},{assistantName:'Bad\nName'},{url:'https://user:password@example.com'},{url:'https://example.com/?token=x'},{url:'https://example.com/#token'},{url:'javascript:alert(1)'},{url:''},{stt:'large'},{tts:'cloned'},{language:'fr'},{token:'secret'}])assert.throws(()=>options.validateSetup({...choice,...patch}));
});
test('atomic manifest and platform settings preserve sessions, references and preferences',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-setup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'.local'));const file=path.join(root,'.local/settings.json');
 const saved={sessionId:'keep',voice:'private',referenceAudio:'keep.wav',wakeWord:true,microphoneDeviceId:'keep',cameraEnabled:true,localDialogueEnabled:true,naturalConversation:true,monitoring:true,proactive:true,speakAlerts:true};fs.writeFileSync(file,JSON.stringify(saved));
 options.applyClientSettings(root,'win32',{...choice,tts:'existing'});const merged=JSON.parse(fs.readFileSync(file));
 for(const [key,value] of Object.entries(saved))assert.equal(merged[key],value);
 assert.equal(merged.assistantName,'Hermes');assert.equal(merged.url,choice.url);
 options.writeInstallation(root,choice);assert.deepEqual(options.readInstallation(root),{schemaVersion:1,...choice});
 options.applyClientSettings(root,'linux',choice);const linux=JSON.parse(fs.readFileSync(path.join(root,'.local/linux-settings.json')));assert.equal(linux.voice,'piper');assert.equal(linux.wakeWord,false);for(const key of ['localDialogueEnabled','naturalConversation','monitoring','proactive','speakAlerts'])assert.equal(linux[key],false);
});
function double(){const handlers=new Map();let win;class Window extends EventEmitter{constructor(settings){super();this.settings=settings;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.send=()=>{};this.webContents.setWindowOpenHandler=fn=>this.open=fn;this.webContents.session={setPermissionRequestHandler:fn=>this.permission=fn};win=this;}async loadFile(file){this.file=file;}close(){this.emit('closed');}}return {electron:{BrowserWindow:Window,ipcMain:{handle:(key,fn)=>handlers.set(key,fn),removeHandler:key=>handlers.delete(key)}},handlers,get win(){return win;},event(){return {sender:win.webContents,senderFrame:win.webContents.mainFrame};}};}
test('onboarding authenticates IPC, retries failure, saves only after install and cleans handlers',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-onboard-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const d=double();let attempts=0;
 const pending=require('../onboarding.cjs').runOnboarding({electron:d.electron,root,install:async()=>{if(++attempts===1)throw Error('missing Python');}});
 d.win.webContents.mainFrame.url=require('node:url').pathToFileURL(d.win.file).href;
 const save=d.handlers.get('onboarding:save');await assert.rejects(()=>save({sender:{},senderFrame:{}},choice),/sender/i);
 await assert.rejects(()=>save({sender:d.win.webContents,senderFrame:{url:d.win.webContents.mainFrame.url}},choice),/sender/i);
 d.win.webContents.mainFrame.url='https://evil.example/';await assert.rejects(()=>save(d.event(),choice),/sender/i);d.win.webContents.mainFrame.url=require('node:url').pathToFileURL(d.win.file).href;
 assert.equal(d.win.open().action,'deny');let blocked=false;d.win.webContents.emit('will-navigate',{preventDefault:()=>blocked=true},'https://evil.example/');assert.equal(blocked,true);
 await assert.rejects(()=>save(d.event(),choice),/missing Python/);assert.equal(options.readInstallation(root),null);
 assert.deepEqual(await save(d.event(),choice),{ok:true});assert.deepEqual(await pending,choice);assert.equal(d.handlers.size,0);
});
test('closing during installation never persists readiness',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-cancel-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const d=double();let finish,signal;const pending=require('../onboarding.cjs').runOnboarding({electron:d.electron,root,install:(_value,_progress,context)=>{signal=context.signal;return new Promise(resolve=>finish=resolve);}});
 d.win.webContents.mainFrame.url=require('node:url').pathToFileURL(d.win.file).href;
 const saving=d.handlers.get('onboarding:save')(d.event(),choice);d.win.close();assert.equal(await pending,null);assert.equal(signal.aborted,true);finish();await assert.rejects(()=>saving,/closed/i);assert.equal(options.readInstallation(root),null);
});
test('renderer displays actionable installation failures and enables retry',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../ui/onboarding.js'),'utf8');
 for(const message of ['Python 3.10–3.12 is missing. Install Python and reopen setup.','Download checksum failed. Retry the download.','Insufficient disk space. Free 2 GB and retry.']){
  const listeners={},nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{value:choice[id]||'',textContent:'',hidden:false,disabled:false,classList:{add(){},remove(){}},replaceChildren(){}});return nodes.get(id);}
  const elements=Object.keys(choice).map(node);elements.namedItem=node;Object.assign(node('setup'),{elements,reportValidity:()=>true,addEventListener:(name,callback)=>listeners[name]=callback});
  const context={document:{getElementById:node,createElement:()=>({})},window:{onboarding:{progress(){},snapshot:async()=>choice,save:async()=>{throw Error("Error invoking remote method 'onboarding:save': Error: "+message+'\n    at install (private.cjs:1:1)');}}}};
  vm.runInNewContext(source,context);await Promise.resolve();await listeners.submit({preventDefault(){}});
  assert.ok(node('status').textContent.includes(message));assert.ok(!node('status').textContent.includes('remote method'));assert.ok(!node('status').textContent.includes('private.cjs'));assert.equal(node('submit').textContent,'Retry installation');assert.equal(elements.every(item=>!item.disabled),true);assert.equal(node('progress').hidden,true);
 }
});
test('trusted installer failure is bounded and redacted without changing an existing manifest',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-error-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));options.writeInstallation(root,choice);const before=fs.readFileSync(path.join(root,'.local/installation.json'),'utf8'),d=double();
 const pending=require('../onboarding.cjs').runOnboarding({electron:d.electron,root,install:async()=>{throw Error('Python missing. Install Python 3.10–3.12 and retry. https://user:secret@example.com/?token=secret\n    at private (private.cjs:1)');}});
 d.win.webContents.mainFrame.url=require('node:url').pathToFileURL(d.win.file).href;
 await assert.rejects(()=>d.handlers.get('onboarding:save')(d.event(),choice),error=>error.message.includes('Install Python')&&!error.message.includes('secret')&&!error.message.includes('private.cjs')&&error.message.length<=600);
 assert.equal(fs.readFileSync(path.join(root,'.local/installation.json'),'utf8'),before);d.win.close();await pending;
});
