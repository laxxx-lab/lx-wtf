'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('tracked public text contains no literal user home directories or private key material',()=>{
 const root=path.resolve(__dirname,'..'),files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean),findings=[];
 for(const file of files){const data=fs.readFileSync(path.join(root,file));if(data.includes(0))continue;const text=data.toString('utf8');
  if(/[A-Za-z]:[\\/]+Users[\\/]+[^\s\\/]+|\/(?:home|Users)\/[A-Za-z0-9_.-]+/.test(text))findings.push(file+': literal home path');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))findings.push(file+': private key material');
  if(/\b(?:AIza[\w-]{35}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-proj-[A-Za-z0-9_-]{20,})\b/.test(text))findings.push(file+': credential-shaped value');
 }
 assert.deepEqual(findings,[],'Use project-relative paths, environment variables and local configuration.');
});
test('optional desktop application root is configured locally',()=>{
 const {createArtcraft}=require('../artcraft.cjs'),os=require('node:os'),root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-public-path-')),previous=process.env.HERMES_VOICE_ARTCRAFT_ROOT;
 try{process.env.HERMES_VOICE_ARTCRAFT_ROOT=path.join(root,'chosen-install');const exe=path.join(process.env.HERMES_VOICE_ARTCRAFT_ROOT,'apps','PhotoCraft','photocraft.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'fixture');const craft=createArtcraft({cacheRoot:path.join(root,'cache')});assert.deepEqual(craft.snapshot().apps.filter(app=>app.installed).map(app=>app.id),['photo']);craft.dispose();}
 finally{if(previous===undefined)delete process.env.HERMES_VOICE_ARTCRAFT_ROOT;else process.env.HERMES_VOICE_ARTCRAFT_ROOT=previous;fs.rmSync(root,{recursive:true,force:true});}
});
