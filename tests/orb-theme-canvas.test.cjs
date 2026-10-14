'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const electron=path.join(process.env.LOCALAPPDATA||'','hermes/hermes-agent/apps/desktop/node_modules/electron/dist/electron.exe');
function inspectThemes(){
 // Stable readback backend: repeated pixel probes must not migrate this QA
 // canvas from GPU to software in the middle of the restoration comparison.
 const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),images={},results={};
 const pixels=()=>ctx.getImageData(0,0,canvas.width,canvas.height).data.slice();
 const difference=(a,b)=>a.reduce((n,v,i)=>n+Math.abs(v-b[i]),0)/a.length;
 const frame=(theme,state,reducedMotion=false,amplitude=0)=>{const r=new HermesOrb.OrbRenderer(canvas,{reducedMotion});r.setTheme(theme);for(let i=0;i<=80;i++)r.draw(i*50,{state,amplitude});return r;};
 for(const theme of Object.keys(HermesOrb.ORB_THEMES)){
  canvas.width=canvas.height=400;canvas.style.width='400px';
  const r=frame(theme,'thinking'),before=pixels();for(let i=1;i<=20;i++)r.draw(4000+i*16,{state:'thinking'});
  const moving=difference(before,pixels());
  const image=document.createElement('canvas');image.width=image.height=400;const p=image.getContext('2d');p.fillStyle='#06121b';p.fillRect(0,0,400,400);p.drawImage(canvas,0,0);images[theme]=image.toDataURL();
  const still={};for(const state of Object.keys(HermesOrb.ORB_DEFAULTS)){const reduced=frame(theme,state,true,0),a=pixels();for(let i=1;i<=8;i++)reduced.draw(4000+i*50,{state,amplitude:0});still[state]=difference(a,pixels());}
  frame(theme,'listening',false,0);const quiet=pixels();frame(theme,'listening',false,.8);const voice=difference(quiet,pixels());
  frame(theme,'speaking',false,1);const loud=pixels();let corners=0;for(const [x,y]of [[0,0],[399,0],[0,399],[399,399]])corners+=loud[(y*400+x)*4+3];
  canvas.width=canvas.height=190;canvas.style.width='190px';frame(theme,'idle');let visible=0;const small=pixels();for(let i=0;i<small.length;i+=4)if(small[i+3]>70&&Math.max(small[i],small[i+1],small[i+2])>70)visible++;
  results[theme]={moving,still,voice,corners,visible};
 }
 // Switching back restores the complete Classic drawing and does not reset its clock.
 canvas.width=canvas.height=400;canvas.style.width='400px';const original=frame('classic','thinking',true),classic=pixels();
 original.setTheme('particle-core');original.draw(4100,{state:'thinking'});const alternate=pixels();
 original.setTheme('classic');original.draw(4200,{state:'thinking'});const restored=difference(classic,pixels());
 return {results,restored,switched:difference(classic,alternate),images};
}
test('all installed themes draw distinct full orbs, honor real audio and motion, and restore Classic',{skip:!fs.existsSync(electron),timeout:60000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-orb-themes-')),output=path.join(dir,'result.json'),entry=path.join(dir,'main.cjs'),html=path.join(dir,'view.html');
 t.after(()=>{if(path.dirname(dir)!==os.tmpdir()||!path.basename(dir).startsWith('lilith-orb-themes-'))throw Error('Unexpected QA path');fs.rmSync(dir,{recursive:true,force:true});});
 fs.writeFileSync(html,'<!doctype html><canvas width="400" height="400"></canvas>'+['orb-classic.js','orb-reference-themes.js','orb.js'].map(file=>'<script src="'+pathToFileURL(path.join(__dirname,'../ui',file)).href+'"></script>').join(''));
 fs.writeFileSync(entry,`const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path');app.setPath('userData',path.join(${JSON.stringify(dir)},'profile'));app.whenReady().then(async()=>{const errors=[];session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});w.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});try{await w.loadFile(${JSON.stringify(html)});const result=await w.webContents.executeJavaScript('('+${JSON.stringify(inspectThemes.toString())}+')()');if(process.env.ORB_THEME_PREVIEW_DIR){fs.mkdirSync(process.env.ORB_THEME_PREVIEW_DIR,{recursive:true});for(const [name,png]of Object.entries(result.images))fs.writeFileSync(path.join(process.env.ORB_THEME_PREVIEW_DIR,name+'.png'),Buffer.from(png.split(',')[1],'base64'));}delete result.images;fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({result,errors}));app.exit(0);}catch(e){fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({error:e.stack,errors}));app.exit(1);}});`);
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(electron,[entry],{env,windowsHide:true,stdio:'ignore'});t.after(()=>{if(child.exitCode===null)child.kill();});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});const value=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(code,0,value.error);assert.deepEqual(value.errors,[]);
 t.diagnostic(JSON.stringify(value.result));
 for(const [theme,result]of Object.entries(value.result.results)){assert.ok(result.moving>.1,theme+' animates');assert.ok(result.voice>.3,theme+' responds to measured audio');assert.equal(result.corners,0,theme+' keeps desktop corners transparent');assert.ok(result.visible>250,theme+' remains visible at compact size');for(const [state,motion]of Object.entries(result.still))assert.equal(motion,0,theme+' '+state+' respects reduced motion');}
 assert.ok(value.result.switched>2,'Theme switch replaces the full drawing');assert.equal(value.result.restored,0,'Classic is restored exactly');
});
