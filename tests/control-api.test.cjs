const {test}=require('node:test');const assert=require('node:assert/strict');
const {createControlApi}=require('../control-api.cjs');

test('Artcraft registration and app operations expose no arbitrary host, command or executable',async t=>{
  const calls=[],token='3'.repeat(64),api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:()=>{},readArtcraft:()=>({apps:[{id:'photo'}]}),onArtcraft:async(action,payload)=>{calls.push({action,payload});return {selectedAppId:payload.appId};}});t.after(()=>api.close());
  const base=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  assert.equal((await fetch(base+'/v1/artcraft',{headers})).status,200);
  for(const action of ['artcraft-open','artcraft-select'])assert.equal((await fetch(base+'/v1/'+action,{method:'POST',headers,body:'{"appId":"photo"}'})).status,200);
  assert.equal((await fetch(base+'/v1/artcraft-link',{method:'POST',headers,body:JSON.stringify({appId:'photo',port:19840,tokenFile:'C:\\Private\\photo.token'})})).status,200);
  for(const payload of [{appId:'powershell',port:4},{appId:'photo',port:70000},{appId:'photo',port:4,host:'evil.test'},{appId:'photo',port:4,token:'SECRET'},{appId:'photo',port:4,command:'remove-item'},{appId:'photo',port:'19840'}])assert.equal((await fetch(base+'/v1/artcraft-link',{method:'POST',headers,body:JSON.stringify(payload)})).status,400);
  assert.equal(calls.length,3);
});
test('graph searches and intel queries use bounded typed local adapters with no arbitrary URLs',async t=>{
  const calls=[],token='1'.repeat(64),api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:()=>{},readGraph:()=>({ready:false}),onGraphSearch:query=>{calls.push(query);return {matches:[]};},readIntelCatalog:()=>[{kind:'earthquakes'}],onIntel:payload=>{calls.push(payload.kind);return {items:[]};}});t.after(()=>api.close());
  const base=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  for(const action of ['graph','intel-catalog'])assert.equal((await fetch(base+'/v1/'+action,{headers})).status,200);
  assert.equal((await fetch(base+'/v1/graph-search',{method:'POST',headers,body:'{"query":"camera"}'})).status,200);
  assert.equal((await fetch(base+'/v1/intel',{method:'POST',headers,body:'{"kind":"earthquakes"}'})).status,200);
  for(const payload of [{kind:'earthquakes',url:'http://localhost'},{kind:'scanner'},{kind:'cameras',lat:91,lon:0},{kind:'cameras',query:'x'.repeat(301)}])assert.equal((await fetch(base+'/v1/intel',{method:'POST',headers,body:JSON.stringify(payload)})).status,400);
  assert.deepEqual(calls,['camera','earthquakes']);
});
test('guidance accepts only physical observed rectangles and allows immediate clearing',async t=>{
  const calls=[],token='2'.repeat(64),api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:()=>{},onGuide:value=>{calls.push(value);return {simulatedPointer:true};},clearGuide:()=>calls.push('clear')});t.after(()=>api.close());
  const base=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token},guide={purpose:'guide',pid:42,windowId:'123',windowRect:{x:10,y:10,width:400,height:300},targetRect:{x:30,y:50,width:80,height:40},observedAt:new Date().toISOString(),label:'Hier klicken'};
  assert.equal((await fetch(base+'/v1/guide',{method:'POST',headers,body:JSON.stringify(guide)})).status,200);
  for(const payload of [{...guide,execute:true},{...guide,windowRect:{x:10,y:10,width:400,height:300,command:'click'}},{...guide,purpose:'click'},{...guide,windowId:'; powershell'}])assert.equal((await fetch(base+'/v1/guide',{method:'POST',headers,body:JSON.stringify(payload)})).status,400);
  assert.equal((await fetch(base+'/v1/guide-clear',{method:'POST',headers,body:'{}'})).status,200);assert.equal(calls.length,2);
});
test('context, tasks and configured routines are authenticated read-only resources',async t=>{
  const token='c'.repeat(64),api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:()=>{},readContext:()=>({project:'Werkstatt',events:[]}),readTasks:()=>[{status:'agent-finished',verification:'unknown'}],readRoutines:()=>[{id:'musik',name:'Musik'}]});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  for(const action of ['context','tasks','routines']){
    assert.equal((await fetch(url+'/v1/'+action)).status,401);
    assert.equal((await fetch(url+'/v1/'+action,{headers})).status,200);
    assert.equal((await fetch(url+'/v1/'+action,{method:'POST',headers,body:'{}'})).status,405);
  }
  assert.equal((await (await fetch(url+'/v1/context',{headers})).json()).project,'Werkstatt');
});
test('privacy and emergency stop bypass a stalled camera confirmation, and remote unlock is forbidden',async t=>{
  let release,started,locked=false;const gate=new Promise(resolve=>release=resolve),begin=new Promise(resolve=>started=resolve),calls=[];
  const token='d'.repeat(64),api=await createControlApi({port:0,token,readStatus:()=>({locked}),onCommand:async(action)=>{calls.push(action);if(action==='camera'){started();await gate;}if(action==='privacy')locked=true;},onStop:async()=>{locked=true;return {remoteStop:'unavailable'};}});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  const camera=fetch(url+'/v1/camera',{method:'POST',headers,body:'{"enabled":true}'});await begin;
  try{
    const stop=await fetch(url+'/v1/emergency-stop',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(1000)});
    assert.equal(stop.status,200);assert.equal((await stop.json()).result.remoteStop,'unavailable');
    const privacy=await fetch(url+'/v1/privacy',{method:'POST',headers,body:'{"enabled":true}',signal:AbortSignal.timeout(1000)});assert.equal(privacy.status,200);
    assert.equal((await fetch(url+'/v1/privacy',{method:'POST',headers,body:'{"enabled":false}'})).status,403);
    assert.deepEqual(calls,['camera','privacy']);
  }finally{release();await camera;}
});
test('routines require a configured identifier and emergency stop rejects injected arguments',async t=>{
  const calls=[],token='e'.repeat(64),api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:()=>{},onRoutine:async id=>{calls.push(id);return {prepared:true};},onStop:()=>({})});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  assert.equal((await fetch(url+'/v1/routine',{method:'POST',headers,body:'{"id":"musik"}'})).status,200);
  for(const body of ['{"id":"../secret"}','{"id":"musik","command":"delete"}','{}'])assert.equal((await fetch(url+'/v1/routine',{method:'POST',headers,body})).status,400);
  assert.equal((await fetch(url+'/v1/emergency-stop',{method:'POST',headers,body:'{"command":"delete"}'})).status,400);assert.deepEqual(calls,['musik']);
});
test('a stop invalidates already queued sensor enables instead of replaying them after shutdown',async t=>{
  let release,started;const gate=new Promise(resolve=>release=resolve),begin=new Promise(resolve=>started=resolve),calls=[];
  const token='f'.repeat(64),api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:async action=>{calls.push(action);if(action==='camera'){started();await gate;}},onStop:async()=>({remoteStop:'unavailable'})});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  const first=fetch(url+'/v1/camera',{method:'POST',headers,body:'{"enabled":true}'});await begin;
  const second=fetch(url+'/v1/live',{method:'POST',headers,body:'{"enabled":true}'});await new Promise(resolve=>setTimeout(resolve,30));
  try{assert.equal((await fetch(url+'/v1/emergency-stop',{method:'POST',headers,body:'{}'})).status,200);}finally{release();await first;}
  assert.equal((await second).status,423);assert.deepEqual(calls,['camera']);
});
async function fixture(t){
  const commands=[],token='a'.repeat(64);
  const api=await createControlApi({port:0,token,readStatus:()=>({live:false,camera:{enabled:false}}),onCommand:async(action,enabled)=>{commands.push({action,enabled});return {accepted:true};}});
  t.after(()=>api.close());
  return {url:`http://127.0.0.1:${api.address().port}`,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},commands};
}
test('controls and status require the token and never reveal it',async t=>{
  const f=await fixture(t);
  assert.equal((await fetch(f.url+'/v1/status')).status,401);
  const reply=await fetch(f.url+'/v1/status',{headers:f.headers});assert.equal(reply.status,200);const text=await reply.text();assert.ok(!text.includes('a'.repeat(64)));
});

