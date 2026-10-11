'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {randomUUID,randomBytes}=require('node:crypto'),{execFile,spawn}=require('node:child_process'),{promisify}=require('node:util');
const {redactContext}=require('./context-journal.cjs'),{redactTaskText}=require('./task-ledger.cjs');
const {INPUT_APPS,validCraftInput,captureGeometry,clientPoint,readNativeWindow}=require('./window-input.cjs');
const runFile=promisify(execFile),MAX_PNG=12*1024*1024,MAX_PIXELS=24*1024*1024;
const ARTCRAFT_APPS=Object.freeze([
  ['photo','PhotoCraft','Bild'],['vector','VectorCraft','Vektor'],['design','DesignCraft','Layout'],
  ['deck','DeckCraft','Präsentation'],['grid','GridCraft','Tabelle'],['word','WordCraft','Text'],
  ['cad','CadCraft','CAD'],['light','LightCraft','Foto'],['sound','SoundCraft','Audio'],
  ['effect','EffectCraft','Effekte'],['film','FilmCraft','Video'],['pdf','PdfCraft','PDF']
].map(([id,name,kind])=>Object.freeze({id,name,kind,exePath:path.join('apps',name,id+'craft.exe'),cliPath:path.join('apps',name,id+'craft-cli.exe')})));
const IMAGE_FIELD={photo:'base64',vector:'pngBase64',design:'pngBase64',deck:'png',grid:'base64',sound:'png_base64',effect:'png',film:'pngBase64',pdf:'png_base64'};
const FILE_PREVIEW=new Set(['word','cad','light']),FOCUS_METHOD=new Set(['photo','vector','design','deck','grid','word','effect','film']);
const script=path.join(__dirname,'scripts','artcraft_processes.ps1');
function abortError(){return Object.assign(Error('Artcraft-Anfrage abgebrochen.'),{name:'AbortError'});}
function checkSignal(signal){if(signal?.aborted)throw abortError();}
function localPath(value){if(typeof value!=='string'||!path.isAbsolute(value)||/^(?:\\\\|\/\/)|\u0000/.test(value)||/^[a-z]+:\/\//i.test(value))throw Error('Ein absoluter lokaler Pfad ist erforderlich.');return path.resolve(value);}
function samePath(a,b){return typeof a==='string'&&typeof b==='string'&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();}
function validPort(port){return Number.isInteger(port)&&port>0&&port<=65535;}
function text(value,limit=160){return redactContext(redactTaskText(value,limit),limit).replace(/\b[a-f0-9]{64}\b/gi,'[redacted]').replace(/(?:[A-Za-z]:\\|\\\\)[^\s]*|\/[^\s]*\//g,'[Pfad]');}
function title(value){return text(typeof value==='string'?value.split(/[\\/]/).at(-1):'',160);}
function finite(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e9?value:undefined;}
function layerCount(layers,depth=0){if(!Array.isArray(layers)||depth>12)return undefined;let total=0;for(const layer of layers.slice(0,2000)){total++;total+=layerCount(layer?.children,depth+1)||0;if(total>=10000)return 10000;}return total;}
function documentInfo(id,raw){
  const documents=Array.isArray(raw.documents)?raw.documents:[];
  let doc=raw.document;
  if(id==='photo'){const active=raw.session?.documents?.[raw.session?.active];doc=doc?{...doc,name:doc.name||active?.name||active?.title||active?.path,dirty:active?.dirty}:active;}
  else if(id==='pdf')doc=documents.find(d=>d?.active)||documents.find(d=>d?.doc===raw.active?.doc);
  else if(id==='cad')doc=raw.session?.documents?.find(d=>d?.active);
  else if(!doc&&documents.length)doc=Number.isInteger(raw.activeDocument)?documents[raw.activeDocument]:documents.length===1?documents[0]:undefined;
  else if(!doc&&id==='word')doc=raw;
  if(!doc||typeof doc!=='object')return undefined;
  const result={},name=title(doc.name||doc.title);if(name)result.name=name;
  for(const key of ['width','height']){const value=finite(doc[key]);if(value!==undefined)result[key]=value;}
  if(typeof doc.dirty==='boolean')result.dirty=doc.dirty;
  const layers=Array.isArray(doc.layers)?layerCount(doc.layers):finite(doc.layers);if(layers!==undefined)result.layers=layers;
  const pages=id==='word'?undefined:Array.isArray(doc.pages)?doc.pages.length:finite(doc.pages);if(pages!==undefined)result.pages=pages;
  return Object.keys(result).length?result:undefined;
}
function jobInfo(raw){
  const jobs=[];let source=Array.isArray(raw.jobs)?raw.jobs:[];
  if(raw.jobs&&typeof raw.jobs==='object'&&!Array.isArray(raw.jobs))source=[...(Array.isArray(raw.jobs.running)?raw.jobs.running:[]),...(Array.isArray(raw.jobs.opening)?raw.jobs.opening:[]),...(Array.isArray(raw.jobs.saving)?raw.jobs.saving:[])];
  if(raw.progress&&typeof raw.progress==='object')source=[...source,raw.progress];
  for(const job of source.slice(0,20)){if(!job||typeof job!=='object')continue;const item={};const label=text(job.label||job.name||job.title);if(label)item.label=label;const status=text(job.status,40);if(status)item.status=status;const progress=job.progress??job.fraction;if(typeof progress==='number'&&Number.isFinite(progress)&&progress>=0&&progress<=1)item.progress=progress;if(Object.keys(item).length)jobs.push(item);}
  return jobs;
}
function safeFile(file,max){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw Error('Ungültige lokale Datei.');const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));try{const opened=fs.fstatSync(fd);if(!opened.isFile()||opened.size>max||opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error('Ungültige lokale Datei.');const bytes=Buffer.alloc(opened.size);let offset=0;while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!n)throw Error('Unvollständige lokale Datei.');offset+=n;}return bytes;}finally{fs.closeSync(fd);}}
function pngInfo(bytes,result){
  if(!Buffer.isBuffer(bytes)||bytes.length<45||bytes.length>MAX_PNG||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')throw Error('Ungültige PNG-Vorschau.');
  let crc=0xffffffff;for(const value of bytes.subarray(12,29)){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}if(((crc^0xffffffff)>>>0)!==bytes.readUInt32BE(29))throw Error('Ungültiger PNG-Header.');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width*height>MAX_PIXELS)throw Error('Vorschau zu groß.');
  const bitDepth=bytes[24],colorType=bytes[25];if(!({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]})[colorType]?.includes(bitDepth)||bytes[26]!==0||bytes[27]!==0||bytes[28]>1)throw Error('Ungültiger PNG-Header.');
  if(result.mime!==undefined&&result.mime!=='image/png')throw Error('Ungültiges Vorschauformat.');
  if((result.width!==undefined&&result.width!==width)||(result.height!==undefined&&result.height!==height))throw Error('Ungültige Vorschaumaße.');
  let offset=8,ended=false;while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);if(length>MAX_PNG||offset+length+12>bytes.length)throw Error('Unvollständige PNG-Vorschau.');offset+=length+12;if(kind==='IEND'){if(length!==0||offset!==bytes.length)throw Error('Ungültige PNG-Vorschau.');ended=true;break;}}
  if(!ended)throw Error('Unvollständige PNG-Vorschau.');return {width,height,image:'data:image/png;base64,'+bytes.toString('base64')};
}
function rawRequest(connection,request){
  const readable=['ui.inspect','ui.state','ui.screenshot','ui.focus'].includes(request.method),input=connection.appId==='light'&&['ui.click','ui.move','ui.key','ui.text','ui.scroll'].includes(request.method);
  if((!readable&&!input)||!validPort(connection.port))return Promise.reject(Error('Ungültige Artcraft-Anfrage.'));
  const {signal}=connection;checkSignal(signal);
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port:connection.port});let buffer=Buffer.alloc(0),done=false,auth=!!connection.token;
    const id=randomUUID(),authId=randomUUID(),rpc=connection.protocol==='jsonrpc';
    const timer=setTimeout(()=>finish(Error('Artcraft antwortet nicht rechtzeitig.')),request.method==='ui.screenshot'?12000:4000);
    function finish(error,result){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);socket.destroy();error?reject(error):resolve(result);}
    function cancel(){finish(abortError());}
    function send(method,params,requestId){socket.write(JSON.stringify({...rpc?{jsonrpc:'2.0'}:{},id:requestId,method,params})+'\n');}
    signal?.addEventListener('abort',cancel,{once:true});
    socket.on('connect',()=>{if(signal?.aborted)return cancel();auth?send('auth',{token:connection.token},authId):send(request.method,request.params,id);});
    socket.on('error',()=>finish(Error('Artcraft-Verbindung nicht erreichbar.')));
    socket.on('close',()=>{if(!done)finish(Error('Artcraft-Verbindung geschlossen.'));});
    socket.on('data',chunk=>{
      const max=auth?16384:request.method==='ui.screenshot'?Math.ceil(MAX_PNG*4/3)+32768:512*1024;
      if(buffer.length+chunk.length>max)return finish(Error('Artcraft-Antwort zu groß.'));buffer=Buffer.concat([buffer,chunk]);const index=buffer.indexOf(10);if(index<0)return;
      let reply;try{reply=JSON.parse(buffer.subarray(0,index).toString('utf8'));}catch{return finish(Error('Ungültige Artcraft-Antwort.'));}buffer=buffer.subarray(index+1);
      if(!reply||reply.id!==(auth?authId:id)||(rpc&&reply.jsonrpc!=='2.0')||reply.error||(!rpc&&reply.ok!==true))return finish(Error(auth?'Artcraft-Authentifizierung fehlgeschlagen.':'Artcraft-Anfrage fehlgeschlagen.'));
      if(auth){if((rpc&&reply.result?.ok!==true)||(!rpc&&reply.result?.authenticated!==true))return finish(Error('Artcraft-Authentifizierung fehlgeschlagen.'));auth=false;send(request.method,request.params,id);}else finish(null,reply.result);
    });
  });
}
async function readNativeProcesses(installRoot,signal){
  if(process.platform!=='win32')return {processes:[],listeners:[]};checkSignal(signal);
  const {stdout}=await runFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-InstallRoot',installRoot],{windowsHide:true,timeout:6000,maxBuffer:256*1024,signal});return JSON.parse(stdout.replace(/^\uFEFF/,''));
}
async function unusedPort(){const server=net.createServer();const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));return port;}
async function launchNative(exe,args){await new Promise((resolve,reject)=>{const child=spawn(exe,args,{detached:true,stdio:'ignore',windowsHide:false});child.once('error',()=>reject(Error('Artcraft konnte nicht geöffnet werden.')));child.once('spawn',()=>{child.unref();resolve();});});}
function createArtcraft({installRoot='I:\\tools\\artcraft',cacheRoot,readProcesses,readWindow=readNativeWindow,canInput=()=>true,transport=rawRequest,launcher=launchNative,onUpdate=()=>{},now=Date.now,initialAppId='photo'}={}){
  installRoot=localPath(installRoot);cacheRoot=localPath(cacheRoot);fs.mkdirSync(cacheRoot,{recursive:true});
  const configPath=path.join(cacheRoot,'artcraft-connections.json'),registrations={},details=new Map(),activities=new Map(),launching=new Map();
  let selectedAppId=ARTCRAFT_APPS.some(app=>app.id===initialAppId)?initialAppId:'photo',preview=null,disposed=false,generation=0,controller=null,apps=[],lastData={processes:[],listeners:[]};
  let inputGrant=null,inputGeneration=0,inputController=null,inputBusy=false;
  const definition=id=>{const app=ARTCRAFT_APPS.find(a=>a.id===id);if(!app)throw Error('Unbekannte Artcraft-App.');return app;};
  const exe=app=>path.join(installRoot,app.exePath);
  const alive=()=>{if(disposed)throw Error('Artcraft wurde beendet.');};
  function validateRegistration(value){const app=definition(value?.appId),result={};if(value.port!==undefined){if(!validPort(value.port))throw Error('Ungültiger Control-Port.');result.port=value.port;}for(const key of ['tokenFile','endpointFile'])if(value[key]!==undefined)result[key]=localPath(value[key]);if(app.id==='pdf'&&!result.endpointFile)throw Error('PDF benötigt eine lokale Endpoint-Datei.');if(app.id!=='pdf'&&result.port===undefined)throw Error('Control-Port fehlt.');return result;}
  try{const stored=JSON.parse(safeFile(configPath,64*1024).toString('utf8'));for(const [appId,value] of Object.entries(stored)){try{registrations[appId]=validateRegistration({appId,...value});}catch{}}}catch{}
  function guiProcesses(app,data=lastData){return (Array.isArray(data.processes)?data.processes:[]).filter(p=>samePath(p?.executablePath,exe(app))&&Number.isInteger(p.pid)&&p.pid>0);}
  function updateApps(data){apps=ARTCRAFT_APPS.map(app=>{const installed=fs.existsSync(exe(app)),running=installed&&guiProcesses(app,data).some(p=>Number(p.mainWindowHandle)>0);const prior=apps.find(a=>a.id===app.id);return {id:app.id,name:app.name,kind:app.kind,installed,running,inputSupported:INPUT_APPS.includes(app.id),bridgeState:!installed?'unavailable':!running?'closed':prior?.running?prior.bridgeState:'unconfigured'};});}
  function snapshot(){const app=apps.find(a=>a.id===selectedAppId);return structuredClone({apps,selectedAppId,selected:{id:app.id,name:app.name,running:app.running,inputSupported:app.inputSupported,bridgeState:app.bridgeState,...details.get(selectedAppId),jobs:details.get(selectedAppId)?.jobs||[],activities:activities.get(selectedAppId)||[]},preview});}
  function publish(){if(!disposed)onUpdate(snapshot());return snapshot();}
  function cancel(){generation++;controller?.abort();controller=null;preview=null;}
  function stopInput(){inputGeneration++;inputGrant=null;inputController?.abort();inputController=null;}
  async function read(signal){return await (readProcesses?readProcesses({installRoot,signal}):readNativeProcesses(installRoot,signal));}
  function connectionFor(app,data,signal){
    const candidates=[];let invalid=false;
    for(const process of guiProcesses(app,data).filter(p=>Number(p.mainWindowHandle)>0)){
      const registration=registrations[app.id]||{},descriptor={...registration};
      if(validPort(process.controlPort))descriptor.port=process.controlPort;
      for(const key of ['tokenFile','endpointFile'])if(process[key])descriptor[key]=process[key];
      let token;
      try{
        if(app.id==='pdf'){
          if(!descriptor.endpointFile)continue;
          const endpoint=JSON.parse(safeFile(localPath(descriptor.endpointFile),16384).toString('utf8'));
          if(endpoint.pid!==process.pid||!validPort(endpoint.port)||typeof endpoint.token!=='string'||!/^[a-f0-9]{64}$/i.test(endpoint.token))throw Error('Endpoint ungültig.');descriptor.port=endpoint.port;token=endpoint.token;
        }
        if(!validPort(descriptor.port))continue;
        const owned=(Array.isArray(data.listeners)?data.listeners:[]).some(l=>l?.pid===process.pid&&l.port===descriptor.port&&l.localAddress==='127.0.0.1');if(!owned)continue;
        if(app.id==='photo'){if(!descriptor.tokenFile)continue;token=safeFile(localPath(descriptor.tokenFile),512).toString('utf8').trim();if(!/^[a-f0-9]{64}$/i.test(token))throw Error('Token ungültig.');}
        candidates.push({appId:app.id,pid:process.pid,mainWindowHandle:process.mainWindowHandle,port:descriptor.port,protocol:app.id==='pdf'?'jsonrpc':'plain',...(token?{token}:{}),signal});
      }catch{invalid=true;}
    }
    if(candidates.length>1)throw Error('Mehrere Artcraft-Fenster mit Live-Steuerung.');
    if(!candidates.length&&invalid)throw Error('Lokale Artcraft-Verbindung ungültig.');return candidates[0];
  }
  async function capture(app,connection){
    let issued;try{
      const params={focus:false};if(FILE_PREVIEW.has(app.id)){issued=path.join(cacheRoot,randomUUID()+'.png');params.path=issued;if(app.id==='light')params.headless=true;}
      checkSignal(connection.signal);const result=await transport(connection,{method:'ui.screenshot',params});checkSignal(connection.signal);if(!result||typeof result!=='object')throw Error('Vorschau fehlt.');
      let bytes;if(issued){if(!samePath(fs.realpathSync(issued),issued))throw Error('Ungültiges Vorschauziel.');bytes=safeFile(issued,MAX_PNG);}else{const base64=result[IMAGE_FIELD[app.id]];if(typeof base64!=='string'||base64.length>Math.ceil(MAX_PNG*4/3)||!base64.length||base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw Error('Ungültige Vorschau.');bytes=Buffer.from(base64,'base64');}
      return {appId:app.id,...pngInfo(bytes,result),capturedAt:now()};
    }finally{if(issued){try{fs.unlinkSync(issued);}catch{}}}
  }
  updateApps(lastData);
  return {
    snapshot,
    stopInput,
    async input(payload,{captureTarget,captureGeneration,getCaptureGeneration}={}){
      alive();if(!validCraftInput(payload)||payload.appId!==selectedAppId||!canInput())throw Error('Eingabe für diese Anwendung ist nicht verfügbar.');
      if(!captureTarget||captureTarget.appId!==payload.appId||!Number.isSafeInteger(captureTarget.pid)||captureTarget.pid<=0||!(/^[1-9][0-9]{0,15}$/).test(String(captureTarget.windowId))||!Number.isSafeInteger(captureGeneration)||typeof getCaptureGeneration!=='function')throw Error('Eingabe benötigt eine bestätigte Fensteraufnahme.');
      if(inputBusy)throw Error('Eine Anwendungseingabe läuft bereits.');
      const validGrant=()=>payload.kind==='arm'||!!inputGrant&&inputGrant.frameId===payload.frameId&&inputGrant.captureGeneration===captureGeneration&&inputGrant.expires>now();
      if(!validGrant())throw Error('Eingabe erneut aktivieren; das Fensterbild ist nicht mehr gültig.');
      inputBusy=true;const epoch=inputGeneration,activeController=new AbortController();inputController=activeController;
      const valid=()=>{checkSignal(activeController.signal);if(disposed||epoch!==inputGeneration||payload.appId!==selectedAppId||!canInput()||getCaptureGeneration()!==captureGeneration)throw abortError();if(!validGrant())throw Error('Eingabe erneut aktivieren; das Fensterbild ist nicht mehr gültig.');};
      try{
        valid();const app=definition(payload.appId),data=await read(activeController.signal);valid();const connection=connectionFor(app,data,activeController.signal);
        if(!connection)throw Error('Die laufende GUI-Steuerung ist nicht angebunden.');
        if(connection.pid!==captureTarget.pid||String(connection.mainWindowHandle)!==String(captureTarget.windowId))throw Error('Das Eingabeziel ist nicht das aufgezeichnete Anwendungsfenster.');
        const owner={exePath:exe(app),pid:connection.pid,windowId:String(connection.mainWindowHandle),signal:activeController.signal};
        const verifyNative=native=>{if(!native||native.pid!==owner.pid||String(native.windowId)!==owner.windowId||!samePath(native.executablePath,owner.exePath)||native.visible!==true||native.minimized!==false||native.enabled!==true||(native.popupWindowId&&String(native.popupWindowId)!==owner.windowId))throw Error('Quellfenster ist verändert, minimiert oder durch einen Dialog gesperrt.');return native;};
        const native=verifyNative(await readWindow(owner));valid();
        const raw=await transport(connection,{method:'ui.inspect',params:{}});valid();
        const frame=payload.kind==='arm'?payload:inputGrant.frame,geometry=captureGeometry(native,raw,frame);
        const signature=JSON.stringify({pid:owner.pid,windowId:owner.windowId,port:connection.port,geometry,dialog:raw?.ui?.dialog??null,quitPrompt:raw?.quitPrompt??null,fileDialogs:raw?.fileDialogs??[],libraryProblem:raw?.libraryProblem??null});
        if(Array.isArray(raw?.fileDialogs)&&raw.fileDialogs.length)throw Error('Ein nativer Dateidialog sperrt die eingebettete Eingabe.');
        if(payload.kind!=='arm'&&signature!==inputGrant.signature)throw Error('Fenster oder Dialog hat sich geändert. Eingabe erneut aktivieren.');
        const latest=verifyNative(await readWindow(owner));valid();
        if(JSON.stringify({frame:latest.frame,client:latest.client,dpi:latest.dpi})!==JSON.stringify({frame:native.frame,client:native.client,dpi:native.dpi}))throw Error('Fenster-Geometrie hat sich während der Eingabe geändert.');
        if(payload.kind==='arm'){
          const frameId=randomBytes(16).toString('hex');inputGrant={frameId,captureGeneration,signature,frame:{frameWidth:payload.frameWidth,frameHeight:payload.frameHeight},expires:now()+60000};
          return {ok:true,appId:app.id,kind:'arm',frameId,viewport:{width:geometry.points[0],height:geometry.points[1]}};
        }
        let request;
        if(payload.kind==='click')request={method:'ui.click',params:clientPoint(geometry,payload.x,payload.y)};
        else if(payload.kind==='text')request={method:'ui.text',params:{text:payload.text}};
        else if(payload.kind==='key')request={method:'ui.key',params:{key:payload.key}};
        else{
          await transport(connection,{method:'ui.move',params:clientPoint(geometry,payload.x,payload.y)});valid();request={method:'ui.scroll',params:{dx:0,dy:-payload.delta}};
        }
        valid();await transport(connection,request);valid();
        return {ok:true,appId:app.id,kind:payload.kind,...(['click','scroll'].includes(payload.kind)?{x:payload.x,y:payload.y}:{}),...(payload.kind==='key'?{key:payload.key}:{}),...(payload.kind==='scroll'?{delta:payload.delta}:{}),...(payload.kind==='text'?{characters:payload.text.length}:{})};
      }catch(error){inputGrant=null;if(error?.name==='AbortError')throw error;throw Error('Anwendungseingabe abgewiesen: '+(error?.message||'Fensterprüfung fehlgeschlagen.'));}
      finally{inputBusy=false;if(inputController===activeController)inputController=null;}
    },
    async streamTarget(appId){
      alive();const app=definition(appId),data=await read();
      if(disposed)throw abortError();
      const matches=guiProcesses(app,data).filter(p=>Number(p.mainWindowHandle)>0);
      if(matches.length!==1)throw Error('Artcraft-Fenster ist nicht eindeutig verfügbar.');
      return {appId,pid:matches[0].pid,windowId:String(matches[0].mainWindowHandle)};
    },
    async refresh({preview:wantPreview=false,signal}={}){
      alive();cancel();const current=generation,selected=selectedAppId;controller=new AbortController();const activeController=controller;const forward=()=>activeController.abort();signal?.addEventListener('abort',forward,{once:true});if(signal?.aborted)forward();
      const valid=()=>!disposed&&generation===current&&!activeController.signal.aborted&&selectedAppId===selected;
      try{
        checkSignal(activeController.signal);const data=await read(activeController.signal);if(!valid())return snapshot();lastData=data||{processes:[],listeners:[]};updateApps(lastData);details.delete(selected);
        const app=definition(selected),state=apps.find(a=>a.id===selected);if(!state.running)return publish();
        const connection=connectionFor(app,lastData,activeController.signal);if(!connection){state.bridgeState='unconfigured';return publish();}state.bridgeState='connecting';publish();
        const raw=await transport(connection,{method:app.id==='pdf'?'ui.state':'ui.inspect',params:{}});if(!valid())return snapshot();if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Ungültiger Dokumentstatus.');
        const document=documentInfo(app.id,raw),tool=text(raw.tool||raw.quick_tool||raw.ui?.tool,80);details.set(selected,{...(document?{document}:{}),...(tool?{tool}:{}),jobs:jobInfo(raw)});state.bridgeState='ready';delete state.error;
        if(wantPreview){const captured=await capture(app,connection);if(valid())preview=captured;}
        if(valid())return publish();return snapshot();
      }catch(error){if(valid()){const state=apps.find(a=>a.id===selected);state.bridgeState='error';state.error='Artcraft-Liveverbindung oder Vorschau nicht verfügbar.';preview=null;return publish();}return snapshot();}
      finally{signal?.removeEventListener('abort',forward);if(controller===activeController)controller=null;}
    },
    async select(appId){alive();definition(appId);cancel();stopInput();selectedAppId=appId;return publish();},
    register(value){alive();const descriptor=validateRegistration(value);registrations[value.appId]=descriptor;const temporary=configPath+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temporary,JSON.stringify(registrations,null,2),{mode:0o600,flag:'wx'});fs.renameSync(temporary,configPath);}finally{try{fs.unlinkSync(temporary);}catch{}}cancel();return publish();},
    async open(appId){
      alive();const app=definition(appId);if(!fs.existsSync(exe(app)))throw Error('Artcraft-App ist nicht installiert.');if(launching.has(appId))return snapshot();
      launching.set(appId,now());const ticket=generation;try{const data=await read();if(disposed||generation!==ticket)throw abortError();lastData=data;updateApps(data);if(guiProcesses(app,data).length)return publish();let descriptor=registrations[appId];if(!descriptor){const value=appId==='pdf'?{appId,endpointFile:path.join(cacheRoot,'pdf-endpoint.json')}:{appId,port:await unusedPort()};if(disposed||generation!==ticket)throw abortError();if(appId==='photo'){value.tokenFile=path.join(cacheRoot,'photo-'+randomUUID()+'.token');fs.writeFileSync(value.tokenFile,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}this.register(value);descriptor=registrations[appId];}const args=[];if(descriptor){if(appId==='pdf')args.push('--control',descriptor.endpointFile);else{args.push('--control',String(descriptor.port));if(appId==='photo'&&descriptor.tokenFile)args.push('--control-token-file',descriptor.tokenFile);}}await launcher(exe(app),args);return publish();}finally{launching.delete(appId);}
    },
    async focus(appId){
      alive();const ticket=generation,app=definition(appId),data=await read();if(disposed||generation!==ticket)throw abortError();lastData=data;updateApps(data);const processes=guiProcesses(app,data).filter(p=>Number(p.mainWindowHandle)>0);if(processes.length!==1)throw Error('Artcraft-Fenster ist nicht eindeutig verfügbar.');
      const connection=connectionFor(app,data);if(FOCUS_METHOD.has(appId)&&connection)await transport(connection,{method:'ui.focus',params:{}});
      else{const p=processes[0];try{await runFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-InstallRoot',installRoot,'-FocusPid',String(p.pid),'-FocusHandle',String(p.mainWindowHandle),'-FocusExe',exe(app)],{windowsHide:true,timeout:4000,maxBuffer:16384});}catch{throw Error('Artcraft-Fenster konnte nicht fokussiert werden.');}}
      return publish();
    },
    observeTool(event){
      if(disposed||!event||typeof event.name!=='string')return snapshot();const explicit=event.appId,lower=event.name.toLowerCase();const appId=explicit||ARTCRAFT_APPS.find(a=>lower.includes(a.id+'craft'))?.id;if(!ARTCRAFT_APPS.some(a=>a.id===appId))return snapshot();
      const name=text(event.name,120),status=text(event.status||event.type,40);if(!name)return snapshot();const list=activities.get(appId)||[];list.unshift({name,status,timestamp:now()});activities.set(appId,list.slice(0,30));return publish();
    },
    stop(){cancel();stopInput();details.clear();activities.clear();return publish();},
    dispose(){cancel();stopInput();details.clear();activities.clear();disposed=true;}
  };
}
module.exports={ARTCRAFT_APPS,createArtcraft};
