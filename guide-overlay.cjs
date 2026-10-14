'use strict';
const path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {redactTaskText}=require('./task-ledger.cjs');
const runFile=promisify(execFile);
const FRESH_MS=15000,POLL_MS=400;
const sensitiveApp=/(?:^|[^a-z])(1password|bitwarden|keepass(?:xc)?|lastpass|dashlane|nordpass|enpass)(?:$|[^a-z])/i;
const sensitiveTitle=/passw[oö]r(?:d|t)|kennwort|secret vault|password vault|anmeld(?:ung|en)|sign[ -]?in|log[ -]?in|authenticat|authentifiz|banking|bankkonto|payment|zahlung|credit card|kreditkarte|private browsing|incognito|inkognito|inprivate/i;
function identifier(value,name,max=Number.MAX_SAFE_INTEGER){
  if(typeof value==='string'&&!/^[1-9][0-9]{0,15}$/.test(value))throw new Error('Ungültige '+name+'.');
  const number=typeof value==='string'?Number(value):value;
  if(!Number.isSafeInteger(number)||number<1||number>max)throw new Error('Ungültige '+name+'.');
  return number;
}
function rect(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['x','y','width','height'].includes(key))||!['x','y','width','height'].every(key=>Number.isFinite(value[key]))||value.width<2||value.height<2||value.width>65536||value.height>65536||Math.abs(value.x)>1000000||Math.abs(value.y)>1000000)throw new Error('Ungültige Fensterposition.');
  return {x:value.x,y:value.y,width:value.width,height:value.height};
}
function fresh(value,now){
  const observed=typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(observed)||now-observed>FRESH_MS||observed-now>1000)throw new Error('Bitte eine aktuelle UIA-Position mit ihrem ursprünglichen Beobachtungszeitpunkt verwenden.');
  return observed;
}
function request(value,now){
  const allowed=['purpose','windowId','pid','windowRect','targetRect','observedAt','snapshotId','label','text','taskId','toolCallId'];
  if(value?.purpose==='guide')allowed.push('color','shape');
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||!['guide','activity'].includes(value.purpose))throw new Error('Ungültiger visueller Hinweis.');
  const result={purpose:value.purpose,windowId:identifier(value.windowId,'Fenster-ID'),pid:identifier(value.pid,'Prozess-ID',4294967295),windowRect:rect(value.windowRect),observedAt:value.observedAt,observedTime:fresh(value.observedAt,now)};
  if(value.purpose==='guide'){
    result.color=value.color===undefined?'cyan':value.color;result.shape=value.shape===undefined?'frame':value.shape;
    if(!['cyan','violet','amber','green'].includes(result.color)||!['frame','ellipse'].includes(result.shape))throw new Error('Ungültige Hinweisfarbe oder Hinweisform.');
  }
  for(const key of ['snapshotId','taskId','toolCallId'])if(value[key]!==undefined&&(typeof value[key]!=='string'||!value[key]||value[key].length>128||/[\u0000-\u001f\u007f]/.test(value[key])))throw new Error('Ungültige Hinweiszuordnung.');
  if(value.purpose==='activity'&&(!value.taskId||!value.toolCallId))throw new Error('Aktivität benötigt einen zugeordneten laufenden Auftrag und Werkzeugaufruf.');
  for(const [key,limit]of [['label',80],['text',600]])if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key].length>limit))throw new Error('Hinweistext ist zu lang.');
  result.label=redactTaskText(value.label,80)||(value.purpose==='guide'?'Hier klicken':'Lilith arbeitet hier');
  result.text=redactTaskText(value.text,600);
  result.targetRect=value.targetRect===undefined?null:rect(value.targetRect);
  if(result.targetRect){
    const target=result.targetRect,window=result.windowRect;
    if(value.purpose!=='guide'||target.x<window.x||target.y<window.y||target.x+target.width>window.x+window.width||target.y+target.height>window.y+window.height)throw new Error('Das Hinweisziel liegt nicht im beobachteten Fenster.');
  }
  return result;
}
async function readWindowBounds(value,{platform=process.platform,runFile:run=runFile}={}){
  const windowId=identifier(value?.windowId,'Fenster-ID'),pid=identifier(value?.pid,'Prozess-ID',4294967295);
  if(platform!=='win32')throw new Error('Fensterhinweise sind nur unter Windows verfügbar.');
  const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const {stdout}=await run(exe,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'scripts/window_bounds.ps1'),'-WindowId',String(windowId),'-ProcessId',String(pid)],{windowsHide:true,timeout:3000,maxBuffer:16*1024,encoding:'utf8'});
  let result;try{result=JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{throw new Error('Fensterposition ist nicht verfügbar.');}
  if(!result||result.valid!==true||result.pid!==pid||result.windowId!==windowId)throw new Error('Das beobachtete Fenster ist nicht mehr verfügbar.');
  return {valid:true,pid,windowId,...rect({x:result.x,y:result.y,width:result.width,height:result.height}),minimized:result.minimized,visible:result.visible,app:result.app,windowTitle:result.windowTitle};
}
function checkWindow(value,native){
  if(!native||native.valid!==true||native.pid!==value.pid||native.windowId!==value.windowId||native.minimized!==false||native.visible!==true||typeof native.app!=='string'||!native.app||typeof native.windowTitle!=='string')throw new Error('Das beobachtete Fenster ist nicht sichtbar oder hat sich geändert.');
  if(sensitiveApp.test(native.app)||sensitiveTitle.test(native.windowTitle))throw new Error('Sensible Fenster sind von visuellen Hinweisen ausgeschlossen.');
  const current=rect({x:native.x,y:native.y,width:native.width,height:native.height});
  if(['x','y','width','height'].some(key=>Math.abs(current[key]-value.windowRect[key])>2))throw new Error('Das Fenster wurde bewegt. Bitte die UIA-Position erneut lesen.');
}
function intersection(a,b){
  const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);
  return right-x>=2&&bottom-y>=2?{x,y,width:right-x,height:bottom-y}:null;
}
function monitorPieces(value,screen){
  if(typeof screen.dipToScreenRect!=='function'||typeof screen.screenToDipRect!=='function')throw new Error('Monitor-Koordinaten sind nicht verfügbar.');
  const window=value.windowRect,padded={x:window.x-14,y:window.y-14,width:window.width+28,height:window.height+28};
  const pieces=[];
  for(const display of screen.getAllDisplays()){
    const physical=screen.dipToScreenRect(null,display.bounds),piece=intersection(padded,physical);
    if(!piece||!intersection(window,physical))continue;
    const bounds=screen.screenToDipRect(null,piece),scale=display.scaleFactor;
    if(!Number.isFinite(scale)||scale<=0||!['x','y','width','height'].every(key=>Number.isFinite(bounds[key]))||bounds.width<2||bounds.height<2)throw new Error('Ungültige Monitor-Koordinaten.');
    const local=target=>({x:(target.x-piece.x)/scale,y:(target.y-piece.y)/scale,width:target.width/scale,height:target.height/scale});
    const target=value.targetRect,center=target?{x:target.x+target.width/2,y:target.y+target.height/2}:null;
    const ownsTarget=!!center&&center.x>=physical.x&&center.x<physical.x+physical.width&&center.y>=physical.y&&center.y<physical.y+physical.height;
    pieces.push({bounds,windowRect:local(window),targetRect:ownsTarget?local(target):null,area:piece.width*piece.height});
  }
  if(!pieces.length||value.targetRect&&!pieces.some(piece=>piece.targetRect))throw new Error('Das Hinweisziel liegt außerhalb eines sichtbaren Monitors.');
  const primary=pieces.find(piece=>piece.targetRect)||pieces.reduce((largest,piece)=>piece.area>largest.area?piece:largest);
  return pieces.map(piece=>({...piece,primary:piece===primary}));
}
function createGuideOverlay({electron,root,readWindow=readWindowBounds,onChange=()=>{},now=Date.now,timers={setTimeout,clearTimeout}}){
  const {BrowserWindow,screen}=electron;
  let windows=[],generation=0,disposed=false,pollTimer=null,expireTimer=null;
  const empty=()=>({visible:false,purpose:null,label:'',text:'',clickThrough:true,simulatedPointer:false,observedAt:null,expiresAt:null});
  let state=empty();
  const snapshot=()=>({...state});
  function publish(){try{onChange(snapshot());}catch{}}
  function clear(){
    generation++;timers.clearTimeout(pollTimer);timers.clearTimeout(expireTimer);pollTimer=null;expireTimer=null;
    const old=windows;windows=[];for(const window of old)if(!window.isDestroyed())window.destroy();
    state=empty();publish();return snapshot();
  }
  const current=sequence=>{if(disposed||sequence!==generation)throw new Error('Visueller Hinweis wurde gestoppt oder ersetzt.');};
  async function verify(value,sequence){
    const native=await readWindow({pid:value.pid,windowId:value.windowId});current(sequence);fresh(value.observedAt,now());checkWindow(value,native);
  }
  function schedulePoll(value,sequence){
    pollTimer=timers.setTimeout(async()=>{
      pollTimer=null;if(disposed||sequence!==generation)return;
      try{await verify(value,sequence);if(sequence===generation)schedulePoll(value,sequence);}
      catch{if(sequence===generation)clear();}
    },POLL_MS);
  }
  for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,clear);
  return {
    async show(payload){
      if(disposed)throw new Error('Visuelle Hinweise wurden beendet.');
      clear();const sequence=generation,value=request(payload,now());
      try{
        await verify(value,sequence);current(sequence);
        const pieces=monitorPieces(value,screen);
        const pending=pieces.map(piece=>{
          const window=new BrowserWindow({...piece.bounds,title:'Lilith Hinweis',frame:false,transparent:true,focusable:false,alwaysOnTop:true,skipTaskbar:true,resizable:false,show:false,hasShadow:false,webPreferences:{preload:path.join(root,'guide-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
          windows.push(window);window.setIgnoreMouseEvents(true,{forward:true});
          window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
          return {window,piece,ready:window.loadFile(path.join(root,'ui/guide.html'))};
        });
        await Promise.all(pending.map(item=>item.ready));current(sequence);await verify(value,sequence);current(sequence);
        const expires=Math.min(value.observedTime+FRESH_MS,now()+(value.purpose==='activity'?10000:FRESH_MS));
        if(expires<=now())throw new Error('Die beobachtete Position ist abgelaufen.');
        for(const {window,piece}of pending){
          window.setBounds(piece.bounds);
          window.webContents.send('guide:event',{type:'guide',purpose:value.purpose,...(value.purpose==='guide'?{color:value.color,shape:value.shape}:{}),label:value.label,text:value.text,primary:piece.primary,width:piece.bounds.width,height:piece.bounds.height,windowRect:piece.windowRect,targetRect:piece.targetRect});
          window.showInactive();
        }
        state={visible:true,purpose:value.purpose,...(value.purpose==='guide'?{color:value.color,shape:value.shape}:{}),label:value.label,text:value.text,clickThrough:true,simulatedPointer:!!value.targetRect,observedAt:value.observedAt,expiresAt:new Date(expires).toISOString()};publish();
        expireTimer=timers.setTimeout(()=>{if(sequence===generation)clear();},expires-now());schedulePoll(value,sequence);return snapshot();
      }catch(error){if(sequence===generation)clear();throw error;}
    },
    clear,snapshot,
    dispose(){if(disposed)return;disposed=true;for(const event of ['display-added','display-removed','display-metrics-changed'])screen.removeListener(event,clear);clear();}
  };
}
module.exports={createGuideOverlay,readWindowBounds};
