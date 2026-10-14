'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {createControlApi}=require('../control-api.cjs');
function fixture({failStart=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-control-')),handlers={},events=[],presentations=[];
 const clipboard={value:'QA text',reads:0,writes:0,readText(type){assert.equal(type,'clipboard');this.reads++;return this.value;},writeText(text,type){assert.equal(type,'clipboard');this.writes++;this.value=text;}};
 let api,apiOptions;
 const browser={ready:true,url:'https://example.org/',title:'Example',loading:false,visible:true,tab:'browser'};
 const workbench={get browserState(){return {...browser};},get visible(){return browser.visible;},get activeTab(){return browser.tab;},publish(){},destroy(){},hide(){browser.visible=false;},release:id=>({closed:true,requestId:id}),
  show:async options=>{presentations.push(options);browser.visible=true;browser.tab=options.tab;browser.url=options.url||browser.url;},
  present:async options=>{presentations.push(options);return {shown:true,owner:'agent',requestId:options.requestId||'own-request'};},
  controlBrowser:async value=>{if(value.action==='navigate')Object.assign(browser,{url:value.url,title:'Navigated',visible:true,tab:'browser'});return {...browser};}};
 const app={commandLine:{appendSwitch(){}},requestSingleInstanceLock:()=>true,on:(name,fn)=>handlers[name]=fn,whenReady:()=>({then:()=>({catch(){}})}),quit(){}};
 const context=vm.createContext({__dirname:root,process:{...process,argv:[...process.argv,'--linux-smoke']},Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app,clipboard,globalShortcut:{unregisterAll(){}}};
  if(name==='./workbench.cjs')return {...require('../workbench.cjs'),createWorkbench:()=>workbench};
  if(name==='./control-api.cjs')return {createControlApi:async options=>{apiOptions=options;assert.equal(options.port,8874);if(failStart)throw Object.assign(Error('fixture start refused'),{code:'EADDRINUSE'});api=await createControlApi({...options,port:0});return api;}};
  if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));return require(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../linux-main.cjs'),'utf8'),context);
 context.events=events;vm.runInContext("emit=event=>events.push(event);connected=true;conversation={session:{id:'runtime',storedId:'stored',profile:'default',title:'Selected',privateField:'never expose'},busy:false};approval={secret:'never expose'};",context);
 return {root,events,presentations,browser,workbench,clipboard,run:code=>vm.runInContext(code,context),get options(){return apiOptions;},get api(){return api;},async close(){handlers['before-quit']?.();if(api?.listening)await new Promise(resolve=>api.close(resolve));fs.rmSync(root,{recursive:true,force:true});}};
}
async function request(f,action,payload,headers={}){
 const connection=JSON.parse(fs.readFileSync(path.join(f.root,'.local/linux-control.json'),'utf8'));
 const response=await fetch('http://127.0.0.1:'+f.api.address().port+'/v1/'+action,{method:payload===undefined?'GET':'POST',headers:{Authorization:'Bearer '+connection.token,...headers},...(payload!==undefined?{body:JSON.stringify(payload)}:{})});
 return {status:response.status,body:await response.json()};
}
test('Linux local API publishes private connection metadata and only bounded sanitized device controls',async()=>{
 const f=fixture();try{await f.run('startLinuxControlApi()');assert.ok(f.api?.listening);
  const file=path.join(f.root,'.local/linux-control.json'),connection=JSON.parse(fs.readFileSync(file));assert.equal(connection.url,'http://127.0.0.1:8874');assert.equal(connection.pid,process.pid);assert.match(connection.token,/^[0-9a-f]{64}$/);if(process.platform==='linux')assert.equal(fs.statSync(file).mode&0o777,0o600);
  const unopened=await request(f,'status');assert.equal(unopened.body.workbench.browser.ready,false);f.run('ensureWorkbench()');
  const status=await request(f,'status');assert.equal(status.status,200);assert.equal(status.body.session.id,'runtime');assert.equal(status.body.workbench.tab,'browser');assert.equal(status.body.workbench.browser.url,'https://example.org/');assert.ok(!JSON.stringify(status.body).includes('never expose'));assert.ok(!JSON.stringify(status.body).includes(connection.token));assert.equal(status.body.settings,undefined);assert.equal(status.body.approval,undefined);
  assert.equal((await request(f,'camera',{enabled:true})).status,404);assert.equal((await request(f,'browser',undefined,{Authorization:'Bearer wrong'})).status,401);assert.equal((await request(f,'browser',undefined,{Origin:'https://example.org'})).status,403);
  const browser=await request(f,'browser',{action:'navigate',url:'https://example.org/next'});assert.equal(browser.status,200);assert.equal(browser.body.browser.title,'Navigated');assert.equal(browser.body.browser.visible,true);
  assert.equal((await request(f,'browser',{action:'navigate',url:'file:///etc/passwd'})).status,400);assert.equal((await request(f,'browser',{action:'state',script:'bad'})).status,400);
 }finally{await f.close();}
});
test('Linux agent presentation preserves request ownership and privacy forbids browser/workbench disclosure',async()=>{
 const f=fixture();try{await f.run('startLinuxControlApi()');
  const shown=await request(f,'workbench',{enabled:true,agent:true,tab:'browser',url:'https://example.org/',requestId:'specific',reason:'Recherche'});assert.equal(shown.body.result.owner,'agent');assert.equal(f.presentations[0].requestId,'specific');
  const release=await request(f,'workbench',{enabled:false,agent:true,requestId:'specific'});assert.equal(release.body.result.closed,true);
  f.run('config.privacyLocked=true;');assert.equal((await request(f,'browser')).status,423);assert.equal((await request(f,'browser',{action:'reload'})).status,423);assert.equal((await request(f,'workbench',{enabled:true,tab:'console'})).status,423);
  const status=await request(f,'status');assert.equal(status.body.privacyLocked,true);assert.equal(status.body.workbench.browser,null);assert.equal(status.body.session,null);assert.ok(!JSON.stringify(status.body).includes('https://example.org/'));
 }finally{await f.close();}
});
test('Linux loopback startup failure remains a visible local notice without private configuration',async()=>{
 const f=fixture({failStart:true});try{await f.run('startLinuxControlApi()');assert.ok(f.events.some(event=>event.type==='notice'&&/8874/.test(event.message)));assert.equal(fs.existsSync(path.join(f.root,'.local/linux-control.json')),false);}finally{await f.close();}
});
test('Linux browser results are rejected after privacy or session ownership changes without altering saved preferences',async()=>{
 const f=fixture();try{await f.run('startLinuxControlApi()');const before=f.run('JSON.stringify(config)');
  f.workbench.controlBrowser=async()=>{f.run('generation++;');return {...f.browser};};const stale=await request(f,'browser',{action:'reload'});assert.equal(stale.status,500);assert.ok(!JSON.stringify(stale.body).includes('example.org'));assert.equal(f.run('JSON.stringify(config)'),before);assert.equal(f.run('conversation.session.storedId'),'stored');
  f.workbench.controlBrowser=async()=>{f.run('config.privacyLocked=true;');return {...f.browser};};const locked=await request(f,'browser',{action:'reload'});assert.equal(locked.status,423);assert.ok(!JSON.stringify(locked.body).includes('example.org'));
 }finally{await f.close();}
});
test('Linux API shutdown closes its own listener and removes only its matching private connection file',async()=>{
 const f=fixture();try{await f.run('startLinuxControlApi()');const file=path.join(f.root,'.local/linux-control.json');assert.equal(fs.existsSync(file),true);f.run('stopLinuxControlApi()');assert.equal(f.api.listening,false);assert.equal(fs.existsSync(file),false);}finally{await f.close();}
});
test('Linux clipboard reads are explicit, bounded and absent from status; writes preserve Unicode and verify native contents',async()=>{
 const f=fixture();try{
  assert.equal(f.run('typeof linuxControlClipboard'),'function');await f.run('startLinuxControlApi()');
  await request(f,'status');assert.equal(f.clipboard.reads,0);
  const read=await request(f,'clipboard',{action:'read',maxChars:2});assert.equal(read.status,200);assert.equal(read.body.text,'QA');assert.equal(read.body.truncated,true);assert.equal(read.body.untrusted,true);assert.ok(Number.isFinite(Date.parse(read.body.observedAt)));assert.equal(f.clipboard.writes,0);
  const write=await request(f,'clipboard',{action:'write',text:'Grüße 😀\n'});assert.equal(write.status,200);assert.equal(write.body.verified,true);assert.equal(write.body.characters,9);assert.equal(write.body.text,undefined);assert.equal(f.clipboard.value,'Grüße 😀\n');assert.equal(f.clipboard.writes,1);
  assert.ok(!JSON.stringify((await request(f,'status')).body).includes('Grüße'));assert.equal(f.clipboard.reads,2);
 }finally{await f.close();}
});
test('Linux clipboard rejects privacy, standby, missing session and foreign ownership before any native read or write',async()=>{
 for(const state of ['config.privacyLocked=true','standbyActive=true','connected=false','conversation.session=null','handoff={close(){},canSubmit:()=>false,snapshot:()=>({})}','handoff={close(){},canSubmit:()=>true,snapshot:()=>({pending:{session:{id:"stored",profile:"default"}}})}']){
  const f=fixture();try{
   assert.equal(f.run('typeof linuxControlClipboard'),'function');await f.run('startLinuxControlApi()');f.run(state);
   for(const payload of [{action:'read'},{action:'write',text:'replacement'}])assert.notEqual((await request(f,'clipboard',payload)).status,200);
   assert.equal(f.clipboard.reads,0);assert.equal(f.clipboard.writes,0);assert.equal(f.clipboard.value,'QA text');
  }finally{await f.close();}
 }
});
test('Linux clipboard rejects empty/nontext reads and failed write verification without returning clipboard data',async()=>{
 const f=fixture();try{
  assert.equal(f.run('typeof linuxControlClipboard'),'function');await f.run('startLinuxControlApi()');f.clipboard.value='';const empty=await request(f,'clipboard',{action:'read'});assert.notEqual(empty.status,200);assert.equal(empty.body.result,undefined);
  f.clipboard.value='previous';f.clipboard.writeText=()=>{f.clipboard.writes++;};const write=await request(f,'clipboard',{action:'write',text:'replacement'});assert.notEqual(write.status,200);assert.ok(!JSON.stringify(write.body).includes('previous'));
  f.clipboard.readText=()=>{throw Error('private clipboard error');};const failed=await request(f,'clipboard',{action:'read'});assert.notEqual(failed.status,200);assert.ok(!JSON.stringify(failed.body).includes('private clipboard error'));
 }finally{await f.close();}
});
