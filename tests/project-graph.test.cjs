'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const modulePath=path.join(__dirname,'../project-graph.cjs');
function fixture(t,graph,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-graph-')),root=path.join(dir,'project'),cacheRoot=path.join(dir,'cache');
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'server.cjs'),'function greet() { return "hello"; }\n');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  assert.ok(fs.existsSync(modulePath),'project graph is not implemented');
  const runner=async({outRoot})=>{const out=path.join(outRoot,'graphify-out');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'graph.json'),JSON.stringify(graph));};
  const model=require(modulePath).createProjectGraph({cacheRoot,runner,now:()=>1000,...options});
  t.after(()=>model.dispose());return {root,dir,model};
}
const sample={nodes:[{id:'server',label:'server.cjs',source_file:'server.cjs',source_location:'L1',file_type:'code'},{id:'greet',label:'greet()',source_file:'server.cjs',source_location:'L1',file_type:'code'}],links:[{source:'server',target:'greet',relation:'contains',confidence:'EXTRACTED'}]};
test('indexes actual files, searches them, and keeps absolute paths out of public snapshots',async t=>{
  const {root,model}=fixture(t,sample);assert.equal(model.snapshot().ready,false);
  await model.index(root);const snap=model.snapshot();assert.equal(snap.ready,true);assert.equal(snap.rootName,'project');assert.equal(snap.stats.nodes,2);assert.equal(snap.stats.links,1);assert.ok(!JSON.stringify(snap).includes(root));
  const result=model.search('GREET');assert.deepEqual(result.selectedIds,['greet']);assert.equal(result.matches[0].sourceFile,'server.cjs');assert.equal(result.matches[0].line,1);
  assert.match(model.readSource('greet').text,/function greet/);assert.deepEqual(model.snapshot().selectedIds,['greet']);
});
test('a cached graph survives restart and source changes remain visibly stale',async t=>{
  const {root,dir,model}=fixture(t,sample);await model.index(root);fs.appendFileSync(path.join(root,'server.cjs'),'\nfunction later() {}');
  const restored=require(modulePath).createProjectGraph({cacheRoot:path.join(dir,'cache')});t.after(()=>restored.dispose());
  assert.equal(restored.restore(root),true);assert.equal(restored.snapshot().ready,true);assert.equal(restored.snapshot().stale,true);assert.deepEqual(restored.search('greet').selectedIds,['greet']);
  assert.equal(restored.restore(path.join(dir,'other-project')),false);
});