test('workspace controls accept only explicit visibility, valid tabs and safe web URLs',async t=>{
  const token='b'.repeat(64),calls=[],api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:async()=>{},onWorkbench:value=>calls.push(value)});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}/v1/workbench`,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  for(const payload of [{enabled:true,tab:'system'},{enabled:false},{enabled:true,tab:'browser',url:'https://example.com'}])assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)})).status,200);
  for(const payload of [{enabled:'yes'},{enabled:true,tab:'shell'},{enabled:true,url:'file:///C:/secret'},{enabled:true,url:'https://user:pass@example.com'},{enabled:true,command:'delete'}])assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)})).status,400);
  assert.equal(calls.length,3);
});
test('agent workbench requests preserve presentation leases and refused close results',async t=>{
  const token='b'.repeat(64),calls=[],api=await createControlApi({port:0,token,readStatus:()=>({workbench:{visible:true,presentation:{owner:'user'}}}),onCommand:()=>{},onWorkbench:value=>{
    calls.push(value);
    return value.enabled?{shown:true,owner:'agent',requestId:value.requestId||'generated-lease',reason:value.reason||''}:{closed:false,owner:'user',requestId:'',reason:'user-owned'};
  }});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}/v1/workbench`,headers={Authorization:'Bearer '+token};
  const open=await fetch(url,{method:'POST',headers,body:JSON.stringify({enabled:true,agent:true,tab:'console',reason:'Erklärung zeigen'})});
  assert.equal(open.status,200);assert.deepEqual((await open.json()).result,{shown:true,owner:'agent',requestId:'generated-lease',reason:'Erklärung zeigen'});
  const close=await fetch(url,{method:'POST',headers,body:'{"enabled":false,"agent":true,"requestId":"generated-lease"}'});
  assert.equal(close.status,200);assert.deepEqual((await close.json()).result,{closed:false,owner:'user',requestId:'',reason:'user-owned'});
  assert.deepEqual(calls,[{enabled:true,agent:true,tab:'console',reason:'Erklärung zeigen'},{enabled:false,agent:true,requestId:'generated-lease'}]);
});
test('agent workbench fields are bounded and close requires an explicit lease',async t=>{
  const token='b'.repeat(64),calls=[],api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:()=>{},onWorkbench:value=>{calls.push(value);return {closed:true,owner:'none',requestId:value.requestId,reason:''};}});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}/v1/workbench`,headers={Authorization:'Bearer '+token};
  for(const payload of [{enabled:false,agent:true},{enabled:false,agent:true,requestId:''},{enabled:true,agent:'true'},{enabled:true,agent:true,requestId:'x'.repeat(81)},{enabled:true,agent:true,requestId:'request/../../x'},{enabled:true,agent:true,requestId:4},{enabled:true,agent:true,reason:'x'.repeat(161)},{enabled:true,agent:true,reason:'line\ncommand'},{enabled:true,agent:true,reason:4},{enabled:true,agent:true,force:true}])assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)})).status,400);
  const close=await fetch(url,{method:'POST',headers,body:'{"enabled":false,"agent":true,"requestId":"lease_1-2"}'});
  assert.equal(close.status,200);assert.equal((await close.json()).result.closed,true);assert.equal(calls.length,1);
});
test('current content reads only an explicitly requested source and returns the bounded observation',async t=>{
  const token='a'.repeat(64),calls=[],observation={kind:'clipboard',text:'Ausgewählter Text',source:{app:'Zwischenablage'},observedAt:'2026-10-11T12:00:00Z',truncated:false};
  const api=await createControlApi({port:0,token,readStatus:()=>({privacy:{locked:false}}),onCommand:()=>{throw Error('Must not enable any sensor');},onContent:value=>{calls.push(value);return {...observation,kind:value.kind};}});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}/v1/current-content`,headers={Authorization:'Bearer '+token};
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({kind:'clipboard',question:'  Erkläre den kopierten Text.  '})});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,action:'current-content',observation,status:{privacy:{locked:false}}});
  assert.equal((await fetch(url,{method:'POST',headers,body:'{"kind":"window","question":"Erkläre dieses Fenster."}'})).status,200);
  for(const payload of [{kind:'file',question:'Was?'},{kind:'clipboard'},{kind:'clipboard',question:''},{kind:'window',question:'  '},{kind:'window',question:'x'.repeat(501)},{kind:'window',question:'Was?',path:'C:\\secret'},{kind:'clipboard',question:'Was?',enabled:true},null,[],42])assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)})).status,400);
  assert.deepEqual(calls,[{kind:'clipboard',question:'Erkläre den kopierten Text.'},{kind:'window',question:'Erkläre dieses Fenster.'}]);
});
test('current-content and normal stop retain authentication, origin and local-lock boundaries',async t=>{
  const token='a'.repeat(64),calls=[],api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:()=>{},onContent:()=>{calls.push('content');throw Object.assign(new Error('PRIVATE'),{status:423});},onStopTask:()=>{calls.push('stop');return {};}});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  for(const [action,body] of [['current-content','{"kind":"window","question":"Was?"}'],['stop','{}']]){
    assert.equal((await fetch(url+'/v1/'+action,{method:'POST',body})).status,401);
    assert.equal((await fetch(url+'/v1/'+action,{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body})).status,403);
    assert.equal((await fetch(url+'/v1/'+action,{headers})).status,405);
  }
  const response=await fetch(url+'/v1/current-content',{method:'POST',headers,body:'{"kind":"window","question":"Was?"}'});assert.equal(response.status,423);assert.doesNotMatch(await response.text(),/PRIVATE/);assert.deepEqual(calls,['content']);
});
test('normal stop bypasses pending sensor confirmation and invalidates queued controls without locking privacy',async t=>{
  let release,started;const gate=new Promise(resolve=>release=resolve),begin=new Promise(resolve=>started=resolve),calls=[];
  const token='a'.repeat(64),api=await createControlApi({port:0,token,readStatus:()=>({privacy:{locked:false}}),onCommand:async action=>{calls.push(action);if(action==='camera'){started();await gate;}},onStop:()=>{throw Error('Must not invoke emergency stop');},onStopTask:()=>{calls.push('stop');return {remoteStop:'requested'};}});t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  const first=fetch(url+'/v1/camera',{method:'POST',headers,body:'{"enabled":true}'});await begin;
  const queued=fetch(url+'/v1/live',{method:'POST',headers,body:'{"enabled":true}'});await new Promise(resolve=>setTimeout(resolve,30));
  try{
    const response=await fetch(url+'/v1/stop',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(1000)});assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,action:'stop',result:{remoteStop:'requested'},status:{privacy:{locked:false}}});
  }finally{release();await first;}
  assert.equal((await queued).status,423);assert.deepEqual(calls,['camera','stop']);
  for(const body of ['{"enabled":true}','{"command":"delete"}','null','[]','42','"stop"'])assert.equal((await fetch(url+'/v1/stop',{method:'POST',headers,body})).status,400);
});
test('new content and normal-stop operations report unavailable adapters without changing other controls',async t=>{
  const f=await fixture(t);
  for(const [action,body] of [['current-content','{"kind":"clipboard","question":"Was?"}'],['stop','{}']])assert.equal((await fetch(f.url+'/v1/'+action,{method:'POST',headers:f.headers,body})).status,503);
  assert.deepEqual(f.commands,[]);
});
test('PowerShell helper sends agent leases, explicit content questions and normal stop to the local API',{skip:process.platform!=='win32'},async t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'voice-control-api-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const token='4'.repeat(64),calls=[],api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand:()=>{},onWorkbench:value=>{calls.push(value);return value.enabled?{shown:true,owner:value.agent?'agent':'user',requestId:'cli-lease',reason:value.reason||''}:{closed:true,owner:'none',requestId:value.requestId,reason:''};},onContent:value=>{calls.push(value);return {kind:value.kind,text:'Requested text'};},onStopTask:()=>{calls.push('stop');return {remoteStop:'requested'};}});t.after(()=>api.close());
  fs.copyFileSync(path.join(__dirname,'../control.ps1'),path.join(directory,'control.ps1'));fs.mkdirSync(path.join(directory,'.local'));
  fs.writeFileSync(path.join(directory,'.local/control-api.json'),JSON.stringify({url:`http://127.0.0.1:${api.address().port}`,token}));
  const run=args=>new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(directory,'control.ps1'),...args],{windowsHide:true});let output='',error='';
    child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,output,error}));
  });
  const open=await run(['-Action','workbench','-State','on','-Agent','-Tab','console','-Reason','Explain window']);assert.equal(open.code,0,open.error);assert.equal(JSON.parse(open.output).result.requestId,'cli-lease');
  const close=await run(['-Action','workbench','-State','off','-Agent','-RequestId','cli-lease']);assert.equal(close.code,0,close.error);assert.equal(JSON.parse(close.output).result.closed,true);
  for(const kind of ['clipboard','window']){const content=await run(['-Action','current-content','-Kind',kind,'-Question','Explain this text.']);assert.equal(content.code,0,content.error);assert.equal(JSON.parse(content.output).observation.kind,kind);}
  const stop=await run(['-Action','stop']);assert.equal(stop.code,0,stop.error);assert.equal(JSON.parse(stop.output).result.remoteStop,'requested');
  for(const args of [['-Action','workbench','-State','off','-Agent'],['-Action','current-content','-Kind','news','-Question','Explain.'],['-Action','intel','-Kind','clipboard']])assert.notEqual((await run(args)).code,0);
  const manual=await run(['-Action','workbench','-State','on']);assert.equal(manual.code,0,manual.error);assert.equal(JSON.parse(manual.output).result.owner,'user');
  assert.deepEqual(calls,[{enabled:true,tab:'console',agent:true,reason:'Explain window'},{enabled:false,tab:'system',agent:true,requestId:'cli-lease'},{kind:'clipboard',question:'Explain this text.'},{kind:'window',question:'Explain this text.'},'stop',{enabled:true,tab:'system'}]);
});
test('only explicit boolean camera, live and wakeword controls are accepted',async t=>{
  const f=await fixture(t);
  for(const action of ['camera','live','wakewords']){
    const response=await fetch(f.url+'/v1/'+action,{method:'POST',headers:f.headers,body:JSON.stringify({enabled:false})});assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,action,enabled:false,status:{live:false,camera:{enabled:false}}});
  }
  for(const body of [{enabled:'false'},{enabled:false,url:'http://evil.invalid'},{}])assert.equal((await fetch(f.url+'/v1/camera',{method:'POST',headers:f.headers,body:JSON.stringify(body)})).status,400);
  assert.deepEqual(f.commands,[{action:'camera',enabled:false},{action:'live',enabled:false},{action:'wakewords',enabled:false}]);
  assert.equal((await fetch(f.url+'/v1/run',{method:'POST',headers:f.headers,body:'{}'})).status,404);
});
test('browser origins and oversized payloads cannot issue controls',async t=>{
  const f=await fixture(t);
  assert.equal((await fetch(f.url+'/v1/camera',{method:'POST',headers:{...f.headers,Origin:'https://evil.invalid'},body:'{"enabled":true}'})).status,403);
  assert.equal((await fetch(f.url+'/v1/camera',{method:'POST',headers:f.headers,body:'x'.repeat(3000)})).status,413);
  assert.equal(f.commands.length,0);
});

