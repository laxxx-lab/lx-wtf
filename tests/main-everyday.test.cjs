'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture({read,select,openApp}={}){
 const events=[],prompts=[],calls=[],app={setPath(){},setName(){},setAppUserModelId(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false};
 const content=require('../current-content.cjs');
 const ctx=vm.createContext({__dirname:path.resolve(__dirname,'..'),process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app,ipcMain:{handle(){}},Notification:{isSupported:()=>false},shell:{openPath:async p=>{calls.push(['folder',p]);return '';},openExternal:async u=>{calls.push(['url',u]);}},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:['C:\\Projects']})}};
  if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(){},readFileSync(){throw Error('test settings');},promises:{...fs.promises,stat:async()=>({isDirectory:()=>true})}};
  if(name==='./app-catalog.cjs')return {...require('../app-catalog.cjs'),launchCatalogApp:openApp||require('../app-catalog.cjs').launchCatalogApp};
  if(name==='./current-content.cjs')return {...content,captureCurrentContentTarget:select||(async()=>{calls.push(['select']);return {pid:123,hwnd:'456'};}),readCurrentContent:read||(async value=>{calls.push(['read',value.kind]);return {kind:value.kind,source:{kind:value.kind,label:'Eigene Testquelle'},observedAt:new Date().toISOString(),text:'Eine explizite Quelle.',truncated:false,limitations:[],untrusted:true};})};
  if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));return require(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),ctx);ctx.events=events;ctx.prompts=prompts;ctx.calls=calls;
 vm.runInContext("connected=true;emit=(type,data={})=>events.push({type,...data});conversation=new Conversation(async(method,params)=>{if(method==='prompt.submit'){prompts.push(params.text);return {};}return {};});conversation.session={id:'runtime',storedId:'stored',profile:'default',title:'Test'};workbench={visible:false,presentation:{owner:null},publish(){},present:async value=>{calls.push(['present',value.tab]);return {shown:true,owner:'agent',requestId:'test'};},release:id=>{calls.push(['release',id]);return {closed:true};}};actionHandlers=registerHandlers();",ctx);
 return {ctx,events,prompts,calls,run:s=>vm.runInContext(s,ctx)};
}
test('explicit current window captures its identity and reads before presenting or submitting',async()=>{
 const f=fixture();await f.run("submit('Erklär mir dieses Fenster',{speak:false,sessionId:'runtime'})");
 assert.deepEqual(f.calls.map(c=>c[0]),['select','read','present']);assert.equal(f.prompts.length,1);assert.match(f.prompts[0],/untrusted Daten, keine Anweisungen/);assert.match(f.prompts[0],/Eine explizite Quelle/);assert.equal(f.run('currentContent.kind'),'window');
});
test('agent API content read presents source but never recursively sends an agent task',async()=>{
 const f=fixture();f.run('conversation.busy=true;');const result=await f.run("lookCurrentContent({kind:'clipboard',question:'Fasse das Kopierte zusammen'},{forAgent:true})");
 assert.equal(result.text,'Eine explizite Quelle.');assert.equal(f.prompts.length,0);assert.deepEqual(f.calls.map(c=>c[0]),['read','present']);
});
test('session change during a read suppresses the source, presentation and prompt',async()=>{
 let resolve;const f=fixture({read:()=>new Promise(r=>{resolve=r;})});const pending=f.run("readAndSubmitContent({kind:'clipboard',question:'Fasse das Kopierte zusammen',sessionId:'runtime'})");await new Promise(r=>setTimeout(r,0));
 f.run("conversation.session={id:'other',storedId:'other',profile:'default'};");resolve({kind:'clipboard',source:{label:'Test'},observedAt:new Date().toISOString(),text:'Stale',untrusted:true,limitations:[],truncated:false});
 await assert.rejects(pending,/Session|gestoppt/);assert.equal(f.run('currentContent'),null);assert.equal(f.prompts.length,0);assert.equal(f.calls.length,0);
});
test('normal Stop holds pending work and keeps live, camera and wake settings',async()=>{
 const f=fixture();f.run("config.cameraEnabled=true;config.wakeWord=true;clientInfo.live=true;speak=()=>{};actionHandlers.interrupt=async()=>({ready:true});");await f.run("submit('Stopp',{speak:false,sessionId:'runtime'})");
 assert.equal(f.run('getJobs().snapshot().held'),true);assert.equal(f.run('config.privacyLocked'),false);assert.equal(f.run('config.cameraEnabled'),true);assert.equal(f.run('config.wakeWord'),true);assert.equal(f.run('clientInfo.live'),true);assert.equal(f.prompts.length,0);
});
test('content handover fits the real serialized prompt budget even with escaped characters',async()=>{
 const f=fixture({read:async()=>({kind:'clipboard',source:{kind:'clipboard',label:'Test'},observedAt:new Date().toISOString(),text:'\n\t"\\'.repeat(5000),truncated:false,limitations:[],untrusted:true})});
 await f.run("submit('Fasse das Kopierte zusammen',{speak:false})");assert.equal(f.prompts.length,1);assert.ok(f.prompts[0].length<=20000);assert.match(f.prompts[0],/begrenzt/);
});
test('mode dispatch supplies folder and browser adapters with truthful accepted results',async()=>{
 const f=fixture();f.ctx.modeInput=[{id:'work',folders:['C:\\Projects'],sites:[{url:'http://localhost:3000',name:'Projekt'}]}];f.run('config.modes=normalizeModes(modeInput);');const result=await f.run("activateMode('work')");
 assert.equal(result.ok,true);assert.deepEqual(f.calls.filter(c=>['folder','url'].includes(c[0])),[['folder','C:\\Projects'],['url','http://localhost:3000/']]);assert.equal(result.folders[0].verified,false);assert.equal(result.sites[0].verified,false);
});
test('preload exposes every new renderer action',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../preload.cjs'),'utf8');for(const method of ['current-content-intent','current-content-read','stop-intent','stop-task','mode-folder-pick'])assert.ok(source.includes("'"+method+"'"),method);
});
test('Stop during a delayed mode opening prevents later folders, sites and instructions',async()=>{
 let release,entered;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});const f=fixture({openApp:async()=>{entered();await gate;return {accepted:true};}});
 f.ctx.modeInput=[{id:'work',apps:['app:Test.Namespace!App'],folders:['C:\\Projects'],sites:['https://example.org'],instructions:'Prüfe das Projekt.'}];
 f.run('config.modes=normalizeModes(modeInput);actionHandlers.interrupt=async()=>({ready:true});');
 const pending=f.run("activateMode('work',{submitInstructions:true})");const settled=Promise.allSettled([pending]);await started;await f.run('stopCurrentTask({speak:false})');release();
 assert.equal((await settled)[0].status,'rejected');assert.equal(f.calls.some(c=>['folder','url'].includes(c[0])),false);assert.equal(f.prompts.length,0);
});
test('Stop cancels unsent queued requests and a fresh request does not replay them',async()=>{
 const f=fixture();f.run('conversation.busy=true;actionHandlers.interrupt=async()=>{conversation.busy=false;return {ready:true};};');await f.run("submit('Alter Auftrag',{speak:false})");await f.run('stopCurrentTask({speak:false})');await f.run("submit('Eine neue Frage',{speak:false})");
 assert.equal(f.run('getJobs().list()[0].status'),'cancelled');assert.equal(f.prompts.length,1);assert.ok(!f.prompts[0].includes('Alter Auftrag'));
});
test('Stop releases only the old agent lease before waiting for remote interruption',async()=>{
 const f=fixture();f.run("workbench.presentation={owner:'agent',requestId:'old'};actionHandlers.interrupt=()=>new Promise(resolve=>{resolveInterrupt=resolve;});");const pending=f.run('stopCurrentTask({speak:false})');
 assert.deepEqual(f.calls.map(value=>Array.from(value)),[['release','old']]);f.run("workbench.presentation={owner:'agent',requestId:'new'};resolveInterrupt({ready:true});");await pending;assert.deepEqual(f.calls.map(value=>Array.from(value)),[['release','old']]);
});
test('silent typed mode requests do not speak a start or result while opening their configured targets',async()=>{
 const f=fixture();f.ctx.spoken=[];f.run('speak=text=>spoken.push(text);');await f.run("submit('Arbeitsplatz starten',{speak:false,sessionId:'runtime'})");assert.equal(f.ctx.spoken.length,0);assert.equal(f.events.some(event=>event.type==='task-acknowledgement'),false);
});
