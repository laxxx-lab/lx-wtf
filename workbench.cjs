'use strict';
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {createWindowStream}=require('./artcraft-stream.cjs');
const {pathToFileURL}=require('node:url');
const {normalizeRoutines}=require('./routines.cjs');
const {validIntelRequest,validCraftAppRequest}=require('./control-api.cjs');
const {validCraftInput}=require('./window-input.cjs');
const TABS=['system','console','browser','context','graph','intel','artcraft'];
const USER_METHODS=new Set(['tab','browser','command','action','craft-input','craft-select','craft-open','craft-focus','craft-command','graph-pick','graph-index','graph-search','graph-source','guide-clear','circle-open','intel-query','intel-open','job-retry','job-cancel','job-reconcile','job-resume','awareness-action','awareness-dismiss','teach-start','teach-confirm','teach-save','teach-cancel']);
const utfText=(value,limit)=>value.slice(0,limit).replace(/[\uD800-\uDBFF]$/,'').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,'\uFFFD');
const text=(value,limit=1200)=>typeof value==='string'?utfText(value.slice(0,32000).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\bBearer\s+[^\s"',;]+/gi,'Bearer [redacted]').replace(/\b(token|access[_-]?token|refresh[_-]?token|password|passwd|api[_-]?key|cookie|authorization|secret)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,'$1=[redacted]').replace(/https?:\/\/[^\s"'<>]+/gi,value=>{try{const url=new URL(value);url.username='';url.password='';url.hash='';for(const key of [...url.searchParams.keys()])if(/token|password|secret|key|auth|cookie|signature|credential|session/i.test(key))url.searchParams.set(key,'[redacted]');return url.href;}catch{return '[URL redacted]';}}),limit):'';
const number=value=>Number.isFinite(value)?value:null;
const validWindowBounds=value=>!!value&&['x','y','width','height'].every(key=>Number.isFinite(value[key])&&Math.abs(value[key])<=100000)&&value.width>0&&value.height>0&&value.width<=20000&&value.height<=20000;
function placementDisplay(bounds,displays){
  return displays.reduce((best,display)=>{const area=display.workArea,overlap=Math.max(0,Math.min(bounds.x+bounds.width,area.x+area.width)-Math.max(bounds.x,area.x))*Math.max(0,Math.min(bounds.y+bounds.height,area.y+area.height)-Math.max(bounds.y,area.y));return overlap>best.overlap?{display,overlap}:best;},{display:displays[0],overlap:0}).display;
}
function restoreWindowPlacement(value,displays){
  if(!validWindowBounds(value?.bounds)||!Array.isArray(displays)||!displays.length)return null;
  const display=displays.find(item=>item.id===value.displayId)||placementDisplay(value.bounds,displays),area=display.workArea;
  const width=Math.min(area.width,Math.max(840,Math.round(value.bounds.width))),height=Math.min(area.height,Math.max(620,Math.round(value.bounds.height)));
  const oldArea=validWindowBounds(value.workArea)?value.workArea:area;
  const x=Math.round(Math.max(area.x,Math.min(area.x+area.width-width,area.x+value.bounds.x-oldArea.x))),y=Math.round(Math.max(area.y,Math.min(area.y+area.height-height,area.y+value.bounds.y-oldArea.y)));
  return {bounds:{x,y,width,height},displayId:display.id,workArea:{...area},maximized:value.maximized===true};
}
function validateBrowserUrl(value){
  if(typeof value!=='string'||value.length>4096||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Bitte eine vollständige HTTP- oder HTTPS-Adresse eingeben.');
  let url;try{url=new URL(value.trim());}catch{throw new Error('Ungültige Webadresse.');}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('Nur HTTP/HTTPS ohne Zugangsdaten ist erlaubt.');
  return url.href;
}
function trustedSender(event,contents,localUrl){return !!contents&&event?.sender===contents&&event.senderFrame===contents.mainFrame&&event.senderFrame?.url===localUrl;}
function projectContent(value){
  if(!value||!['clipboard','window'].includes(value.kind)||typeof value.text!=='string')return null;
  const observed=typeof value.observedAt==='number'?value.observedAt:typeof value.observedAt==='string'?Date.parse(value.observedAt):NaN;
  if(!Number.isFinite(observed)||Math.abs(observed)>8640000000000000)return null;
  const source=value.source||{},body=text(value.text,12000);
  return {kind:value.kind,source:{label:text(source.label,180),app:text(source.app,80),title:text(source.windowTitle||source.title||source.label,180)},text:body,observedAt:new Date(observed).toISOString(),limitations:Array.isArray(value.limitations)?value.limitations.slice(0,8).map(item=>text(item,300)).filter(Boolean):[],truncated:value.truncated===true||value.text.length>12000,untrusted:true};
}
function safeSnapshot(value={}){
  const config=value.settings||{},sample=value.sample||{},report=value.systemReport,context=value.context||{},locked=value.privacyLocked===true||config.privacyLocked===true;
  const timing={};for(const key of ['firstAudioMs','transcribeMs','hermesFirstTokenMs','ttsFirstPcmMs','endToEndMs']){const measured=value.voiceTiming?.summary?.[key];if(measured&&Number.isSafeInteger(measured.count)&&measured.count>0&&measured.count<=200&&['p50','p95'].every(name=>Number.isFinite(measured[name])&&measured[name]>=0&&measured[name]<=86400000))timing[key]={count:measured.count,p50:measured.p50,p95:measured.p95};}
  return {status:text(value.status,40),detail:text(value.detail,200),connected:value.connected===true,busy:value.busy===true,sessionTitle:text(value.session?.title,120),privacyLocked:locked,currentContent:locked?null:projectContent(value.currentContent),
    sample:Object.fromEntries(['cpuPercent','memoryPercent','gpuPercent','gpuTimestamp','diskFreeGiB','diskTotalGiB','timestamp'].map(key=>[key,number(sample[key])])),
    camera:{enabled:!locked&&config.cameraEnabled===true,active:!locked&&value.camera?.active===true,looking:!locked&&value.camera?.looking===true},screen:{enabled:!locked&&config.screenEnabled===true,looking:!locked&&value.screen?.looking===true},
    wake:{enabled:!locked&&config.wakeWord===true,ready:value.wakeReady===true,armed:!locked&&value.wakeArmed===true},voice:{ready:value.voiceReady===true,sttReady:value.sttReady===true},voiceTiming:{summary:timing},
    context:{enabled:!locked&&context.enabled===true,project:text(context.project,80),foreground:!locked&&context.foreground?{app:text(context.foreground.app,80),windowTitle:text(context.foreground.windowTitle,180),excluded:context.foreground.excluded===true,timestamp:number(context.foreground.timestamp)}:null,events:Array.isArray(context.events)?context.events.slice(0,80).map(event=>({type:text(event.type,40),summary:text(event.summary,500),source:text(event.source,180),status:text(event.status,40),project:text(event.project,80),timestamp:number(event.timestamp)})):[],logPaths:Array.isArray(context.logPaths)?context.logPaths.slice(0,16).filter(file=>typeof file==='string').map(file=>text(file,1000)):[]},
    tasks:Array.isArray(value.tasks)?value.tasks.slice(0,50).map(task=>({id:text(task.id,80),...(validCraftAppRequest({appId:task.appId})?{appId:task.appId}:{}),title:text(task.title,200),status:['running','agent-finished','error','interrupted','disconnected'].includes(task.status)?task.status:'unknown',verification:task.verification==='verified'?'verified':'unknown',evidence:Array.isArray(task.evidence)?task.evidence.filter(item=>item.scope==='tool').slice(0,8).map(item=>({type:text(item.type,40),scope:'tool',tool:text(item.tool,96),detail:text(item.detail,200)})):[],startedAt:number(task.startedAt),finishedAt:number(task.finishedAt),toolCount:number(task.toolCount),completedTools:number(task.completedTools),tools:Array.isArray(task.tools)?task.tools.slice(-8).map(tool=>({name:text(tool.name,96),status:text(tool.status,40)})):[],summary:text(task.summary,1200)})):[],
    routines:Array.isArray(value.routines)?value.routines.slice(0,20).map(routine=>({id:text(routine.id,40),name:text(routine.name,80),instructions:text(routine.instructions,6000),verification:text(routine.verification,1500)})):[],
    jobQueue:{held:value.jobQueue?.held===true,blocked:value.jobQueue?.blocked===true,activeJobId:text(value.jobQueue?.activeJobId,80),jobs:Array.isArray(value.jobQueue?.jobs)?value.jobQueue.jobs.slice(0,50).map(job=>({id:text(job.id,80),title:text(job.title,200),status:['queued','running','agent-finished','completed','error','paused','cancelled','outcome-unknown'].includes(job.status)?job.status:'unknown',summary:text(job.summary,1200),reason:text(job.reason,300),attempts:Number.isSafeInteger(job.attempts)&&job.attempts>=0?job.attempts:0})):[]},
    awareness:{project:{name:text(value.awareness?.project?.name,80),confidence:['manual','registered'].includes(value.awareness?.project?.confidence)?value.awareness.project.confidence:'unknown'},foreground:!locked&&value.awareness?.foreground?{app:text(value.awareness.foreground.app,80),windowTitle:text(value.awareness.foreground.windowTitle,180),timestamp:number(value.awareness.foreground.timestamp)}:null,cards:!locked&&Array.isArray(value.awareness?.cards)?value.awareness.cards.slice(0,8).map(card=>({id:text(card.id,80),kind:text(card.kind,40),title:text(card.title,120),detail:text(card.detail,450),source:text(card.source,180),timestamp:number(card.timestamp),actionLabel:text(card.actionLabel,80)})):[]},
    teach:{active:!locked&&value.teach?.active===true,name:!locked?text(value.teach?.name,80):'',steps:!locked&&Array.isArray(value.teach?.steps)?value.teach.steps.slice(0,20).map(step=>({appId:step.appId==='light'?'light':'',kind:['click','text','key','scroll'].includes(step.kind)?step.kind:'unknown',label:text(step.label,160),verified:step.verified===true,verification:text(step.verification,300)})):[]},
    mode:value.mode?{id:text(value.mode.id,80),name:text(value.mode.name,80),ok:value.mode.ok===true}:null,
    modes:Array.isArray(config.modes)?config.modes.slice(0,12).map(mode=>({id:text(mode.id,80),name:text(mode.name,80)})):[],
    hud:{state:text(value.hud?.state,40),title:text(value.hud?.title,160),summary:text(value.hud?.summary,500),completedTools:number(value.hud?.completedTools),steps:Array.isArray(value.hud?.steps)?value.hud.steps.slice(-4).map(step=>({label:text(step.label,96),status:text(step.status,40)})):[]},
    systemReport:report?{text:text(report.text,3000),fresh:report.fresh===true,ageSeconds:number(report.ageSeconds),timestamp:number(report.timestamp),metrics:Array.isArray(report.metrics)?report.metrics.slice(0,12).map(item=>({key:text(item.key,40),label:text(item.label,80),value:number(item.value),unit:text(item.unit,20),available:item.available===true})):[],links:Array.isArray(report.links)?report.links.slice(0,12).map(item=>({key:text(item.key,40),label:text(item.label,80),state:['online','offline'].includes(item.state)?item.state:'unknown'})):[]}:null};
}
function validateAction(payload){
  const simple=['status','standby','highlight-clear','privacy-lock','privacy-unlock','emergency-stop','context-clear','logs-pick'];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.name!=='string')throw new Error('Ungültige Aktion.');
  const fail=()=>{throw new Error('Ungültige Aktion.');};
  const only=(object,keys)=>!Object.keys(object).some(key=>!keys.includes(key));
  if(simple.includes(payload.name)){if(!only(payload,['name']))fail();return {name:payload.name};}
  if(['mode','routine-run','routine-delete'].includes(payload.name)){
    if(!only(payload,['name','id'])||typeof payload.id!=='string'||!payload.id||payload.id.length>80)fail();
    if(payload.name!=='mode'&&(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(payload.id)||payload.id.length>40))fail();
    return {name:payload.name,id:payload.id};
  }
  if(payload.name==='context-settings'){
    const values=payload.values;
    if(!only(payload,['name','values'])||!values||typeof values!=='object'||Array.isArray(values)||!only(values,['contextEnabled','projectName','logPaths']))fail();
    if(values.contextEnabled!==undefined&&typeof values.contextEnabled!=='boolean')fail();
    if(values.projectName!==undefined&&(typeof values.projectName!=='string'||values.projectName.length>80||/[\u0000-\u001f\u007f]/.test(values.projectName)))fail();
    if(values.logPaths!==undefined&&(!Array.isArray(values.logPaths)||values.logPaths.length>16||values.logPaths.some(file=>typeof file!=='string'||!file||file.length>1000||/[\u0000-\u001f\u007f]/.test(file))))fail();
    return {name:payload.name,values:structuredClone(values)};
  }
  if(payload.name==='routine-save'){
    if(!only(payload,['name','routine'])||!payload.routine||typeof payload.routine!=='object'||Array.isArray(payload.routine)||!only(payload.routine,['id','name','instructions','verification']))fail();
    return {name:payload.name,routine:normalizeRoutines([payload.routine])[0]};
  }
  throw new Error('Unbekannte Aktion.');
}
function normalizeConsoleEvent(event){
  const type={'activity':'tool','tool.start':'tool','tool.end':'tool','notice':'error','task-acknowledgement':'acknowledgement'}[event?.type]||event?.type;
  if(!['user','reply','acknowledgement','tool','error','turn-end'].includes(type))return null;
  const body=text(event.text||event.message||event.name||event.data?.name||event.data?.tool||event.status,6000);
  if(!body)return null;
  return {type,text:body,time:Date.now()};
}
function createWorkbench({electron,root,stateFile=null,getSnapshot=()=>({}),onCommand=async()=>{},onAction=async()=>{},onVisual=async()=>{},onBrowserChange=()=>{},onVisibility=()=>{}}){
  const {BrowserWindow,WebContentsView,session,ipcMain}=electron;
  const localFile=path.join(root,'ui/workbench.html'),localUrl=pathToFileURL(localFile).href;
  let win=null,browser=null,ready=null,tab='system',destroyed=false,attached=false,events=[],gesture={enabled:false,ready:false,label:''},sequence=0;
  let placement=null,placementTimer=null,restoringPlacement=false,placementReady=false,lastPlacementJson='';
  let inputFrameId=null,inputEpoch=0;
  let presentation={owner:null,reason:'',requestId:null},presentationEpoch=0,userShowPending=null;
  const appearance={glass:false,opacity:.94};
  const displays=()=>electron.screen?.getAllDisplays()||[];
  if(stateFile){try{placement=restoreWindowPlacement(JSON.parse(fs.readFileSync(stateFile,'utf8')),displays());}catch{}}
  function rememberPlacement(){
    clearTimeout(placementTimer);placementTimer=null;
    if(!stateFile||restoringPlacement||!placementReady||!win||win.isDestroyed())return;
    try{
      const bounds=win.getNormalBounds(),minimized=win.isMinimized(),visible=win.isVisible();if(!validWindowBounds(bounds))return;
      const currentDisplays=displays();if(!currentDisplays.length)return;
      const maximized=minimized||!visible?placement?.maximized===true:win.isMaximized();
      const display=(maximized&&(minimized||!visible)?currentDisplays.find(item=>item.id===placement?.displayId):null)||placementDisplay(visible&&!minimized?win.getBounds():bounds,currentDisplays);
      placement={bounds,displayId:display.id,workArea:{...display.workArea},maximized};const json=JSON.stringify(placement);
      if(json===lastPlacementJson)return;
      fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile+'.tmp',json,{mode:0o600});fs.renameSync(stateFile+'.tmp',stateFile);lastPlacementJson=json;
    }catch{send({type:'browser-error',message:'Die Fensterposition konnte nicht gespeichert werden.'});}
  }
  function queuePlacement(){if(!restoringPlacement&&placementReady){clearTimeout(placementTimer);placementTimer=setTimeout(rememberPlacement,250);}}
  const uiSession=session.fromPartition('lilith-workbench-ui');
  const resetInput=()=>{inputFrameId=null;inputEpoch++;};
  const streamBroker=createWindowStream({resolveTarget:appId=>onVisual('craft-stream-target',{appId}),getSources:options=>electron.desktopCapturer.getSources(options),allowed:()=>!!win&&!win.isDestroyed()&&win.isVisible()&&tab==='artcraft'&&!safeSnapshot(getSnapshot()).privacyLocked,onStop:reason=>{resetInput();send({type:'craft-stream-stop',reason});}});
  const capturePermission=(contents,permission,details,request=false)=>contents===win?.webContents&&contents?.mainFrame?.url===localUrl&&(permission==='display-capture'||request&&permission==='media'&&details?.isMainFrame===true&&Array.isArray(details.mediaTypes)&&details.mediaTypes.length===0)&&(streamBroker.armed||streamBroker.active)&&controller.visible&&tab==='artcraft'&&!safeSnapshot(getSnapshot()).privacyLocked;
  uiSession.setPermissionCheckHandler((contents,permission)=>capturePermission(contents,permission));
  uiSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(capturePermission(contents,permission,details,true)));
  uiSession.setDisplayMediaRequestHandler?.((request,callback)=>{
    if(request.frame!==win?.webContents.mainFrame||request.frame?.url!==localUrl)return callback(null);
    streamBroker.request(request).then(value=>{try{callback(value);}catch{streamBroker.stop();}},()=>{try{callback(null);}catch{}});
  });
  let craftRefreshPending=false;
  const streamMonitor=setInterval(()=>{
    if(streamBroker.active)void streamBroker.check();
    if(!destroyed&&win?.isVisible()&&tab==='artcraft'&&!safeSnapshot(getSnapshot()).privacyLocked&&!craftRefreshPending){
      craftRefreshPending=true;Promise.resolve(onVisual('craft-refresh',{preview:false})).then(craft=>{if(!destroyed&&win?.isVisible()&&tab==='artcraft'&&!safeSnapshot(getSnapshot()).privacyLocked&&craft)send({type:'craft-update',craft});}).catch(()=>{}).finally(()=>{craftRefreshPending=false;});
    }
  },3000);streamMonitor.unref?.();
  const browserSession=session.fromPartition('persist:lilith-workbench-browser');
  browserSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  browserSession.setPermissionCheckHandler(()=>false);
  const blockDownload=(_event,item)=>item.cancel();browserSession.on('will-download',blockDownload);
  browserSession.webRequest.onBeforeRequest((details,callback)=>{
    if(details.resourceType!=='mainFrame')return callback({});
    try{validateBrowserUrl(details.url);callback({});}catch{callback({cancel:true});}
  });
  const send=event=>{if(win&&!win.isDestroyed())win.webContents.send('workbench:event',event);};
  function setPresentation(owner,reason='',requestId=null){presentationEpoch++;presentation={owner,reason,requestId};send({type:'presentation',presentation:{...presentation}});return presentationEpoch;}
  const claimUser=()=>setPresentation('user');
  function cancelPrivatePresentation(){if(presentation.owner==='agent'){setPresentation(null);rememberPlacement();streamBroker.stop();if(win&&!win.isDestroyed())win.hide();}}
  const snapshot=()=>{const projected=safeSnapshot(getSnapshot());if(projected.privacyLocked)cancelPrivatePresentation();return {...projected,presentation:{...presentation},appearance:{...appearance},events:events.map(event=>({...event})),gesture:{...gesture},tab,visible:!!win&&!win.isDestroyed()&&win.isVisible()};};
  function browserStatus(){
    if(!browser)return;
    layout();
    const contents=browser.webContents,history=contents.navigationHistory;
    send({type:'browser',url:contents.getURL()==='about:blank'?'':contents.getURL(),title:text(contents.getTitle(),120),loading:contents.isLoading(),back:history.canGoBack(),forward:history.canGoForward()});
  }
  function layout(){
    if(!browser||!win||win.isDestroyed())return;
    browser.setVisible(tab==='browser'&&browser.webContents.getURL()!=='about:blank');
    const bounds=win.getContentBounds();browser.setBounds({x:22,y:190,width:Math.max(1,bounds.width-44),height:Math.max(1,bounds.height-230)});
  }
  function selectTab(next){if(!TABS.includes(next))throw new Error('Unbekannter Arbeitsbereich.');if(next!==tab)streamBroker.stop();tab=next;layout();send({type:'tab',tab});if(next==='browser')browserStatus();onVisibility(controller.visible,tab);}
  function retain(event){
    const row=normalizeConsoleEvent(event);if(!row)return;
    const last=events.at(-1);
    if(row.type==='reply'&&last?.type==='reply'){row.id=last.id;events[events.length-1]=row;}else{row.id=++sequence;events.push(row);if(events.length>200)events.shift();}
    send({type:'console',event:{...row}});
  }
  function ensure(){
    if(destroyed)throw new Error('Arbeitsbereich wurde beendet.');
    if(win&&!win.isDestroyed())return ready;
    const systemVersion=os.release(),glassSupported=process.platform==='win32'&&Number(systemVersion.split('.')[2])>=22621&&typeof BrowserWindow.prototype.setBackgroundMaterial==='function';
    win=new BrowserWindow({title:'Lilith Workbench',width:1240,height:820,...placement?.bounds,minWidth:840,minHeight:620,frame:false,show:false,resizable:true,backgroundColor:glassSupported?'#00000000':'#060e17',webPreferences:{session:uiSession,preload:path.join(root,'workbench-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
    if(glassSupported){try{win.setBackgroundMaterial('acrylic');appearance.glass=true;}catch{win.setBackgroundColor('#060e17');}}
    if(!placement)win.center();
    // showInactive/placement restoration is presentation; subsequent native focus
    // and input belong to the user, including the embedded browser surface.
    const userFocus=()=>{if(!restoringPlacement&&win?.isVisible()&&presentation.owner==='agent')claimUser();};
    const userKey=(_event,input)=>{if(input?.type==='keyDown'||input?.type==='char')userFocus();};
    const userMouse=(_event,input)=>{if(['mouseDown','mouseWheel'].includes(input?.type))userFocus();};
    win.on('focus',userFocus);
    win.webContents.on('before-input-event',userKey);win.webContents.on('before-mouse-event',userMouse);
    win.on('close',event=>{if(!destroyed){event.preventDefault();controller.hide();}});
    win.on('hide',()=>{if(presentation.owner!==null)setPresentation(null);rememberPlacement();send({type:'visibility',visible:false});streamBroker.stop();onVisibility(false,tab);});win.on('show',()=>{send({type:'visibility',visible:true});onVisibility(true,tab);});win.on('minimize',()=>{rememberPlacement();controller.hide();});win.on('resize',()=>{layout();queuePlacement();});win.on('move',queuePlacement);win.on('maximize',rememberPlacement);win.on('unmaximize',rememberPlacement);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.webContents.on('did-finish-load',()=>{send({type:'snapshot',snapshot:snapshot()});browserStatus();});
    browser=new WebContentsView({webPreferences:{partition:'persist:lilith-workbench-browser',sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,allowRunningInsecureContent:false}});
    win.contentView.addChildView(browser);attached=true;
    const contents=browser.webContents;
    contents.on('before-input-event',userKey);contents.on('before-mouse-event',userMouse);
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    const preventUnsafe=(event,url)=>{try{validateBrowserUrl(typeof url==='string'?url:url?.url);}catch{event.preventDefault();}};
    contents.on('will-navigate',preventUnsafe);contents.on('will-redirect',preventUnsafe);
    contents.on('will-frame-navigate',(event,details)=>{try{validateBrowserUrl(details?.url||event.url);}catch{event.preventDefault();}});
    for(const name of ['did-navigate','did-navigate-in-page','did-start-loading','did-stop-loading','page-title-updated'])contents.on(name,browserStatus);
    for(const name of ['did-navigate','did-navigate-in-page','did-start-loading'])contents.on(name,()=>onBrowserChange());
    contents.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)send({type:'browser-error',message:text(description,200)});});
    contents.loadURL('about:blank').catch(()=>{});layout();ready=win.loadFile(localFile);return ready;
  }
  async function browserAction(value){
    if(!value||typeof value!=='object'||Object.keys(value).some(key=>!['action','url'].includes(key)))throw new Error('Ungültige Browseraktion.');
    await ensure();const contents=browser.webContents,history=contents.navigationHistory;
    if(value.action==='navigate'){const url=validateBrowserUrl(value.url);selectTab('browser');await contents.loadURL(url);}
    else if(value.action==='back'){if(history.canGoBack())history.goBack();}
    else if(value.action==='forward'){if(history.canGoForward())history.goForward();}
    else if(value.action==='reload')contents.reload();
    else throw new Error('Unbekannte Browseraktion.');
    browserStatus();return {ok:true};
  }
  async function handle(event,method,payload){
    if(!trustedSender(event,win?.webContents,localUrl))throw new Error('Arbeitsbereich-Zugriff verweigert.');
    if(method==='snapshot')return snapshot();
    if(USER_METHODS.has(method)||method==='craft-refresh'&&payload?.preview===true)claimUser();
    if(method==='craft-stream-start'){if(!validCraftAppRequest(payload))throw new Error('Ungültiger Fensterstream.');resetInput();return streamBroker.arm(payload.appId);}
    if(method==='craft-stream-stop'){if(payload!==undefined&&payload!==null)throw new Error('Keine Argumente erwartet.');resetInput();streamBroker.stop();return {ok:true};}
    if(method==='craft-input'){
      const allowed=()=>controller.visible&&tab==='artcraft'&&!safeSnapshot(getSnapshot()).privacyLocked&&streamBroker.active&&streamBroker.target?.appId===payload?.appId;
      if(!validCraftInput(payload)||!allowed()||(payload.kind!=='arm'&&payload.frameId!==inputFrameId))throw Error('Eingabe benötigt den sichtbaren, aktuellen Fensterstream.');
      const ticket=inputEpoch;await streamBroker.check();if(ticket!==inputEpoch||!allowed())throw Error('Das Quellfenster hat sich geändert.');
      try{const result=await onVisual(method,payload);if(ticket!==inputEpoch||!allowed())throw Error('Die Eingabeansicht wurde geschlossen.');if(payload.kind==='arm'){if(!result?.ok||!(/^[a-f0-9]{32}$/).test(result.frameId||''))throw Error('Kein gültiger Eingabekanal.');inputFrameId=result.frameId;}return result;}
      catch(error){resetInput();throw error;}
    }
    if(['job-retry','job-cancel','job-reconcile','awareness-action','awareness-dismiss'].includes(method)){
      if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.id!=='string'||!payload.id||payload.id.length>80||/[\u0000-\u001f\u007f]/.test(payload.id))throw Error('Ungültige lokale Aktion.');return onVisual(method,payload);
    }
    if(['job-resume','teach-cancel'].includes(method)){if(payload!==undefined&&payload!==null)throw Error('Keine Argumente erwartet.');return onVisual(method);}
    if(method==='teach-start'){if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>80||/[\u0000-\u001f\u007f]/.test(payload.name))throw Error('Ungültiger Name für die Lehre.');return onVisual(method,payload);}
    if(method==='teach-confirm'){
      if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!['index','label','verification'].includes(key))||!Number.isInteger(payload.index)||payload.index<0||payload.index>=20||typeof payload.verification!=='string'||!payload.verification.trim()||payload.verification.length>300||(payload.label!==undefined&&(typeof payload.label!=='string'||!payload.label.trim()||payload.label.length>160)))throw Error('Ungültiger Lernschritt.');return onVisual(method,payload);
    }
    if(method==='teach-save'){if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.verification!=='string'||!payload.verification.trim()||payload.verification.length>1500)throw Error('Ungültiges Erfolgskriterium.');return onVisual(method,payload);}
    if(method==='hide'){controller.hide();return {ok:true};}
    if(method==='tab'){selectTab(payload);return {ok:true};}
    if(['graph-pick','graph-index','graph-snapshot','intel-snapshot','guide-clear','craft-snapshot','circle-open'].includes(method)){
      if(payload!==undefined&&payload!==null)throw new Error('Diese Aktion erwartet keine Argumente.');return onVisual(method);
    }
    if(['craft-select','craft-open','craft-focus'].includes(method)){if(!validCraftAppRequest(payload))throw new Error('Ungültige Artcraft-App.');if(method==='craft-select'){resetInput();streamBroker.stop();}return onVisual(method,payload);}
    if(method==='craft-refresh'){if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.preview!=='boolean')throw new Error('Ungültige Artcraft-Vorschau.');return onVisual(method,payload);}
    if(method==='craft-command'){if(!payload||Array.isArray(payload)||Object.keys(payload).length!==2||!validCraftAppRequest({appId:payload.appId})||typeof payload.text!=='string'||!payload.text.trim()||payload.text.length>2000)throw new Error('Ungültiger Artcraft-Auftrag.');return onVisual(method,payload);}
    if(method==='graph-search'){
      if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.query!=='string'||payload.query.length>300)throw new Error('Ungültige Graphsuche.');return onVisual(method,payload);
    }
    if(method==='graph-source'){
      if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.id!=='string'||!payload.id||payload.id.length>400)throw new Error('Ungültige Graphquelle.');return onVisual(method,payload);
    }
    if(method==='intel-query'){if(!validIntelRequest(payload))throw new Error('Ungültige Lageabfrage.');return onVisual(method,payload);}
    if(method==='intel-open'){
      if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.url!=='string'||payload.url.length>2000)throw new Error('Ungültige Quelle.');validateBrowserUrl(payload.url);return onVisual(method,payload);
    }
    if(method==='command'){
      if(typeof payload!=='string'||!payload.trim()||payload.length>20000)throw new Error('Bitte einen kurzen Auftrag eingeben.');
      await onCommand(payload.trim());return {ok:true};
    }
    if(method==='action'){
      await onAction(validateAction(payload));send({type:'snapshot',snapshot:snapshot()});return {ok:true};
    }
    if(method==='browser')return browserAction(payload);
    throw new Error('Unbekannte Arbeitsbereich-Aktion.');
  }
  ipcMain.handle('workbench:invoke',handle);
  function showWindow(focus){
    const maximize=placement?.maximized===true,restored=restoreWindowPlacement(placement,displays());restoringPlacement=true;
    // Windows maximize() may activate even after showInactive(). Keep the agent
    // window non-activating for the entire restoration, then allow user clicks.
    if(!focus)win.setFocusable?.(false);
    try{if(win.isMinimized?.())win.restore();if(typeof win.showInactive==='function')win.showInactive();else win.show();const current=win.getBounds?.(),area=restored?.workArea;const outside=area&&current&&(current.x+current.width/2<area.x||current.x+current.width/2>=area.x+area.width||current.y+current.height/2<area.y||current.y+current.height/2>=area.y+area.height);if(restored&&(!maximize||!win.isMaximized()||outside)){if(win.isMaximized())win.unmaximize();win.setBounds(restored.bounds);}if(maximize&&!win.isMaximized())win.maximize();}
    finally{if(!focus)win.setFocusable?.(true);restoringPlacement=false;placementReady=true;}rememberPlacement();if(focus)win.focus();onVisibility(controller.visible,tab);send({type:'snapshot',snapshot:snapshot()});
  }
  function agentRequestCurrent(epoch,requestId){
    if(safeSnapshot(getSnapshot()).privacyLocked){cancelPrivatePresentation();throw new Error('Datenschutz ist aktiv.');}
    return !destroyed&&presentationEpoch===epoch&&presentation.owner==='agent'&&presentation.requestId===requestId;
  }
  const controller={
    async show(next='system'){
      const options=typeof next==='object'?next:{tab:next};
      if(options.url)validateBrowserUrl(options.url);
      const nextTab=options.url?'browser':options.tab||'system';if(!TABS.includes(nextTab))throw new Error('Unbekannter Arbeitsbereich.');
      const epoch=claimUser();userShowPending=epoch;
      try{await ensure();if(destroyed||epoch!==presentationEpoch)return;if(win.isVisible())rememberPlacement();if(options.url){await browser.webContents.loadURL(validateBrowserUrl(options.url));if(destroyed||epoch!==presentationEpoch)return;}selectTab(nextTab);if(epoch===presentationEpoch)showWindow(true);}
      finally{if(userShowPending===epoch)userShowPending=null;}
    },
    async present(options={}){
      if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['tab','url','reason','requestId'].includes(key)))throw new Error('Ungültige Agentenpräsentation.');
      const nextTab=options.tab||'system',requestId=options.requestId===undefined?randomUUID():options.requestId;
      if(!TABS.includes(nextTab)||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(requestId)||options.reason!==undefined&&(typeof options.reason!=='string'||options.reason.length>160||/[\u0000-\u001f\u007f]/.test(options.reason)))throw new Error('Ungültige Agentenpräsentation.');
      const url=options.url===undefined?null:validateBrowserUrl(options.url);if(url&&nextTab!=='browser')throw new Error('Eine Webadresse benötigt den Browserbereich.');
      if(safeSnapshot(getSnapshot()).privacyLocked)throw new Error('Datenschutz ist aktiv.');
      const result=shown=>({shown,...presentation,requestId});
      if(presentation.owner==='user'&&(controller.visible||userShowPending!==null))return result(false);
      const epoch=setPresentation('agent',text(options.reason,160),requestId);
      try{
        await ensure();if(!agentRequestCurrent(epoch,requestId))return result(false);
        if(win.isVisible())rememberPlacement();
        if(url){await browser.webContents.loadURL(url);if(!agentRequestCurrent(epoch,requestId))return result(false);}
        selectTab(nextTab);if(!agentRequestCurrent(epoch,requestId))return result(false);showWindow(false);return result(true);
      }catch(error){if(presentationEpoch===epoch&&presentation.owner==='agent'&&presentation.requestId===requestId)controller.hide();throw error;}
    },
    release(requestId){
      if(typeof requestId!=='string'||presentation.owner!=='agent'||presentation.requestId!==requestId)return {closed:false,...presentation};
      controller.hide();return {closed:true,...presentation,requestId};
    },
    stopStream(reason){streamBroker.stop(reason);},
    hide(){setPresentation(null);rememberPlacement();streamBroker.stop();if(win&&!win.isDestroyed())win.hide();},
    toggle(){return controller.visible?controller.hide():controller.show(tab);},
    cycleTab(direction=1){claimUser();selectTab(TABS[(TABS.indexOf(tab)+(direction<0?-1:1)+TABS.length)%TABS.length]);},
    publish(event){
      if(destroyed)return;
      if(['audio-chunk','audio-start','audio-end','audio-stop','camera-frame','wake-feed','vad-feed','client-state'].includes(event?.type))return;
      if(event?.type==='privacy-state'&&event.locked===true||safeSnapshot(getSnapshot()).privacyLocked)cancelPrivatePresentation();
      if(event?.type==='graph-update'){send({type:'graph-update',graph:event.graph});return;}
      if(event?.type==='craft-update'){if(event.craft?.privacyLocked)streamBroker.stop();send({type:'craft-update',craft:event.craft});return;}
      if(event?.type==='intel-update'){send({type:'intel-update',intel:event.intel});return;}
      if(event?.type==='guide-update'){send({type:'guide-update',guide:event.guide});return;}
      if(event?.type==='open-browser'){controller.show({tab:'browser',url:event.url}).catch(error=>retain({type:'error',text:error.message}));return;}
      if(event?.type==='workspace-cycle'){controller.cycleTab(event.direction);return;}
      if(event?.type==='gesture-state'){gesture={enabled:event.enabled===true,ready:event.ready===true,label:text(event.label,120)};send({type:'gesture-state',...gesture});return;}
      if(event?.type==='gesture-update'){
        const value=event.gesture;if(!controller.visible||tab!=='graph'||safeSnapshot(getSnapshot()).privacyLocked||!value||!['pointer','cancel','zoom'].includes(value.kind)||!Number.isSafeInteger(value.generation)||value.generation<0||!Number.isSafeInteger(value.sequence)||value.sequence<0||!Number.isFinite(value.at)||Math.abs(Date.now()-value.at)>1000)return;
        const metadata={kind:value.kind,generation:value.generation,sequence:value.sequence,at:value.at};
        if(value.kind==='pointer'){if(!['x','y'].every(key=>Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1)||typeof value.pinching!=='boolean')return;send({type:'gesture-update',gesture:{...metadata,x:value.x,y:value.y,pinching:value.pinching}});}
        else if(value.kind==='cancel')send({type:'gesture-update',gesture:metadata});
        else if(Number.isFinite(value.delta)&&Math.abs(value.delta)<=1)send({type:'gesture-update',gesture:{...metadata,delta:value.delta}});return;
      }
      retain(event);send({type:'snapshot',snapshot:snapshot()});
    },
    destroy(){setPresentation(null);rememberPlacement();clearTimeout(placementTimer);streamBroker.stop();clearInterval(streamMonitor);uiSession.setDisplayMediaRequestHandler?.(null);uiSession.setPermissionRequestHandler(null);uiSession.setPermissionCheckHandler(null);destroyed=true;onVisibility(false,tab);ipcMain.removeHandler('workbench:invoke');browserSession.removeListener('will-download',blockDownload);browserSession.webRequest.onBeforeRequest(null);if(browser&&!browser.webContents.isDestroyed()){if(attached&&win&&!win.isDestroyed())win.contentView.removeChildView(browser);browser.webContents.close();}if(win&&!win.isDestroyed())win.destroy();browser=null;win=null;},
    get presentation(){return {...presentation};},
    get activeTab(){return tab;},
    get streamTarget(){return streamBroker.target;},
    get inputGeneration(){return inputEpoch;},
    get visible(){return !!win&&!win.isDestroyed()&&win.isVisible();}
  };
  return controller;
}
module.exports={createWorkbench,validateBrowserUrl,trustedSender,safeSnapshot,normalizeConsoleEvent,restoreWindowPlacement};
