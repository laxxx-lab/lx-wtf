'use strict';
const {app,BrowserWindow,Tray,Menu,nativeImage,ipcMain,globalShortcut,Notification,session,shell,screen,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const readline=require('node:readline');
const {spawn}=require('node:child_process');
const {Gateway,validateGatewayUrl}=require('./gateway.cjs');
const {Conversation,SentenceBuffer}=require('./conversation.cjs');
const {createMonitorPolicy}=require('./monitor-policy.cjs');
const {createSystemSampler,germanAlert}=require('./system-monitor.cjs');
const {engineSpecs}=require('./engines.cjs');
const {matchWakePhrase,isWakeRequestCurrent}=require('./wake-phrase.cjs');
const {ReplyAccumulator}=require('./reply.cjs');
const ROOT=__dirname, LOCAL=path.join(ROOT,'.local');
fs.mkdirSync(LOCAL,{recursive:true});
app.setPath('userData',path.join(LOCAL,process.argv.includes('--smoke')?'smoke-data':'app-data'));
app.setName('Hermes Voice');
if(process.platform==='win32')app.setAppUserModelId('Hermes.Voice.Windows');
let config={url:'http://lilith.lx.local',voice:'dark',delivery:'normal',monitoring:true,proactive:true,speakAlerts:true,autoStart:false,wakeWord:true,bareNames:true,sessionId:null};
try { const saved=JSON.parse(fs.readFileSync(path.join(LOCAL,'settings.json'),'utf8'));config={...config,...saved}; }
catch {try {const saved=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'Hermes','connection.json'),'utf8'));if(saved.remote?.url)config.url=saved.remote.url;}catch{}}
let win,tray,authSession,gateway,conversation,loginWindow,interval,clarification=null;
let sample={},connected=false,status='offline',detail='Hermes verbinden',sessionRows=[],approval=null;
let speechChain=Promise.resolve(),speechGeneration=0,speechController=null,buffer=new SentenceBuffer(),reply=new ReplyAccumulator();
let alertQueue=[],pendingReconnect=false,shuttingDown=false,everConnected=false,ttsPending=0,clientSpeaking=false,clientListening=false,wakeChild=null,wakeReady=false,wakeTranscribing=false,lastWake=0,wakeGeneration=0;
const children=new Set(),policy=createMonitorPolicy(),sampleSystem=createSystemSampler();
const voicePrompts={
  sovereign:'A mature adult female native German speaker. Low-pitched, warm, slightly smoky and velvety voice. Calm, confident, sovereign presence, precise articulation and natural conversational rhythm. Restrained authority, elegant warmth, unhurried but concise. Studio quality, no exaggerated acting.',
  dark:'A mature adult female native German speaker. Deep, dark, rich contralto voice with a subtle smoky texture. Powerful, self-assured and grounded, controlled intensity and quiet authority. Clear precise German articulation, natural conversational delivery, warm undertone. Studio quality, no shouting or exaggerated acting.',
  playful:'An adult female native German speaker. Low to mid pitch, warm, velvety, slightly husky and smoky voice. Confident, intelligent and charming with a subtle cheeky smile, dry wit and lively natural intonation. Clear relaxed German articulation, affectionate warmth, conversational delivery. Studio quality, no childish or squeaky voice.'
};
function emit(type,data={}) {if(win&&!win.isDestroyed())win.webContents.send('companion:event',{type,...data});}
function state(next,message) {status=next;detail=message || '';const data={status,detail,busy:!!(conversation?.busy||conversation?.selecting),connected,session:conversation?.session||null,approval};emit('state',data);fs.writeFileSync(path.join(LOCAL,process.argv.includes('--smoke')?'smoke-status.json':'status.json'),JSON.stringify(data,null,2));}
function snapshot(){return {status,detail,connected,busy:!!(conversation?.busy||conversation?.selecting),session:conversation?.session||null,sessions:sessionRows,sample,settings:config,approval,wakeReady,voiceReady:fs.existsSync(path.join(ROOT,'runtime/voice/build/tts-server.exe')),sttReady:fs.existsSync(path.join(ROOT,'runtime/stt/models/ggml-large-v3-turbo.bin'))};}
function saveConfig(){fs.writeFileSync(path.join(LOCAL,'settings.json'),JSON.stringify(config,null,2));}
function stopSpeech(){speechGeneration++;speechController?.abort();speechController=null;emit('audio-stop');ttsPending=0;emit('speech-pending',{pending:0});buffer=new SentenceBuffer();speechChain=Promise.resolve();}
function speak(text,voice=config.voice,delivery=config.delivery){
  text=String(text).replace(/<think>[\s\S]*?<\/think>/g,'').replace(/```[\s\S]*?```/g,'').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/[*#`]/g,'').trim();
  if(!text)return;
  const generation=speechGeneration;
  ttsPending++;emit('speech-pending',{pending:ttsPending});
  speechChain=speechChain.catch(()=>{}).then(async()=>{
    if(generation!==speechGeneration)return;
    const controller=new AbortController();speechController=controller;
    const timer=setTimeout(()=>controller.abort(),90000);
    try{
      emit('audio-start',{generation,sampleRate:24000});
      let instructions=voicePrompts[voice];
      if(delivery==='whisper')instructions+=' Whisper softly with a close breathy intimate delivery, keeping clear words and the same mature female character.';
      if(delivery==='power')instructions=instructions.replace('no shouting or exaggerated acting','clear powerful projection')+' Speak with powerful energetic loud projection and strong emphasis, controlled urgency and clear diction.';
      const response=await fetch('http://127.0.0.1:8870/v1/audio/speech',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({input:text.slice(0,2500),voice:'',language:'German',instructions,response_format:'pcm',seed:42,max_new_tokens:1200})});
      if(!response.ok)throw new Error(`Lokale Stimme: HTTP ${response.status}`);
      for await(const chunk of response.body){if(generation!==speechGeneration)break;emit('audio-chunk',{generation,data:Buffer.from(chunk).toString('base64')});}
      emit('audio-end',{generation});
    }catch(error){if(error.name!=='AbortError')emit('notice',{message:'Die lokale Stimme ist nicht bereit: '+error.message});}
    finally{clearTimeout(timer);if(speechController===controller)speechController=null;if(generation===speechGeneration){ttsPending=Math.max(0,ttsPending-1);emit('speech-pending',{pending:ttsPending});}}
  });
}
function gatewayEvent(event){
  if(!conversation?.receive(event))return;
  const data=event.data;
  if(event.type==='message.start'){reply=new ReplyAccumulator();buffer=new SentenceBuffer();state('thinking','Hermes denkt');}
  if(event.type==='message.delta'){reply.delta(data.text);emit('reply',{text:reply.text});for(const sentence of buffer.push(data.text || ''))if(conversation.speakReply)speak(sentence);}
  if(event.type==='message.interim'){
    reply.interim(data);emit('reply',{text:reply.text});
    if(!data.already_streamed){if(conversation.speakReply)speak(data.text||'');}
    else{const suffix=buffer.flush();if(suffix&&conversation.speakReply)speak(suffix);}
    buffer=new SentenceBuffer();
  }
  if(event.type==='tool.start'){state('working',data.name || data.tool || 'Hermes arbeitet');emit('activity',{text:data.name || 'Werkzeug gestartet'});}
  if(event.type==='tool.end'){state('thinking','Hermes prüft das Ergebnis');}
  if(event.type==='message.complete'){
    approval=null;
    if(data.status==='error'||data.status==='interrupted'){stopSpeech();state(data.status==='error'?'error':'ready',conversation.error || 'Unterbrochen');}
    else{const final=reply.complete(data);emit('reply',{text:reply.text});if(final.newText){if(conversation.speakReply)speak(final.newText);}else{const suffix=buffer.flush();if(suffix&&conversation.speakReply)speak(suffix);}state('ready','Auftrag abgeschlossen');}
    emit('turn-end',{status:data.status||'complete'});
    if(Notification.isSupported()&&config.proactive&&typeof data.text==='string'&&data.text) new Notification({title:'Hermes · Auftrag abgeschlossen',body:data.text.slice(0,180),silent:true}).show();
    setTimeout(drainAlerts,1500);
  }
  if(event.type==='error'){stopSpeech();state('error',conversation.error);}
}
async function connect(){
  if(pendingReconnect)return;pendingReconnect=true;connected=false;state('connecting','Verbinde mit Hermes');
  try{
    gateway?.close();
    gateway=new Gateway({url:config.url,fetcher:(url,opts)=>authSession.fetch(url,{...opts,credentials:'include'}),onEvent:gatewayEvent});
    const thisGateway=gateway;
    gateway.on('disconnected',()=>{if(gateway!==thisGateway)return;connected=false;if(conversation)conversation.busy=false;stopSpeech();state('offline','Hermes-Verbindung unterbrochen');});
    gateway.on('server-request',frame=>{
      if(frame.method==='approval'){
        if(frame.params?.session_id!==conversation?.session?.id){gateway.respond(frame.id,{choice:'deny'});return;}
        approval={id:frame.id,...frame.params};state('approval','Hermes benötigt deine Freigabe');emit('approval',{approval});expand(true);
      }else if(frame.method==='clarify'&&frame.params?.session_id===conversation?.session?.id){
        clarification={id:frame.id,questions:(frame.params.questions||[]).slice(0,5)};state('question','Hermes hat eine Rückfrage');emit('clarify',{clarification});expand(true);
        for(const question of clarification.questions)speak(question.question);
      }else{gateway.respond(frame.id,frame.method==='clarify'?{answers:null}:{value:''});emit('notice',{message:'Hermes benötigt eine Eingabe in der Desktop-App: '+frame.method});}
    });
    await gateway.connect();connected=true;everConnected=true;
    conversation=new Conversation((method,params)=>gateway.request(method,params));
    const response=await gateway.json('/api/sessions?limit=100&order=recent');
    sessionRows=(response.sessions||[]).map(row=>({id:row.id,title:row.title||'Unbenannte Session',source:row.source||'',profile:row.profile||'default',message_count:row.message_count,last_active:row.last_active}));
    emit('sessions',{sessions:sessionRows});state('ready','Session auswählen');
    if(config.sessionId){const row=sessionRows.find(row=>row.id===config.sessionId);if(row)await selectSession(row.id);}
  }catch(error){connected=false;gateway?.close();state('offline',error.message);}
  finally{pendingReconnect=false;}
  return snapshot();
}
async function selectSession(id){
  const row=sessionRows.find(row=>row.id===id);if(!row)throw new Error('Diese Session ist nicht in der aktuellen Hermes-Liste.');
  stopSpeech();const pending=conversation.select(row);state('connecting','Session wird geöffnet');
  try{await pending;}catch(error){state('error',error.message);throw error;}
  config.sessionId=id;saveConfig();state(conversation.busy?'working':'ready',row.title);return snapshot();
}
async function submit(text,options){stopSpeech();reply=new ReplyAccumulator();emit('user',{text});await conversation.submit(text,options);state('thinking','Hermes denkt');}
function expand(open){
  if(!win)return;
  const bounds=win.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
  const width=open?460:190,height=open?740:230;
  const x=Math.max(area.x,Math.min(bounds.x,area.x+area.width-width)),y=Math.max(area.y,Math.min(bounds.y,area.y+area.height-height));
  win.setBounds({x,y,width,height});emit('expanded',{expanded:open});
}
async function login(){
  if(loginWindow&&!loginWindow.isDestroyed()){loginWindow.focus();return;}
  loginWindow=new BrowserWindow({width:660,height:760,title:'Hermes · Gateway-Anmeldung',autoHideMenuBar:true,webPreferences:{session:authSession,nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const origin=new URL(config.url).origin;
  loginWindow.webContents.setWindowOpenHandler(({url})=>{if(new URL(url).protocol==='https:')shell.openExternal(url);return {action:'deny'};});
  loginWindow.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();emit('notice',{message:'Externe Anmeldung bitte im normalen Hermes Desktop durchführen.'});}});
  loginWindow.on('closed',()=>{loginWindow=null;void connect();});
  await loginWindow.loadURL(config.url+'/login');
  const poll=setInterval(async()=>{if(!loginWindow||loginWindow.isDestroyed()){clearInterval(poll);return;}try{const resp=await authSession.fetch(config.url+'/api/auth/me',{credentials:'include',signal:AbortSignal.timeout(4000)});if(resp.ok){clearInterval(poll);loginWindow.close();}}catch{}},2500);
}
function runEngine(exe,args,cwd,name){
  if(!fs.existsSync(exe))return;
  const child=spawn(exe,args,{cwd,windowsHide:true,stdio:['ignore','ignore','pipe']});children.add(child);
  const output=fs.createWriteStream(path.join(LOCAL,name+'.log'),{flags:'a'});child.stderr.pipe(output);
  child.on('error',error=>emit('notice',{message:`${name}: ${error.message}`}));
  child.on('exit',()=>{children.delete(child);output.end();});
}
async function startEngines(){
  for(const spec of engineSpecs(ROOT)){
    try{const response=await fetch(`http://127.0.0.1:${spec.port}${spec.health}`,{signal:AbortSignal.timeout(700)});if(response.status<500)continue;}catch{}
    if(fs.existsSync(spec.args[1]))runEngine(spec.exe,spec.args,spec.cwd,spec.name);
  }
  startWake();
}
function startWake(){
  wakeGeneration++;
  if(wakeChild){wakeChild.kill();wakeChild=null;}wakeReady=false;
  if(!config.wakeWord){emit('wake-ready',{ready:false});return;}
  const python=path.join(ROOT,'runtime/voice/venv/Scripts/python.exe');
  if(!fs.existsSync(python))return;
  const args=[path.join(ROOT,'scripts/wake_listener.py'),'--model',path.join(ROOT,'runtime/wake/hey_hermes.tflite')];if(config.bareNames)args.push('--bare-names');
  const child=spawn(python,args,{cwd:ROOT,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','pipe']});wakeChild=child;children.add(child);
  const output=fs.createWriteStream(path.join(LOCAL,'wake.log'),{flags:'a'});child.stderr.pipe(output);
  const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{if(wakeChild!==child)return;let event;try{event=JSON.parse(line);}catch{return;}
    if(event.type==='ready'){wakeReady=true;emit('wake-ready',{ready:true,phrases:event.phrases});}
    if(event.type==='wake'&&config.wakeWord&&connected&&conversation?.session&&!conversation.busy&&!clientSpeaking&&Date.now()-lastWake>2000){lastWake=Date.now();emit('wake-detected',{phrase:event.phrase,sessionId:conversation.session.id});}
    if(event.type==='error')emit('notice',{message:'Aktivierungswort: '+event.message});
  });
  child.stdin.on('error',()=>{});child.on('error',error=>emit('notice',{message:'Aktivierungswort: '+error.message}));
  child.on('exit',()=>{children.delete(child);output.end();lines.close();if(wakeChild===child){wakeChild=null;wakeReady=false;emit('wake-ready',{ready:false});}});
}
async function tick(){
  try{
    sample=await sampleSystem();if(everConnected)sample.gatewayOnline=connected;emit('telemetry',{sample});
    if(everConnected&&!connected&&!pendingReconnect)void connect();
    if(!config.monitoring)return;
    for(const alert of policy.observe(sample)){
      const text=germanAlert(alert);emit('alert',{alert,text});
      if(Notification.isSupported())new Notification({title:'Hermes · Systemhinweis',body:text,silent:true}).show();
      if(config.proactive||config.speakAlerts){alertQueue.push({alert,text});alertQueue=alertQueue.slice(-10);}
    }
    await drainAlerts();
  }catch(error){emit('notice',{message:'Systemmessung: '+error.message});}
}
async function drainAlerts(){
  if(!alertQueue.length||conversation?.busy||ttsPending||clientSpeaking||clientListening)return;
  const alerts=alertQueue.splice(0);
  // Send measured facts only. Never autonomously delete, reboot or change settings.
  if(config.proactive&&connected&&conversation?.session){
    try{await submit('Lokaler Systemhinweis meines Windows-Assistenten: '+alerts.map(x=>x.text).join(' ')+' Bitte bewerte das kurz auf Deutsch und schlage bei Bedarf einen nächsten Schritt vor. Führe ohne weiteren Auftrag keine Änderungen, Löschungen oder Neustarts aus.',{speak:config.speakAlerts});}catch(error){emit('notice',{message:error.message});}
  }else if(config.speakAlerts)for(const item of alerts)speak(item.text);
}
function registerHandlers(){
  const actions={
    snapshot:()=>snapshot(),connect:()=>connect(),login:()=>login(),sessions:()=>sessionRows,
    select:(_e,id)=>selectSession(id),submit:(_e,value)=>typeof value==='string'?submit(value):submit(value?.text,{sessionId:value?.sessionId}),
    interrupt:async()=>{stopSpeech();await conversation?.interrupt();state('ready','Sprachausgabe beendet');},
    transcribe:async(_e,data)=>{
      if(data?.sessionId!==conversation?.session?.id)throw new Error('Die Session hat sich seit der Aufnahme geändert.');
      const bytes=Buffer.from(String(data?.audio||''),'base64');if(bytes.length<44||bytes.length>8*1024*1024||bytes.toString('ascii',0,4)!=='RIFF')throw new Error('Ungültige Mikrofonaufnahme.');
      state('transcribing','Erkenne deine Sprache lokal');
      const body=new FormData();body.set('file',new Blob([bytes],{type:'audio/wav'}),'command.wav');body.set('response_format','json');body.set('language','de');
      const response=await fetch('http://127.0.0.1:8871/inference',{method:'POST',body,signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error('Lokale Spracherkennung ist nicht bereit.');
      const result=await response.json();const text=String(result.text||'').trim();state('ready',text?'Sprache erkannt':'Keine Sprache erkannt');return text;
    },
    audition:(_e,value)=>{const voice=typeof value==='string'?value:value?.voice,delivery=value?.delivery||config.delivery;if(!voicePrompts[voice]||!['normal','whisper','power'].includes(delivery))throw new Error('Unbekannte Stimme oder Sprechweise.');stopSpeech();speak('Ich bin da. Sag mir, was heute anliegt. Ich behalte den Überblick und kümmere mich um die nächsten Schritte.',voice,delivery);},
    settings:async(_e,values)=>{
      if(values?.approvalChoice){if(!approval)throw new Error('Keine Freigabe offen.');if(!['once','deny'].includes(values.approvalChoice))throw new Error('Unbekannte Freigabe.');gateway.respond(approval.id,{choice:values.approvalChoice});approval=null;state('working','Hermes setzt fort');return snapshot();}
      const oldUrl=config.url,oldWake=config.wakeWord,oldBare=config.bareNames;
      if(typeof values?.url==='string')config.url=validateGatewayUrl(values.url);
      if(Object.hasOwn(voicePrompts,values?.voice))config.voice=values.voice;
      if(['normal','whisper','power'].includes(values?.delivery))config.delivery=values.delivery;
      for(const key of ['monitoring','proactive','speakAlerts','autoStart','wakeWord','bareNames'])if(typeof values?.[key]==='boolean')config[key]=values[key];
      saveConfig();app.setLoginItemSettings({openAtLogin:config.autoStart,path:process.execPath,args:[ROOT]});
      if(oldWake!==config.wakeWord||oldBare!==config.bareNames)startWake();
      if(oldUrl!==config.url){authSession=session.fromPartition('persist:hermes-voice-'+crypto.createHash('sha256').update(config.url).digest('hex').slice(0,12));config.sessionId=null;saveConfig();await connect();}
      return snapshot();
    },
    'wake-feed':(_e,data)=>{if(!config.wakeWord||!wakeReady||clientSpeaking||conversation?.busy)return;const bytes=Buffer.from(String(data||''),'base64');if(bytes.length>8192||bytes.length%2)throw new Error('Ungültiges Aktivierungswort-Audio.');if(wakeChild?.stdin.writable&&wakeChild.stdin.writableLength<16000)wakeChild.stdin.write(bytes);},
    'wake-utterance':async(_e,data)=>{
      if(!config.wakeWord||!conversation?.session||conversation.busy||clientSpeaking||wakeTranscribing||Date.now()-lastWake<2000)return;
      const bytes=Buffer.from(String(data||''),'base64');if(bytes.length<44||bytes.length>600000||bytes.toString('ascii',0,4)!=='RIFF')return;
      wakeTranscribing=true;
      const request={generation:wakeGeneration,sessionId:conversation.session.id};
      const current=()=>({generation:wakeGeneration,sessionId:conversation?.session?.id,enabled:config.wakeWord,connected,busy:conversation?.busy||conversation?.selecting,speaking:clientSpeaking||ttsPending>0});
      try{
        const body=new FormData();body.set('file',new Blob([bytes],{type:'audio/wav'}),'wake.wav');body.set('response_format','json');body.set('language','de');
        const response=await fetch('http://127.0.0.1:8871/inference',{method:'POST',body,signal:AbortSignal.timeout(10000)});
        if(!response.ok||!isWakeRequestCurrent(request,current()))return;const result=await response.json();
        if(!isWakeRequestCurrent(request,current()))return;
        const match=matchWakePhrase(result.text,config.bareNames);
        if(match&&Date.now()-lastWake>=2000){lastWake=Date.now();emit('wake-detected',{...match,sessionId:request.sessionId});}
      }catch{/* A missing fallback doesn't disable the fast local detector. */}
      finally{wakeTranscribing=false;}
    },
    'client-state':(_e,value)=>{clientSpeaking=value?.speaking===true;clientListening=value?.listening===true;},
    answer:(_e,answers)=>{
      if(!clarification)throw new Error('Keine Rückfrage offen.');const result={};
      for(const q of clarification.questions){const value=answers?.[q.qid];if(typeof value!=='string'||value.length>10000)throw new Error('Bitte alle Rückfragen beantworten.');result[q.qid]=value;}
      gateway.respond(clarification.id,{answers:result});clarification=null;state('working','Hermes setzt fort');
    },
    expand:(_e,open)=>expand(!!open),
    move:(_e,point)=>{if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return;const area=screen.getDisplayNearestPoint(point).workArea,b=win.getBounds();win.setPosition(Math.round(Math.max(area.x,Math.min(point.x,area.x+area.width-b.width))),Math.round(Math.max(area.y,Math.min(point.y,area.y+area.height-b.height))));},
    quit:()=>app.quit()
  };
  for(const [name,fn]of Object.entries(actions))ipcMain.handle('companion:'+name,async(event,...args)=>{
    if(event.sender!==win?.webContents||!event.senderFrame?.url.startsWith('file://'))throw new Error('Unbekannter Client.');
    try{return await fn(event,...args);}catch(error){emit('notice',{message:error.message});if(name==='submit'||name==='transcribe')state('error',error.message);throw error;}
  });
}
app.on('before-quit',()=>{shuttingDown=true;clearInterval(interval);stopSpeech();gateway?.close();globalShortcut.unregisterAll();for(const child of children)child.kill();});
if(!app.requestSingleInstanceLock()){app.quit();}else{
  app.on('second-instance',()=>{win?.show();expand(true);});
  app.whenReady().then(async()=>{
    if(!process.argv.includes('--smoke'))fs.writeFileSync(path.join(LOCAL,'app.pid'),String(process.pid));
    authSession=session.fromPartition('persist:hermes-voice-'+crypto.createHash('sha256').update(config.url).digest('hex').slice(0,12));
    authSession.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
    const area=screen.getPrimaryDisplay().workArea;
    win=new BrowserWindow({width:190,height:230,x:area.x+area.width-215,y:area.y+area.height-255,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,show:false,webPreferences:{preload:path.join(ROOT,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
    session.defaultSession.setPermissionRequestHandler((web,permission,callback)=>callback(permission==='media'&&web===win.webContents&&web.getURL().startsWith('file://')));
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.on('close',event=>{if(!shuttingDown){event.preventDefault();win.hide();}});
    registerHandlers();await win.loadFile(path.join(ROOT,'ui/index.html'));win.show();
    const orbData=await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.getElementById("neural").toDataURL("image/png")))))');
    const icon=nativeImage.createFromDataURL(orbData).resize({width:32,height:32});
    const png=icon.toPNG(),ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=32;ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);fs.writeFileSync(path.join(LOCAL,'app.ico'),Buffer.concat([ico,png]));
    tray=new Tray(icon);tray.setToolTip('Hermes Voice · Ctrl+Alt+Space');
    tray.setContextMenu(Menu.buildFromTemplate([{label:'Hermes anzeigen',click:()=>{win.show();expand(true);}},{label:'Live-Gespräch · Ctrl+Alt+Space',click:()=>{win.show();emit('toggle-mic');}},{label:'Mikrofon und Stimme aus',click:()=>{stopSpeech();emit('mic-off');}},{label:'Systemüberwachung',type:'checkbox',checked:config.monitoring,click:item=>{config.monitoring=item.checked;saveConfig();}},{type:'separator'},{label:'Hermes beenden',click:()=>app.quit()}]));
    tray.on('click',()=>{win.show();expand(true);});
    globalShortcut.register('Control+Alt+Space',()=>{win.show();emit('toggle-mic');});
    if(process.argv.includes('--expanded'))expand(true);
    void startEngines();void connect().then(()=>{if(process.argv.includes('--login')&&!connected)void login();});void tick();interval=setInterval(()=>void tick(),15000);
    if(process.argv.includes('--smoke'))setTimeout(async()=>{expand(true);await new Promise(resolve=>setTimeout(resolve,1000));const image=await win.webContents.capturePage();fs.writeFileSync(path.join(LOCAL,'app-smoke.png'),image.toPNG());fs.writeFileSync(path.join(LOCAL,'smoke.json'),JSON.stringify(snapshot(),null,2));app.quit();},6500);
  });
}
