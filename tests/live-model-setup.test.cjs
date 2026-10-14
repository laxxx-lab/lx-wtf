'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.resolve(__dirname,'../scripts/setup-live-model.ps1');
const run=(args)=>{
  const env={...process.env};delete env.PSModulePath; // Windows PowerShell must use its own modules when launched from pwsh.
  return spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args],{encoding:'utf8',timeout:20000,env});
};

test('live setup describes a pinned GPU-only loopback server without downloading',{skip:process.platform!=='win32'},()=>{
  const result=run(['-Action','Manifest']);
  assert.equal(result.status,0,result.stderr);
  const manifest=JSON.parse(result.stdout.replace(/^\uFEFF/,''));
  assert.match(manifest.model.url,/\/resolve\/[0-9a-f]{40}\//);
  assert.match(manifest.model.sha256,/^[0-9a-f]{64}$/);
  assert.match(manifest.runtime.sha256,/^[0-9a-f]{64}$/);
  const args=manifest.args;
  assert.equal(args[args.indexOf('--host')+1],'127.0.0.1');
  assert.match(args[args.indexOf('--device')+1],/^Vulkan\d+$/);
  assert.ok(Number(args[args.indexOf('--gpu-layers')+1])>0);
  assert.equal(new URL(manifest.url).port,args[args.indexOf('--port')+1]);
});

test('live setup refuses a corrupt cached runtime and preserves its bytes',{skip:process.platform!=='win32'},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-live-setup-'));
  try{
    const downloads=path.join(root,'runtime/live/downloads');fs.mkdirSync(downloads,{recursive:true});
    const archive=path.join(downloads,'llama-b11565-bin-win-vulkan-x64.zip');fs.writeFileSync(archive,'corrupt fixture');
    for(const action of ['Verify','Download']){
      const result=run(['-Action',action,'-ProjectRoot',root]);
      assert.notEqual(result.status,0);
      assert.match(result.stderr,/SHA256/);
      assert.equal(fs.readFileSync(archive,'utf8'),'corrupt fixture');
      assert.equal(fs.existsSync(path.join(root,'runtime/live/llama-b11565')),false);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
