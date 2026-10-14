'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const electron=path.join(process.env.LOCALAPPDATA||'','hermes','hermes-agent','apps','desktop','node_modules','electron','dist','electron.exe');

// Removing the thinking palette, animating reduced motion, or ignoring preferences
// must change the actual Canvas pixels, rather than just a mocked draw call.
function checkCanvas(){
  const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const preview=()=>{const image=document.createElement('canvas');image.width=image.height=400;const paint=image.getContext('2d');paint.fillStyle='#06121b';paint.fillRect(0,0,400,400);paint.drawImage(canvas,0,0);return image.toDataURL('image/png');};
  const frame=(state,{reducedMotion=false,color,intensity=1,at=0,amplitude=0,theme='classic'}={})=>{
    const orb=new HermesOrb.OrbRenderer(canvas,{reducedMotion});
    orb.setTheme(theme);if(color)orb.setColors({[state]:color});
    orb.setPointer(.7,-.6);
    for(let i=0;i<=80;i++)orb.draw(at+i*50,{state,intensity,amplitude});
    return {orb,pixels:ctx.getImageData(0,0,400,400).data.slice(),image:preview(),now:at+80*50};
  };
  const hues=(pixels,anchor)=>{
    const bins=new Set();let colored=0,outside=0;
    for(let i=0;i<pixels.length;i+=4){
      const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
      if(pixels[i+3]<65||max<.3||delta/max<.35)continue;
      let h=max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta;
      h=(h*60+360)%360;bins.add(Math.floor(h/30));colored++;
      if(anchor!==undefined&&Math.abs((h-anchor+540)%360-180)>35)outside++;
    }
    return {bins:bins.size,colored,outside};
  };
  const difference=(a,b)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length;};
  const normal=frame('thinking'),working=frame('working'),idle=frame('idle'),custom=frame('thinking',{color:'#ff3366'});
  const listen=frame('listening'),voice=frame('listening',{amplitude:.75}),customWork=frame('working',{color:'#ff3366'}),customListen=frame('listening',{color:'#ff3366'});
  const before=normal.pixels;for(let i=1;i<=30;i++)normal.orb.draw(normal.now+i*16,{state:'thinking'});
  const after=ctx.getImageData(0,0,400,400).data;
  const still=frame('thinking',{reducedMotion:true});
  for(let i=1;i<=90;i++)still.orb.draw(still.now+i*16,{state:'thinking'});
  const stillAfter=ctx.getImageData(0,0,400,400).data;
  const stillGray=frame('thinking',{reducedMotion:true,color:'#eeeeee'});
  for(let i=1;i<=300;i++)stillGray.orb.draw(stillGray.now+i*16,{state:'thinking'});
  const stillGrayAfter=ctx.getImageData(0,0,400,400).data;
  const pale=frame('thinking',{color:'#eeeeee',intensity:2.4});
  let edgePixels=0;
  for(let y=0;y<400;y++)for(let x=0;x<400;x++)if((x<4||y<4||x>=396||y>=396)&&pale.pixels[(y*400+x)*4+3]>20)edgePixels++;
  const gentle=frame('thinking',{intensity:.4});
  const changedState=frame('thinking');for(let i=1;i<=80;i++)changedState.orb.draw(changedState.now+i*50,{state:'working'});
  const returned=ctx.getImageData(0,0,400,400).data;
  const start=performance.now();for(let i=1;i<=120;i++)pale.orb.draw(pale.now+i*16,{state:'thinking',intensity:2.4});
  const msPerFrame=(performance.now()-start)/120,images={thinking:normal.image,working:working.image,idle:idle.image,custom:custom.image,reduced:still.image,listeningVoice:voice.image};
  for(const state of ['listening','speaking','looking','success','alert','error','offline'])images[state]=frame(state).image;
  // A small Orb must visibly move in standby and show a quiet listening aperture.
  let compactBeaconPixels=0;
  const compactMovement=(state,reducedMotion=false)=>{canvas.width=canvas.height=190;const renderer=new HermesOrb.OrbRenderer(canvas,{reducedMotion});for(let i=0;i<=80;i++)renderer.draw(i*50,{state});const a=ctx.getImageData(0,0,190,190).data.slice();if(!reducedMotion)for(let y=0;y<190;y++)for(let x=0;x<190;x++){const radius=Math.hypot(x-95,y-95);if(radius>40&&radius<56&&a[(y*190+x)*4+3]>200)compactBeaconPixels++;}for(let i=1;i<=60;i++)renderer.draw(4000+i*16,{state});return difference(a,ctx.getImageData(0,0,190,190).data);};
  const smallIdleMovement=compactMovement('idle'),smallIdleStill=compactMovement('idle',true);canvas.width=canvas.height=400;
  const listening=frame('listening',{reducedMotion:true}),points=ctx.getImageData(0,0,400,400).data;
  // At rest, two open side arcs are visible around the quiet microphone bands.
  let aperturePixels=0;for(let y=110;y<290;y++)for(let x=290;x<305;x++)if(points[(y*400+x)*4+3]>100)aperturePixels++;
  const stateMotion={},stateStill={};for(const state of Object.keys(HermesOrb.ORB_DEFAULTS)){const f=frame(state);for(let i=1;i<=45;i++)f.orb.draw(f.now+i*16,{state});stateMotion[state]=difference(f.pixels,ctx.getImageData(0,0,400,400).data);const quiet=frame(state,{reducedMotion:true});for(let i=1;i<=60;i++)quiet.orb.draw(quiet.now+i*16,{state});stateStill[state]=difference(quiet.pixels,ctx.getImageData(0,0,400,400).data);}
  const filledCore={},particleTexture={};for(const state of ['idle','thinking','listening','speaking']){
    const f=frame(state,{theme:'particle-core'});let filled=0;for(let y=174;y<226;y++)for(let x=174;x<226;x++){
      if(Math.hypot(x-200,y-200)>26)continue;const i=(y*400+x)*4,max=Math.max(...f.pixels.slice(i,i+3)),min=Math.min(...f.pixels.slice(i,i+3));
      if(f.pixels[i+3]>=210&&max>90&&max-min>max*.2)filled++;
    }filledCore[state]=filled;
    let edges=0;for(let y=175;y<225;y++)for(let x=175;x<225;x++){
      if(Math.hypot(x-200,y-200)>25)continue;
      const i=(y*400+x)*4,j=i+8;
      if(Math.max(...[0,1,2].map(k=>Math.abs(f.pixels[i+k]-f.pixels[j+k])))>40)edges++;
    }particleTexture[state]=edges;
  }
  const compactContrast={};canvas.width=canvas.height=190;const small=new HermesOrb.OrbRenderer(canvas);for(let i=0;i<=240;i++)small.draw(i*16,{state:'idle'});
  const smallPixels=ctx.getImageData(0,0,190,190).data;
  for(const background of [25,128,235]){let visible=0;for(let y=37;y<153;y++)for(let x=37;x<153;x++){
    const i=(y*190+x)*4,alpha=smallPixels[i+3]/255,contrast=Math.max(...[0,1,2].map(k=>Math.abs(smallPixels[i+k]*alpha+background*(1-alpha)-background)));
    if(contrast>55)visible++;
  }compactContrast[background]=visible;}canvas.width=canvas.height=400;
  const base=HermesOrb.ORB_DEFAULTS.thinking,[r,g,b]=[1,3,5].map(i=>parseInt(base.slice(i,i+2),16)),max=Math.max(r,g,b),delta=max-Math.min(r,g,b),anchor=((max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta)*60+360)%360;
  return {particleTexture,filledCore,compactContrast,thinking:hues(normal.pixels,anchor),customPalette:hues(custom.pixels,345),working:hues(working.pixels,221),listening:hues(listen.pixels,169),customWorking:hues(customWork.pixels,345),customListening:hues(customListen.pixels,345),voiceDifference:difference(listen.pixels,voice.pixels),idle:hues(idle.pixels),returned:hues(returned),customDifference:difference(normal.pixels,custom.pixels),movement:difference(before,after),stillMovement:difference(still.pixels,stillAfter),stillGrayMovement:difference(stillGray.pixels,stillGrayAfter),intensityDifference:difference(normal.pixels,gentle.pixels),edgePixels,msPerFrame,smallIdleMovement,smallIdleStill,compactBeaconPixels,aperturePixels,stateMotion,stateStill,systemReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,images};
}

