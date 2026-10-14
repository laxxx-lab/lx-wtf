'use strict';
// A native Linux shell around the same Hermes gateway and shared contracts.
// Windows main.cjs, settings, microphone choice and engines remain separate.
const electron=require('electron'),{app,BrowserWindow,ipcMain,session,dialog,shell,screen,Menu,globalShortcut,clipboard}=electron;
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {Gateway}=require('./gateway.cjs'),{Conversation,SentenceBuffer}=require('./conversation.cjs'),{ReplyAccumulator,visibleHandoffHistory}=require('./reply.cjs'),{VoiceClient}=require('./voice-client.cjs'),{transcribeAudio}=require('./transcription.cjs');
const {createWorkbench}=require('./workbench.cjs'),{createProjectLibrary}=require('./project-library.cjs');
const {createControlApi}=require('./control-api.cjs');
const {validateLinuxSettings,linuxProjectPrompt,normalizeLinuxRegistry,requireLinuxAccess,linuxEngineSpecs,linuxGatewayMapping,requireLinuxReconnect,createLinuxTurnGate,requireLinuxApprovalOwner,linuxDeviceContext,readLinuxSession,writeLinuxSession,resolveLinuxSession}=require('./linux-client.cjs');
const {enrollLinuxMcp}=require('./linux-mcp-enrollment.cjs');
const {createLinuxOrbWindow}=require('./linux-window.cjs');
const {createSessionHandoff,handoffIntent,recallIntent,handoffRequest}=require('./session-handoff.cjs');
const {createIdleStandby}=require('./idle-standby.cjs');
const {normalizeOrbMotion}=require('./ui/orb.js');
const ROOT=__dirname,LOCAL=path.join(ROOT,'.local'),settingsFile=path.join(LOCAL,'linux-settings.json'),page=pathToFileURL(path.join(ROOT,'ui/linux.html')).href;
const sessionFile=path.join(LOCAL,'linux-session.json');
const controlFile=path.join(LOCAL,'linux-control.json');let controlApi=null,controlToken=null;
fs.mkdirSync(LOCAL,{recursive:true,mode:0o700});
let stored={};try{stored=JSON.parse(fs.readFileSync(settingsFile,'utf8'));}catch{}
let config=validateLinuxSettings({...stored,...(process.env.LILITH_GATEWAY_URL?{url:process.env.LILITH_GATEWAY_URL}:{})});
const gatewayHostMap=process.env.LILITH_GATEWAY_HOST_MAP||(process.env.LILITH_GATEWAY_IP?new URL(config.url).hostname+'='+process.env.LILITH_GATEWAY_IP:'');
let gatewayMapping=linuxGatewayMapping(config.url,gatewayHostMap);if(gatewayMapping)app.commandLine.appendSwitch('host-resolver-rules',gatewayMapping.rule);
let win,workbench,authWindow,authSession,gateway,conversation,connected=false,connecting=false,detail='Gateway-Adresse eintragen',status='offline',sessions=[],generation=0,reply=new ReplyAccumulator(),buffer=new SentenceBuffer(),approval=null;
let voiceClient=null,speechChain=Promise.resolve(),speechGeneration=0,speechAbort=null,sttAbort=null,transcribing=false,health={stt:false,voice:false},healthTimer;
const children=new Set(),device=os.hostname(),projects=createProjectLibrary({file:path.join(LOCAL,'linux-projects.json'),onChange:value=>workbench?.publish({type:'project-update',projects:value})});
const turnGate=createLinuxTurnGate();let mcpEnrolling=false,notebookTools={configured:!!process.env.LILITH_MCP_URL&&!!process.env.LILITH_MCP_TOKEN_FILE,connected:false,detail:'Notebook-Werkzeuge noch nicht verbunden'};
let gatewayId=0,windowShell,panelOpen=false,shuttingDown=false,remoteTerminalSequence=0;
let handoff=null,rendererInput={capturing:false,speaking:false,live:false,microphoneOpen:false},speechPending=0;
const idleStandby=createIdleStandby();let standbyActive=false,idleStandbyTimer;
const activeTools=new Map();let toolSequence=0;
function agentPhase(){return activeTools.size?'working':'thinking';}
function selectedStoredSession(){const row=conversation?.session;return row?{id:row.storedId,profile:row.profile,title:row.title}:null;}
function localBusy(){return !!conversation?.busy||!!conversation?.selecting||transcribing||speechPending>0||rendererInput.capturing||rendererInput.speaking;}
function handoffCanSubmit(){return !handoff||handoff.canSubmit(selectedStoredSession());}
function handoffPendingCurrent(){const record=handoff?.snapshot().pending,selected=selectedStoredSession();return !!record&&!!selected&&[record.session,record.previous].some(row=>row?.id===selected.id&&row.profile===selected.profile);}
function enterLinuxStandby(){
 if(config.privacyLocked||standbyActive||localBusy()||!handoffCanSubmit()||handoffPendingCurrent())return snapshot();
 standbyActive=true;generation++;rendererInput={capturing:false,speaking:false,live:false,microphoneOpen:false};
 emit({type:'standby-state',active:true,generation});stopSpeech();update(connected?'ready':'offline','Standby · zum Sprechen auf den Orb klicken');return snapshot();
}
function resumeLinuxStandby(){
 access();if(!handoffCanSubmit()||handoffPendingCurrent()||localBusy())throw Error('Das Gespräch ist noch beschäftigt oder gehört zum anderen Gerät.');
 standbyActive=false;idleStandby.activity();update(status,'Bereit');return snapshot();
}
function idleStandbyTick(){
 if(idleStandby.due(config.idleStandbyMinutes,{eligible:!shuttingDown&&!standbyActive&&!config.privacyLocked&&connected&&!!conversation?.session&&!connecting&&handoffCanSubmit()&&!handoffPendingCurrent(),busy:localBusy()||mcpEnrolling}))enterLinuxStandby();
}
let pendingEnrollment=process.argv.includes('--enroll-mcp')||notebookTools.configured;
try{voiceClient=new VoiceClient({url:config.ttsUrl,registry:normalizeLinuxRegistry(JSON.parse(fs.readFileSync(path.join(ROOT,'voices/fixed/registry.json'),'utf8')),ROOT)});}catch{}
if(voiceClient&&!voiceClient.profiles.some(profile=>profile.id===config.voice))config.voice=voiceClient.profiles[0]?.id||'reference';
function save(){fs.writeFileSync(settingsFile,JSON.stringify(config,null,2),{mode:0o600});}
function rememberSession(){const selected=conversation?.session;if(selected)writeLinuxSession(sessionFile,{id:selected.storedId,profile:selected.profile,title:selected.title},config.url);}
function runPendingEnrollment(){if(!pendingEnrollment||!connected||connecting||mcpEnrolling)return;pendingEnrollment=false;void actions['mcp-enroll']().catch(error=>emit({type:'notice',message:error.message}));}
function snapshot(){const modelReady=health.stt&&health.voice&&!!voiceClient;return {status,detail,connected,panelOpen,standby:{active:standbyActive,idleMinutes:config.idleStandbyMinutes},busy:!!conversation?.busy||transcribing,localBusy:localBusy(),inputState:{...rendererInput},canSubmit:handoffCanSubmit(),handoff:handoff?.snapshot()||null,session:conversation?.session||null,sessions,settings:config,privacyLocked:config.privacyLocked,generation,device,voiceReady:health.voice&&!!voiceClient,sttReady:health.stt,voiceProfiles:voiceClient?.profiles||[],approval,notebookTools:{...notebookTools,enrolling:mcpEnrolling},voiceHealth:{state:modelReady?'ready':'degraded',summary:modelReady?'Lokale Sprachmodelle bereit · Mikrofon noch separat prüfen':'Lokale Sprachmodelle noch nicht vollständig bereit',checks:[{key:'stt',state:health.stt?'ready':'degraded',summary:'Lokale Spracherkennung'},{key:'voice',state:health.voice&&voiceClient?'ready':'degraded',summary:'Lokale Lilith-Stimme'}]}};}
function emit(event){workbench?.publish(event);if(win&&!win.isDestroyed())win.webContents.send('linux:event',event);}
function update(next=status,message=detail){status=next;detail=message;emit({type:'state',snapshot:snapshot()});fs.writeFileSync(path.join(LOCAL,'linux-status.json'),JSON.stringify({status,detail,connected,busy:snapshot().busy,localBusy:localBusy(),inputState:{...rendererInput},device,sessionId:conversation?.session?.id||null,storedSessionId:conversation?.session?.storedId||null,sessionProfile:conversation?.session?.profile||null,sessionTitle:conversation?.session?.title||null,privacyLocked:config.privacyLocked,engines:health,notebookTools:{...notebookTools,enrolling:mcpEnrolling},pid:process.pid},null,2),{mode:0o600});}
function access(captured){return requireLinuxAccess({privacyLocked:config.privacyLocked,connected,sessionId:conversation?.session?.id,generation},captured);}
function clearApproval(deny=false){const previous=approval;approval=null;if(deny&&connected&&previous?.scope?.gatewayId===gatewayId&&previous.scope.sessionId===conversation?.session?.id){try{gateway.respond(previous.id,previous.kind==='approval'?{choice:'deny'}:{answers:null});}catch{/* Privacy still must reach the local renderer if transport failed. */}}}
function stopSpeech(){speechGeneration++;speechPending=0;rendererInput.speaking=false;speechAbort?.abort();speechAbort=null;speechChain=Promise.resolve();buffer=new SentenceBuffer();emit({type:'audio-stop',generation:speechGeneration});}
function speak(text){
  if(!text?.trim()||config.privacyLocked||standbyActive||!voiceClient||!handoffCanSubmit())return;
  speechPending++;emit({type:'audio-queued',generation:speechGeneration});
  const current=speechGeneration;const task=async()=>{if(current!==speechGeneration||config.privacyLocked)return;const controller=new AbortController();speechAbort=controller;
    try{const response=await voiceClient.speech(text,config.voice,'normal',controller.signal);if(!response.ok)throw Error('Lokale Stimme ist nicht bereit.');rendererInput.speaking=true;emit({type:'audio-start',generation:current,sampleRate:24000});for await(const chunk of response.body){if(current!==speechGeneration||config.privacyLocked)break;emit({type:'audio-chunk',generation:current,data:Buffer.from(chunk).toString('base64')});}emit({type:'audio-end',generation:current});}
    catch(error){if(!controller.signal.aborted)emit({type:'notice',message:'Sprachausgabe: '+error.message});}finally{if(speechAbort===controller)speechAbort=null;if(current===speechGeneration){speechPending=Math.max(0,speechPending-1);if(!speechPending)emit({type:'audio-idle',generation:current});}}};
  speechChain=speechChain.then(task,task);
}
async function interrupt(value){
 if(value?.bargeIn===true){
  if(!value.captured)throw Error('Aufnahmezuordnung fehlt.');access(value.captured);if(standbyActive||!handoffCanSubmit()||handoffPendingCurrent())throw Error('Dieses Gespräch ist pausiert oder gehört zum anderen Gerät.');
  const owner=conversation,selected=owner.session,link=gateway,capturedGeneration=generation,terminal=remoteTerminalSequence,wasBusy=owner.busy,wasPreparing=owner.preparing&&!owner.remoteRunning,submission=owner.submissionGeneration,until=Date.now()+5000;
  const current=()=>owner===conversation&&selected===owner.session&&link===gateway&&capturedGeneration===generation&&connected&&!config.privacyLocked&&!standbyActive&&handoffCanSubmit()&&!handoffPendingCurrent();
  clearApproval();if(wasBusy)turnGate.suppress(selected.id);stopSpeech();let timeout;
  try{await Promise.race([owner.interrupt(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Unterbrechung nicht bestätigt.')),5000);})]);}
  catch{return {...snapshot(),ready:false};}finally{clearTimeout(timeout);}
  while(current()&&owner.busy&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,40));
  const ready=current()&&!owner.busy&&(!wasBusy||remoteTerminalSequence>terminal||wasPreparing&&owner.submissionGeneration>submission&&!owner.preparing&&!owner.remoteRunning);
  if(ready)turnGate.reconcile(selected.id,false);
  if(current())update(ready?'ready':agentPhase(),ready?'Unterbrochen · ich höre zu':'Warte auf bestätigte Unterbrechung');return {...snapshot(),ready};
 }
 const owner=handoffCanSubmit();clearApproval();generation++;rendererInput.capturing=false;if(owner&&conversation?.busy)turnGate.suppress(conversation.session?.id);sttAbort?.abort();stopSpeech();if(owner)await conversation?.interrupt();update(conversation?.busy?agentPhase():'ready',!owner?'Lokale Ausgabe gestoppt · Gespräch gehört zum anderen Gerät':conversation?.busy?'Warte auf bestätigte Unterbrechung':'Gestoppt');return snapshot();
}
function setPrivacy(enabled){clearApproval(enabled);config.privacyLocked=enabled;standbyActive=false;idleStandby.activity();generation++;if(enabled&&conversation?.busy)turnGate.suppress(conversation.session?.id);sttAbort?.abort();stopSpeech();save();emit({type:'privacy-state',locked:enabled});update(status,enabled?'Datenschutz aktiv · Mikrofon aus':'Datenschutz aufgehoben');return snapshot();}
async function submit(text,{captured,project}={}){
  if(typeof text!=='string'||!text.trim()||text.length>20000)throw Error('Auftrag fehlt oder ist zu lang.');
  const command=text.trim().toLocaleLowerCase('de-DE');
  if(/^(?:stopp|stop|stoppe alles|alles stoppen|not-aus)[.!]?$/.test(command))return interrupt();
  if(/^(?:datenschutz|privatmodus) (?:an|ein|aktivieren)[.!]?$/.test(command))return setPrivacy(true);
  access(captured);const target=handoffIntent(text);if(recallIntent(text)||target==='notebook')return handoff.requestRecall();if(target)return handoff.requestTransfer(target);if(!handoffCanSubmit()||handoffPendingCurrent())throw Error('Dieses Gespräch wird übergeben oder gehört zum anderen Gerät.');if(conversation.busy)throw Error('Ein Auftrag läuft. Bitte abschließen oder stoppen.');
  const prompt=linuxDeviceContext(device,notebookTools)+'\n\n'+(project?linuxProjectPrompt(projects,{...project,text},device):'Nutzerauftrag: '+text.trim());
  standbyActive=false;idleStandby.activity();
  activeTools.clear();stopSpeech();reply=new ReplyAccumulator();emit({type:'user',text});await conversation.submit(prompt,{speak:true,sessionId:captured?.sessionId,isCurrent:()=>!config.privacyLocked&&connected&&handoffCanSubmit()&&!handoffPendingCurrent()});update(agentPhase(),'Hermes denkt nach');return {ok:true};
}
function gatewayEvent(event){
  if(!conversation?.receive(event))return;
  if(['message.complete','error'].includes(event.type))remoteTerminalSequence++;
  const data=event.data||{};
  if(!handoffCanSubmit())return;
  if(!turnGate.receive(event)){if(['message.complete','error'].includes(event.type)){approval=null;update(conversation.busy?agentPhase():'ready',config.privacyLocked?'Auftrag beendet · Datenschutz aktiv':'Vorheriger Auftrag beendet · Ausgabe bleibt gestoppt');}return;}
  if(config.privacyLocked){if(['message.complete','error'].includes(event.type))update('ready','Auftrag beendet · Datenschutz aktiv');return;}
  if(event.type==='message.start'){reply=new ReplyAccumulator();buffer=new SentenceBuffer();update(agentPhase(),'Hermes denkt nach');}
  if(event.type==='message.delta'){reply.delta(data.text);emit({type:'reply',text:reply.text});for(const sentence of buffer.push(data.text||''))speak(sentence);}
  if(event.type==='message.interim'){reply.interim(data);emit({type:'reply',text:reply.text});if(data.already_streamed)speak(buffer.flush());else speak(data.text);buffer=new SentenceBuffer();}
  if(['tool.start','tool.end'].includes(event.type)){
    const name=String(data.name||data.tool||'Werkzeug'),explicit=data.tool_call_id||data.call_id||data.id;
    if(event.type==='tool.start')activeTools.set(String(explicit||'observed-'+(++toolSequence)),name);
    else{const id=explicit?String(explicit):[...activeTools].find(([_id,label])=>label===name||!data.name&&!data.tool&&activeTools.size===1)?.[0];if(id)activeTools.delete(id);}
    emit({type:event.type,text:name});update(agentPhase(),activeTools.size?[...activeTools.values()][0]:'Hermes denkt nach');
  }
  if(event.type==='message.complete'){activeTools.clear();const result=reply.complete(data);if(data.status!=='interrupted'&&data.status!=='error')speak(result.newText||buffer.flush());else stopSpeech();emit({type:'reply',text:reply.text});emit({type:'turn-end',text:data.status||'beendet'});approval=null;update(conversation.busy?agentPhase():'ready',conversation.error||'Bereit');}
  if(event.type==='error'){activeTools.clear();clearApproval();stopSpeech();update('error',conversation.error);}
}
async function connect(){
  if(connecting)return snapshot();requireLinuxReconnect({connected,busy:!!conversation?.busy});
  const previous=conversation,resume=previous?.session,wasDisconnected=!connected;
  connecting=true;clearApproval();generation++;gatewayId++;connected=false;update('connecting','Verbinde mit bestehendem Hermes');gateway?.close();
  const link=new Gateway({url:config.url,socketOptions:gatewayMapping?.socketOptions,fetcher:(url,options)=>authSession.fetch(url,{...options,credentials:'include'}),onEvent:event=>{if(gateway===link)gatewayEvent(event);}});gateway=link;
  link.on('disconnected',()=>{if(gateway!==link)return;clearApproval();connected=false;generation++;sttAbort?.abort();stopSpeech();update('offline',conversation?.busy?'Verbindung verloren · Auftragsergebnis unbekannt':'Hermes-Verbindung unterbrochen');});
  link.on('server-request',frame=>{
    if(gateway!==link)return;
    if(!handoffCanSubmit())return;
    const deny=()=>{try{link.respond(frame.id,frame.method==='approval'?{choice:'deny'}:frame.method==='clarify'?{answers:null}:{value:''});}catch{/* Transport close cannot revive or expose a stopped turn. */}};
    if(config.privacyLocked||!conversation?.session?.id||!conversation.busy||frame.params?.session_id!==conversation.session.id||!turnGate.receive({session_id:frame.params?.session_id,type:'server-request'})){deny();return;}
    if(!['approval','clarify'].includes(frame.method)){deny();return;}
    approval={...frame.params,id:frame.id,kind:frame.method,scope:{gatewayId,sessionId:frame.params.session_id,generation}};windowShell?.setPanel(true);update(frame.method==='approval'?'approval':'question','Hermes benötigt deine Antwort');
  });
  try{
    await link.connect();connected=true;conversation=new Conversation((method,params,timeout)=>link.request(method,params,timeout));const result=await link.json('/api/sessions?limit=100&order=recent');sessions=(result.sessions||[]).map(row=>({id:row.id,title:row.title||'Session',profile:row.profile||'default'}));
    const remembered=resume?null:resolveLinuxSession(readLinuxSession(sessionFile),sessions,config.url),target=resume?{id:resume.storedId,profile:resume.profile,title:resume.title}:remembered;
    if(target){const result=await conversation.select(target);turnGate.reconcile(resume?.id||conversation.session.id,result.running===true);rememberSession();update(conversation.busy?agentPhase():'ready',conversation.busy?'Wiederverbunden · derselbe Auftrag läuft noch':resume&&wasDisconnected?'Wiederverbunden · Laufstatus abgefragt; vorheriges Ergebnis prüfen':target.title);}else update('ready','Eigene Notebook-Session auswählen');
  }
  catch(error){link.close();connected=false;conversation=previous;update('offline',error.message);}finally{connecting=false;}runPendingEnrollment();return snapshot();
}
function configureAuth(){authSession=session.fromPartition('persist:hermes-linux-'+crypto.createHash('sha256').update(config.url).digest('hex').slice(0,12));}
function createHandoff(){
 handoff=createSessionHandoff({kind:'notebook',name:device,stateFile:path.join(LOCAL,'linux-handoff.json'),
  getState:()=>({profile:conversation?.session?.profile||'default',session:selectedStoredSession(),connected:connected&&!connecting,busy:localBusy(),privacyLocked:config.privacyLocked,generation,gatewayUrl:config.url}),
  request:async payload=>{const link=gateway,owner=generation;if(!connected||!link)throw Error('Hermes ist nicht verbunden.');const result=await handoffRequest(link,payload);if(link!==gateway||owner!==generation)throw Error('Gateway-Verbindung geändert.');return result;},
  selectSession:async row=>{const link=gateway,owner=generation;if(!connected||config.privacyLocked||localBusy())throw Error('Notebook ist nicht zur Übernahme bereit.');const known=sessions.find(value=>value.id===row.id&&value.profile===row.profile);if(!known)throw Error('Gespeicherte Session fehlt in diesem Profil.');clearApproval();stopSpeech();const result=await conversation.select(row);if(gateway!==link||generation!==owner||config.privacyLocked||!connected)throw Error('Notebook-Verbindung wurde geändert.');if(result.running===true)throw Error('Die ausgewählte Session läuft noch.');turnGate.reconcile(conversation.session.id,false);rememberSession();update('ready',row.title);},
  showHistory:async row=>{const link=gateway,owner=generation,selected=conversation?.session;if(!selected||selected.storedId!==row.id||selected.profile!==row.profile||config.privacyLocked)throw Error('Session wurde geändert.');const result=await link.request('session.history',{session_id:selected.id,profile:selected.profile});if(link!==gateway||owner!==generation||selected!==conversation.session||config.privacyLocked||!connected)throw Error('Verlauf wurde durch einen Sessionwechsel gestoppt.');if(!Array.isArray(result?.messages))throw Error('Gesprächsverlauf nicht bestätigt.');const messages=visibleHandoffHistory(result.messages);emit({type:'history',sessionId:row.id,messages:messages.slice(-40)});win?.showInactive();},
  onReceived:row=>{if(config.privacyLocked||!connected||!handoffCanSubmit()||row.id!==conversation?.session?.storedId||row.profile!==conversation.session.profile)return;standbyActive=false;idleStandby.activity();update();const text='Ich bin jetzt hier, Boss.',owner={sessionId:conversation.session.id,generation,storedSessionId:row.id,profile:row.profile},speech=speechGeneration;emit({type:'handoff-listen',...owner});emit({type:'reply',text});speak(text);void speechChain.then(()=>{if(speech!==speechGeneration||owner.generation!==generation||owner.sessionId!==conversation?.session?.id||owner.storedSessionId!==conversation.session.storedId||owner.profile!==conversation.session.profile||config.privacyLocked||standbyActive||!connected||!handoffCanSubmit())return;emit({type:'handoff-listen-ready',...owner});});},
  onState:()=>update(),onTransferred:row=>{if(conversation?.session?.storedId!==row.id||conversation.session.profile!==row.profile)return;generation++;rendererInput.capturing=false;stopSpeech();emit({type:'handoff-passive'});update('ready','Gespräch wurde am PC übernommen');}
 });return handoff.start();
}
async function login(){
  if(authWindow&&!authWindow.isDestroyed()){authWindow.focus();return;}
  const base=config.url,auth=authSession,origin=new URL(base).origin;authWindow=new BrowserWindow({width:660,height:760,title:'Lilith · Hermes-Anmeldung',autoHideMenuBar:true,webPreferences:{session:auth,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  authWindow.webContents.setWindowOpenHandler(({url})=>{if(new URL(url).protocol==='https:')void shell.openExternal(url);return {action:'deny'};});
  authWindow.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  const window=authWindow;let poll;
  const onClosed=()=>{clearInterval(poll);if(authWindow===window)authWindow=null;if(config.url===base&&authSession===auth)void connect().catch(error=>emit({type:'notice',message:error.message}));};window.on('closed',onClosed);
  try{await window.loadURL(base+'/login');}
  catch(error){clearInterval(poll);window.removeListener('closed',onClosed);if(authWindow===window)authWindow=null;if(!window.isDestroyed())window.destroy();const code=/ERR_[A-Z_]+/.exec(String(error.message))?.[0]||error.code||'Ladefehler';throw Error('Hermes-Anmeldung konnte nicht geöffnet werden ('+code+'). Gateway-Adresse und Notebook-Netzverbindung prüfen.');}
  if(window.isDestroyed()||config.url!==base||authSession!==auth)return;
  poll=setInterval(async()=>{if(window.isDestroyed()||config.url!==base||authSession!==auth){clearInterval(poll);return;}try{if((await auth.fetch(base+'/api/auth/me',{credentials:'include',signal:AbortSignal.timeout(3000)})).ok)window.close();}catch{}},2500);
}
async function projectAction(method,value){
  if(config.privacyLocked)throw Error('Datenschutz ist aktiv.');
  if(method==='project-snapshot')return projects.snapshot();if(method==='project-list')return projects.list(value);if(method==='project-read')return projects.read(value);
  if(method==='project-pick'){const captured=generation,result=await dialog.showOpenDialog(win,{title:'Lokales Notebook-Projekt auswählen',properties:['openDirectory']});if(config.privacyLocked||captured!==generation)throw Error('Ordnerauswahl gestoppt.');return result.canceled?projects.snapshot():projects.add(result.filePaths[0]);}
  if(method==='project-select')return projects.select(value.id);if(method==='project-remove')return projects.remove(value.id);if(method==='project-rename')return projects.rename(value.id,value.name);
  if(method==='project-command')return submit(value.text,{project:value});
  if(['graph-snapshot','intel-snapshot','craft-snapshot'].includes(method))return {ready:false,available:false,error:'Diese Desktop-Funktion ist auf diesem Linux-Client noch nicht eingerichtet.'};
  throw Error('Diese Funktion ist auf Linux noch nicht eingerichtet.');
}
function ensureWorkbench(){
  if(!workbench)workbench=createWorkbench({electron,root:ROOT,stateFile:path.join(LOCAL,'linux-workbench.json'),getSnapshot:snapshot,onCommand:text=>submit(text),onVisual:projectAction,onAction:async value=>{if(value.name==='privacy-lock')return setPrivacy(true);if(value.name==='privacy-unlock')return setPrivacy(false);if(['emergency-stop','standby'].includes(value.name))return interrupt();if(value.name==='status')return snapshot();throw Error('Diese lokale Funktion ist auf Linux noch nicht eingerichtet.');}});
  return workbench;
}
function linuxControlStatus(){
  const locked=config.privacyLocked,browser=locked?null:workbench?.browserState||{ready:false,url:'',title:'',loading:false,visible:false,tab:'console'};
  const selected=conversation?.session;
  return {status:locked?'privacy':status,connected,standby:{active:standbyActive,idleMinutes:config.idleStandbyMinutes},busy:!!conversation?.busy||transcribing,localBusy:localBusy(),privacyLocked:locked,device,pid:process.pid,
    session:!locked&&selected?{id:selected.id,storedId:selected.storedId,profile:selected.profile,title:selected.title}:null,
    engines:{...health},voiceReady:health.voice&&!!voiceClient,sttReady:health.stt,
    notebookTools:{configured:notebookTools.configured,connected:notebookTools.connected,enrolling:mcpEnrolling},
    workbench:{visible:!locked&&!!workbench?.visible,tab:locked?null:workbench?.activeTab||'console',browser}};
}
function requireLinuxControlAccess(captured){
  if(config.privacyLocked)throw Object.assign(Error('Datenschutz ist aktiv.'),{status:423});
  if(standbyActive)throw Object.assign(Error('Standby ist aktiv. Bitte auf den Orb klicken.'),{status:423});
  return access(captured);
}
async function linuxControlWorkbench(value){
  if(value.enabled)requireLinuxControlAccess();
  const captured={sessionId:conversation?.session?.id,generation},w=ensureWorkbench();
  if(value.agent){
    if(!value.enabled)return w.release(value.requestId);
    const result=await w.present({tab:value.url?'browser':value.tab||'console',...(value.url?{url:value.url}:{}),...(value.requestId?{requestId:value.requestId}:{}),reason:value.reason||'Lilith arbeitet hier'});
    requireLinuxControlAccess(captured);return result;
  }
  if(!value.enabled){w.hide();return {closed:true};}
  await w.show({tab:value.url?'browser':value.tab||'console',...(value.url?{url:value.url}:{})});requireLinuxControlAccess(captured);
  return {shown:w.visible===true,owner:'user',browser:w.browserState};
}
async function linuxControlBrowser(value){
  requireLinuxControlAccess();const captured={sessionId:conversation.session.id,generation};
  const result=await ensureWorkbench().controlBrowser(value);requireLinuxControlAccess(captured);return result;
}
function linuxControlClipboard(value){
  requireLinuxControlAccess();
  if(!handoffCanSubmit()||handoffPendingCurrent())throw Object.assign(Error('Dieses Gespräch wird übergeben oder gehört zum anderen Gerät.'),{status:423});
  const captured={sessionId:conversation.session.id,generation};
  try{
    if(value.action==='write'){
      clipboard.writeText(value.text,'clipboard');
      const verified=clipboard.readText('clipboard')===value.text;requireLinuxControlAccess(captured);
      if(!verified)throw Error('Clipboard verification failed');
      return {ok:true,verified:true,characters:value.text.length};
    }
    const raw=clipboard.readText('clipboard');requireLinuxControlAccess(captured);
    if(typeof raw!=='string'||!raw.length)throw Error('Clipboard contains no text');
    const maximum=value.maxChars||20000;
    return {ok:true,text:raw.slice(0,maximum),untrusted:true,truncated:raw.length>maximum,observedAt:new Date().toISOString()};
  }catch(error){
    if(error.status===423)throw error;
    throw Object.assign(Error('Zwischenablage konnte nicht sicher gelesen oder geschrieben werden. Bilder und Dateien werden nicht unterstützt.'),{status:503});
  }
}
async function startLinuxControlApi(){
  const token=crypto.randomBytes(32).toString('hex'),temporary=controlFile+'.'+crypto.randomUUID()+'.tmp';
  try{
    controlApi=await createControlApi({port:8874,token,enabledActions:['status','workbench','browser','clipboard'],readStatus:linuxControlStatus,onWorkbench:linuxControlWorkbench,onBrowser:linuxControlBrowser,onClipboard:linuxControlClipboard,onCommand:async()=>{throw Error('Diese Linux-Aktion ist nicht freigegeben.');}});
    fs.writeFileSync(temporary,JSON.stringify({url:'http://127.0.0.1:8874',token,pid:process.pid}),{mode:0o600,flag:'wx'});fs.renameSync(temporary,controlFile);controlToken=token;
  }catch{
    controlApi?.close();controlApi=null;emit({type:'notice',message:'Lokale Lilith-Steuerung auf 127.0.0.1:8874 konnte nicht gestartet werden. Werkstatt und Browser sind für Hermes noch nicht erreichbar.'});
  }finally{try{fs.unlinkSync(temporary);}catch{}}
}
function stopLinuxControlApi(){
  controlApi?.close();controlApi=null;
  if(!controlToken)return;
  try{const info=fs.lstatSync(controlFile);if(info.isFile()&&!info.isSymbolicLink()&&info.size<=4096){const value=JSON.parse(fs.readFileSync(controlFile,'utf8'));if(value.pid===process.pid&&value.token===controlToken)fs.unlinkSync(controlFile);}}catch{}
  controlToken=null;
}
async function inspectEngines(){
  const results=await Promise.allSettled(linuxEngineSpecs(ROOT).map(async spec=>({name:spec.name,ready:(await fetch(`http://127.0.0.1:${spec.port}${spec.health}`,{signal:AbortSignal.timeout(1000)})).ok})));
  results.forEach((result,index)=>health[linuxEngineSpecs(ROOT)[index].name]=result.status==='fulfilled'&&result.value.ready);update();
}
async function startEngines(){
  for(const spec of linuxEngineSpecs(ROOT)){
    try{if((await fetch(`http://127.0.0.1:${spec.port}${spec.health}`,{signal:AbortSignal.timeout(700)})).ok)continue;}catch{}
    if(!fs.existsSync(spec.exe)||!fs.existsSync(spec.args[spec.args.indexOf('--model')+1])){emit({type:'notice',message:spec.name+': lokale Linux-Binärdatei oder Modell fehlt'});continue;}
    const child=spawn(spec.exe,spec.args,{cwd:spec.cwd,stdio:['ignore','ignore','ignore']});children.add(child);child.on('error',error=>emit({type:'notice',message:spec.name+': '+error.message}));child.on('exit',()=>children.delete(child));
  }
  await inspectEngines();healthTimer=setInterval(()=>void inspectEngines(),5000);
}
const actions={
  activity:()=>{idleStandby.activity();return {ok:true};},
  'wake-resume':resumeLinuxStandby,
  handoff:target=>handoff.requestTransfer(target),
  recall:()=>{access();return handoff.requestRecall();},
  'input-state':value=>{if(!value||typeof value.capturing!=='boolean'||typeof value.speaking!=='boolean'||['live','microphoneOpen'].some(key=>value[key]!==undefined&&typeof value[key]!=='boolean')||value.sessionId!==conversation?.session?.id||value.generation!==generation)throw Error('Ungültiger Aufnahmezustand.');if(!config.privacyLocked&&!standbyActive&&(value.capturing&&!rendererInput.capturing||value.microphoneOpen&&!rendererInput.microphoneOpen))idleStandby.activity();rendererInput={capturing:value.capturing&&!config.privacyLocked&&!standbyActive,speaking:value.speaking&&!config.privacyLocked&&!standbyActive,live:value.live===true&&!config.privacyLocked&&!standbyActive,microphoneOpen:value.microphoneOpen===true&&!config.privacyLocked&&!standbyActive};return {ok:true};},
  panel:expanded=>windowShell.setPanel(expanded),
  snapshot,connect,login,select:async id=>{if(config.privacyLocked||!connected||!conversation)throw Error('Bitte verbinden und Datenschutz aufheben.');if(conversation.busy||conversation.selecting)throw Error('Ein Auftrag oder Sessionwechsel läuft noch.');const row=sessions.find(row=>row.id===id);if(!row)throw Error('Session nicht gefunden.');clearApproval();generation++;stopSpeech();const result=await conversation.select(row);turnGate.reconcile(conversation.session.id,result.running===true);rememberSession();update(conversation.busy?agentPhase():'ready',row.title);return snapshot();},
  submit:value=>submit(value?.text,{captured:value?.captured}),interrupt,privacy:enabled=>setPrivacy(enabled===true),workbench:()=>{if(config.privacyLocked)throw Error('Datenschutz ist aktiv.');return ensureWorkbench().show('console');},
  settings:async values=>{if(values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).length===1&&Object.hasOwn(values,'orbMotion')){config={...config,orbMotion:normalizeOrbMotion(values.orbMotion)};save();update();return snapshot();}if(connecting)throw Error('Die Verbindung wird gerade hergestellt. Bitte kurz warten.');if(connected&&conversation?.busy||transcribing)throw Error('Ein Auftrag läuft. Einstellungen anschließend ändern.');const next=validateLinuxSettings({...config,...values}),urlChanged=next.url!==config.url,voiceChanged=next.ttsUrl!==config.ttsUrl;if(urlChanged&&conversation?.busy)throw Error('Vor einem Gateway-Wechsel den bestehenden Auftragsstatus wieder verbinden.');gatewayMapping=linuxGatewayMapping(next.url,gatewayHostMap);if(voiceClient&&!voiceClient.profiles.some(profile=>profile.id===next.voice))throw Error('Diese Stimme ist nicht installiert.');clearApproval();config=next;idleStandby.activity();generation++;stopSpeech();save();if(voiceChanged&&voiceClient){voiceClient.url=config.ttsUrl;voiceClient.ready=null;}if(urlChanged){conversation=null;sessions=[];notebookTools={...notebookTools,connected:false};authWindow?.close();configureAuth();return connect();}if(values?.url&&!connected)return connect();update();return snapshot();},
  transcribe:async value=>{if(!value?.captured||typeof value.captured.sessionId!=='string'||!Number.isSafeInteger(value.captured.generation))throw Error('Aufnahmezuordnung fehlt.');access(value.captured);if(!handoffCanSubmit()||handoffPendingCurrent())throw Error('Dieses Gespräch wird übergeben oder gehört zum anderen Gerät.');if(transcribing||conversation.busy&&value.bargeIn!==true)throw Error('Ein Auftrag läuft.');const bytes=Buffer.from(String(value?.audio||''),'base64');if(bytes.length<44||bytes.length>8*1024*1024)throw Error('Ungültige Aufnahme.');idleStandby.activity();const captured=value.captured,controller=new AbortController();sttAbort=controller;transcribing=true;update('transcribing','Erkenne deine Sprache auf diesem Notebook');try{const text=await transcribeAudio(bytes,{url:config.sttUrl,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});access(captured);return text;}finally{transcribing=false;if(sttAbort===controller)sttAbort=null;update(conversation.busy?agentPhase():'ready',config.privacyLocked?'Datenschutz aktiv':'Bereit');}},
  audition:()=>{if(config.privacyLocked)throw Error('Datenschutz aktiv.');stopSpeech();speak('Ich bin Lilith. Ich bin auf deinem Notebook für dich da.');},
  'mcp-enroll':async()=>{if(config.privacyLocked||!connected||!gateway)throw Error('Bitte lokal an Hermes anmelden und Datenschutz aufheben.');if(mcpEnrolling)throw Error('Notebook-Werkzeuge werden bereits verbunden.');if(!notebookTools.configured)throw Error('Lokale Notebook-Werkzeuge sind noch nicht eingerichtet.');const link=gateway,owner=generation;const requireOwner=()=>{if(config.privacyLocked||!connected||gateway!==link||generation!==owner)throw Error('Notebook-Verbindung wurde geändert.');};mcpEnrolling=true;update();try{const result=await enrollLinuxMcp({url:process.env.LILITH_MCP_URL,tokenFile:process.env.LILITH_MCP_TOKEN_FILE,request:async(method,params)=>{requireOwner();const result=await link.request(method,params,60000);requireOwner();return result;}});requireOwner();notebookTools={configured:true,connected:true,detail:`Notebook-Werkzeuge verbunden · ${result.toolCount} Werkzeuge geprüft`};return {ok:true,toolCount:result.toolCount};}catch(error){notebookTools={...notebookTools,connected:false,detail:error.message};throw error;}finally{mcpEnrolling=false;update();}},
  answer:value=>{if(!connected||config.privacyLocked||!handoffCanSubmit())throw Error('Keine Antwort offen.');requireLinuxApprovalOwner(approval,value,{gatewayId,sessionId:conversation?.session?.id,generation});if(approval.kind==='approval'){if(!['once','deny'].includes(value?.choice))throw Error('Ungültige Freigabe.');gateway.respond(approval.id,{choice:value.choice});}else{const answers={};for(const question of (approval.questions||[])){const answer=value?.answers?.[question.qid];if(typeof answer!=='string'||answer.length>4000)throw Error('Bitte alle Rückfragen beantworten.');answers[question.qid]=answer;}gateway.respond(approval.id,{answers});}approval=null;update(agentPhase(),'Antwort gesendet');},quit:()=>app.quit()
};
if(process.platform!=='linux'&&!process.argv.includes('--linux-smoke'))throw Error('Diesen Einstieg ausschließlich unter Linux verwenden.');
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',(_event,argv)=>{win?.show();if(!argv?.includes('--enroll-mcp'))windowShell?.setPanel(true);if(argv?.includes('--enroll-mcp')){pendingEnrollment=true;if(connected&&!connecting)runPendingEnrollment();else if(!connecting)void connect().catch(error=>emit({type:'notice',message:error.message}));}if(argv?.includes('--login'))void login().catch(error=>emit({type:'notice',message:error.message}));});
  app.whenReady().then(async()=>{
    configureAuth();void createHandoff();const uiSession=session.fromPartition('persist:lilith-linux-ui');
    const permitted=(contents,permission,details)=>contents===win?.webContents&&contents?.mainFrame?.url===page&&permission==='media'&&details?.isMainFrame===true&&!config.privacyLocked&&Array.isArray(details.mediaTypes)&&details.mediaTypes.every(type=>type==='audio');
    uiSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(permitted(contents,permission,details)));
    uiSession.setPermissionCheckHandler((contents,permission,_origin,details)=>permitted(contents,permission,{...details,isMainFrame:details?.isMainFrame??true,mediaTypes:details?.mediaTypes||[details?.mediaType].filter(Boolean)}));
    windowShell=createLinuxOrbWindow({BrowserWindow,screen,root:ROOT,uiSession,onPanel:value=>{panelOpen=value;}});win=windowShell.win;
    win.on('close',event=>{if(!shuttingDown){event.preventDefault();windowShell.setPanel(false);}});
    win.webContents.on('context-menu',()=>Menu.buildFromTemplate([{label:'Gespräch & Audio',click:()=>windowShell.setPanel(true)},{label:'Werkstatt öffnen',enabled:!config.privacyLocked,click:()=>void actions.workbench().catch(error=>emit({type:'notice',message:error.message}))},{label:config.privacyLocked?'Datenschutz aufheben':'Datenschutz aktivieren',click:()=>setPrivacy(!config.privacyLocked)},{label:'Stopp',click:()=>void interrupt().catch(error=>emit({type:'notice',message:error.message}))},{type:'separator'},{label:'Lilith beenden',click:()=>app.quit()}]).popup({window:win}));
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',(event,url)=>{if(url!==page)event.preventDefault();});
    for(const [method,action]of Object.entries(actions))ipcMain.handle('linux:'+method,async(event,value)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==page)throw Error('Client-Zugriff verweigert.');return action(value);});
    await win.loadFile(path.join(ROOT,'ui/linux.html'));windowShell.setPanel(process.argv.includes('--panel'));win.show();await startLinuxControlApi();
    globalShortcut.register('Control+Alt+Space',()=>{win.show();emit({type:'toggle-record'});});globalShortcut.register('Control+Alt+W',()=>void actions.workbench().catch(error=>emit({type:'notice',message:error.message})));globalShortcut.register('Control+Alt+Escape',()=>void interrupt().catch(error=>emit({type:'notice',message:error.message})));
    idleStandby.activity();idleStandbyTimer=setInterval(idleStandbyTick,1000);idleStandbyTimer.unref?.();
    fs.writeFileSync(path.join(LOCAL,'linux-app.pid'),String(process.pid),{mode:0o600});void startEngines();if(!config.url.includes('hermes.invalid'))void connect().then(()=>{if(process.argv.includes('--login')&&!connected)void login().catch(error=>emit({type:'notice',message:error.message}));});
  }).catch(error=>{console.error(error.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{shuttingDown=true;stopLinuxControlApi();handoff?.close();globalShortcut.unregisterAll();try{rememberSession();}catch{/* The last confirmed selection is already saved; never reset it on quit. */}generation++;sttAbort?.abort();stopSpeech();clearInterval(healthTimer);clearInterval(idleStandbyTimer);gateway?.close();workbench?.destroy();for(const child of children)child.kill();});
}
