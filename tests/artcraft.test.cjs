'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const runFile=require('node:util').promisify(require('node:child_process').execFile);
const modulePath=path.join(__dirname,'../artcraft.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function pngDimensions(width,height){const bytes=Buffer.from(png);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);let crc=0xffffffff;for(const byte of bytes.subarray(12,29)){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}bytes.writeUInt32BE((crc^0xffffffff)>>>0,29);return bytes;}
function api(){assert.ok(fs.existsSync(modulePath),'Artcraft manager is not implemented');return require(modulePath);}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-craft-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const installRoot=path.join(root,'installed'),cacheRoot=path.join(root,'cache');fs.mkdirSync(cacheRoot);return {root,installRoot,cacheRoot};}
function install(f,id){const stem=id+'craft',name=id[0].toUpperCase()+id.slice(1)+'Craft',exe=path.join(f.installRoot,'apps',name,stem+'.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'fixture');return exe;}
function running(exe,port,pid=42,extras={}){return {processes:[{pid,executablePath:exe,mainWindowHandle:123,controlPort:port,...extras}],listeners:[{pid,port,localAddress:'127.0.0.1'}]};}
function manager(t,f,options={}){const m=api().createArtcraft({...f,...options});t.after(()=>m.dispose());return m;}
test('input grants expiring during target checks or pointer movement never dispatch the final input',async t=>{
 for(const boundary of ['process','first-window','inspect','second-window','move']){
  const f=fixture(t),exe=install(f,'light'),requests=[];
  let time=0,expiring=false,windowReads=0;
  const expire=step=>{if(expiring&&step===boundary)time=60000;};
  const native={pid:42,windowId:'123',executablePath:exe,visible:true,minimized:false,enabled:true,popupWindowId:'123',dpi:96,frame:{x:-1600,y:50,width:1500,height:1000},client:{x:-1592,y:96,width:1484,height:946}};
  const m=manager(t,f,{initialAppId:'light',now:()=>time,
   readProcesses:async()=>{expire('process');return running(exe,7979);},
   readWindow:async()=>{expire(++windowReads===1?'first-window':'second-window');return native;},
   transport:async(connection,request)=>{
    requests.push(request.method);
    if(request.method==='ui.inspect'){expire('inspect');return {window:[1484,946],pixelsPerPoint:1,ui:{dialog:null},fileDialogs:[]};}
    if(request.method==='ui.move')expire('move');
    return null;
   }});
  const options={captureTarget:{appId:'light',pid:42,windowId:'123'},captureGeneration:1,getCaptureGeneration:()=>1};
  const grant=await m.input({appId:'light',kind:'arm',frameWidth:1500,frameHeight:1000},options);
  windowReads=0;time=59000;expiring=true;requests.length=0;
  const payload={appId:'light',kind:boundary==='move'?'scroll':'click',frameId:grant.frameId,x:.5,y:.5,...(boundary==='move'?{delta:120}:{})};
  await assert.rejects(m.input(payload,options),/erneut aktivieren|nicht mehr gültig/,boundary);
  assert.ok(!requests.some(method=>method==='ui.click'||method==='ui.scroll'),boundary);
  await assert.rejects(m.input(payload,options),/erneut aktivieren/,boundary+' invalidates the grant');
 }
});
test('restored app selection survives reconstruction and invalid saved app IDs fall back to PhotoCraft',t=>{
 const f=fixture(t);assert.equal(manager(t,f,{initialAppId:'light'}).snapshot().selectedAppId,'light');assert.equal(manager(t,f,{initialAppId:'powershell'}).snapshot().selectedAppId,'photo');
});

test('stream targets require an exact known GUI owner and remain independent of MCP ports',async t=>{
 const f=fixture(t),exe=install(f,'photo');let data=running(exe,null);const m=manager(t,f,{readProcesses:async()=>data});assert.equal(typeof m.streamTarget,'function');
 assert.deepEqual(await m.streamTarget('photo'),{appId:'photo',pid:42,windowId:'123'});
 data=running(exe.replace('.exe','-cli.exe'),null);await assert.rejects(m.streamTarget('photo'));
 data=running(exe,null);data.processes.push({...data.processes[0],pid:99});await assert.rejects(m.streamTarget('photo'));
});

test('explicit opening creates a local GUI control descriptor when none exists, without a second MCP',async t=>{
  for(const appId of ['photo','vector','pdf']){
    const f=fixture(t);install(f,appId);const launches=[];
    const m=manager(t,f,{readProcesses:async()=>({processes:[],listeners:[]}),launcher:async(exe,args)=>launches.push(args)});
    await m.open(appId);assert.equal(launches.length,1);assert.equal(launches[0][0],'--control');
    const stored=JSON.parse(fs.readFileSync(path.join(f.cacheRoot,'artcraft-connections.json'),'utf8'))[appId];
    if(appId==='pdf')assert.equal(launches[0][1],stored.endpointFile);
    else assert.ok(stored.port>0&&stored.port<=65535);
    if(appId==='photo'){assert.match(fs.readFileSync(stored.tokenFile,'utf8'),/^[a-f0-9]{64}$/);assert.ok(launches[0].includes('--control-token-file'));}
    assert.ok(!JSON.stringify(m.snapshot()).includes(f.cacheRoot));assert.ok(!launches[0].includes('mcp'));
  }
});

test('stop cancels a pending native open or focus before its process read completes',async t=>{
  for(const action of ['open','focus']){
    const f=fixture(t),exe=install(f,'vector');let finishRead,launches=0,calls=0;
    const m=manager(t,f,{readProcesses:()=>new Promise(resolve=>finishRead=resolve),launcher:async()=>{launches++;},transport:async()=>{calls++;return {};}});
    const request=m[action]('vector');m.stop();finishRead(action==='open'?{processes:[],listeners:[]}:running(exe,7979));
    await assert.rejects(request,{name:'AbortError'});assert.equal(launches,0);assert.equal(calls,0);
  }
});
async function server(t,handler){const sockets=new Set(),s=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let text='';socket.on('data',bytes=>{text+=bytes;let index;while((index=text.indexOf('\n'))>=0){const line=text.slice(0,index);text=text.slice(index+1);const request=JSON.parse(line);handler(request,socket);}});});await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(()=>{for(const s of sockets)s.destroy();return new Promise(resolve=>s.close(resolve));});return s.address().port;}

