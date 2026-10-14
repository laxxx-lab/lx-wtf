'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {enrollLinuxMcp}=require('../linux-mcp-enrollment.cjs');
test('Notebook enrolls only its private local token and confirms the MCP probe',async()=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-mcp-enroll-')),file=path.join(folder,'token');fs.writeFileSync(file,'a'.repeat(64),{mode:0o600});const calls=[];
  try{const result=await enrollLinuxMcp({tokenFile:file,url:'http://100.64.1.2:8876/mcp',request:async(method,params)=>{calls.push({method,params});if(method==='mcp.servers.list')return {servers:[]};if(method==='mcp.servers.add')return {ok:true};if(method==='mcp.servers.test')return {ok:true,tools:[{name:'status'}]};throw Error('Unexpected method');}});
    assert.equal(result.ok,true);assert.equal(result.toolCount,1);assert.ok(!JSON.stringify(result).includes('a'.repeat(64)));assert.equal(calls[1].params.name,'lilith-zorin');assert.equal(calls[1].params.bearer_token,'a'.repeat(64));assert.equal(calls[1].params.config.url,'http://100.64.1.2:8876/mcp');assert.equal(calls[2].method,'mcp.servers.test');
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('Notebook never overwrites a different server with its reserved name',async()=>{
  let attempted=false;await assert.rejects(enrollLinuxMcp({tokenFile:'/never/read',url:'http://100.64.1.2:8876/mcp',request:async method=>{if(method==='mcp.servers.list')return {servers:[{name:'lilith-zorin',url:'http://100.64.8.9:8876/mcp'}]};attempted=true;return {};}}));assert.equal(attempted,false);
});
test('Existing matching top-level gateway URL is probed without reading or replacing a token',async()=>{
  const methods=[];const result=await enrollLinuxMcp({tokenFile:'/never/read',url:'http://100.64.1.2:8876/mcp',request:async method=>{methods.push(method);if(method==='mcp.servers.list')return {servers:[{name:'lilith-zorin',url:'http://100.64.1.2:8876/mcp'}]};if(method==='mcp.servers.test')return {ok:true,tools:[{name:'status'}]};throw Error('No add');}});
  assert.equal(result.alreadyRegistered,true);assert.deepEqual(methods,['mcp.servers.list','mcp.servers.test']);
});
test('Notebook rejects non-Tailscale URLs and never exposes service error tokens',async()=>{
  await assert.rejects(enrollLinuxMcp({tokenFile:'/never/read',url:'http://192.168.1.2:8876/mcp',request:()=>{throw Error('must not call');}}),/Tailscale/);
  await assert.rejects(enrollLinuxMcp({tokenFile:'/never/read',url:'http://100.64.1.2:8876/mcp',request:()=>{throw Error('token='+'a'.repeat(64));}}),error=>!error.message.includes('a'.repeat(64)));
});
