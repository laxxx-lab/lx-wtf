'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const identity={id:'1234',pid:42,processStartedAt:'2026-10-14T10:00:00.1234567Z'},rect={x:-1920,y:0,width:960,height:1040},monitor={id:'\\\\.\\DISPLAY2',primary:false,bounds:{x:-1920,y:0,width:1920,height:1080},workArea:{x:-1920,y:0,width:1920,height:1040}};
function fixture(output,check=()=>{}){return require('../windows-control.cjs').createWindowsControl({platform:'win32',execFile(exe,args,options,callback){check(args);callback(null,JSON.stringify({sessionId:1,activeDesktop:true,observedAt:new Date().toISOString(),...output}));}});}
test('interactive window inventory includes physical geometry and monitor work areas rather than remote display guesses',async()=>{
 const value=await fixture({kind:'list',monitors:[monitor],windows:[{...identity,title:'Editor',app:'editor',rect,minimized:false}]}).read();
 assert.ok(value.desktop,'Missing native desktop observation');assert.deepEqual(value.desktop.monitors,[monitor]);assert.equal(value.desktop.coordinateSpace,'physical');assert.equal(value.desktop.sessionId,1);assert.deepEqual(value.windows[0].rect,rect);
 await assert.rejects(fixture({kind:'list',sessionId:0,activeDesktop:false,monitors:[{...monitor,bounds:{x:0,y:0,width:1024,height:768}}],windows:[]}).read(),/Fenster/);
});
test('natural arrangement requests receive current source data and never convert a service result into a monitor diagnosis',()=>{
 const {windowArrangementRequest,windowArrangementContext}=require('../windows-control.cjs');for(const text of ['Kannst du mal die Fenster auf meinem Desktop anordnen?','Ordne meine Fenster nebeneinander an','Fenster auf zwei Hälften aufteilen'])assert.equal(windowArrangementRequest(text),true);
 for(const text of ['Ändere den Desktop-Hintergrund','Ordne meine Fenster auf dem Notebook an','Wie geht es dir?'])assert.equal(windowArrangementRequest(text),false);
 const context=windowArrangementContext({observedAt:new Date().toISOString(),desktop:{sessionId:5,monitors:[monitor]},windows:[]});assert.match(context,/interaktiver Sitzung/);assert.match(context,/untrusted Quelldaten/);assert.match(context,/window-place/);assert.match(context,/1024x768/);assert.match(context,/"sessionId":5/);
});
test('window placement API authenticates and rejects free commands, foreign monitor IDs and privacy before invoking native placement',async t=>{
 const {createControlApi}=require('../control-api.cjs'),calls=[],token='w'.repeat(64);let locked=false;
 const api=await createControlApi({port:0,token,readStatus:()=>({privacyLocked:locked}),onCommand:()=>{},onWindowPlace:value=>{calls.push(value);return {verified:true};}});t.after(()=>api.close());const url='http://127.0.0.1:'+api.address().port+'/v1/window-place',headers={Authorization:'Bearer '+token},payload={...identity,monitorId:monitor.id,rect},send=v=>fetch(url,{method:'POST',headers,body:JSON.stringify(v)});
 assert.equal((await fetch(url,{method:'POST',body:JSON.stringify(payload)})).status,401);assert.equal((await send(payload)).status,200);
 for(const value of [{...payload,command:'move'},{...payload,monitorId:'guess'},{...payload,rect:{...rect,width:1}},{...payload,pid:0}])assert.equal((await send(value)).status,400);
 locked=true;assert.equal((await send(payload)).status,423);assert.equal(calls.length,1);
});
test('placement accepts only exact identity and a bounded physical rectangle; success requires native readback',async()=>{
 const request={...identity,monitorId:monitor.id,rect},observation={kind:'place',accepted:true,placementAccepted:true,identityMatched:true,minimized:false,target:identity,monitorId:monitor.id,rect,workArea:monitor.workArea};
 const control=fixture(observation,args=>{assert.ok(args.includes('place'));assert.ok(args.includes('-MonitorId'));assert.ok(args.includes('-X'));assert.ok(args.includes('-1920'));});assert.equal(typeof control.place,'function','Missing native placement');const result=await control.place(request);
 assert.equal(result.verified,true);assert.deepEqual(result.evidence.rect,rect);
 for(const patch of [{rect:{...rect,x:0}},{placementAccepted:false},{identityMatched:false},{activeDesktop:false},{minimized:true},{monitorId:'\\\\.\\DISPLAY1'},{observedAt:'2001-01-01T00:00:00Z'}])assert.equal((await fixture({...observation,...patch}).place(request)).verified,false);
 assert.equal((await fixture({...observation,placementAccepted:false}).place(request)).status,'unverified','A preceding restore must not become a no-effect failure');
 const invalid=fixture({},()=>assert.fail('Invalid placement reached native API'));
 for(const patch of [{monitorId:'external'},{rect:{...rect,width:0}},{rect:{...rect,width:1.5}},{rect:{...rect,x:NaN}},{rect:{...rect,height:40000}},{command:'move'}])assert.equal((await invalid.place({...request,...patch})).status,'failed');
});
