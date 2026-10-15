const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('public workspace upgrade preserves settings, models and voices and replaces public code',()=>{
 const {installPublicWorkspace}=require('../workspace-install.cjs'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hermes workspace ')),source=path.join(tmp,'source'),destination=path.join(tmp,'installed');
 try{fs.mkdirSync(source);fs.writeFileSync(path.join(source,'main.cjs'),'one');fs.mkdirSync(path.join(destination,'.local'),{recursive:true});fs.writeFileSync(path.join(destination,'.local/settings.json'),'personal');fs.mkdirSync(path.join(destination,'voices'));fs.writeFileSync(path.join(destination,'voices/reference.wav'),'private');
  installPublicWorkspace({source,destination,version:'a',files:['main.cjs']});assert.equal(fs.readFileSync(path.join(destination,'main.cjs'),'utf8'),'one');fs.writeFileSync(path.join(source,'main.cjs'),'two');installPublicWorkspace({source,destination,version:'b',files:['main.cjs']});assert.equal(fs.readFileSync(path.join(destination,'main.cjs'),'utf8'),'two');assert.equal(fs.readFileSync(path.join(destination,'.local/settings.json'),'utf8'),'personal');assert.equal(fs.readFileSync(path.join(destination,'voices/reference.wav'),'utf8'),'private');
  for(const file of ['../secret','.local/settings.json','runtime/model','voices/reference.wav','C:\\secret'])assert.throws(()=>installPublicWorkspace({source,destination,version:'c',files:[file]}),/public|path|Datei|Pfad/i);
 }finally{fs.rmSync(tmp,{recursive:true});}
});
test('workspace destination uses local user storage and is never the bundled app',()=>{
 const {defaultWorkspace}=require('../workspace-install.cjs');assert.equal(defaultWorkspace({platform:'win32',env:{LOCALAPPDATA:'C:/Local'},home:'C:/Home',appData:'C:/Roaming'}),path.join('C:/Local','Hermes Voice','workspace'));assert.equal(defaultWorkspace({platform:'linux',env:{XDG_DATA_HOME:'/data'},home:'/srv/example',appData:'/config'}),path.join('/data','hermes-voice','workspace'));
});
test('explicit isolated workspace is absolute and not a symlink target',()=>{
 const {defaultWorkspace}=require('../workspace-install.cjs');assert.equal(defaultWorkspace({env:{HERMES_VOICE_HOME:path.resolve('isolated workspace')}}),path.resolve('isolated workspace'));assert.throws(()=>defaultWorkspace({env:{HERMES_VOICE_HOME:'../relative'}}),/absolut/i);
});
