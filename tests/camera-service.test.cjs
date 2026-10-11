const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {validateFrame,describeImage,needsCameraLook,cameraPrompt}=require('../camera-service.cjs');
const image=Buffer.from([255,216,255,224,0,4,0,0,255,217]).toString('base64');
test('camera frames are bounded images and vision requests cannot leave loopback',async()=>{
  assert.equal(validateFrame(image),image);
  for(const bad of ['',Buffer.from('not an image').toString('base64'),'x'.repeat(2000001)])assert.throws(()=>validateFrame(bad));
  await assert.rejects(describeImage(image,'Was ist das?',{url:'https://example.com/api/chat'}),/lokal/i);
});
test('a visual question uses only the local image endpoint and returns a bounded observation',async t=>{
  let body;
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;body=JSON.parse(raw);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:JSON.stringify({description:'Eine Person hält eine blaue Tasse.',held_object:'Tasse',uncertain:false})}}));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
  const result=await describeImage(image,'Was halte ich in der Hand?',{url:`http://127.0.0.1:${server.address().port}/api/chat`});
  assert.equal(result.held_object,'Tasse');assert.equal(body.model,'qwen3-vl:8b-instruct');
  assert.deepEqual(body.messages[1].images,[image]);assert.equal(body.stream,false);
  const prompt=cameraPrompt('Was ist das?',result,[{name:'Patrik'},{name:null}]);
  assert.ok(prompt.includes('Tasse'));assert.ok(prompt.includes('Patrik'));assert.ok(!prompt.includes(image));
});
test('ordinary instructions do not trigger the camera and explicit visual questions do',()=>{
  for(const text of ['Was halte ich in der Hand?','Ja, perfekt. Dann schau mal, was ich in der Hand halte.','Schau mal durch die Kamera.','Siehst du mich?','Erkennst du mich?','Wer sitzt vor dem Computer?','Was ist das hier?'])assert.equal(needsCameraLook(text),true,text);
  for(const text of ['Öffne Spotify.','Öffne die Kameraeinstellungen.','Was liegt heute an?','Was habe ich morgen vor?','Was ist das Problem mit meinem Login?','Schau mal in die README.'])assert.equal(needsCameraLook(text),false,text);
});
test('an HTTP redirect cannot forward the image to another endpoint',async t=>{
  let forwarded=false;
  const sink=http.createServer((req,res)=>{forwarded=true;res.end('{}');});
  await new Promise(r=>sink.listen(0,'127.0.0.1',r));t.after(()=>sink.close());
  const redirect=http.createServer((req,res)=>{res.writeHead(307,{Location:`http://127.0.0.1:${sink.address().port}/other`});res.end();});
  await new Promise(r=>redirect.listen(0,'127.0.0.1',r));t.after(()=>redirect.close());
  await assert.rejects(describeImage(image,'Was ist das?',{url:`http://127.0.0.1:${redirect.address().port}/api/chat`}));
  assert.equal(forwarded,false);
});
test('closing during the initial health probe cannot start an orphaned vision server',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');let spawnCalls=0,release;
  const health=new Promise(resolve=>{release=resolve;});
  const sandbox={module:{exports:{}},process,AbortController,AbortSignal,setTimeout,clearTimeout,Buffer,fetch:()=>health,require:name=>{
    if(name==='node:child_process')return {spawn:()=>{spawnCalls++;return {stderr:{pipe(){}},on(){},kill(){}};}};
    if(name==='node:fs')return {existsSync:()=>true,createWriteStream:()=>({end(){}})};
    return require(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../camera-service.cjs'),'utf8'),sandbox);
  const service=new sandbox.module.exports.CameraService(process.cwd());
  const pending=service.ensureVision();service.close();release({ok:false});
  await assert.rejects(pending);assert.equal(spawnCalls,0);
});
test('malformed vision results fail instead of being treated as confident scene facts',async()=>{
  await assert.rejects(describeImage(image,'Was ist das?',{fetcher:async()=>Response.json({message:{content:'not JSON'}})}),/Bildbeschreibung/);
});
test('vision warm-up loads the local model without any camera image or user message',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),requests=[];
  const sandbox={module:{exports:{}},require,process,AbortController,AbortSignal,setTimeout,clearTimeout,Buffer,fetch:async(url,options)=>{
    if(options?.body)requests.push({url,body:JSON.parse(options.body)});
    return new Response('{}',{status:200});
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../camera-service.cjs'),'utf8'),sandbox);
  const service=new sandbox.module.exports.CameraService(process.cwd());
  await service.warmVision();service.close();
  assert.equal(requests.length,1);assert.equal(requests[0].url,'http://127.0.0.1:11435/api/chat');
  assert.deepEqual(requests[0].body.messages,[]);assert.equal(requests[0].body.options.num_ctx,8192);assert.ok(!JSON.stringify(requests[0]).includes('images'));
});