test('wrong credentials including multibyte authorization headers fail safely',async t=>{
  const f=await fixture(t);
  for(const token of ['b'.repeat(64),'a','é'.repeat(64)]) {
    assert.equal((await fetch(f.url+'/v1/status',{headers:{Authorization:'Bearer '+token}})).status,401);
  }
  assert.equal((await fetch(f.url+'/v1/status?token='+'a'.repeat(64))).status,401);
});

test('chunked bodies above 1KB are rejected for both commands and status',async t=>{
  const f=await fixture(t),http=require('node:http');
  for(const [method,path] of [['POST','/v1/camera'],['GET','/v1/status']]) {
    const status=await new Promise((resolve,reject)=>{
      const request=http.request(f.url+path,{method,headers:{...f.headers,'Transfer-Encoding':'chunked'}},response=>{
        response.resume();response.on('end',()=>resolve(response.statusCode));
      });
      request.on('error',reject);request.write('x'.repeat(800));request.end('x'.repeat(800));
    });
    assert.equal(status,413);
  }
  assert.equal(f.commands.length,0);
});

test('responses disable caching and wrong methods cannot dispatch controls',async t=>{
  const f=await fixture(t);
  const response=await fetch(f.url+'/v1/status',{headers:f.headers});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.equal((await fetch(f.url+'/v1/camera',{headers:f.headers})).status,405);
  assert.equal((await fetch(f.url+'/v1/status',{method:'POST',headers:f.headers,body:'{}'})).status,405);
  assert.equal(f.commands.length,0);
});

