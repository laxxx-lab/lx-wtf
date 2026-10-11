(() => {
  'use strict';
  const bridge=window.workbench,$=id=>document.getElementById(id),tabs=['system','console','browser','context','graph','intel','artcraft'];
  let current={},activeTab='system',pending=false,lastEvents='',noticeTimer,animation=null;
  let editingRoutine=null,routineDirty=false,projectDirty=false,lastContextRows='',lastTaskRows='',lastRoutineRows='',lastLogs='',lastOperationRows='',lastSource='';
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const orb=new window.HermesOrb.OrbRenderer($('reactor'),{reducedMotion:reduced});
  const phases={offline:'OFFLINE',ready:'BEREIT',listening:'HÖRT ZU',thinking:'DENKT',working:'ARBEITET',connecting:'VERBINDET',transcribing:'TRANSKRIBIERT',approval:'FREIGABE',question:'RÜCKFRAGE',error:'FEHLER'};
  function notice(message){$('notice').textContent=String(message||'');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').textContent='',7000);}
  async function invoke(method,payload){try{return await bridge.invoke(method,payload);}catch(error){notice(error.message||'Die Aktion konnte nicht ausgeführt werden.');return null;}}
  const graphView=window.ProjectGraphView?.mount({container:$('project-graph-panel'),invoke:(method,payload)=>bridge.invoke(method,payload),notice});
  const intelView=window.OsirisView?.mount({container:$('osiris-panel'),invoke:(method,payload)=>bridge.invoke(method,payload),notice});
  let lastCraft={};
  const craftView=window.ArtcraftView?.mount({container:$('artcraft-panel'),invoke:(method,payload)=>bridge.invoke(method,payload),notice});
  function setTab(tab){
    if(!tabs.includes(tab))return;if(activeTab==='graph'&&tab!=='graph')graphView?.cancelGesture?.();activeTab=tab;
    for(const name of tabs){$(name).hidden=name!==tab;$('tab-'+name).setAttribute('aria-selected',String(name===tab));$('tab-'+name).tabIndex=name===tab?0:-1;}
    $('browser-caption').hidden=tab!=='browser';
  }
  function metric(name,value,unit='%'){
    const valid=Number.isFinite(value),node=$(name+'-value');node.replaceChildren();
    node.append(document.createTextNode(valid?(unit==='%'?String(Math.round(value)):value.toFixed(1)):'—'));
    const suffix=document.createElement('small');suffix.textContent=unit;node.append(suffix);
    $(name+'-meter').style.width=(valid?Math.max(0,Math.min(100,value)):0)+'%';
  }
  function renderEvents(events=[]){
    const fingerprint=JSON.stringify(events);if(fingerprint===lastEvents)return;lastEvents=fingerprint;
    const list=$('events'),atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<60;
    const fragment=document.createDocumentFragment();
    if(!events.length){const empty=document.createElement('div');empty.className='console-empty';const title=document.createElement('p');title.textContent='Noch keine Aktivität.';const hint=document.createElement('small');hint.textContent='Hier erscheinen echte Aufträge, Werkzeugschritte und Antworten dieser Session.';empty.append(title,hint);fragment.append(empty);}
    for(const event of events.slice(-200)){
      const row=document.createElement('article');row.className='event '+event.type;
      const time=document.createElement('time');time.textContent=new Date(event.time).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const label=document.createElement('span');label.className='event-label';label.textContent={user:'DU',reply:'LILITH',acknowledgement:'LILITH',tool:'WERKZEUG',error:'HINWEIS','turn-end':'ABSCHLUSS'}[event.type]||'EREIGNIS';
      const body=document.createElement('p');body.textContent=event.text;row.append(time,label,body);fragment.append(row);
    }
    list.replaceChildren(fragment);$('event-count').textContent=events.length+' EREIGNISSE';if(atBottom)list.scrollTop=list.scrollHeight;
  }
  function renderGesture(value){if(!value?.enabled||!value.ready)graphView?.cancelGesture?.();$('gesture-status').textContent=!value?.enabled?'GESTEN AUS':value.ready?(value.label||'GESTEN BEREIT').toUpperCase():'GESTEN WARTEN';}
  function node(tag,text,className){const value=document.createElement(tag);if(text!==undefined)value.textContent=String(text);if(className)value.className=className;return value;}
  function timeLabel(timestamp){return Number.isFinite(timestamp)?new Date(timestamp).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'—';}
  function runningTask(){return (current.tasks||[]).find(task=>task.status==='running')||null;}
  function renderActivity(){
    const task=runningTask(),jobs=current.jobQueue?.jobs||[],job=jobs.find(value=>value.status==='running'||value.status==='outcome-unknown'),latest=task||(!current.busy&&!job?(current.tasks||[])[0]:null),hud=current.hud||{},locked=current.privacyLocked===true,presentation=current.presentation||{};
    const attention=!locked&&(current.jobQueue?.blocked||['approval','question','error'].includes(current.status)),active=!locked&&(current.busy||task||job?.status==='running');
    $('mission-bar').dataset.state=attention?'attention':active?'active':'idle';
    $('mission-title').textContent=locked?'Dein privater Raum.':task?.title||job?.title||((active||attention)&&hud.title?hud.title:attention?'Deine Aufmerksamkeit wird gebraucht.':presentation.owner==='agent'&&presentation.reason?presentation.reason:current.connected?'Bereit für deinen nächsten Schritt.':'Hermes verbinden, dann geht es los.');
    const steps=(latest?.tools?.length?latest.tools.map(tool=>({label:tool.name,status:tool.status})):hud.steps||[]).slice(-5);
    const liveStep=steps.findLast(step=>['running','working','started','pending'].includes(step.status));
    $('mission-detail').textContent=locked?'Sensoren und Kontexteingaben sind gesperrt.':attention?(job?.reason||current.detail||'Deine Aufmerksamkeit wird gebraucht.'):liveStep?.label||current.detail||(active?'Lilith bearbeitet deinen Auftrag.':'Was möchtest du heute erledigen?');
    $('presentation-owner').textContent=locked?'PRIVATER ARBEITSBEREICH':presentation.owner==='agent'?'LILITH ARBEITET':'DEINE WERKSTATT';
    $('presentation-reason').textContent=locked?'':presentation.reason||'';$('presentation-reason').hidden=locked||presentation.owner!=='agent'||!presentation.reason;
    if(!locked&&current.jobQueue?.blocked)$('phase').textContent='ERGEBNIS OFFEN';
    $('task-jump').disabled=locked||!(task||job||current.busy||(current.events||[]).length);
    $('activity-state').textContent=locked?'PRIVAT':attention?'AUFMERKSAMKEIT':active?'IN ARBEIT':latest?.status==='agent-finished'?'AGENT BEENDET':'BEREIT';
    $('activity-title').textContent=locked?'Datenschutz ist aktiv':task?.title||job?.title||latest?.title||(active?hud.title:'Noch kein Auftrag')||'Aktueller Auftrag';
    const completed=latest?.completedTools??hud.completedTools,total=latest?.toolCount;
    $('activity-progress').textContent=locked?'Freigaben bleiben unter deiner Kontrolle.':job?.status==='outcome-unknown'?'Ergebnis unbekannt. Remote-Status zuerst prüfen.':Number.isFinite(total)&&total>0&&Number.isFinite(completed)?completed+' von '+total+' Werkzeugschritten beendet.':Number.isFinite(completed)&&completed>0?completed+' Werkzeugschritte beendet.':active?'Warte auf den nächsten beobachteten Schritt.':'Schritte erscheinen, sobald Lilith arbeitet.';
    const observed=steps.length?steps:(current.events||[]).filter(event=>event.type==='tool').slice(-3).map(event=>({label:event.text,status:'observed'}));
    $('activity-steps').replaceChildren(...(locked?[]:observed).map(step=>{const row=node('li'),done=['done','complete','completed','success','ok','finished','tool.end'].includes(step.status),failed=['error','failed','interrupted','disconnected'].includes(step.status),running=['running','working','started','pending'].includes(step.status);row.dataset.state=done?'done':failed?'attention':running?'active':'observed';row.append(node('strong',String(step.label||'Werkzeugschritt').slice(0,180)),node('small',done?'Beendet':failed?'Hinweis':running?'Läuft':'Beobachtet'));return row;}));
    $('activity-hint').textContent=latest?.status==='agent-finished'?'Der Agent hat seinen Turn beendet. Werkzeugbelege stehen im Lagebild.':'Der Verlauf zeigt beobachtete Werkzeugschritte.';
  }
  function renderSource(){
    const content=current.privacyLocked?null:current.currentContent,key=JSON.stringify(content||null);if(key===lastSource)return;lastSource=key;
    const value=typeof content?.text==='string'?content.text.slice(0,12000):'',valid=!!value,observed=typeof content?.observedAt==='string'?Date.parse(content.observedAt):content?.observedAt;
    for(const place of ['console','context']){const prefix='source-'+place;$(prefix).hidden=!valid;$(prefix+'-details').open=false;$(prefix+'-title').textContent=valid?[content.source?.app||({clipboard:'Zwischenablage',window:'Fensterinhalt'})[content.kind]||'Gelesener Inhalt',content.source?.title].filter(Boolean).join(' · '):'Aktuell gelesener Inhalt';$(prefix+'-meta').textContent=valid?[timeLabel(observed),content.truncated||content.text.length>value.length?'AUSZUG':'EXPLIZIT GELESEN'].join(' · '):'';$(prefix+'-text').textContent=value;}
  }
  async function jumpToTask(){
    if($('task-jump').disabled)return;const task=runningTask(),appId=task?.appId,fromTab=activeTab;
    if(appId){const craft=await invoke('craft-snapshot');if(current.privacyLocked||activeTab!==fromTab||runningTask()?.id!==task.id)return;if(craft?.apps)lastCraft=craft;if(lastCraft.apps?.some(app=>app.id===appId&&app.running)){const result=await invoke('craft-select',{appId});if(current.privacyLocked||activeTab!==fromTab||runningTask()?.id!==task.id)return;if(result)craftView?.update({...result,connected:current.connected,busy:current.busy,privacyLocked:current.privacyLocked,tasks:current.tasks,teach:current.teach,windowVisible:current.visible});await invoke('tab','artcraft');return;}}
    await invoke('tab','console');
  }
  function privacy(snapshot){
    const locked=snapshot.privacyLocked===true;
    if(locked)graphView?.cancelGesture?.();
    $('privacy-state').textContent=locked?'DATENSCHUTZ AKTIV':'LOKALE KONTROLLE';$('privacy-detail').textContent=locked?'Mikrofon, Kamera, Bildschirm und Kontext sind gesperrt.':'Sensoren bleiben unter deiner Kontrolle.';
    for(const id of ['privacy-control','privacy-control-context']){$(id).textContent=locked?'Lokal entsperren':'Datenschutz sperren';$(id).dataset.action=locked?'privacy-unlock':'privacy-lock';}
    $('context-enabled').disabled=locked;$('project-name').disabled=locked;$('logs-pick').disabled=locked;
  }
  function renderContext(snapshot){
    const context=snapshot.context||{},foreground=context.foreground,locked=snapshot.privacyLocked===true;
    $('context-enabled').checked=context.enabled===true;
    if(!projectDirty&&document.activeElement!==$('project-name'))$('project-name').value=context.project||'';
    $('context-state').textContent=locked?'DATENSCHUTZ AKTIV':context.enabled?'BEOBACHTUNG AKTIV':'BEOBACHTUNG AUS';$('context-state').classList.toggle('active',context.enabled===true);
    $('context-app').textContent=foreground?.excluded?'Sensibles Fenster ausgeblendet':foreground?.app||'Nicht beobachtet';
    $('context-window').textContent=foreground?.excluded?'Dieser Fenstertitel wird nicht gespeichert.':foreground?.windowTitle||(!context.enabled?'Aktiviere den Kontext, wenn Lilith dein aktuelles Arbeitsfenster kennen soll.':'Warte auf die nächste Fensterbeobachtung.');
    $('context-updated').textContent=Number.isFinite(foreground?.timestamp)?'BEOBACHTET '+timeLabel(foreground.timestamp):'KEINE BEOBACHTUNG';
    const logs=context.logPaths||[],logKey=JSON.stringify(logs);
    if(logKey!==lastLogs){lastLogs=logKey;$('log-list').replaceChildren(...logs.map(file=>{const row=node('li'),label=node('span',file),remove=node('button','×');remove.type='button';remove.setAttribute('aria-label','Log entfernen: '+file);remove.addEventListener('click',()=>invoke('action',{name:'context-settings',values:{logPaths:(current.context?.logPaths||[]).filter(value=>value!==file)}}));row.append(label,remove);return row;}));if(!logs.length)$('log-list').append(node('li','Keine Logs ausgewählt.','context-empty'));}
    const events=context.events||[],eventKey=JSON.stringify(events);
    if(eventKey!==lastContextRows){lastContextRows=eventKey;$('context-events').replaceChildren(...events.map(event=>{const row=node('article',undefined,'context-event '+event.type),heading=node('div'),label=node('strong',{'window':'Fenster','build-error':'Build / Test fehlgeschlagen','build-success':'Build / Test erfolgreich','task-start':'Auftrag','task-end':'Abschluss'}[event.type]||'Beobachtung');heading.append(node('time',timeLabel(event.timestamp)),label);row.append(heading,node('p',event.summary));if(event.source||event.project)row.append(node('small',[event.project,event.source].filter(Boolean).join(' · ')));return row;}));if(!events.length)$('context-events').append(node('p','Noch keine Beobachtungen gespeichert.','context-empty'));}
    $('context-event-count').textContent=events.length+' BEOBACHTUNGEN';
    const tasks=snapshot.tasks||[],taskKey=JSON.stringify(tasks);
    if(taskKey!==lastTaskRows){lastTaskRows=taskKey;$('task-list').replaceChildren(...tasks.map(task=>{const row=node('article',undefined,'task-row '+task.status),heading=node('div'),status=node('span',{running:'Läuft','agent-finished':'Agent beendet',error:'Fehler',interrupted:'Unterbrochen',disconnected:'Verbindung verloren'}[task.status]||'Unbekannt','task-status');heading.append(node('strong',task.title),status);row.append(heading,node('small',timeLabel(task.startedAt)+' · '+(task.completedTools||0)+' / '+(task.toolCount||0)+' beobachtete Werkzeuge'));if(task.summary)row.append(node('p',task.summary));const evidence=(task.evidence||[]).filter(item=>item.scope==='tool');if(evidence.length){row.append(node('span','Werkzeugwirkung bestätigt','tool-proof'));for(const item of evidence)row.append(node('small',item.detail));}else row.append(node('small','Ergebnis nicht unabhängig bestätigt.','unverified'));return row;}));if(!tasks.length)$('task-list').append(node('p','Noch kein Auftrag beobachtet.','context-empty'));}
    $('task-count').textContent=tasks.length+' AUFTRÄGE';
    const routines=snapshot.routines||[],routineKey=JSON.stringify(routines);
    if(routineKey!==lastRoutineRows){lastRoutineRows=routineKey;$('routine-list').replaceChildren(...routines.map(routine=>{const button=node('button',routine.name);button.type='button';button.classList.toggle('selected',editingRoutine===routine.id);button.addEventListener('click',()=>editRoutine(routine));return button;}));if(!routines.length)$('routine-list').append(node('p','Noch kein Ablauf gespeichert.','context-empty'));}
    updateRoutineButtons();
  }
  function renderOperations(snapshot){
    const queue=snapshot.jobQueue||{},awareness=snapshot.awareness||{},locked=snapshot.privacyLocked===true,jobs=Array.isArray(queue.jobs)?queue.jobs:[],cards=Array.isArray(awareness.cards)?awareness.cards:[];
    $('job-queue-state').textContent=locked?'DATENSCHUTZ AKTIV':queue.blocked?'ERGEBNIS ZUERST PRÜFEN':queue.held?'WARTESCHLANGE ANGEHALTEN':'WARTESCHLANGE BEREIT';$('job-resume').hidden=!queue.held;$('job-resume').disabled=locked||queue.blocked;$('job-queue-count').textContent=jobs.length+' AUFTRÄGE';
    $('awareness-project').textContent=awareness.project?.name||'Kein Projekt zugeordnet';$('awareness-confidence').textContent=({manual:'VON DIR GESETZT',registered:'AUS REGISTRIERTEM PROJEKT',unknown:'ZUORDNUNG OFFEN'})[awareness.project?.confidence]||'ZUORDNUNG OFFEN';
    const fingerprint=JSON.stringify({jobs,cards,locked});if(fingerprint===lastOperationRows)return;lastOperationRows=fingerprint;
    const actionButton=(label,method,id)=>{const button=node('button',label);button.type='button';button.disabled=locked;button.addEventListener('click',()=>invoke(method,{id}));return button;};
    $('job-queue-list').replaceChildren();if(!jobs.length)$('job-queue-list').append(node('p','Noch keine Aufträge in der Warteschlange.','context-empty'));
    for(const job of jobs.slice().reverse()){
      const row=node('article',undefined,'queue-row '+job.status),heading=node('div',undefined,'queue-row-heading'),actions=node('div',undefined,'queue-actions');heading.append(node('strong',job.title||'Auftrag'),node('span',({queued:'Wartet',running:'Läuft','agent-finished':'Agent beendet',completed:'Ergebnis bestätigt',error:'Fehler',paused:'Angehalten',cancelled:'Abgebrochen','outcome-unknown':'Ergebnis unbekannt'})[job.status]||'Status unbekannt'));row.append(heading);
      if(job.reason)row.append(node('p',job.reason));if(job.summary)row.append(node('p',job.summary));row.append(node('small',(job.attempts||0)+' gestartete Versuche'));
      if(job.status==='outcome-unknown')actions.append(actionButton('Remote-Status prüfen','job-reconcile',job.id));
      if(['paused','error'].includes(job.status))actions.append(actionButton('Erneut versuchen','job-retry',job.id));
      if(['queued','paused','error','running'].includes(job.status))actions.append(actionButton('Abbrechen','job-cancel',job.id));
      row.append(actions);$('job-queue-list').append(row);
    }
    $('awareness-cards').replaceChildren();if(!cards.length)$('awareness-cards').append(node('p',locked?'Hinweise pausieren im Datenschutzmodus.':'Aktuell keine Hinweise mit Handlungsbedarf.','context-empty'));
    for(const card of cards){const row=node('article',undefined,'awareness-card '+card.kind),actions=node('div',undefined,'queue-actions');row.append(node('strong',card.title),node('p',card.detail));if(card.source)row.append(node('small',card.source));if(card.actionLabel)actions.append(actionButton(card.actionLabel,'awareness-action',card.id));actions.append(actionButton('Ausblenden','awareness-dismiss',card.id));row.append(actions);$('awareness-cards').append(row);}
  }
  function renderVoiceTiming(value){
    const summary=value?.summary||{},stages=[['firstAudioMs','Sprechende → erstes hörbares Audio'],['transcribeMs','Transkription'],['hermesFirstTokenMs','Hermes → erstes Textstück'],['ttsFirstPcmMs','Sprachsynthese → erster Audioblock'],['endToEndMs','Aufnahmeende → Wiedergabeende']],rows=[];
    for(const [key,label]of stages){const measured=summary[key];if(!measured)continue;const row=node('tr');row.append(node('th',label),node('td',String(measured.count)),node('td',Math.round(measured.p50)+' ms'),node('td',Math.round(measured.p95)+' ms'));rows.push(row);}
    if(!rows.length){const row=node('tr'),cell=node('td','Noch keine Messungen.','timing-empty');cell.setAttribute('colspan','4');row.append(cell);rows.push(row);}$('voice-timing-rows').replaceChildren(...rows);
  }
  function editRoutine(routine=null){editingRoutine=routine?.id||null;routineDirty=false;$('routine-name').value=routine?.name||'';$('routine-steps').value=routine?.instructions||'';$('routine-verification').value=routine?.verification||'';lastRoutineRows='';renderContext(current);$('routine-name').focus();}
  function updateRoutineButtons(){const saved=(current.routines||[]).some(routine=>routine.id===editingRoutine),locked=current.privacyLocked===true;$('routine-run').disabled=!saved||routineDirty||!current.connected||locked;$('routine-run').textContent=current.busy?'Ablauf vormerken':'Ablauf starten';$('routine-delete').disabled=!saved||locked;$('routine-save').disabled=locked;$('routine-hint').textContent=routineDirty&&saved?'Änderungen zuerst speichern. Gestartet wird nur der gespeicherte Ablauf.':'Ein Ablauf startet erst auf deinen Befehl. Schritte und Erfolgskriterien speichern; keine Passwörter eintragen.';}
  function newRoutineId(name){const base=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32).replace(/-+$/,'');const prefix=/^[a-z]/.test(base)?base:'r-'+(base||Date.now());const ids=new Set((current.routines||[]).map(routine=>routine.id));let id=prefix,index=2;while(ids.has(id))id=prefix+'-'+index++;return id;}
  function render(snapshot){
    current=snapshot;setTab(snapshot.tab||activeTab);craftView?.update({...lastCraft,connected:snapshot.connected,busy:snapshot.busy,privacyLocked:snapshot.privacyLocked,tasks:snapshot.tasks,teach:snapshot.teach,windowVisible:snapshot.visible});
    if(document.body){document.body.dataset.glass=String(snapshot.appearance?.glass!==false);const opacity=snapshot.appearance?.opacity;document.body.style.setProperty('--glass-opacity',Number.isFinite(opacity)?String(Math.max(.9,Math.min(1,opacity))):'.94');}
    $('signal').classList.toggle('online',snapshot.connected);
    $('session-title').textContent=snapshot.sessionTitle||'Keine Session gewählt';
    $('phase').textContent=snapshot.privacyLocked?'PRIVAT':phases[snapshot.status]||snapshot.status?.toUpperCase()||'OFFLINE';
    $('detail').textContent=snapshot.detail||'Kein aktueller Status verfügbar.';
    $('footer-state').textContent=snapshot.connected?'HERMES VERBUNDEN':'HERMES OFFLINE';
    const sample=snapshot.sample||{},age=sample.timestamp===null||!Number.isFinite(sample.timestamp)?null:Math.max(0,Math.round((Date.now()-sample.timestamp)/1000));
    $('sample-age').textContent=age===null?'KEINE MESSUNG':age<3?'LIVE / GERADE GEMESSEN':'MESSUNG VOR '+age+' S';
    metric('cpu',sample.cpuPercent);metric('memory',sample.memoryPercent);
    const gpuFresh=Number.isFinite(sample.gpuTimestamp)&&Date.now()-sample.gpuTimestamp<30000;
    metric('gpu',gpuFresh?sample.gpuPercent:null);$('gpu-note').textContent=gpuFresh&&Number.isFinite(sample.gpuPercent)?'AUSLASTUNG':'KEINE AKTUELLE MESSUNG';
    metric('disk',sample.diskFreeGiB,'GiB');$('disk-meter').style.width=Number.isFinite(sample.diskFreeGiB)&&sample.diskTotalGiB>0?Math.min(100,sample.diskFreeGiB/sample.diskTotalGiB*100)+'%':'0%';
    $('disk-note').textContent=sample.diskTotalGiB>0?'VON '+Math.round(sample.diskTotalGiB)+' GiB':'FREIER SPEICHER';
    const core=snapshot.hud||{};const phase=snapshot.status||'offline';
    $('core-code').textContent=snapshot.privacyLocked?'LOCKED':core.state?.toUpperCase()||'IDLE';$('core-state').textContent=snapshot.privacyLocked?'PRIVAT':snapshot.camera?.looking||snapshot.screen?.looking?'SIEHT HIN':phases[phase]||phase.toUpperCase();
    $('core-detail').textContent=core.title||snapshot.detail||'Warte auf Verbindung';$('tool-count').textContent=Number.isFinite(core.completedTools)?core.completedTools+' SCHRITTE':'—';
    const links=snapshot.systemReport?.links?.length?snapshot.systemReport.links:[{label:'Hermes-Verbindung',state:snapshot.connected?'online':'offline'},{label:'Sprachsynthese lokal',state:snapshot.voice?.ready?'online':'unknown'},{label:'Spracherkennung lokal',state:snapshot.voice?.sttReady?'online':'unknown'}];
    $('links').replaceChildren(...links.map(link=>{const row=document.createElement('li'),label=document.createElement('span'),state=document.createElement('strong');label.textContent=link.label;state.textContent={online:'BEREIT',offline:'OFFLINE',unknown:'UNBEKANNT'}[link.state]||'UNBEKANNT';state.className=link.state;row.append(label,state);return row;}));
    $('camera-state').textContent=snapshot.camera?.looking?'Blick läuft':snapshot.camera?.active?'Aktiv':snapshot.camera?.enabled?'Aktiviert':'Aus';
    $('wake-state').textContent=!snapshot.wake?.enabled?'Aus':snapshot.wake.armed?'Wartet auf dich':snapshot.wake.ready?'Modell bereit':'Modell lädt';
    $('screen-state').textContent=snapshot.screen?.looking?'Blick läuft':snapshot.screen?.enabled?'Aktiviert':'Aus';$('mode-state').textContent=snapshot.mode?.name||'Keiner';
    const report=snapshot.systemReport;$('report-text').textContent=report?.text||'Noch kein Systembericht. „Status prüfen“ ruft den aktuellen Bericht ab.';$('report-age').textContent=!report?'KEIN BERICHT':report.fresh?'AKTUELL':Number.isFinite(report.ageSeconds)?report.ageSeconds+' S ALT':'ZEIT UNBEKANNT';
    const modeButtons=(snapshot.modes||[]).map(mode=>{const button=document.createElement('button');button.type='button';button.textContent=mode.name;button.classList.toggle('active',mode.id===snapshot.mode?.id);button.addEventListener('click',()=>invoke('action',{name:'mode',id:mode.id}));return button;});$('mode-actions').replaceChildren(...modeButtons);
    privacy(snapshot);renderContext(snapshot);renderOperations(snapshot);renderVoiceTiming(snapshot.voiceTiming);renderEvents(snapshot.events);renderGesture(snapshot.gesture);renderActivity();renderSource();updateCommand();
  }
  function updateCommand(){$('send-command').disabled=pending||current.privacyLocked===true||!current.connected;$('send-command').textContent=current.busy?'Vormerken':'Auftrag senden';$('command').disabled=pending||current.privacyLocked===true;}
  for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>invoke('tab',button.dataset.tab));
  document.querySelector('.tabs').addEventListener('keydown',async event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.indexOf(activeTab),next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length];await invoke('tab',next);$('tab-'+next).focus();});
  for(const id of ['minimize','close'])$(id).addEventListener('click',()=>invoke('hide'));
  $('task-jump').addEventListener('click',jumpToTask);
  $('circle-open').addEventListener('click',()=>invoke('circle-open'));
  document.addEventListener('keydown',event=>{if(event.key==='Escape')invoke('hide');});
  for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',()=>invoke('action',{name:button.dataset.action}));
  $('context-enabled').addEventListener('change',()=>invoke('action',{name:'context-settings',values:{contextEnabled:$('context-enabled').checked}}));
  $('project-name').addEventListener('input',()=>{projectDirty=true;});
  $('project-form').addEventListener('submit',async event=>{event.preventDefault();const result=await invoke('action',{name:'context-settings',values:{projectName:$('project-name').value.trim()}});if(result?.ok){projectDirty=false;notice('Projekt gespeichert.');}});
  $('context-clear').addEventListener('click',async()=>{const result=await invoke('action',{name:'context-clear'});if(result?.ok){projectDirty=false;$('project-name').value='';notice('Beobachtungen und Projekt geleert.');}});
  $('logs-pick').addEventListener('click',()=>invoke('action',{name:'logs-pick'}));
  $('job-resume').addEventListener('click',()=>invoke('job-resume'));
  $('routine-new').addEventListener('click',()=>editRoutine());
  for(const id of ['routine-name','routine-steps','routine-verification'])$(id).addEventListener('input',()=>{routineDirty=true;updateRoutineButtons();});
  $('routine-form').addEventListener('submit',async event=>{event.preventDefault();const name=$('routine-name').value.trim(),instructions=$('routine-steps').value.trim(),verification=$('routine-verification').value.trim();if(!name||!instructions||!verification){notice('Name, Schritte und Erfolgskriterien ausfüllen.');return;}const id=editingRoutine||newRoutineId(name);const result=await invoke('action',{name:'routine-save',routine:{id,name,instructions,verification}});if(result?.ok){editingRoutine=id;routineDirty=false;lastRoutineRows='';renderContext(current);notice('Ablauf gespeichert.');}});
  $('routine-run').addEventListener('click',()=>{if(editingRoutine&&!$('routine-run').disabled)invoke('action',{name:'routine-run',id:editingRoutine});});
  $('routine-delete').addEventListener('click',async()=>{if(!editingRoutine)return;const result=await invoke('action',{name:'routine-delete',id:editingRoutine});if(result?.ok){editRoutine();notice('Ablauf gelöscht.');}});
  $('command-form').addEventListener('submit',async event=>{event.preventDefault();const input=$('command'),value=input.value.trim();if(!value||pending)return;pending=true;updateCommand();const result=await invoke('command',value);if(result?.ok)input.value='';pending=false;updateCommand();input.focus();});
  $('browser-form').addEventListener('submit',event=>{event.preventDefault();invoke('browser',{action:'navigate',url:$('address').value});});
  for(const action of ['back','forward','reload'])$(action).addEventListener('click',()=>invoke('browser',{action}));
  $('guide-clear').addEventListener('click',()=>invoke('guide-clear'));
  bridge.on(event=>{
    if(event.type==='snapshot')render(event.snapshot);
    else if(event.type==='tab')setTab(event.tab);
    else if(event.type==='gesture-state')renderGesture(event);
    else if(event.type==='gesture-update'&&activeTab==='graph')graphView?.gesture?.(event.gesture);
    else if(event.type==='console'){const rows=current.events||[];const index=rows.findIndex(row=>row.id===event.event.id);if(index>=0)rows[index]=event.event;else rows.push(event.event);current.events=rows.slice(-200);renderEvents(current.events);renderActivity();}
    else if(event.type==='presentation'){if(event.snapshot)render(event.snapshot);else{current.presentation=event.presentation;renderActivity();}}
    else if(event.type==='browser'){document.querySelector('.browser-empty').hidden=Boolean(event.url);$('back').disabled=!event.back;$('forward').disabled=!event.forward;if(document.activeElement!==$('address'))$('address').value=event.url;$('reload').textContent=event.loading?'◌':'↻';}
    else if(event.type==='browser-error')notice(event.message);
    else if(event.type==='graph-update')graphView?.update(event.graph);
    else if(event.type==='craft-stream-stop')craftView?.stopStream(event.reason);
    else if(event.type==='visibility'){current.visible=event.visible;if(!event.visible)graphView?.cancelGesture?.();craftView?.update({windowVisible:event.visible});}
    else if(event.type==='craft-update'){lastCraft=event.craft;craftView?.update({...lastCraft,connected:current.connected,busy:current.busy,privacyLocked:current.privacyLocked,teach:current.teach,windowVisible:current.visible});}
    else if(event.type==='intel-update')intelView?.update(event.intel);
    else if(event.type==='guide-update')$('guide-clear').hidden=!event.guide?.visible;
  });
  function draw(now){if(!document.hidden&&activeTab==='system'){const state=window.HermesOrb.orbState({phase:current.privacyLocked?'offline':current.status||'offline',looking:current.camera?.looking||current.screen?.looking});orb.draw(now,{state,intensity:1});}animation=requestAnimationFrame(draw);}
  animation=requestAnimationFrame(draw);window.addEventListener('unload',()=>{cancelAnimationFrame(animation);craftView?.dispose();});
  invoke('snapshot').then(snapshot=>{if(snapshot)render(snapshot);});
})();
