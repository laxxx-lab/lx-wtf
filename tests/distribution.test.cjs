const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
test('public payload excludes private and development data, including nested paths',()=>{
 const {listPublicFiles}=require('../scripts/prepare-package.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-package-'));
 try {
 for(const name of ['main.cjs','package.json','ui/app.js','scripts/helper.py','scripts/requirements-portable-stt.txt','.local/token','runtime/model','voices/private.wav','tests/example.cjs','ui/.secret','scripts/helper_test.py','scripts/helper.py.bak','backup.cjs','node_modules/ws/index.js','node_modules/electron/index.js']) {fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),'x');}
 assert.deepEqual(listPublicFiles(root),['main.cjs','node_modules/ws/index.js','package.json','scripts/helper.py','scripts/requirements-portable-stt.txt','ui/app.js']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('distribution embeds Electron and targets native desktop installers',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.main,'desktop-entry.cjs');assert.equal(pkg.devDependencies.electron,'44.7.2');
 const config=fs.readFileSync(path.join(__dirname,'../electron-builder.yml'),'utf8');
 for(const target of ['nsis','AppImage','deb','dmg','zip']) assert.ok(config.includes(target));
 assert.match(config,/asar: false/);
});
test('platform scripts support explicit dry run and verified Linux release download',()=>{
 const linux=fs.readFileSync(path.join(__dirname,'../scripts/install-linux.sh'),'utf8');
 const windows=fs.readFileSync(path.join(__dirname,'../scripts/install-windows.ps1'),'utf8');
 assert.match(linux,/--dry-run/);assert.match(linux,/sha256sum/);assert.match(windows,/DryRun/);
 assert.doesNotMatch(linux+windows,/HermesDesktop|curl[^\n]*\|\s*(?:ba)?sh/);
});
const {spawnSync}=require('node:child_process');
test('Windows source dry run does not install or create files',()=>{
 if(process.platform!=='win32') return;
 const result=spawnSync('powershell.exe',['-NoProfile','-File',path.join(__dirname,'../scripts/install-windows.ps1'),'-DryRun','-SourceRoot','C:\\unused path\\source'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/InstallNode=False; InstallPython=False/);
});
test('Linux installer dry run runs without installing dependencies', {skip: process.platform !== 'linux'},()=>{
 const result=spawnSync('bash',[path.join(__dirname,'../scripts/install-linux.sh'),'--source','/unused source path','--install-python','--autostart','--dry-run'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/python=1 autostart=1/);
});
test('release checksum matches full decoded artifact names and rejects duplicate rows',()=>{
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 if(process.platform==='win32'&&!fs.existsSync(bash)) return;
 const source=fs.readFileSync(path.join(__dirname,'../scripts/install-linux.sh'),'utf8');
 const helper=source.match(/function release_checksum\(\) \{[\s\S]*?\n\}/)?.[0];
 assert.ok(helper,'installer exposes the checksum parser used by download');
 const digest='a'.repeat(64);
 for(const basename of ['Hermes Voice-0.2.0-preview.1-x86_64.AppImage','Hermes%20Voice-0.2.0-preview.1-x86_64.AppImage','Hermes-Voice-0.2.0-preview.1-linux-x64.AppImage']) {
  const name=decodeURIComponent(basename); const line=digest+'  '+name;
  const run=(rows)=>spawnSync(bash,['-s'],{input:helper+`\nprintf '%s\\n' '${rows}' | release_checksum 'https://example.org/${basename}'\n`,encoding:'utf8'});
  const result=run(line);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),digest);
  assert.notEqual(run(line+'\n'+line).status,0,'duplicate entries must fail');
 }
});
test('Linux optional system/deb installation is explicit and release needs no Node',()=>{
 const linux=fs.readFileSync(path.join(__dirname,'../scripts/install-linux.sh'),'utf8');
 assert.match(linux,/--install-system\) install_system=1/);
 assert.match(linux,/if \(\(install_system\)\); then/);
 assert.match(linux,/--deb\) mode=deb/);
 assert.match(linux,/sudo apt-get install -y -- "\$artifact"/);
 assert.ok(linux.indexOf('if [[ "$mode" == appimage ]]')<linux.indexOf('command -v npm'));
});
test('source installers explicitly install the pinned Electron binary after npm ci',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.scripts['runtime:install'],'node node_modules/electron/install.js');
 for(const name of ['install-linux.sh','install-windows.ps1']) {
  const script=fs.readFileSync(path.join(__dirname,'../scripts',name),'utf8');
  assert.ok(script.indexOf('ci')<script.indexOf('runtime:install'));
  assert.match(script,/runtime:install/);
 }
 assert.equal(pkg.scripts.postinstall,undefined);
});
test('deb installation honors Python selection and per-user autostart using package desktop entry',()=>{
 const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
 if(process.platform==='win32'&&!fs.existsSync(bash)) return;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-deb-'));
 const posix=p=>p.replaceAll('\\','/');
 try {
  const artifact=path.join(root,'Hermes Voice.deb'), desktop=path.join(root,'share/applications/package.desktop'), log=path.join(root,'commands');
  fs.writeFileSync(artifact,'fixture');fs.mkdirSync(path.dirname(desktop),{recursive:true});fs.writeFileSync(desktop,'[Desktop Entry]\nExec=/opt/Hermes Voice/hermes-voice-desktop\n');
  const script=posix(path.join(__dirname,'../scripts/install-linux.sh'));
  const input=`uname() { if [[ "$1" == -s ]]; then echo Linux; else echo x86_64; fi; }\nsudo() { printf '%s\\n' "$*" >> "$TEST_LOG"; }\ndpkg-query() { printf '%s\\n' "$TEST_DESKTOP"; }\nexport -f uname sudo dpkg-query\nbash '${script}' --deb '${posix(artifact)}' --install-python --autostart\n`;
  const result=spawnSync(bash,['-s'],{input,encoding:'utf8',env:{...process.env,TEST_LOG:posix(log),TEST_DESKTOP:posix(desktop),XDG_CONFIG_HOME:posix(path.join(root,'config'))}});
  assert.equal(result.status,0,result.stderr);
  assert.match(fs.readFileSync(log,'utf8'),/apt-get install -y python3 python3-venv/);
  assert.match(fs.readFileSync(log,'utf8'),/apt-get install -y -- .*Hermes Voice.deb/);
  assert.equal(fs.readFileSync(path.join(root,'config/autostart/hermes-voice.desktop'),'utf8'),fs.readFileSync(desktop,'utf8'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('payload matches builder dependency filtering and retains dependency licenses',()=>{
 const {listPublicFiles}=require('../scripts/prepare-package.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-license-'));
 try{
  for(const file of ['node_modules/ws/README.md','node_modules/ws/LICENSE','node_modules/@mediapipe/tasks-vision/vision.d.ts','node_modules/@mediapipe/tasks-vision/vision_bundle.cjs','assets/licenses/mediapipe-Apache-2.0.txt']){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'fixture');}
  assert.deepEqual(listPublicFiles(root),['assets/licenses/mediapipe-Apache-2.0.txt','node_modules/@mediapipe/tasks-vision/vision_bundle.cjs','node_modules/ws/LICENSE']);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 const license=fs.readFileSync(path.join(__dirname,'../assets/licenses/mediapipe-Apache-2.0.txt'),'utf8');
 assert.match(license,/Apache License/);assert.match(license,/END OF TERMS AND CONDITIONS/);
});
test('packaged artifact verification rejects a stripped or changed inventoried file',()=>{
 const {prepare}=require('../scripts/prepare-package.cjs'),{verifyPackage}=require('../scripts/verify-package.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-artifact-')),source=path.join(root,'source'),dest=path.join(root,'package');
 try{fs.mkdirSync(source);fs.writeFileSync(path.join(source,'main.cjs'),'public source');prepare(source,dest);assert.equal(verifyPackage(dest),1);fs.writeFileSync(path.join(dest,'main.cjs'),'changed');assert.throws(()=>verifyPackage(dest),/missing or changed/);fs.unlinkSync(path.join(dest,'main.cjs'));assert.throws(()=>verifyPackage(dest),/missing or changed/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('builder metadata cleanup updates checksums while changed runtime metadata fails',()=>{
 const {prepare}=require('../scripts/prepare-package.cjs'),{finalizePackage,verifyPackage}=require('../scripts/verify-package.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'voice-metadata-')),source=path.join(root,'source'),dest=path.join(root,'package');
 try{fs.mkdirSync(source);fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({name:'fixture',main:'desktop-entry.cjs',scripts:{test:'test'},devDependencies:{electron:'44.7.2'}}));prepare(source,dest);const file=path.join(dest,'package.json');fs.writeFileSync(file,JSON.stringify({name:'fixture',main:'desktop-entry.cjs'}));assert.throws(()=>verifyPackage(dest),/missing or changed/);finalizePackage(dest,source);assert.equal(verifyPackage(dest),1);fs.writeFileSync(file,JSON.stringify({name:'fixture',main:'unexpected.cjs'}));assert.throws(()=>finalizePackage(dest,source),/runtime metadata changed/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
