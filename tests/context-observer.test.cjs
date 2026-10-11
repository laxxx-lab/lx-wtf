'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const modulePath=path.join(__dirname,'../context-observer.cjs');
function moduleUnderTest(){assert.ok(fs.existsSync(modulePath),'context observer is not implemented');return require(modulePath);}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-log-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return path.join(dir,'build.log');}
test('foreground observation keeps metadata only and applies redaction',async()=>{
  const {readForegroundContext}=moduleUnderTest();
  const result=await readForegroundContext({platform:'win32',now:()=>4000,runFile:async()=>({stdout:JSON.stringify({app:'Code',windowTitle:'Voice - token=SECRET',pid:12,body:'FILE BODY'})})});
  assert.equal(result.app,'Code');assert.equal(result.pid,12);assert.equal(result.timestamp,4000);
  assert.equal(result.excluded,false);assert.ok(!result.windowTitle.includes('SECRET'));
  assert.equal(result.body,undefined);
});
test('password managers and sensitive windows never return their title or app context',async()=>{
  const {readForegroundContext}=moduleUnderTest();
  for(const data of [{app:'Bitwarden',windowTitle:'My secret vault',pid:1},{app:'KeePassXC',windowTitle:'Account',pid:2},{app:'msedge',windowTitle:'PayPal – Anmeldung',pid:3},{app:'chrome',windowTitle:'Passwords - Google Chrome',pid:4},{app:'chrome',windowTitle:'Private browsing',pid:5}]){
    const result=await readForegroundContext({platform:'win32',runFile:async()=>({stdout:JSON.stringify(data)})});
    assert.equal(result.excluded,true,data.app+': '+data.windowTitle);
    assert.equal(result.windowTitle,null);assert.equal(result.app,null);assert.equal(result.pid,null);
  }
});
test('foreground command is bounded and failures remain unknown',async()=>{
  const {readForegroundContext}=moduleUnderTest();
  let command;
  const result=await readForegroundContext({platform:'win32',runFile:async(exe,args,options)=>{command={exe,args,options};throw Error('timeout');}});
  assert.equal(result.app,null);assert.equal(result.windowTitle,null);assert.equal(result.pid,null);
  assert.equal(result.excluded,false);
  assert.equal(command.options.timeout,4000);assert.equal(command.options.windowsHide,true);
  assert.ok(command.args.includes('-File'));
  assert.ok(!command.args.includes('-Command'));
  const malformed=await readForegroundContext({platform:'win32',runFile:async()=>({stdout:'not json'})});
  assert.equal(malformed.app,null);
  assert.equal((await readForegroundContext({platform:'linux'})).app,null);
});
test('rejects unconfigured remote and non-log files without reading them',t=>{
  const {createLogWatcher}=moduleUnderTest();
  for(const entry of ['relative.log','https://example.org/build.log','\\\\server\\share\\build.log','C:\\Windows\\secret.ps1','C:\\pipe\\a.exe'])assert.throws(()=>createLogWatcher({paths:[entry]}),/local|absolute|log|txt/i,entry);
});
test('first poll starts at EOF and subsequent polls emit completed appended lines only',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t),events=[];
  fs.writeFileSync(file,'Build failed: historical failure\n');
  const watcher=createLogWatcher({paths:[file],onEvent:e=>events.push(e),now:()=>1000});t.after(()=>watcher.close());
  assert.deepEqual(await watcher.poll(),[]);
  fs.appendFileSync(file,'normal progress\nBuild failed: compile error');
  assert.deepEqual(await watcher.poll(),[]);
  fs.appendFileSync(file,'\n');
  const returned=await watcher.poll();
  assert.equal(returned.length,1);assert.equal(events.length,1);
  assert.equal(returned[0].type,'build-error');assert.equal(returned[0].source,file);
  assert.match(returned[0].summary,/compile error/);
});
test('deduplicates repeated failures but emits recovery and later failures',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t);let time=1000;
  fs.writeFileSync(file,'');const watcher=createLogWatcher({paths:[file],now:()=>time});t.after(()=>watcher.close());await watcher.poll();
  fs.appendFileSync(file,'Build failed: package error\n');assert.equal((await watcher.poll()).length,1);
  fs.appendFileSync(file,'Build failed: package error\n');assert.equal((await watcher.poll()).length,0);
  fs.appendFileSync(file,'Build succeeded\n');assert.equal((await watcher.poll())[0].type,'build-success');
  fs.appendFileSync(file,'Build failed: package error\n');assert.equal((await watcher.poll())[0].type,'build-error');
  time+=61000;fs.appendFileSync(file,'Build failed: package error\n');assert.equal((await watcher.poll()).length,1);
});
test('handles truncation and replacement without interpreting old replacement content as new',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t);fs.writeFileSync(file,'old history\n');
  const watcher=createLogWatcher({paths:[file]});t.after(()=>watcher.close());await watcher.poll();
  fs.writeFileSync(file,'');await watcher.poll();fs.appendFileSync(file,'Tests failed: 2 cases\n');assert.equal((await watcher.poll())[0].type,'build-error');
  const replacement=file+'.replacement';fs.writeFileSync(replacement,'Build failed: replacement history\n');fs.renameSync(replacement,file);
  assert.deepEqual(await watcher.poll(),[]);
  fs.appendFileSync(file,'All tests passed\n');assert.equal((await watcher.poll())[0].type,'build-success');
});
test('missing log uses a future EOF baseline and reports errors without throwing',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t),errors=[];
  const watcher=createLogWatcher({paths:[file],onError:e=>errors.push(e)});t.after(()=>watcher.close());
  assert.deepEqual(await watcher.poll(),[]);assert.equal(errors.length,1);
  fs.writeFileSync(file,'Build failed: existed before first successful observation\n');assert.deepEqual(await watcher.poll(),[]);
  fs.appendFileSync(file,'Build succeeded\n');assert.equal((await watcher.poll()).length,1);
});
test('large append reads only a bounded tail and does not report skipped failures',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t);fs.writeFileSync(file,'');
  const watcher=createLogWatcher({paths:[file]});t.after(()=>watcher.close());await watcher.poll();
  fs.appendFileSync(file,'Build failed: skipped beginning\n'+'x'.repeat(20000)+'\nBuild succeeded\n');
  const events=await watcher.poll();assert.equal(events.length,1);assert.equal(events[0].type,'build-success');
});
test('sanitizes log events and close stops subsequent reads and callbacks',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t),events=[];fs.writeFileSync(file,'');
  const watcher=createLogWatcher({paths:[file],onEvent:e=>events.push(e)});await watcher.poll();
  fs.appendFileSync(file,'Build failed token=SECRET https://user:PASSWORD@example.org/?secret=QUERY\n');
  const output=JSON.stringify(await watcher.poll());for(const secret of ['SECRET','PASSWORD','QUERY'])assert.ok(!output.includes(secret));
  watcher.close();fs.appendFileSync(file,'Build succeeded\n');assert.deepEqual(await watcher.poll(),[]);assert.equal(events.length,1);
});
test('does not lose a failure split across a UTF-8 byte boundary',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t);fs.writeFileSync(file,'');
  const watcher=createLogWatcher({paths:[file]});t.after(()=>watcher.close());await watcher.poll();
  const line=Buffer.from('Build failed: Übersetzung fehlerhaft\n','utf8'),position=line.indexOf(Buffer.from('Ü'))+1;
  fs.appendFileSync(file,line.subarray(0,position));assert.deepEqual(await watcher.poll(),[]);
  fs.appendFileSync(file,line.subarray(position));const events=await watcher.poll();
  assert.equal(events[0].summary,'Build failed: Übersetzung fehlerhaft');
});
test('rejects alternate data streams disguised as log paths',()=>{
  const {createLogWatcher}=moduleUnderTest();
  assert.throws(()=>createLogWatcher({paths:['C:\\Windows\\file.log:private.txt']}),/local|log|stream/i);
});
test('zero failed test counts are not reported as build errors',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t);fs.writeFileSync(file,'');
  const watcher=createLogWatcher({paths:[file]});t.after(()=>watcher.close());await watcher.poll();
  fs.appendFileSync(file,'Tests: 5 passed, 0 failed\n');
  const events=await watcher.poll();assert.equal(events.length,1);assert.equal(events[0].type,'build-success');
});
test('recognizes compiler error codes and npm failure records',async t=>{
  const {createLogWatcher}=moduleUnderTest(),file=fixture(t);fs.writeFileSync(file,'');let time=1000;
  const watcher=createLogWatcher({paths:[file],now:()=>time});t.after(()=>watcher.close());await watcher.poll();
  fs.appendFileSync(file,'npm ERR! Missing script: build\n');assert.equal((await watcher.poll())[0]?.type,'build-error');
  time+=61000;fs.appendFileSync(file,'src/test.ts: error TS2307: Cannot find module\n');assert.equal((await watcher.poll())[0]?.type,'build-error');
});
