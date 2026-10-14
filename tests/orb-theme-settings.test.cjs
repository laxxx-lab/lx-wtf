'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const repo=path.resolve(__dirname,'..');
function fixture(platform,saved={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-orb-settings-')),local=path.join(root,'.local'),events=[];
 fs.mkdirSync(local);const file=path.join(local,platform==='linux'?'linux-settings.json':'settings.json');fs.writeFileSync(file,JSON.stringify(saved));
 const app={commandLine:{appendSwitch(){}},setPath(){},setName(){},setAppUserModelId(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false};
 const ctx=vm.createContext({__dirname:root,process:{...process,argv:[process.argv[0],platform==='linux'?'--linux-smoke':'test'],env:{...process.env,LILITH_GATEWAY_URL:'',LILITH_GATEWAY_HOST_MAP:'',LILITH_GATEWAY_IP:'',LILITH_MCP_URL:''}},Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
  if(name==='electron')return {app,ipcMain:{handle(){}},Notification:{isSupported:()=>false}};
  if(name.startsWith('./'))return require(path.resolve(repo,name));return require(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(repo,platform==='linux'?'linux-main.cjs':'main.cjs'),'utf8'),ctx);ctx.events=events;
 const run=code=>vm.runInContext(code,ctx);
 run("connected=true;conversation=new Conversation(async()=>({}));conversation.session={id:'runtime',storedId:'stored',profile:'default',title:'Test'};conversation.busy=true;");
 if(platform==='linux')run("generation=7;transcribing=true;rendererInput={capturing:true,speaking:true,live:true,microphoneOpen:true};speechPending=2;connecting=true;emit=event=>events.push(event);");
 else run("safetyGeneration=7;clientInfo={...clientInfo,capturing:true,speaking:true,live:true};emit=(type,data={})=>events.push({type,...data});syncStartup=()=>{throw Error('unexpected startup sync')};syncPushToTalk=()=>{throw Error('unexpected hotkey sync')};syncDesktopGestureInput=()=>{throw Error('unexpected gesture sync')};");
 run("stopSpeech=()=>{throw Error('unexpected audio stop')};connect=()=>{throw Error('unexpected reconnect')};");
 return {run,events,file,settings:()=>JSON.parse(fs.readFileSync(file,'utf8')),set:values=>{ctx.values=values;return run(platform==='linux'?'actions.settings(values)':'registerHandlers().settings(null,values)');},close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('Linux validates persisted themes and falls back to Classic for absent or unknown ids',()=>{
 const {validateLinuxSettings}=require('../linux-client.cjs');
 for(const [input,want] of [[undefined,'classic'],['unknown','classic'],['voice-orb','voice-orb'],['ai-interface','ai-interface'],['particle-core','particle-core'],['hud-core','hud-core']])assert.equal(validateLinuxSettings({orbTheme:input}).orbTheme,want);
});
for(const platform of ['windows','linux']){
 test(platform+' starts with Classic unless a supported theme was saved',()=>{
  for(const [input,want] of [[undefined,'classic'],['obsolete','classic'],['hud-core','hud-core']]){const f=fixture(platform,{orbTheme:input});try{assert.equal(f.run('config.orbTheme'),want);}finally{f.close();}}
 });
 test(platform+' saves and publishes theme changes while work capture and speech retain ownership',async()=>{
  const f=fixture(platform,{orbTheme:'classic',cameraEnabled:true,privacyLocked:false});try{
   const before=JSON.stringify(f.run(platform==='linux'?'({generation,session:conversation.session,input:rendererInput,speechPending,transcribing,connecting})':'({generation:safetyGeneration,session:conversation.session,input:clientInfo})'));
   const result=await f.set({orbTheme:'particle-core'});
   assert.equal(result.settings.orbTheme,'particle-core');assert.equal(result.busy,true);assert.equal(f.settings().orbTheme,'particle-core');
   assert.equal(JSON.stringify(f.run(platform==='linux'?'({generation,session:conversation.session,input:rendererInput,speechPending,transcribing,connecting})':'({generation:safetyGeneration,session:conversation.session,input:clientInfo})')),before);
   assert.ok(f.events.some(event=>platform==='linux'?event.type==='state'&&event.snapshot.settings.orbTheme==='particle-core':event.type==='orb-theme-config'&&event.orbTheme==='particle-core'));
   if(platform==='windows')assert.equal(f.events.some(event=>event.type==='settings-config'),false,'A visual change does not reset unrelated form drafts');
   await f.set({orbTheme:'no-such-theme'});assert.equal(f.settings().orbTheme,'classic');
  }finally{f.close();}
 });
 test(platform+' retains the last saved theme if persistence fails',async()=>{
  const f=fixture(platform,{orbTheme:'voice-orb'});try{fs.unlinkSync(f.file);fs.mkdirSync(f.file);await assert.rejects(f.set({orbTheme:'hud-core'}));assert.equal(f.run('config.orbTheme'),'voice-orb');assert.equal(f.events.length,0);}finally{f.close();}
 });
}
function windowsOrbSettings(){
 const nodes=new Map(),calls=[],renderers=[],notices=[],$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},append(){}});return nodes.get(id);};
 $('orb-motion-mode').value='system';
 const HermesOrb={...require('../ui/orb.js'),OrbRenderer:class{constructor(){renderers.push(this);}setTheme(value){this.theme=value;}setColors(){}pulse(){}}};
 const context=vm.createContext({HermesOrb,$,settings:{orbTheme:'voice-orb'},orbColors:HermesOrb.normalizeOrbColors(),orbIntensity:1,document:{createElement:()=>({})},matchMedia:()=>({matches:false,addEventListener(){}}),performance:{now:()=>10},notice:value=>notices.push(value),acceptSettings:value=>{context.settings=value;},invoke:async(method,values)=>{calls.push({method,values});if(context.fail)throw Error('Speichern fehlgeschlagen');return {settings:{...context.settings,...values}};}});
 const source=fs.readFileSync(path.join(repo,'ui/app.js'),'utf8');vm.runInContext(source.slice(source.indexOf('const motionPreference='),source.indexOf('let lastDraw=')),context);
 return {context,$,calls,renderers,notices,run:code=>vm.runInContext(code,context)};
}
test('Windows theme selection saves immediately and restores its saved rendering after IPC failure',async()=>{
 const f=windowsOrbSettings();f.run('syncOrbSettings(settings)');
 assert.equal(f.$('orb-theme').value,'voice-orb');assert.equal(typeof f.$('orb-theme').handlers.change,'function');
 f.$('orb-theme').value='hud-core';await f.$('orb-theme').handlers.change({target:f.$('orb-theme')});
 assert.equal(JSON.stringify(f.calls.at(-1)),JSON.stringify({method:'settings',values:{orbTheme:'hud-core'}}));assert.ok(f.renderers.every(renderer=>renderer.theme==='hud-core'));
 f.context.fail=true;f.$('orb-theme').value='particle-core';await f.$('orb-theme').handlers.change({target:f.$('orb-theme')});
 assert.equal(f.$('orb-theme').value,'hud-core');assert.ok(f.renderers.every(renderer=>renderer.theme==='hud-core'));assert.match(f.notices.at(-1),/fehlgeschlagen/);
 f.$('orb-reset').onclick();assert.equal(f.$('orb-theme').value,'hud-core');
});