test('catalog reports installed GUI separately from running and never exposes internal paths',async t=>{
  const f=fixture(t),exe=install(f,'photo');const m=manager(t,f,{readProcesses:async()=>running(exe,null,42,{tokenFile:path.join(f.root,'secret'),commandLine:'token=SECRET'})});await m.refresh();const state=m.snapshot();assert.equal(state.apps.length,12);assert.equal(state.apps.find(a=>a.id==='photo').installed,true);assert.equal(state.apps.find(a=>a.id==='photo').running,true);assert.equal(state.apps.find(a=>a.id==='vector').installed,false);assert.equal(state.selected.bridgeState,'unconfigured');assert.ok(!JSON.stringify(state).includes(f.root));assert.ok(!JSON.stringify(state).includes('SECRET'));
});
test('known executable and visible GUI owner are required before a preview connection',async t=>{
  const f=fixture(t),exe=install(f,'vector');let calls=0;const m=manager(t,f,{transport:async()=>{calls++;return {};},readProcesses:async()=>running(exe.replace('.exe','-cli.exe'),7979)});await m.select('vector');await m.refresh({preview:true});assert.equal(m.snapshot().selected.running,false);assert.equal(calls,0);
  const n=manager(t,f,{transport:async()=>{calls++;return {};},readProcesses:async()=>running(exe,7979,42,{mainWindowHandle:0})});await n.select('vector');await n.refresh({preview:true});assert.equal(n.snapshot().selected.running,false);assert.equal(calls,0);
});
test('listener belonging to another PID is never contacted',async t=>{
  const f=fixture(t),exe=install(f,'vector');let calls=0;const data=running(exe,7979);data.listeners[0].pid=9;const m=manager(t,f,{readProcesses:async()=>data,transport:async()=>{calls++;return {};}});await m.select('vector');await m.refresh({preview:true});assert.equal(calls,0);assert.notEqual(m.snapshot().selected.bridgeState,'ready');
});
test('register persists local descriptors before launch and refuses arbitrary or remote inputs',async t=>{
  const f=fixture(t);install(f,'vector');const m=manager(t,f,{readProcesses:async()=>({processes:[],listeners:[]})});m.register({appId:'vector',port:54321});const stored=JSON.parse(fs.readFileSync(path.join(f.cacheRoot,'artcraft-connections.json'),'utf8'));assert.equal(stored.vector.port,54321);assert.throws(()=>m.register({appId:'evil',port:1}),/app/i);assert.throws(()=>m.register({appId:'vector',port:0}),/port/i);assert.throws(()=>m.register({appId:'photo',port:123,tokenFile:'\\\\evil\\secret'}),/local|absolute/i);assert.throws(()=>m.register({appId:'photo',port:123,tokenFile:'relative.txt'}),/local|absolute/i);assert.ok(!JSON.stringify(m.snapshot()).includes('54321'));
});
test('opening reuses a running GUI and only starts a known installed editor with explicit registered flags',async t=>{
  const f=fixture(t),exe=install(f,'vector'),launches=[];let data=running(exe,23456);const m=manager(t,f,{readProcesses:async()=>data,launcher:async(exe,args)=>launches.push({exe,args})});await m.open('vector');assert.equal(launches.length,0);data={processes:[],listeners:[]};m.register({appId:'vector',port:23456});await m.open('vector');assert.deepEqual(launches,[{exe,args:['--control','23456']}]);await assert.rejects(m.open('evil'),/app/i);await assert.rejects(m.open('photo'),/install/i);
});
test('Photo authenticates first and uses passive preview while publishing only redacted metadata',async t=>{
  const f=fixture(t),exe=install(f,'photo'),token='a'.repeat(64),tokenFile=path.join(f.root,'token.txt');fs.writeFileSync(tokenFile,token);const calls=[];const port=await server(t,(req,s)=>{calls.push(req);let result={authenticated:true};if(req.method==='ui.inspect')result={document:{name:'C:\\private\\work.psd token=SECRET',width:2048,height:1024,layers:[{children:[{}]},{}]},session:{active:0,documents:[{dirty:true}]},tool:'Brush',jobs:[{label:'Render',status:'running',progress:0.5}],raw:'PRIVATE'};if(req.method==='ui.screenshot')result={base64:png.toString('base64'),mime:'image/png',width:1,height:1};s.write(JSON.stringify({id:req.id,ok:true,result})+'\n');});const m=manager(t,f,{readProcesses:async()=>running(exe,port,42,{tokenFile}),now:()=>12345});await m.refresh({preview:true});const state=m.snapshot();assert.equal(state.selected.bridgeState,'ready');assert.equal(state.selected.document.dirty,true);assert.equal(state.selected.document.width,2048);assert.equal(state.selected.document.layers,3);assert.equal(state.selected.tool,'Brush');assert.equal(state.preview.image,'data:image/png;base64,'+png.toString('base64'));assert.equal(state.preview.capturedAt,12345);assert.equal(calls[0].method,'auth');assert.equal(calls[0].params.token,token);assert.ok(calls.filter(c=>c.method==='ui.screenshot').every(c=>c.params.focus===false));assert.ok(!JSON.stringify(state).includes('SECRET'));assert.ok(!JSON.stringify(state).includes('private'));assert.ok(!JSON.stringify(state).includes(token));assert.ok(!JSON.stringify(state).includes('PRIVATE'));
});
test('passive refresh requests selected metadata only and never screenshots or focus',async t=>{
  const f=fixture(t),exe=install(f,'vector'),requests=[];const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>{requests.push(r);return {documents:[{title:'Drawing.svg',dirty:true}],activeDocument:0,tool:'pen'};}});await m.select('vector');await m.refresh();assert.deepEqual(requests.map(r=>r.method),['ui.inspect']);assert.equal(m.snapshot().selected.document.name,'Drawing.svg');assert.equal(m.snapshot().selected.document.dirty,true);assert.equal(m.snapshot().preview,null);await m.focus('vector');assert.equal(requests.at(-1).method,'ui.focus');
});
test('all inline adapters decode their pinned screenshot result field',async t=>{
  for(const [id,field] of [['vector','pngBase64'],['design','pngBase64'],['deck','png'],['grid','base64'],['sound','png_base64'],['effect','png'],['film','pngBase64']]){const f=fixture(t),exe=install(f,id);const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>r.method==='ui.screenshot'?{[field]:png.toString('base64'),width:1,height:1}:{}});await m.select(id);await m.refresh({preview:true});assert.equal(m.snapshot().preview?.appId,id,id);}
});
test('PDF validates endpoint PID and authenticates using JSON RPC before ui.state',async t=>{
  const f=fixture(t),exe=install(f,'pdf'),calls=[],token='b'.repeat(64);const port=await server(t,(req,s)=>{calls.push(req);s.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result:req.method==='auth'?{ok:true}:req.method==='ui.screenshot'?{png_base64:png.toString('base64'),width:1,height:1}:{documents:[{doc:2,name:'Document.pdf',path:'PRIVATE',pages:5,dirty:false,active:true}],quick_tool:'highlight'}})+'\n');});const endpointFile=path.join(f.root,'endpoint.json');fs.writeFileSync(endpointFile,JSON.stringify({port,pid:42,token}));const m=manager(t,f,{readProcesses:async()=>running(exe,port,42,{endpointFile,controlPort:undefined})});await m.select('pdf');await m.refresh({preview:true});assert.equal(m.snapshot().selected.document.pages,5);assert.equal(m.snapshot().preview?.appId,'pdf');assert.ok(calls.every(c=>c.jsonrpc==='2.0'));assert.ok(calls.some(c=>c.method==='ui.state'));fs.writeFileSync(endpointFile,JSON.stringify({port,pid:9,token}));const before=calls.length;await m.refresh({preview:true});assert.equal(calls.length,before);assert.equal(m.snapshot().preview,null);
});
test('path adapters read only the exact private issued file and always delete it',async t=>{
  for(const id of ['word','cad','light']){const f=fixture(t),exe=install(f,id),secret=path.join(f.root,'secret.png');fs.writeFileSync(secret,png);let issued;const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>{if(r.method!=='ui.screenshot')return {};issued=r.params.path;assert.ok(issued.startsWith(f.cacheRoot+path.sep));assert.equal(r.params.focus,false);if(id==='light')assert.equal(r.params.headless,true);fs.writeFileSync(issued,png);return {path:secret,width:1,height:1};}});await m.select(id);await m.refresh({preview:true});assert.equal(m.snapshot().preview?.appId,id);assert.equal(fs.existsSync(issued),false);assert.equal(fs.existsSync(secret),true);}
});
test('path adapter never accepts a returned path when no issued file was written',async t=>{
  const f=fixture(t),exe=install(f,'word'),secret=path.join(f.root,'secret.png');fs.writeFileSync(secret,png);const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>r.method==='ui.screenshot'?{path:secret,width:1,height:1}:{}});await m.select('word');await m.refresh({preview:true});assert.equal(m.snapshot().preview,null);assert.equal(fs.existsSync(secret),true);
});
test('invalid base64, MIME and unsafe PNG dimensions never become a preview',async t=>{
  const f=fixture(t),exe=install(f,'vector');for(const data of [{pngBase64:'invalid==='},{pngBase64:Buffer.from('PRIVATE').toString('base64')},{pngBase64:png.toString('base64'),width:2,height:1}]){const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>r.method==='ui.screenshot'?data:{}});await m.select('vector');await m.refresh({preview:true});assert.equal(m.snapshot().preview,null);}
  const bomb=Buffer.from(png);bomb.writeUInt32BE(100000,16);const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>r.method==='ui.screenshot'?{pngBase64:bomb.toString('base64')}:{}});await m.select('vector');await m.refresh({preview:true});assert.equal(m.snapshot().preview,null);
});
test('select, abort, stop and dispose reject late screenshots and cleanup path previews',async t=>{
  for(const action of ['select','abort','stop','dispose']){const f=fixture(t),exe=install(f,'word');let release,issued,started;const start=new Promise(resolve=>started=resolve);const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>{if(r.method!=='ui.screenshot')return {};issued=r.params.path;started();await new Promise(resolve=>release=resolve);fs.writeFileSync(issued,png);return {path:issued,width:1,height:1};}});await m.select('word');const controller=new AbortController(),refresh=m.refresh({preview:true,signal:controller.signal});await start;if(action==='select')await m.select('vector');else if(action==='abort')controller.abort();else m[action]();release();await refresh;assert.equal(m.snapshot().preview,null,action);assert.equal(fs.existsSync(issued),false,action);}
});
test('malformed IDs, error messages and oversized responses are bounded and never leak server text',async t=>{
  for(const kind of ['wrong-id','error','oversized']){const f=fixture(t),exe=install(f,'vector');const port=await server(t,(req,s)=>{if(kind==='oversized')s.write('x'.repeat(600*1024)+'\n');else s.write(JSON.stringify(kind==='error'?{id:req.id,ok:false,error:'C:\\private\\token SECRET'}:{id:'wrong',ok:true,result:{}})+'\n');});const m=manager(t,f,{readProcesses:async()=>running(exe,port)});await m.select('vector');await m.refresh();assert.equal(m.snapshot().selected.bridgeState,'error',kind);assert.ok(!JSON.stringify(m.snapshot()).includes('SECRET'));}
});
test('real tool observations are app scoped, bounded and redacted without invented progress',async t=>{
  const f=fixture(t);install(f,'photo');const m=manager(t,f);m.observeTool({type:'tool-start',name:'photocraft.screenshot token=SECRET',status:'running'});assert.equal(m.snapshot().selected.activities.length,1);assert.ok(!JSON.stringify(m.snapshot()).includes('SECRET'));assert.equal(m.snapshot().selected.jobs.length,0);m.observeTool({type:'tool-end',name:'vectorcraft.draw',status:'complete',appId:'vector'});assert.equal(m.snapshot().selected.activities.length,1);await m.select('vector');assert.equal(m.snapshot().selected.activities.length,1);for(let i=0;i<50;i++)m.observeTool({name:'vectorcraft.draw',status:'complete'});assert.ok(m.snapshot().selected.activities.length<=30);
});
test('valid PNG headers exceeding the pixel limit and files exceeding the byte limit are rejected',async t=>{
  const f=fixture(t),exe=install(f,'word');let issued;const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>{if(r.method!=='ui.screenshot')return {};issued=r.params.path;fs.writeFileSync(issued,pngDimensions(5000,6000));return {};}});await m.select('word');await m.refresh({preview:true});assert.equal(m.snapshot().preview,null);assert.equal(fs.existsSync(issued),false);
  const n=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async(c,r)=>{if(r.method!=='ui.screenshot')return {};issued=r.params.path;fs.writeFileSync(issued,png);fs.truncateSync(issued,12*1024*1024+1);return {};}});await n.select('word');await n.refresh({preview:true});assert.equal(n.snapshot().preview,null);assert.equal(fs.existsSync(issued),false);
});
test('refused authentication never sends document or screenshot requests',async t=>{
  const f=fixture(t),exe=install(f,'photo'),tokenFile=path.join(f.root,'token');fs.writeFileSync(tokenFile,'c'.repeat(64));const requests=[];const port=await server(t,(r,s)=>{requests.push(r.method);s.write(JSON.stringify({id:r.id,ok:false,error:'SECRET tokenfile='+tokenFile})+'\n');});const m=manager(t,f,{readProcesses:async()=>running(exe,port,42,{tokenFile})});await m.refresh({preview:true});assert.deepEqual(requests,['auth']);assert.equal(m.snapshot().preview,null);assert.equal(m.snapshot().selected.bridgeState,'error');assert.ok(!JSON.stringify(m.snapshot()).includes('SECRET'));
});
test('abort closes an actual stalled TCP request promptly',async t=>{
  const f=fixture(t),exe=install(f,'vector');let started;const ready=new Promise(resolve=>started=resolve);const port=await server(t,()=>started());const m=manager(t,f,{readProcesses:async()=>running(exe,port)});await m.select('vector');const controller=new AbortController(),request=m.refresh({preview:true,signal:controller.signal});await ready;controller.abort();await Promise.race([request,new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('abort did not close socket')),500);timer.unref();})]);assert.equal(m.snapshot().preview,null);
});
test('concurrent open clicks cannot launch duplicate processes',async t=>{
  const f=fixture(t);install(f,'vector');let release,started,calls=0;const ready=new Promise(resolve=>started=resolve);const m=manager(t,f,{readProcesses:async()=>({processes:[],listeners:[]}),launcher:async()=>{calls++;started();await new Promise(resolve=>release=resolve);}});const a=m.open('vector'),b=m.open('vector');await b;await ready;release();await a;assert.equal(calls,1);
});
test('metadata never assigns the first document of an ambiguous multi-document editor',async t=>{
  const f=fixture(t),exe=install(f,'deck');const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async()=>({documents:[{title:'Wrong first',dirty:true},{title:'Actual active',dirty:false}]})});await m.select('deck');await m.refresh();assert.equal(m.snapshot().selected.document,undefined);
});
test('bare credential strings in tool and job metadata stay private',async t=>{
  const f=fixture(t),exe=install(f,'vector'),secret='d'.repeat(64);const m=manager(t,f,{readProcesses:async()=>running(exe,7979),transport:async()=>({tool:secret,jobs:[{label:secret}]})});await m.select('vector');await m.refresh();m.observeTool({appId:'vector',name:secret,status:'running'});assert.ok(!JSON.stringify(m.snapshot()).includes(secret));
});
test('Windows reader parses explicit quoted control flags and filters foreign listeners without emitting command lines',{skip:process.platform!=='win32'},async t=>{
  const f=fixture(t),exe=install(f,'photo'),psFile=path.join(f.root,'process-fixture.ps1');
  const quote=value=>"'"+value.replace(/'/g,"''")+"'";
  fs.writeFileSync(psFile,`
$fixtureExe = ${quote(exe)}
function Get-CimInstance { @(
  [PSCustomObject]@{ ProcessId=42; ExecutablePath=$fixtureExe; CommandLine='"'+$fixtureExe+'" --control=54321 --control-token-file="C:\\private path\\token.txt" SECRET' },
  [PSCustomObject]@{ ProcessId=9; ExecutablePath='C:\\foreign\\photocraft.exe'; CommandLine='SECRET' }
) }
function Get-Process { [PSCustomObject]@{ MainWindowHandle=[IntPtr]123 } }
function Get-NetTCPConnection { @(
  [PSCustomObject]@{ OwningProcess=42; LocalPort=54321; LocalAddress='127.0.0.1' },
  [PSCustomObject]@{ OwningProcess=9; LocalPort=54322; LocalAddress='127.0.0.1' },
  [PSCustomObject]@{ OwningProcess=42; LocalPort=54323; LocalAddress='0.0.0.0' }
) }
& ${quote(path.join(__dirname,'../scripts/artcraft_processes.ps1'))} -InstallRoot ${quote(f.installRoot)}
`);
  const {stdout}=await runFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',psFile],{windowsHide:true,timeout:6000,maxBuffer:65536});const data=JSON.parse(stdout.replace(/^\uFEFF/,''));assert.equal(data.processes.length,1);assert.equal(data.processes[0].controlPort,54321);assert.equal(data.processes[0].tokenFile,'C:\\private path\\token.txt');assert.deepEqual(data.listeners,[{pid:42,port:54321,localAddress:'127.0.0.1'}]);assert.ok(!stdout.includes('SECRET'));assert.ok(!stdout.includes('CommandLine'));
});