test('callback failures never echo exception details or the token',async t=>{
  const token='a'.repeat(64);
  const api=await createControlApi({port:0,token,readStatus:()=>{throw new Error(token);},onCommand:()=>{throw null;}});
  t.after(()=>api.close());
  assert.equal(api.address().address,'127.0.0.1');
  const url=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  for(const path of ['/v1/status','/v1/camera']) {
    const response=await fetch(url+path,{headers,...(path.endsWith('camera')?{method:'POST',body:'{"enabled":true}'}:{})});
    assert.equal(response.status,500);
    assert.deepEqual(await response.json(),{error:'Action failed'});
  }
});

test('overlapping controls wait for the previous confirmation and retain each resulting status',async t=>{
  let release,started;
  const gate=new Promise(resolve=>release=resolve),start=new Promise(resolve=>started=resolve),calls=[];
  let active=false;
  const token='a'.repeat(64);
  const api=await createControlApi({port:0,token,readStatus:()=>({active}),onCommand:async(_action,enabled)=>{calls.push(enabled);if(enabled){started();await gate;}active=enabled;}});
  t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}/v1/camera`,headers={Authorization:'Bearer '+token};
  const first=fetch(url,{method:'POST',headers,body:'{"enabled":true}'});
  await start;
  const second=fetch(url,{method:'POST',headers,body:'{"enabled":false}'});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(calls,[true]);release();
  assert.deepEqual((await (await first).json()).status,{active:true});
  assert.deepEqual((await (await second).json()).status,{active:false});
});

test('a look returns a fresh observation through the existing stream without switching the camera',async t=>{
  const questions=[],token='a'.repeat(64),observation={description:'Eine Tasse.',capturedAt:'2026-10-09T14:00:00Z',source:{label:'HD Webcam C525'}};
  const api=await createControlApi({port:0,token,readStatus:()=>({camera:{active:true}}),onCommand:()=>{throw new Error('Must not reopen camera');},onLook:async question=>{questions.push(question);return observation;}});
  t.after(()=>api.close());
  const url=`http://127.0.0.1:${api.address().port}/v1/look`,headers={Authorization:'Bearer '+token};
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({question:'Was halte ich in der Hand?'})});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,action:'look',observation,status:{camera:{active:true}}});
  assert.deepEqual(questions,['Was halte ich in der Hand?']);
  for(const payload of [{question:''},{question:'x'.repeat(501)},{question:'Was?',image:'secret'},{enabled:true}]){
    assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)})).status,400);
  }
  assert.equal(questions.length,1);
});

