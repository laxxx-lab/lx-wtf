'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const electron=path.join(process.env.LOCALAPPDATA||'','hermes','hermes-agent','apps','desktop','node_modules','electron','dist','electron.exe');

// Removing the thinking palette, animating reduced motion, or ignoring preferences
// must change the actual Canvas pixels, rather than just a mocked draw call.
function checkCanvas(){
  const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
  const preview=()=>{const image=document.createElement('canvas');image.width=image.height=400;const paint=image.getContext('2d');paint.fillStyle='#06121b';paint.fillRect(0,0,400,400);paint.drawImage(canvas,0,0);return image.toDataURL('image/png');};
  const frame=(state,{reducedMotion=false,color,intensity=1,at=0}={})=>{
    const orb=new HermesOrb.OrbRenderer(canvas,{reducedMotion});
    if(color)orb.setColors({thinking:color});
    orb.setPointer(.7,-.6);
    for(let i=0;i<=240;i++)orb.draw(at+i*16,{state,intensity});
    return {orb,pixels:ctx.getImageData(0,0,400,400).data.slice(),image:preview(),now:at+240*16};
  };
  const hues=pixels=>{
    const bins=new Set();let colored=0;
    for(let i=0;i<pixels.length;i+=4){
      const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
      if(pixels[i+3]<65||max<.3||delta/max<.35)continue;
      let h=max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta;
      h=(h*60+360)%360;bins.add(Math.floor(h/30));colored++;
    }
    return {bins:bins.size,colored};
  };
  const difference=(a,b)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length;};
  const normal=frame('thinking'),working=frame('working'),idle=frame('idle'),custom=frame('thinking',{color:'#ff3366'});
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
  const changedState=frame('thinking');for(let i=1;i<=240;i++)changedState.orb.draw(changedState.now+i*16,{state:'working'});
  const returned=ctx.getImageData(0,0,400,400).data;
  const start=performance.now();for(let i=1;i<=120;i++)pale.orb.draw(pale.now+i*16,{state:'thinking',intensity:2.4});
  const msPerFrame=(performance.now()-start)/120,images={thinking:normal.image,working:working.image,idle:idle.image,custom:custom.image,reduced:still.image};
  for(const state of ['listening','speaking','looking','success','alert','error','offline'])images[state]=frame(state).image;
  return {thinking:hues(normal.pixels),working:hues(working.pixels),idle:hues(idle.pixels),returned:hues(returned),customDifference:difference(normal.pixels,custom.pixels),movement:difference(before,after),stillMovement:difference(still.pixels,stillAfter),stillGrayMovement:difference(stillGray.pixels,stillGrayAfter),intensityDifference:difference(normal.pixels,gentle.pixels),edgePixels,msPerFrame,images};
}

test('native thinking reactor renders a moving palette, preserves color and motion preferences, and stays bounded',{skip:!fs.existsSync(electron),timeout:30000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-orb-thinking-')),output=path.join(dir,'result.json'),entry=path.join(dir,'main.cjs'),html=path.join(dir,'view.html');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(html,'<!doctype html><meta charset="utf-8"><canvas width="400" height="400"></canvas><script src="'+pathToFileURL(path.join(__dirname,'../ui/orb.js')).href+'"></script>');
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
  assert.ok(result.thinking.bins>=4,'Thinking must show several simultaneous hues');
  assert.ok(result.thinking.colored>1200,'The gradient must illuminate visible reactor geometry');
  assert.ok(result.working.bins<=2&&result.idle.bins<=2&&result.returned.bins<=2,'Other states retain their own single-color signatures');
  assert.ok(result.customDifference>2,'Changing the thinking base color must change visible pixels');
  assert.ok(result.movement>2,'Thinking must visibly evolve over half a second');
  assert.equal(result.stillMovement,0,'Reduced motion must keep the complete settled thinking frame still');
  assert.equal(result.stillGrayMovement,0,'A gray base color must also keep a settled reduced-motion spectrum still');
  assert.ok(result.intensityDifference>1,'The motion preference must visibly affect thinking');
  assert.equal(result.edgePixels,0,'The strongest reactor keeps a transparent margin');
  t.diagnostic(JSON.stringify(result));
});