test('a removed nested source remains stale after restoring its cached graph',async t=>{
  const {root,dir,model}=fixture(t,{nodes:[{id:'nested',source_file:'src/code.cjs'}],links:[]});
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src/code.cjs'),'function nested() {}');await model.index(root);
  fs.unlinkSync(path.join(root,'src/code.cjs'));assert.equal(model.snapshot().stale,true);
  const restored=require(modulePath).createProjectGraph({cacheRoot:path.join(dir,'cache')});t.after(()=>restored.dispose());
  assert.equal(restored.restore(root),true);assert.equal(restored.snapshot().nodes.length,0);assert.equal(restored.snapshot().stale,true);
});
test('rejects outside paths, traversal, hidden and private source nodes without exposing contents',async t=>{
  const graph={nodes:[...sample.nodes,{id:'outside',label:'outside',source_file:'../outside.cjs'},{id:'env',label:'env',source_file:'.env'},{id:'secret',label:'secret',source_file:'credentials.json'},{id:'binary',label:'binary',source_file:'photo.png'}],edges:sample.links};
  const {root,model,dir}=fixture(t,graph);fs.writeFileSync(path.join(dir,'outside.cjs'),'PRIVATE');fs.writeFileSync(path.join(root,'.env'),'PRIVATE');fs.writeFileSync(path.join(root,'credentials.json'),'PRIVATE');
  await model.index(root);assert.deepEqual(model.snapshot().nodes.map(n=>n.id),['server','greet']);
  for(const id of ['outside','env','secret','binary'])assert.throws(()=>model.readSource(id));
});
test('revalidates real source paths after indexing so a replaced file cannot leave the root',async t=>{
  const graph={nodes:[{id:'greet',label:'greet()',source_file:'src/server.cjs'}],links:[]};
  const {root,model,dir}=fixture(t,graph),src=path.join(root,'src'),outside=path.join(dir,'outside');
  fs.mkdirSync(src);fs.writeFileSync(path.join(src,'server.cjs'),'function greet() {}');await model.index(root);
  fs.renameSync(src,path.join(root,'old-src'));fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'server.cjs'),'PRIVATE');
  fs.symlinkSync(outside,src,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>model.readSource('greet'),/Quelle|source|Pfad|path/i);
});
test('bounds previews and reports stale sources after a file changes',async t=>{
  const {root,model}=fixture(t,sample);await model.index(root);fs.writeFileSync(path.join(root,'server.cjs'),'x'.repeat(30000));
  const preview=model.readSource('server');assert.ok(preview.text.length<=16000);assert.equal(preview.truncated,true);assert.equal(model.snapshot().stale,true);
});
test('rejects malformed and oversized graph output rather than pretending the index is ready',async t=>{
  const {root,model}=fixture(t,{nodes:Array.from({length:5001},(_,i)=>({id:'n'+i,label:'n'+i})),links:[]});
  const result=await model.index(root);assert.equal(result.ready,false);assert.match(result.error,/5000|groß|large/i);
});
test('cancellation suppresses a late graph result',async t=>{
  let release;const {root,model}=fixture(t,sample,{runner:()=>new Promise(resolve=>{release=resolve;})});
  const pending=model.index(root);while(!release)await new Promise(resolve=>setImmediate(resolve));model.cancel();release();await pending;
  assert.equal(model.snapshot().busy,false);assert.equal(model.snapshot().ready,false);assert.equal(model.snapshot().nodes.length,0);
});
test('index deadline returns a real error even if the external runner never finishes',async t=>{
  const {root,model}=fixture(t,sample,{runner:()=>new Promise(()=>{}),deadlineMs:20});
  const snap=await model.index(root);assert.equal(snap.busy,false);assert.equal(snap.ready,false);assert.match(snap.error,/Zeit|deadline|time/i);
});
test('the graph view can derive deterministic labelled positions and selected nodes without a CDN',()=>{
  const file=path.join(__dirname,'../ui/project-graph.js');assert.ok(fs.existsSync(file),'graph view is not implemented');
  const {layoutGraph}=require(file);const result=layoutGraph({...sample,selectedIds:['greet']});assert.equal(result.nodes.length,2);assert.equal(result.nodes.find(n=>n.id==='greet').selected,true);assert.ok(Number.isFinite(result.nodes[0].x));assert.equal(result.links.length,1);
});

test('tool activity marks only structured canonical current sources and keeps search selection independent',async t=>{
  const {root,model,dir}=fixture(t,sample);await model.index(root);model.search('greet');
  assert.equal(typeof model.observeTool,'function','structured tool observation is missing');
  const file=fs.realpathSync(path.join(root,'server.cjs'));
  model.observeTool({toolId:'read-one',status:'running',paths:[file]});
  assert.deepEqual(model.snapshot().activityIds,['server','greet']);assert.deepEqual(model.snapshot().selectedIds,['greet']);
  model.search('');assert.deepEqual(model.snapshot().selectedIds,[]);assert.deepEqual(model.snapshot().activityIds,['server','greet']);
  model.observeTool({toolId:'read-two',status:'running',paths:[file]});model.observeTool({toolId:'read-one',status:'success'});
  assert.deepEqual(model.snapshot().activityIds,['server','greet']);model.observeTool({toolId:'read-two',status:'error'});assert.deepEqual(model.snapshot().activityIds,[]);
  const outside=path.join(dir,'outside.cjs');fs.writeFileSync(outside,'outside');
  for(const event of [
    {toolId:'server.cjs',status:'running'},
    {toolId:'relative',status:'running',paths:['server.cjs']},
    {toolId:'outside',status:'running',paths:[outside]},
    {toolId:'directory',status:'running',paths:[root]},
    {toolId:'guessed',status:'running',arguments:{file}},
    {toolId:'url',status:'running',paths:['file://'+file]},
  ]){model.observeTool(event);assert.deepEqual(model.snapshot().activityIds,[]);}
  fs.unlinkSync(file);model.observeTool({toolId:'removed',status:'running',paths:[file]});assert.deepEqual(model.snapshot().activityIds,[]);
});

