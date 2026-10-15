'use strict';
const electron=require('electron'),{app,dialog}=electron,fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {defaultWorkspace,installPublicWorkspace}=require('./workspace-install.cjs');
const source=__dirname,version=require('./package.json').version;
if(process.argv.includes('--version')){console.log('Hermes Voice '+version+' (Electron v'+process.versions.electron+')');app.exit(0);}
let root=source;
if(app.isPackaged||process.env.HERMES_VOICE_HOME){
 root=defaultWorkspace({appData:app.getPath('appData')});
 fs.mkdirSync(path.join(root,'.local'),{recursive:true,mode:0o700});
}
if(app.isPackaged||process.env.HERMES_VOICE_HOME){app.setName('Hermes Voice');app.setPath('userData',path.join(root,'.local',process.platform==='win32'?'app-data':'desktop-data'));}
else if(process.platform==='win32')app.setPath('userData',path.join(root,'.local','app-data'));
else{
 const marker=path.join(root,'.local/legacy-auth-profile');
 const legacy=fs.existsSync(marker)||fs.existsSync(path.join(root,'.local/linux-settings.json'))&&!fs.existsSync(path.join(root,'.local/installation.json'));
 if(legacy){fs.mkdirSync(path.dirname(marker),{recursive:true,mode:0o700});fs.writeFileSync(marker,'hermes-windows-voice\n',{mode:0o600});app.setPath('userData',path.join(app.getPath('appData'),'hermes-windows-voice'));}
 else app.setPath('userData',path.join(root,'.local/desktop-data'));
 app.setName('Hermes Voice');
}
const ownsBootstrapLock=app.requestSingleInstanceLock();
function command(exe,args,{signal,onProgress=()=>{},timeoutMs=1800000}={}){
 return new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const child=spawn(exe,args,{cwd:root,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',HF_HUB_DISABLE_TELEMETRY:'1'}});
  const terminate=()=>{if(!child.pid)return;if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});else try{process.kill(-child.pid,'SIGTERM');}catch{}};
  const abort=()=>{terminate();done(Error('Installation abgebrochen.'));};
  let finished=false,tail='';const timeout=setTimeout(()=>{terminate();done(Error('Die Installation hat das Zeitlimit erreicht.'));},timeoutMs);
  const done=error=>{if(finished)return;finished=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
  signal?.addEventListener('abort',abort,{once:true});
  const output=data=>{tail=(tail+String(data)).slice(-1800);onProgress(String(data).slice(-1200));};child.stdout.on('data',output);child.stderr.on('data',output);child.once('error',done);child.once('close',code=>done(code===0?null:Error('Installation fehlgeschlagen. '+tail.slice(-900))));
 });
}
async function findPython(){
 const candidates=process.platform==='win32'?[['py',['-3.12']],['py',['-3.11']],['python',[]]]:[['python3',[]]];
 if(process.platform==='win32'&&process.env.LOCALAPPDATA)candidates.push([path.join(process.env.LOCALAPPDATA,'Programs/Python/Python312/python.exe'),[]]);
 for(const [exe,args]of candidates){try{await command(exe,[...args,'-c','import sys; assert (3,10)<=sys.version_info[:2]<(3,13)'],{timeoutMs:10000});return {exe,args};}catch{}}
 return null;
}
async function install(choice,onProgress,{signal}={}){
 const legacy=(process.platform==='win32'?require('./engines.cjs').engineSpecs:require('./linux-client.cjs').linuxEngineSpecs)(root);
 for(const [key,name]of [['stt','stt'],['tts','voice']])if(choice[key]==='existing'){
  const spec=legacy.find(value=>value.name===name),model=spec?.args[spec.args.indexOf('--model')+1];
  if(!spec||!fs.existsSync(spec.exe)||!model||!fs.existsSync(model)||name==='voice'&&!fs.existsSync(path.join(root,'voices/fixed/registry.json')))throw Error('Die ausgewählte vorhandene Sprachlaufzeit ist hier nicht installiert. Bitte Whisper/Piper auswählen oder Textmodus verwenden.');
 }
 const needed=![choice.stt,choice.tts].every(value=>['none','existing'].includes(value));
 if(!needed){onProgress('Textmodus / vorhandene Sprachlaufzeit ausgewählt. Keine Sprachpakete werden heruntergeladen.');return;}
 let python=await findPython();
 if(!python&&process.platform==='win32'){
  onProgress('Python 3.12 wird für die ausgewählten lokalen Sprachkomponenten installiert …');
  await command('winget',['install','--id','Python.Python.3.12','--exact','--scope','user','--accept-package-agreements','--accept-source-agreements','--disable-interactivity'],{signal,onProgress});python=await findPython();
 }
 if(!python)throw Error('Python 3.10–3.12 mit venv fehlt. Bitte das Installationsskript mit Systempaketen nutzen oder Python 3.12 installieren und hier erneut versuchen.');
 const args=[...python.args,path.join(root,'scripts/install_speech.py'),'--root',root,'--stt',choice.stt,'--tts',choice.tts,'--language',choice.language];
 await command(python.exe,args,{signal,onProgress});await command(python.exe,[...args,'--check'],{signal,onProgress,timeoutMs:30000});
}
async function start(){
 if(app.isPackaged||process.env.HERMES_VOICE_HOME){
  let installed;try{installed=JSON.parse(fs.readFileSync(path.join(root,'.local/package-version.json'),'utf8')).version;}catch{}
  if(installed!==version)installPublicWorkspace({source,destination:root,version,files:require('./scripts/prepare-package.cjs').listPublicFiles(source)});
 }
 const options=require('./setup-options.cjs'),settingsFile=path.join(root,'.local',process.platform==='win32'?'settings.json':'linux-settings.json');
 const scripted=options.setupFromArgs(process.argv);
 if(scripted){await install(scripted,message=>console.log(message));options.applyClientSettings(root,process.platform,scripted);options.writeInstallation(root,scripted);console.log('Hermes Voice eingerichtet. Anmeldung erfolgt beim nächsten normalen Start am eigenen Gateway.');app.exit(0);return;}
 const existing=options.readInstallation(root),hasLegacySettings=fs.existsSync(settingsFile);
 if(!existing&&(!hasLegacySettings||fs.existsSync(path.join(root,'.local/installation.json')))||process.argv.includes('--setup')){
  await app.whenReady();let saved={};try{saved=JSON.parse(fs.readFileSync(settingsFile,'utf8'));}catch{}
  const initial=existing||{assistantName:saved.assistantName||'Hermes',url:saved.url||'',stt:hasLegacySettings?'existing':'base',tts:hasLegacySettings?'existing':'de_DE-thorsten-medium',language:'de'};
  const choice=await require('./onboarding.cjs').runOnboarding({electron,root,initial,install});if(!choice){app.quit();return;}
 }
 require(path.join(root,process.platform==='win32'?'main.cjs':'linux-main.cjs'));
}
if(!ownsBootstrapLock)app.quit();else start().catch(async error=>{if(process.argv.includes('--configure')){console.error(error.message);app.exit(1);return;}await app.whenReady();dialog.showErrorBox('Hermes Voice',error.message);app.quit();});