test('standby is an explicit action with an empty body, distinct from microphone privacy off',async t=>{
  const f=await fixture(t);
  const response=await fetch(f.url+'/v1/standby',{method:'POST',headers:f.headers,body:'{}'});
  assert.equal(response.status,200);assert.equal((await response.json()).action,'standby');
  assert.deepEqual(f.commands,[{action:'standby',enabled:undefined}]);
  assert.equal((await fetch(f.url+'/v1/standby',{method:'POST',headers:f.headers,body:'{"enabled":false}'})).status,400);
});

test('screen, marker and mode endpoints expose only typed authenticated workstation operations',async t=>{
  const token='a'.repeat(64),calls=[];
  const api=await createControlApi({port:0,token,readStatus:()=>({}),onCommand(){},onScreen:async question=>{calls.push(question);return {description:'Ein Testfenster.',source:{name:'Test'},capturedAt:new Date().toISOString()};},onHighlight:async value=>{calls.push(value);return {clickThrough:true};},readModes:()=>[{id:'gaming',name:'Gaming'}],onMode:async id=>({id,ok:false,instructionsExecuted:false})});
  t.after(()=>api.close());const url=`http://127.0.0.1:${api.address().port}`,headers={Authorization:'Bearer '+token};
  assert.equal((await fetch(url+'/v1/screen',{method:'POST',body:'{"question":"Was?"}'})).status,401);
  const screenReply=await fetch(url+'/v1/screen',{method:'POST',headers,body:'{"question":"Was siehst du?"}'});assert.equal(screenReply.status,200);assert.equal((await screenReply.json()).observation.description,'Ein Testfenster.');
  assert.equal((await fetch(url+'/v1/screen',{method:'POST',headers,body:'{"question":"Was?","image":"secret"}'})).status,400);
  const modes=await fetch(url+'/v1/modes',{headers});assert.deepEqual((await modes.json()).modes,[{id:'gaming',name:'Gaming'}]);
  const mode=await fetch(url+'/v1/mode',{method:'POST',headers,body:'{"id":"gaming"}'});assert.equal((await mode.json()).ok,false,'Partial local launch failure must not be reported as success');
  assert.equal((await fetch(url+'/v1/mode',{method:'POST',headers,body:'{"id":"gaming","command":"calc"}'})).status,400);
  assert.equal((await fetch(url+'/v1/highlight',{method:'POST',headers,body:JSON.stringify({x:10,y:20,width:30,height:40,label:'Hier',capturedAt:new Date().toISOString()})})).status,200);
  assert.equal((await fetch(url+'/v1/highlight',{method:'POST',headers,body:'{"x":1,"y":2,"width":3,"height":4,"shell":"evil"}'})).status,400);
});