test('real newly created nested source marks the graph stale without indexing again',async t=>{
  const {root,model}=fixture(t,sample);
  fs.mkdirSync(path.join(root,'src','deep'),{recursive:true});await model.index(root);assert.equal(model.snapshot().stale,false);
  fs.writeFileSync(path.join(root,'src','deep','new.cjs'),'function added() {}');
  await new Promise((resolve,reject)=>{const limit=setTimeout(()=>{clearInterval(poll);reject(new Error('nested file change was not observed'));},2000);const poll=setInterval(()=>{if(model.snapshot().stale){clearInterval(poll);clearTimeout(limit);resolve();}},10);});
  assert.equal(model.snapshot().stale,true);assert.equal(model.snapshot().stats.nodes,2);assert.equal(model.snapshot().indexedAt,1000);
});

test('watcher resources stay bounded and cancel clears watchers and running activity',async t=>{
  const {root,model}=fixture(t,sample);for(let i=0;i<140;i++)fs.mkdirSync(path.join(root,'folder'+i));await model.index(root);
  const watch=model.snapshot().watch;assert.ok(watch,'watch coverage is missing');assert.ok(watch.directories<=128);assert.equal(watch.limited,true);assert.equal(model.snapshot().stale,true);
  model.observeTool({toolId:'running',status:'running',paths:[fs.realpathSync(path.join(root,'server.cjs'))]});model.cancel();
  assert.deepEqual(model.snapshot().activityIds,[]);assert.equal(model.snapshot().watch.active,false);assert.equal(model.snapshot().watch.directories,0);
  model.observeTool({toolId:'late',status:'running',paths:[fs.realpathSync(path.join(root,'server.cjs'))]});assert.deepEqual(model.snapshot().activityIds,[]);
});

test('activity cannot follow a directory junction swapped in after indexing',async t=>{
  const {root,model,dir}=fixture(t,{nodes:[{id:'nested',source_file:'src/server.cjs'}],links:[]});
  const src=path.join(root,'src'),outside=path.join(dir,'other');fs.mkdirSync(src);fs.writeFileSync(path.join(src,'server.cjs'),'local');await model.index(root);
  fs.renameSync(src,path.join(root,'before'));fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'server.cjs'),'outside');fs.symlinkSync(outside,src,process.platform==='win32'?'junction':'dir');
  assert.equal(typeof model.observeTool,'function');model.observeTool({toolId:'read',status:'running',paths:[path.join(src,'server.cjs')]});assert.deepEqual(model.snapshot().activityIds,[]);
});

test('a replaced project root is stale even when an outside tree duplicates file stamps',async t=>{
  const {root,model,dir}=fixture(t,sample),stamp=new Date('2026-01-01T00:00:00Z');
  fs.utimesSync(path.join(root,'server.cjs'),stamp,stamp);fs.utimesSync(root,stamp,stamp);await model.index(root);
  const outside=path.join(dir,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'server.cjs'),'function greet() { return "hello"; }\n');
  fs.utimesSync(path.join(outside,'server.cjs'),stamp,stamp);fs.utimesSync(outside,stamp,stamp);
  fs.renameSync(root,path.join(dir,'previous'));fs.symlinkSync(outside,root,process.platform==='win32'?'junction':'dir');
  assert.equal(model.snapshot().stale,true);assert.throws(()=>model.readSource('server'));
});
