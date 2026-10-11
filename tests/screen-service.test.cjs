const test=require('node:test'),assert=require('node:assert/strict');
const {needsScreenLook,describeScreen,screenPrompt,validateScreenFrame,highlightBounds}=require('../screen-service.cjs');
const image=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0]).toString('base64');
test('explicit screen questions have precedence and ordinary camera or app commands do not capture a screen',()=>{
  for(const text of ['Schau auf meinen Bildschirm.','Was bedeutet diese Fehlermeldung?','Zeig mir auf dem Bildschirm, wo ich klicken muss.','Was siehst du im aktuellen Fenster?'])assert.equal(needsScreenLook(text),true,text);
  for(const text of ['Öffne Spotify.','Was halte ich in der Hand?','Schalte den Bildschirm aus.','Erkläre die Windows-Version.'])assert.equal(needsScreenLook(text),false,text);
});
test('a screen frame must be current and belong to exactly the selected desktop source',()=>{
  const frame={image,sourceId:'window:123:0',capturedAt:new Date().toISOString()};
  assert.equal(validateScreenFrame(frame,'window:123:0').image,image);
  assert.throws(()=>validateScreenFrame(frame,'window:987:0'),/Quelle/);
  assert.throws(()=>validateScreenFrame({...frame,capturedAt:'2000-01-01T00:00:00Z'},frame.sourceId),/aktuell/);
});
test('screen images are described only locally and only a bounded text observation reaches the prompt',async()=>{
  let request;
  const result=await describeScreen(image,'Was bedeutet der Fehler?',{fetcher:async(url,options)=>{request={url,options,body:JSON.parse(options.body)};return Response.json({message:{content:JSON.stringify({description:'Eine Fehlermeldung ist sichtbar.',uncertain:false})}});}});
  assert.equal(request.options.redirect,'error');assert.deepEqual(request.body.messages.at(-1).images,[image]);
  assert.match(request.body.messages[0].content,/Bildschirm/);
  const prompt=screenPrompt('Was bedeutet das?',{...result,source:{name:'Testfenster'},capturedAt:new Date().toISOString()});
  assert.ok(!prompt.includes(image));assert.match(prompt,/Testfenster/);
  await assert.rejects(describeScreen(image,'Was?',{url:'https://outside.invalid'}),/lokal/);
});
test('desktop annotations are bounded to one monitor, support negative origins and reject bad geometry',()=>{
  const displays=[{x:-1920,y:0,width:1920,height:1080},{x:0,y:0,width:2560,height:1440}];
  assert.deepEqual(highlightBounds({x:-1800,y:100,width:180,height:50},displays),{x:-1800,y:100,width:180,height:50});
  for(const rect of [{x:0,y:0,width:0,height:20},{x:NaN,y:0,width:20,height:20},{x:-100,y:0,width:300,height:20},{x:99999,y:0,width:20,height:20}])assert.throws(()=>highlightBounds(rect,displays));
});
test('selected messages retain visible text for Hermes instead of being reduced to a generic UI description',async()=>{
 let body;const result=await describeScreen(image,'Erklär die Nachricht.',{selection:true,fetcher:async(_url,options)=>{body=JSON.parse(options.body);return Response.json({message:{content:JSON.stringify({description:'Eine Nachricht.',text:'ZIELNACHRICHT: Der Build ist fehlgeschlagen.',uncertain:false})}});}});
 assert.equal(result.text,'ZIELNACHRICHT: Der Build ist fehlgeschlagen.');assert.ok(body.format.required.includes('text'));assert.match(body.messages[0].content,/transkrib|wörtlich/i);
});
