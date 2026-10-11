'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const electron=path.join(process.env.LOCALAPPDATA||'','hermes','hermes-agent','apps','desktop','node_modules','electron','dist','electron.exe');

test('native isolated graph renderer keeps activity separate and cancels trusted local spatial state',{skip:!fs.existsSync(electron),timeout:30000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-graph-view-')),output=path.join(dir,'result.json'),entry=path.join(dir,'main.cjs'),html=path.join(dir,'view.html');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const root=path.resolve(__dirname,'..');
  fs.writeFileSync(html,'<!doctype html><html lang="de"><meta charset="utf-8"><link rel="stylesheet" href="'+pathToFileURL(path.join(root,'ui','project-graph.css')).href+'"><style>body{margin:0;padding:24px;background:#06121b;font-family:Segoe UI;color:white}button{background:#0b2130;cursor:pointer}</style><div id="graph"></div><script src="'+pathToFileURL(path.join(root,'ui','project-graph.js')).href+'"></script></html>');
  fs.writeFileSync(entry,`
    const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path');
    app.setPath('userData',path.join(${JSON.stringify(dir)},'profile'));
    app.whenReady().then(async()=>{
      session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
      session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('devtools:')}));
      const win=new BrowserWindow({show:false,width:1320,height:850,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
      const errors=[];win.webContents.on('console-message',(_event,_level,message)=>{if(/Uncaught|Error:/.test(message))errors.push(message);});
      try{
        await win.loadFile(${JSON.stringify(html)});
        const result=await win.webContents.executeJavaScript('('+${JSON.stringify(async function(){
          const check=(value,message)=>{if(!value)throw new Error(message);};
          const container=document.getElementById('graph'),calls=[];
          const snapshot={ready:true,rootName:'Synthetic project',indexedAt:1000,stats:{files:24,links:23},nodes:Array.from({length:24},(_,i)=>({id:'n'+i,label:'node '+i,sourceFile:'demo'+i+'.cjs',community:i%6})),links:Array.from({length:23},(_,i)=>({source:'n'+i,target:'n'+(i+1)})),selectedIds:['n3'],activityIds:['n13']};
          const view=ProjectGraphView.mount({container,invoke:async(method,payload)=>{calls.push(method);return method==='graph-snapshot'?snapshot:{text:'Synthetic source'};}});
          await new Promise(resolve=>setTimeout(resolve,30));
          const svg=container.querySelector('svg'),selected=container.querySelector('.pg-node.selected'),activity=container.querySelector('.pg-node.activity');
          check(selected&&activity&&selected!==activity,'activity overwrote search selection');
          check(getComputedStyle(selected.querySelector('.pg-node-core')).fill!==getComputedStyle(activity.querySelector('.pg-node-core')).fill,'activity lacks a separate color');
          check(container.querySelector('[data-pg="motion"]').getAttribute('aria-pressed')==='true','unexpected motion fixture');container.querySelector('[data-pg="motion"]').click();
          const event=(generation,sequence,x=.4,y=.5,pinching=false)=>({kind:'pointer',generation,sequence,at:Date.now(),x,y,pinching});
          const coords=selected.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/),box=svg.viewBox.baseVal;
          check(view.gesture(event(9,1,(Number(coords[1])-box.x)/box.width,(Number(coords[2])-box.y)/box.height)),'visible graph rejected pointing');
          check(selected.classList.contains('gesture-pointed'),'pointing did not highlight the visible node');
          view.gesture(event(9,2,.4,.5,true));view.gesture(event(9,3,.5,.4,true));check(svg.viewBox.baseVal.width<1000,'pinch did not zoom the graph');
          check(calls.filter(method=>method==='graph-source').length===0,'spatial gesture read a source');
          check(typeof view.cancelGesture==='function','trusted local cancellation missing');view.cancelGesture();check(!container.classList.contains('pg-gesture-active'),'cancel left active graph pointer');
          check(view.gesture(event(1,1)),'local cancellation did not reset renderer generation/order');
          container.hidden=true;check(!view.gesture(event(1,2)),'hidden graph accepted manipulation');await new Promise(resolve=>setTimeout(resolve,30));
          container.hidden=false;view.cancelGesture();let accepted=false;
          // IntersectionObserver restores its visibility evidence asynchronously after unhiding.
          for(let attempt=0;attempt<20&&!accepted;attempt++){await new Promise(resolve=>setTimeout(resolve,25));accepted=view.gesture(event(1,1));}
          check(accepted,'cancelled view could not accept a new renderer '+JSON.stringify({visibility:document.visibilityState,rects:svg.getClientRects().length,hidden:container.hidden,rect:svg.getBoundingClientRect().toJSON(),viewport:[document.documentElement.clientWidth,document.documentElement.clientHeight]}));
          view.dispose();check(!view.gesture(event(1,2)),'disposed graph accepted manipulation');
          return {sourceCalls:calls.filter(method=>method==='graph-source').length,activitySeparate:true,localReset:true};
        }.toString())}+')()');
        fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({result,errors}));win.destroy();app.exit(0);
      }catch(error){fs.writeFileSync(${JSON.stringify(output)},JSON.stringify({error:error.stack,errors}));app.exit(1);}
    });
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(electron,[entry],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  const result=fs.existsSync(output)?JSON.parse(fs.readFileSync(output,'utf8')):{};
  assert.equal(code,0,result.error||stderr);assert.deepEqual(result.errors,[]);assert.equal(result.result.localReset,true);assert.equal(result.result.sourceCalls,0);
});
