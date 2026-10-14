'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const modulePath=path.join(__dirname,'../project-library.cjs');
function fixture(t,options={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-library-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const root=path.join(dir,'project'),other=path.join(dir,'other'),file=path.join(dir,'local','projects.json');
  fs.mkdirSync(root);fs.mkdirSync(other);
  assert.ok(fs.existsSync(modulePath),'project library is not implemented');
  const library=require(modulePath).createProjectLibrary({file,...options});
  return {dir,root,other,file,library};
}
function linkDirectory(target,link){fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');}

test('persists multiple projects, active selection and names without touching their contents',t=>{
  const changes=[],{root,other,file,library}=fixture(t,{onChange:s=>changes.push(s)});
  assert.deepEqual(library.snapshot(),{projects:[],activeId:null});assert.equal(library.active(),null);
  const first=library.add(root).projects[0];assert.match(first.id,/^[a-f\d-]{36}$/i);
  fs.writeFileSync(path.join(root,'keep.md'),'Keep me');
  const second=library.add(other).projects[1];assert.equal(library.active().id,second.id);
  library.rename(first.id,'Meine Quellen');library.select(first.id);
  const reloaded=require(modulePath).createProjectLibrary({file,initialRoot:other});
  assert.deepEqual(reloaded.snapshot(),library.snapshot());assert.equal(reloaded.active().name,'Meine Quellen');
  assert.equal(library.add(root).projects.length,2);assert.equal(library.active().id,first.id);
  const detached=library.snapshot();detached.projects[0].name='Changed outside';assert.equal(library.active().name,'Meine Quellen');
  library.remove(first.id);assert.equal(library.active().id,second.id);assert.equal(fs.readFileSync(path.join(root,'keep.md'),'utf8'),'Keep me');
  library.remove(second.id);assert.equal(library.active(),null);assert.ok(changes.length>=7);
  assert.deepEqual(fs.readdirSync(path.dirname(file)),['projects.json']);
});

test('initial root is persisted and invalid registry data cannot introduce projects',t=>{
  const {root,file}=fixture(t);
  const initialized=require(modulePath).createProjectLibrary({file,initialRoot:root});assert.equal(initialized.active().root,fs.realpathSync(root));
  fs.writeFileSync(file,JSON.stringify({projects:[{id:'bad',name:'Injected',root:'https://example.com'}],activeId:'bad'}));
  assert.deepEqual(require(modulePath).createProjectLibrary({file}).snapshot(),{projects:[],activeId:null});
});

test('lists only the requested level, retains unsupported files, and hides private paths',t=>{
  const {root,library}=fixture(t);library.add(root);const id=library.active().id;
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','code.cjs'),'module.exports=1;');
  for(const name of ['readme.md','photo.png','.env','credentials.json','token.txt'])fs.writeFileSync(path.join(root,name),'fixture');
  for(const name of ['.git','runtime','voices','node_modules','private-key'])fs.mkdirSync(path.join(root,name));
  const listing=library.list({id,path:''});assert.equal(listing.id,id);assert.equal(listing.path,'');assert.equal(listing.truncated,false);
  assert.deepEqual(listing.entries.map(e=>e.name).sort(),['photo.png','readme.md','src']);
  assert.deepEqual(listing.entries.find(e=>e.name==='src'),{name:'src',path:'src',kind:'directory',readable:false});
  assert.equal(listing.entries.find(e=>e.name==='photo.png').readable,false);
  assert.deepEqual(library.list({id,path:'src'}).entries,[{name:'code.cjs',path:'src/code.cjs',kind:'file',readable:true}]);
});

test('rejects traversal, absolute paths, forbidden names and non-local roots',t=>{
  const {root,dir,library}=fixture(t);library.add(root);const id=library.active().id;
  fs.writeFileSync(path.join(root,'readme.md'),'local');
  for(const value of ['../outside.md','src/../readme.md','src\\..\\readme.md','/readme.md',path.join(root,'readme.md'),'C:\\other.md','https://example.com','.local/config.json','runtime/code.cjs','readme.md\0']){
    assert.throws(()=>library.read({id,path:value}));assert.throws(()=>library.list({id,path:value}));
  }
  for(const value of ['relative','https://example.com',path.parse(root).root])assert.throws(()=>library.add(value));
  const excluded=path.join(dir,'runtime');fs.mkdirSync(excluded);assert.throws(()=>library.add(excluded));
  assert.throws(()=>library.select('missing'));assert.throws(()=>library.rename(id,'\n'));assert.throws(()=>library.remove('missing'));
});

test('rechecks root and nested directories after junction replacement',t=>{
  const {root,other,dir,library}=fixture(t);library.add(root);const id=library.active().id;
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','code.cjs'),'local');fs.writeFileSync(path.join(other,'code.cjs'),'outside');
  fs.renameSync(path.join(root,'src'),path.join(root,'old-src'));linkDirectory(other,path.join(root,'src'));
  assert.throws(()=>library.read({id,path:'src/code.cjs'}));assert.throws(()=>library.list({id,path:'src'}));assert.ok(!library.list({id}).entries.some(e=>e.name==='src'));
  fs.renameSync(root,path.join(dir,'old-root'));linkDirectory(other,root);
  assert.throws(()=>library.list({id}));assert.throws(()=>library.read({id,path:'code.cjs'}));assert.throws(()=>library.add(root));
});

test('rechecks a replaced ancestor of the selected root',t=>{
  const {dir,library}=fixture(t),parent=path.join(dir,'parent'),root=path.join(parent,'nested'),outside=path.join(dir,'external');
  fs.mkdirSync(root,{recursive:true});fs.mkdirSync(path.join(outside,'nested'),{recursive:true});fs.writeFileSync(path.join(outside,'nested','code.cjs'),'outside');library.add(root);const id=library.active().id;
  fs.renameSync(parent,path.join(dir,'old-parent'));linkDirectory(outside,parent);
  assert.throws(()=>library.list({id}));assert.throws(()=>library.read({id,path:'code.cjs'}));
});

test('bounds and redacts text previews, rejects oversized and binary input',t=>{
  const {root,library}=fixture(t);library.add(root);const id=library.active().id;
  fs.writeFileSync(path.join(root,'notes.md'),'# Notes\npassword="sample-sensitive-value"\nBearer sample-bearer-value\n'+('ordinary text\n'.repeat(2000)));
  const preview=library.read({id,path:'notes.md'});assert.equal(preview.id,id);assert.equal(preview.name,'notes.md');assert.equal(preview.path,'notes.md');assert.equal(preview.root,fs.realpathSync(root));assert.equal(preview.untrusted,true);assert.ok(Number.isFinite(preview.observedAt));assert.equal(preview.truncated,true);assert.ok(preview.text.length<=12000);assert.match(preview.text,/# Notes\n/);assert.match(preview.text,/redacted/);assert.doesNotMatch(preview.text,/sample-sensitive-value|sample-bearer-value/);
  fs.writeFileSync(path.join(root,'binary.cjs'),Buffer.from([0,1,2,3]));assert.throws(()=>library.read({id,path:'binary.cjs'}));
  fs.writeFileSync(path.join(root,'huge.md'),'x'.repeat(1024*1024+1));assert.throws(()=>library.read({id,path:'huge.md'}));
  fs.writeFileSync(path.join(root,'photo.png'),'text');assert.throws(()=>library.read({id,path:'photo.png'}));
});

test('caps immediate directory scans and project count',t=>{
  const {root,dir,library}=fixture(t);library.add(root);const id=library.active().id;
  for(let i=0;i<510;i++)fs.writeFileSync(path.join(root,'item-'+i+'.md'),'text');
  const listing=library.list({id});assert.equal(listing.entries.length,500);assert.equal(listing.truncated,true);
  for(let i=0;i<31;i++){const next=path.join(dir,'project-'+i);fs.mkdirSync(next);library.add(next);}
  const overflow=path.join(dir,'overflow');fs.mkdirSync(overflow);assert.throws(()=>library.add(overflow));assert.equal(library.snapshot().projects.length,32);
});

test('failed registry writes leave the previous active selection intact',t=>{
  const {root,other,file,library}=fixture(t);library.add(root);const before=library.snapshot();
  fs.unlinkSync(file);fs.mkdirSync(file);assert.throws(()=>library.add(other));assert.deepEqual(library.snapshot(),before);
  assert.deepEqual(fs.readdirSync(path.dirname(file)),['projects.json']);
});

test('null or stale migration roots leave a usable empty library',t=>{
  const {dir,root,file}=fixture(t);
  for(const initialRoot of [null,path.join(dir,'missing'), 'https://example.com']){
    const migrated=require(modulePath).createProjectLibrary({file,initialRoot});
    assert.deepEqual(migrated.snapshot(),{projects:[],activeId:null});assert.equal(fs.existsSync(file),false);
    assert.equal(migrated.add(root).projects.length,1);fs.unlinkSync(file);
  }
});

test('an intentionally empty persisted registry does not reimport an old migration root',t=>{
  const {root,file,library}=fixture(t);library.add(root);library.remove(library.active().id);
  const reloaded=require(modulePath).createProjectLibrary({file,initialRoot:root});
  assert.deepEqual(reloaded.snapshot(),{projects:[],activeId:null});
});

test('resolve returns a validated detached project without persistence or selection changes',t=>{
  const {root,other,file,library}=fixture(t);library.add(root);const id=library.active().id;library.add(other);
  const before=library.snapshot();fs.unlinkSync(file);fs.mkdirSync(file);
  const resolved=library.resolve(id);assert.equal(resolved.root,fs.realpathSync(root));assert.equal(resolved.id,id);
  resolved.name='Changed outside';assert.deepEqual(library.snapshot(),before);assert.equal(fs.statSync(file).isDirectory(),true);
  assert.throws(()=>library.resolve('missing'));
});

test('resolve rejects missing and replaced project roots before a root-only command',t=>{
  const {root,other,dir,library}=fixture(t);library.add(root);const id=library.active().id;
  assert.equal(library.resolve(id).root,fs.realpathSync(root));
  fs.renameSync(root,path.join(dir,'old-root'));assert.throws(()=>library.resolve(id));
  linkDirectory(other,root);assert.throws(()=>library.resolve(id));
});
