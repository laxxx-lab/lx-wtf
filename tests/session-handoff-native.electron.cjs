'use strict';
// A real main-process Electron fetch to a local fixture, no real gateway or microphone.
const {app,session}=require('electron'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {handoffRequest}=require('../session-handoff.cjs');
const file=path.join(__dirname,'../.local/handoff-native-result.json');
app.setPath('userData',path.join(__dirname,'../.local/handoff-native-profile'));
app.whenReady().then(async()=>{let server;try{
 const headers=[];server=http.createServer((req,res)=>{headers.push({origin:req.headers.origin||null,site:req.headers['sec-fetch-site']||null,cookiePresent:!!req.headers.cookie});req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({supported:true}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
 const auth=session.fromPartition('handoff-native-fixture');await auth.cookies.set({url,name:'handoff_fixture',value:'fixture',sameSite:'strict'});
 const result=await handoffRequest({url,fetcher:(target,options)=>auth.fetch(target,{...options,credentials:'include'})},{operation:'poll'});assert.equal(result.supported,true);assert.equal(headers[0].cookiePresent,true);fs.writeFileSync(file,JSON.stringify({ok:true,headers}));
 }catch(error){fs.writeFileSync(file,JSON.stringify({ok:false,error:error.message}));app.exitCode=1;}finally{server?.close();app.quit();}});