test('native thinking reactor renders a moving palette, preserves color and motion preferences, and stays bounded',{skip:!fs.existsSync(electron),timeout:60000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-orb-thinking-')),output=path.join(dir,'result.json'),entry=path.join(dir,'main.cjs'),html=path.join(dir,'view.html');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><canvas width="400" height="400"></canvas><script src="'+pathToFileURL(path.join(__dirname,'../ui/orb-classic.js')).href+'"></script><script src="'+pathToFileURL(path.join(__dirname,'../ui/orb-reference-themes.js')).href+'"></script><script src="'+pathToFileURL(path.join(__dirname,'../ui/orb.js')).href+'"></script>');
  fs.writeFileSync(entry,`
    const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path');
    app.setPath('userData',path.join(${JSON.stringify(dir)},'profile'));
    app.whenReady().then(async()=>{
      session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
      session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('devtools:')}));
      const win=new BrowserWindow({show:false,width:420,height:440,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
      const errors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
      try{await win.loadFile(${JSON.stringify(html)});const result=await win.webContents.executeJavaScript('('+${JSON.stringify(checkCanvas.toString())}+')()');
        if(process.env.ORB_PREVIEW_DIR){fs.mkdirSync(process.env.ORB_PREVIEW_DIR,{recursive:true});for(const [name,image]of Object.entries(result.images))fs.writeFileSync(path.join(process.env.ORB_PREVIEW_DIR,name+'.png'),Buffer.from(image.split(',')[1],'base64'));}
        delete result.images;fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({result,errors}));win.destroy();app.exit(0);
      }catch(error){fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({error:error.stack,errors}));app.exit(1);}
    });
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(electron,[entry],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000);});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  const {result,errors,error}=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};
  assert.equal(code,0,error||stderr);assert.deepEqual(errors,[]);
  t.diagnostic(JSON.stringify(result));
  for(const [state,edges]of Object.entries(result.particleTexture))assert.ok(edges>150,state+' center shows distinct luminous particles with gaps rather than a smooth filled body');
  // Original Classic is transparent and finer than the later boosted drawing.
  for(const [background,pixels]of Object.entries(result.compactContrast))assert.ok(pixels>250,'Original compact orb stays visible against background '+background);
  assert.ok(result.thinking.bins>=2&&result.thinking.bins<=3,'Thinking keeps adjacent shades rather than a rainbow');
  assert.equal(result.thinking.outside,0,'Thinking colors remain in the warm status family');
  assert.equal(result.customPalette.outside,0,'A custom thinking color also keeps its own hue family');
  assert.ok(result.thinking.colored>1200,'The gradient must illuminate visible reactor geometry');
  assert.ok(result.working.bins>=1&&result.working.bins<=3,'Original working geometry uses its selected blue family');
  assert.ok(result.listening.bins>=1&&result.listening.bins<=3,'Original listening geometry uses its selected turquoise family');
  for(const key of ['working','listening','customWorking','customListening'])assert.equal(result[key].outside,0,key+' stays in its selected color family');
  assert.ok(result.voiceDifference>2,'Real microphone energy visibly shapes the listening field');
  assert.ok(result.idle.bins<=2&&result.returned.bins<=3,'Standby remains restrained and working recovers its own palette');
  assert.ok(result.customDifference>2,'Changing the thinking base color must change visible pixels');
  assert.ok(result.movement>2,'Thinking must visibly evolve over half a second');
  assert.equal(result.stillMovement,0,'Reduced motion must keep the complete settled thinking frame still');
  assert.equal(result.stillGrayMovement,0,'A gray base color must also keep a settled reduced-motion spectrum still');
  assert.ok(result.intensityDifference>1,'The motion preference must visibly affect thinking');
  assert.equal(result.edgePixels,0,'The strongest reactor keeps a transparent margin');
  assert.ok(result.smallIdleMovement>.2,'Original standby visibly moves at the actual compact size');
  assert.equal(result.smallIdleStill,0,'Reduced motion keeps standby still');
  for(const [state,delta]of Object.entries(result.stateMotion))assert.ok(delta>.2,state+' must visibly animate');
  for(const [state,delta]of Object.entries(result.stateStill))assert.equal(delta,0,state+' respects reduced motion');
});
