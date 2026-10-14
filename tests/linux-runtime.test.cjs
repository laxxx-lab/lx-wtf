'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const script=path.join(__dirname,'../scripts/setup-linux-runtime.sh');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
const shellPath=value=>process.platform==='win32'?value.replaceAll('\\','/').replace(/^([a-z]):/i,(_,drive)=>'/'+drive.toLowerCase()):value;
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-linux-runtime-'));
  for(const file of ['runtime/voice/qwentts.cpp/CMakeLists.txt','runtime/voice/qwentts.cpp/ggml/CMakeLists.txt','runtime/stt/whisper.cpp/CMakeLists.txt','runtime/stt/whisper.cpp/ggml/CMakeLists.txt','runtime/voice/models/qwen-talker-1.7b-base-Q8_0.gguf','runtime/voice/models/qwen-tokenizer-12hz-Q8_0.gguf','runtime/stt/models/ggml-large-v3-turbo.bin','runtime/stt/models/ggml-silero-v6.2.0.bin','voices/fixed/registry.json']){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'test');}
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  for(const name of ['cc','c++','make','cmake'])fs.writeFileSync(path.join(bin,name),'#!/bin/bash\nexit 0\n',{mode:0o755});
  return {root,bin,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function run(f,args){return spawnSync(bash,[shellPath(script),'--root',shellPath(f.root),...args],{encoding:'utf8',env:{...process.env,PATH:shellPath(f.bin)+':/usr/bin:/bin',CC:'cc',CXX:'c++'}});}
test('Linux bootstrap checks transferred sources/models without creating a build',()=>{
  assert.ok(fs.existsSync(script),'Linux runtime bootstrap is missing');
  const f=fixture();try{const result=run(f,['--check','--backend','cpu']);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/backend=cpu/);assert.equal(fs.existsSync(path.join(f.root,'runtime/voice/build-linux')),false);}finally{f.close();}
});
test('Linux bootstrap rejects missing codec before cmake runs',()=>{
  const f=fixture();try{fs.unlinkSync(path.join(f.root,'runtime/voice/models/qwen-tokenizer-12hz-Q8_0.gguf'));const result=run(f,['--check','--backend','cpu']);assert.notEqual(result.status,0);assert.match(result.stderr,/qwen-tokenizer/);}finally{f.close();}
});
test('explicit CUDA request fails rather than silently becoming CPU',()=>{
  const f=fixture();try{fs.writeFileSync(path.join(f.bin,'nvcc'),'#!/bin/bash\nexit 0\n',{mode:0o755});fs.writeFileSync(path.join(f.bin,'nvidia-smi'),'#!/bin/bash\nexit 1\n',{mode:0o755});const result=run(f,['--check','--backend','cuda']);assert.notEqual(result.status,0);assert.match(result.stderr,/NVIDIA/);}finally{f.close();}
});
test('cmake configure failure keeps its exit code and does not claim success',()=>{
  const f=fixture();try{fs.writeFileSync(path.join(f.bin,'cmake'),'#!/bin/bash\nexit 42\n',{mode:0o755});const result=run(f,['--backend','cpu']);assert.equal(result.status,42,result.stderr);assert.doesNotMatch(result.stdout,/build complete/);}finally{f.close();}
});
