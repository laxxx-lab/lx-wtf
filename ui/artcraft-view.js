(function(global){
  'use strict';
  const catalog=[
    ['photo','PhotoCraft','Bild & Retusche','#77c9ef','M5 4h14v16H5z M8 15l3-4 3 3 2-2 3 5 M9 8h.01'],
    ['vector','VectorCraft','Vektor & Illustration','#86d9bc','M5 18L12 4l7 14-7-4z M12 14v6 M10 10h4'],
    ['design','DesignCraft','Layout & Gestaltung','#e4ae79','M4 4h16v16H4z M4 9h16 M9 9v11'],
    ['deck','DeckCraft','Präsentationen','#dfbf73','M4 5h16v12H4z M12 17v4 M8 21h8 M8 9h8 M8 12h5'],
    ['grid','GridCraft','Tabellen & Daten','#8fc68d','M4 4h16v16H4z M4 9h16 M4 14h16 M9 4v16 M14 4v16'],
    ['word','WordCraft','Texte & Dokumente','#84aee2','M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 15h6 M9 18h4'],
    ['cad','CadCraft','Konstruktion & CAD','#94cbcd','M12 3l8 5v9l-8 5-8-5V8z M4 8l8 5 8-5 M12 13v9 M8 5l8 5'],
    ['light','LightCraft','Licht & Entwicklung','#d8c194','M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
    ['sound','SoundCraft','Audio & Klang','#aaa8e0','M4 9v6 M8 5v14 M12 8v8 M16 3v18 M20 8v8'],
    ['effect','EffectCraft','Effekte & Komposition','#cb9ecc','M12 3l2 6 7 3-7 2-2 7-3-7-6-2 6-3z'],
    ['film','FilmCraft','Film & Schnitt','#dc9ca2','M3 5h18v14H3z M7 5v14 M17 5v14 M3 10h4 M3 14h4 M17 10h4 M17 14h4 M10 9l4 3-4 3z'],
    ['pdf','PdfCraft','PDF & Seiten','#d6a094','M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 15h6 M9 18h3'],
  ];
  function bridgeLabel(state){return ({ready:'GUI-Steuerung verbunden',connecting:'GUI-Steuerung wird geprüft',closed:'GUI-Steuerung aus',unconfigured:'GUI-Steuerung nicht angebunden',unlinked:'GUI-Steuerung nicht angebunden',unavailable:'GUI-Steuerung nicht verfügbar',error:'GUI-Steuerung gestört'})[state]||'Unbekannter Live-Status';}
  function appTask(tasks,appId){return Array.isArray(tasks)?tasks.find(task=>task.appId===appId)||null:null;}
  function validPreview(frame,appId){return !!frame&&frame.appId===appId&&typeof frame.image==='string'&&frame.image.length<=33554432&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(frame.image)&&Number.isInteger(frame.width)&&frame.width>0&&frame.width<=32768&&Number.isInteger(frame.height)&&frame.height>0&&frame.height<=32768;}

  function videoPoint(rect,width,height,clientX,clientY){
    if(!rect||![rect.width,rect.height,width,height].every(value=>Number.isFinite(value)&&value>0)||!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
    const scale=Math.min(rect.width/width,rect.height/height),drawWidth=width*scale,drawHeight=height*scale,left=rect.left+(rect.width-drawWidth)/2,top=rect.top+(rect.height-drawHeight)/2;
    const x=(clientX-left)/drawWidth,y=(clientY-top)/drawHeight;return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;
  }
  function createInputRequests({invoke,isVisible,onChange=()=>{},onError=()=>{}}){
    let appId=null,active=false,locked=false,disposed=false,frameId=null,generation=0,pending=false;
    const allowed=()=>!disposed&&!locked&&active&&appId==='light'&&isVisible();
    const state=()=>({enabled:allowed()&&!!frameId,pending});
    function reset(){generation++;frameId=null;onChange(state());}
    async function request(payload){
      if(!allowed()||pending)return false;pending=true;const ticket=generation,selected=appId;onChange(state());
      try{
        const result=await invoke('craft-input',{appId:selected,...payload});
        if(ticket!==generation||!allowed()||appId!==selected)return false;
        if(payload.kind==='arm'){if(!result?.ok||!(/^[a-f0-9]{32}$/).test(result.frameId||''))throw Error('Eingabe konnte nicht aktiviert werden.');frameId=result.frameId;}
        return result?.ok===true;
      }catch(error){if(ticket===generation&&!disposed){reset();onError(error);}return false;}
      finally{pending=false;if(!disposed)onChange(state());}
    }
    return {arm:(frameWidth,frameHeight)=>request({kind:'arm',frameWidth,frameHeight}),send(value){if(!frameId)return Promise.resolve(false);return request({...value,frameId});},reset,
      setContext(value){const next=value.appId??appId,nextActive=Object.hasOwn(value,'active')?value.active===true:active,nextLocked=Object.hasOwn(value,'privacyLocked')?value.privacyLocked===true:locked;if(next!==appId||nextActive!==active||nextLocked!==locked)reset();appId=next;active=nextActive;locked=nextLocked;if(!allowed())frameId=null;onChange(state());},
      visibilityChanged(){if(!isVisible())reset();},dispose(){disposed=true;reset();},get enabled(){return state().enabled;},get pending(){return pending;}};
  }

  function createSnapshotRequests({invoke,onSnapshot,onError=()=>{},onPending=()=>{},isVisible}){
    let selectedAppId=null,privacyLocked=false,disposed=false,pending=false,generation=0,visible=isVisible();
    async function request(method,payload,preview){
      if(disposed||pending||privacyLocked||(preview&&(!selectedAppId||!isVisible())))return false;
      pending=true;onPending(true);const ticket=generation,appId=selectedAppId;
      try{const result=await invoke(method,payload);if(disposed||ticket!==generation||privacyLocked||(preview&&(!isVisible()||appId!==selectedAppId||result?.selectedAppId&&result.selectedAppId!==appId)))return false;if(result)onSnapshot(result,preview);return true;}
      catch(error){if(!disposed&&ticket===generation)onError(error);return false;}
      finally{pending=false;if(!disposed)onPending(false);}
    }
    return {start:()=>request('craft-snapshot',undefined,false),refresh:(preview=true)=>request('craft-refresh',{preview:preview===true},preview===true),
      setContext(context){const nextApp=Object.hasOwn(context,'selectedAppId')?context.selectedAppId:selectedAppId,nextPrivacy=Object.hasOwn(context,'privacyLocked')?context.privacyLocked===true:privacyLocked;if(nextApp!==selectedAppId||nextPrivacy!==privacyLocked)generation++;selectedAppId=nextApp;privacyLocked=nextPrivacy;},
      visibilityChanged(){const next=isVisible();if(next!==visible){visible=next;if(!next)generation++;}},dispose(){disposed=true;generation++;}};
  }

  function mount({container,invoke,notice=()=>{}}){
    const doc=container.ownerDocument||global.document;
    container.classList.add('artcraft-view');
    container.innerHTML=`<div class="ac-layout">
      <aside class="ac-rail" aria-label="Artcraft-Programme"><div class="ac-rail-heading"><span class="ac-mark" aria-hidden="true">A<span>↗</span></span><div><strong>ARTCRAFT</strong><small>DEINE PROGRAMME</small></div></div><div class="ac-rail-summary"><span data-ac="installed">STATUS WIRD GELESEN</span><span>12</span></div><div class="ac-programs" data-ac="programs" role="group" aria-label="Programm auswählen"></div><div class="ac-rail-foot"><span class="ac-local-dot"></span><span>Native Anwendungen<br><small>Auf deinem Rechner</small></span></div></aside>
      <div class="ac-workspace"><header class="ac-heading"><div class="ac-app-heading"><span class="ac-eyebrow">WERKBANK / NATIVE ANWENDUNG</span><div><span data-ac="heading-icon" class="ac-heading-icon" aria-hidden="true"></span><h1 data-ac="name">Artcraft</h1></div><p data-ac="subtitle">Deine Programme. Dein Dokument. Deine Hermes-Session.</p></div><button class="ac-open" data-ac="open" type="button">App öffnen <span aria-hidden="true">↗</span></button></header>
      <div class="ac-status-row"><div class="ac-statuses"><span data-ac="window" class="ac-status">Status wird gelesen</span><span data-ac="bridge" class="ac-status">Live-Status wird geprüft</span></div><span data-ac="document-name" class="ac-current-document">Noch kein Dokumentstatus</span></div>
      <div class="ac-studio"><article class="ac-preview-panel" aria-label="Vorschau der nativen Anwendung"><div class="ac-preview-toolbar"><div><span class="ac-eyebrow">ANWENDUNGSVORSCHAU</span><span data-ac="capture-time" class="ac-capture-time">NOCH KEIN BILD</span></div><div class="ac-preview-actions"><span class="ac-live" data-ac="live" role="status"><span>Fensterstream automatisch</span><small>30 fps Ziel</small></span><button data-ac="refresh" class="ac-refresh" type="button" aria-label="Vorschau aktualisieren"><span aria-hidden="true">↻</span> Aktualisieren</button></div></div><div class="ac-stage" data-ac="stage"><video data-ac="video" class="ac-image ac-video" muted autoplay playsinline hidden aria-label="Livevideo des ausgewählten Anwendungsfensters"></video><img data-ac="image" class="ac-image" alt="Vorschau der laufenden Artcraft-Anwendung" hidden><div class="ac-empty" data-ac="empty"><span data-ac="empty-icon" class="ac-empty-icon" aria-hidden="true"></span><small data-ac="empty-label">NATIVE WERKZEUGE / LOKAL</small><h2 data-ac="empty-title">Dein Arbeitsbereich wartet.</h2><p data-ac="empty-text">Wähle ein Programm, um seinen Fenster- und Dokumentstatus zu sehen.</p></div><span class="ac-stage-corner ac-stage-corner-tl" aria-hidden="true"></span><span class="ac-stage-corner ac-stage-corner-br" aria-hidden="true"></span></div><div class="ac-preview-caption"><span data-ac="preview-label">Vorschau auf Anfrage</span><span data-ac="dimensions">LOKAL · PNG</span></div></article>
      <aside class="ac-inspector" aria-label="Dokument und beobachtete Aktivitäten"><section class="ac-detail" data-ac="task-detail" hidden><div class="ac-detail-title"><span>LETZTER AUFTRAG</span><span data-ac="task-status"></span></div><p data-ac="task-title" class="ac-task-title"></p><p data-ac="task-result" class="ac-task-result" role="status" aria-live="polite"></p></section><section class="ac-detail"><div class="ac-detail-title"><span>DOKUMENT</span><span data-ac="dirty"></span></div><dl data-ac="document"></dl><div class="ac-tool"><span>AKTUELLES WERKZEUG</span><strong data-ac="tool">Nicht gemeldet</strong></div></section><section class="ac-detail ac-job-detail"><div class="ac-detail-title"><span>AUFTRÄGE</span><span data-ac="job-count">0</span></div><div data-ac="jobs" class="ac-records"></div></section><section class="ac-detail ac-activity-detail"><div class="ac-detail-title"><span>LETZTE AKTIVITÄTEN</span><span data-ac="activity-count">0</span></div><div data-ac="activities" class="ac-records"></div></section></aside></div>
      <form class="ac-composer"><label for="ac-prompt"><span>AUFTRAG AN HERMES</span><span data-ac="command-target">Ausgewählte Session</span></label><div class="ac-compose-row"><textarea id="ac-prompt" data-ac="prompt" rows="2" maxlength="2000" placeholder="Was möchtest du in dieser Anwendung bearbeiten?"></textarea><button data-ac="send" type="submit">Auftrag senden <span aria-hidden="true">↗</span></button></div><div class="ac-composer-hint"><span data-ac="session-status">Hermes-Session wird geprüft.</span><span>Strg + Enter zum Senden</span></div></form>
      <section class="ac-input-panel" aria-label="Eingabe in die laufende Anwendung"><div class="ac-input-heading"><div><strong data-ac="input-label">Vorschau · nur Ansicht</strong><small data-ac="input-hint">Eingebettete Eingabe ist für LightCraft verfügbar.</small></div><button type="button" data-ac="input-enable" disabled>Eingabe aktivieren</button><button type="button" class="stop-action" data-ac="input-stop">■ Not-Aus</button></div><form data-ac="input-form" class="ac-input-form" hidden><label for="ac-input-text">Text in das fokussierte LightCraft-Feld</label><div><input id="ac-input-text" data-ac="input-text" maxlength="256" autocomplete="off" placeholder="Text eingeben"><button type="submit" data-ac="input-send">Text übertragen</button><button type="button" data-ac="input-enter">Enter</button><button type="button" data-ac="input-escape">Esc</button></div></form></section>
      <section class="ac-teach-panel" aria-label="Einen Ablauf beibringen"><div class="ac-detail-title"><span>LEHRE / DEINE SICHTBAREN SCHRITTE</span><span data-ac="teach-state">INAKTIV</span></div><form data-ac="teach-start-form" class="ac-teach-start"><label for="ac-teach-name">Name des Ablaufs</label><input id="ac-teach-name" data-ac="teach-name" maxlength="80" autocomplete="off" placeholder="Zum Beispiel: Foto prüfen"><button type="submit" data-ac="teach-start">Lehre starten</button></form><div data-ac="teach-active" hidden><p data-ac="teach-note"></p><div data-ac="teach-steps" class="ac-teach-steps"></div><form data-ac="teach-save-form" class="ac-teach-save"><label for="ac-teach-verification">Woran erkennst du das fertige Ergebnis?</label><input id="ac-teach-verification" data-ac="teach-verification" maxlength="1500" autocomplete="off" placeholder="Sichtbares Erfolgskriterium"><button type="submit" data-ac="teach-save">Als Ablauf speichern</button><button type="button" data-ac="teach-cancel">Lehre verwerfen</button></form></div><small>Nur erfolgreiche lokale LightCraft-Eingaben während einer gestarteten Lehre. Bestätige jeden Schritt am sichtbaren Ergebnis.</small></section>
      <div class="ac-foot"><span class="ac-local-dot"></span>Vorschau der laufenden Anwendung · Aufträge über deine Hermes-Session<span class="ac-readonly" data-ac="input-mode">VORSCHAU · NUR ANSICHT</span></div><p class="ac-warning" data-ac="warning" role="status" hidden></p></div></div>`;
    const el=key=>container.querySelector('[data-ac="'+key+'"]');
    const buttons=new Map();let disposed=false,current={apps:[],selectedAppId:null},initialized=false,preview=null,previewPending=false,commandPending=false,selectionGeneration=0;
    let inputState={enabled:false,pending:false},inputRequests=null,teachKey='';
    function text(value,fallback=''){return typeof value==='string'?value.slice(0,1400):typeof value==='number'||typeof value==='boolean'?String(value):fallback;}
    function node(tag,value,className){const element=doc.createElement(tag);if(value!==undefined)element.textContent=text(value);if(className)element.className=className;return element;}
    function appDesign(app){return catalog.find(item=>item[0]===app?.id||item[1]===app?.name)||[app?.id,text(app?.name,'Artcraft'),'Anwendung','#77c9ef',catalog[0][4]];}
    function icon(app){const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.25');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',appDesign(app)[4]);svg.append(path);return svg;}
    function selected(){return current.selected?.id===current.selectedAppId?current.selected:current.apps.find(app=>app.id===current.selectedAppId)||null;}
    function visible(checkPage=true){if(checkPage&&doc.hidden)return false;for(let at=container;at&&at.nodeType===1;at=at.parentElement){if(at.hidden||at.getAttribute('aria-hidden')==='true')return false;const style=global.getComputedStyle?.(at);if(style&&(style.display==='none'||style.visibility==='hidden'))return false;}return true;}
    function warn(message){if(disposed)return;el('warning').textContent=text(message);el('warning').hidden=!message;}
    function clearPreview(){preview=null;el('image').removeAttribute('src');el('image').hidden=true;el('empty').hidden=false;}
    function renderRail(){
      const apps=initialized?current.apps:catalog.map(([id,name,kind])=>({id,name,kind}));
      const ids=new Set(apps.map(app=>app.id));for(const [id,row]of buttons){if(!ids.has(id)){row.button.remove();buttons.delete(id);}}
      for(const app of apps){
        let row=buttons.get(app.id);if(!row){const button=node('button',undefined,'ac-program'),mark=node('span',undefined,'ac-program-icon'),content=node('span',undefined,'ac-program-copy'),title=node('strong'),detail=node('small'),status=node('span',undefined,'ac-program-state');button.type='button';content.append(title,detail);button.append(mark,content,status);mark.append(icon(app));button.addEventListener('click',()=>selectApp(app.id));button.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const list=[...buttons.values()].map(value=>value.button),index=list.indexOf(button),next=event.key==='Home'?0:event.key==='End'?list.length-1:(index+(event.key==='ArrowDown'?1:-1)+list.length)%list.length;list[next]?.focus();});row={button,title,detail,status};buttons.set(app.id,row);el('programs').append(button);}
        const active=app.id===current.selectedAppId;row.button.setAttribute('aria-pressed',String(active));row.button.style.setProperty('--ac-app-color',appDesign(app)[3]);row.button.disabled=disposed;row.title.textContent=text(app.name,appDesign(app)[1]);row.detail.textContent=text(app.kind,appDesign(app)[2]);row.status.className='ac-program-state'+(app.running?' running':app.installed===false?' missing':'');row.status.setAttribute('aria-label',!initialized?'Status wird gelesen':app.running?'Fenster geöffnet':app.installed?'Installiert':'Nicht installiert');row.button.title=row.title.textContent+' · '+row.status.getAttribute('aria-label');
      }
      el('installed').textContent=initialized?current.apps.filter(app=>app.installed===true).length+' INSTALLIERT':'STATUS WIRD GELESEN';
    }
    function renderDocument(app){
      const documentInfo=app?.document,fields=[];
      if(documentInfo&&typeof documentInfo==='object'){
        if(documentInfo.name)fields.push(['Name',text(documentInfo.name)]);
        if(Number.isFinite(documentInfo.width)&&Number.isFinite(documentInfo.height))fields.push(['Format',documentInfo.width+' × '+documentInfo.height]);
        if(Number.isFinite(documentInfo.layers)||Array.isArray(documentInfo.layers))fields.push(['Ebenen',Array.isArray(documentInfo.layers)?documentInfo.layers.length:documentInfo.layers]);
        if(Number.isFinite(documentInfo.pages)||Array.isArray(documentInfo.pages))fields.push(['Seiten',Array.isArray(documentInfo.pages)?documentInfo.pages.length:documentInfo.pages]);
      }
      const box=el('document');box.replaceChildren();if(fields.length)for(const [label,value]of fields)box.append(node('dt',label),node('dd',value));else box.append(node('div',app?.running?'Kein Dokumentstatus gemeldet.':'Öffne die Anwendung für Dokumentdaten.','ac-muted'));
      el('dirty').textContent=documentInfo?.dirty===true?'UNGESPEICHERT':documentInfo?.dirty===false?'GESPEICHERT':'';
      el('dirty').classList.toggle('ac-unsaved',documentInfo?.dirty===true);
      el('tool').textContent=text(typeof app?.tool==='object'?app.tool?.name||app.tool?.id:app?.tool,'Nicht gemeldet');
    }
    function time(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?date.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'';}
    function renderRecords(app){
      const task=current.privacyLocked?null:appTask(current.tasks,app?.id);el('task-detail').hidden=!task;
      if(task){el('task-title').textContent=text(task.title);el('task-status').textContent=({'running':'LÄUFT','agent-finished':'ANTWORT','error':'FEHLER','interrupted':'GESTOPPT','disconnected':'GETRENNT'})[task.status]||'STATUS';el('task-result').textContent=task.status==='running'?(task.completedTools||0)+' / '+(task.toolCount||0)+' Werkzeugschritte abgeschlossen':text(task.summary,'Keine Rückmeldung verfügbar.');}

      const jobs=Array.isArray(app?.jobs)?app.jobs.slice(-6):[],activities=Array.isArray(app?.activities)?app.activities.slice(-10).reverse():[];
      el('job-count').textContent=String(jobs.length);el('activity-count').textContent=String(activities.length);el('jobs').replaceChildren();el('activities').replaceChildren();
      if(!jobs.length)el('jobs').append(node('p','Keine gemeldeten Aufträge.','ac-muted'));
      for(const job of jobs){const row=node('div',undefined,'ac-job'),title=node('strong',text(job.title||job.name||job.text,'Auftrag')),state=node('span',text(job.status,'Status nicht gemeldet'),'ac-record-state');row.append(title,state);if(job.detail||job.error)row.append(node('small',job.detail||job.error));el('jobs').append(row);}
      if(!activities.length)el('activities').append(node('p','Noch keine beobachteten Aktivitäten.','ac-muted'));
      for(const activity of activities){const row=node('div',undefined,'ac-activity'),when=node('time',time(activity.timestamp||activity.time||activity.at)),content=node('div');content.append(node('strong',text(activity.title||activity.name||activity.type,'Aktivität')));if(activity.text||activity.detail||activity.description)content.append(node('p',activity.text||activity.detail||activity.description));row.append(when,content);el('activities').append(row);}
    }
    function renderTeach(){
      const teach=current.teach||{},locked=current.privacyLocked===true,active=teach.active===true&&!locked,steps=Array.isArray(teach.steps)?teach.steps:[];
      el('teach-state').textContent=active?'AUFNAHME SICHTBARER EINGABEN':'INAKTIV';el('teach-start-form').hidden=active;el('teach-active').hidden=!active;el('teach-start').disabled=locked||current.selectedAppId!=='light';el('teach-name').disabled=locked;
      el('teach-save').disabled=locked||!steps.length||steps.some(step=>!step.verified);el('teach-note').textContent=text(teach.name)+' · '+steps.length+' beobachtete Schritte';
      const key=JSON.stringify({active,steps});if(key===teachKey)return;teachKey=key;el('teach-steps').replaceChildren();
      if(!steps.length)el('teach-steps').append(node('p','Bediene LightCraft im aktiven Fensterstream. Jeder übertragene Schritt erscheint hier.','ac-muted'));
      steps.forEach((step,index)=>{
        const row=node('form',undefined,'ac-teach-step'),heading=node('strong',(index+1)+'. '+text(step.label,'Schritt')),label=node('input'),verification=node('input'),button=node('button',step.verified?'Bestätigung ändern':'Sichtbaren Erfolg bestätigen');
        label.type='text';label.value=text(step.label);label.maxLength=160;label.setAttribute('aria-label','Beschreibung für Schritt '+(index+1));verification.type='text';verification.value=text(step.verification);verification.maxLength=300;verification.placeholder='Was hat sich sichtbar geändert?';verification.setAttribute('aria-label','Erfolgskriterium für Schritt '+(index+1));button.type='submit';row.append(heading,node('small',step.verified?'VON DIR BESTÄTIGT':'ERGEBNIS NOCH PRÜFEN'),label,verification,button);
        row.addEventListener('submit',event=>{event.preventDefault();if(!verification.value.trim()){warn('Beschreibe zuerst den sichtbaren Erfolg des Schritts.');return;}void teachAction('teach-confirm',{index,label:label.value.trim(),verification:verification.value.trim()});});el('teach-steps').append(row);
      });
    }
    function render(){
      if(disposed)return;const app=selected(),design=appDesign(app),locked=current.privacyLocked===true,ready=app?.running&&app?.bridgeState==='ready';
      container.style.setProperty('--ac-selected-color',design[3]);renderRail();el('name').textContent=text(app?.name,'Artcraft');el('heading-icon').replaceChildren(...(app?[icon(app)]:[]));el('subtitle').textContent=app?text(app.kind,design[2])+' · Native Anwendung':'Deine Programme. Dein Dokument. Deine Hermes-Session.';
      el('window').textContent=locked?'Datenschutz aktiv':!initialized?'Status wird gelesen':app?.running?'Fenster geöffnet':app?.installed===false?'Nicht installiert':'Fenster nicht geöffnet';el('window').classList.toggle('active',!!app?.running&&!locked);
      el('bridge').textContent=locked?'Vorschau pausiert':app?bridgeLabel(app.bridgeState):'Wähle ein Programm';el('bridge').classList.toggle('active',!!ready&&!locked);el('bridge').classList.toggle('error',app?.bridgeState==='error');
      el('document-name').textContent=text(app?.document?.name,app?.running?'Kein Dokument gemeldet':'Kein geöffnetes Dokument');el('open').firstChild.textContent=app?.running?'App zeigen ':'App öffnen ';el('open').disabled=!app||app.installed===false||locked;
      el('refresh').disabled=!app||locked||previewPending||streamState.pending;el('refresh').classList.toggle('pending',previewPending);el('video').hidden=!streamState.active;if(streamState.active){el('image').hidden=true;el('empty').hidden=true;}
      el('command-target').textContent=app?text(app.name)+' / ausgewählte Session':'Ausgewählte Session';const connected=current.connected===true;el('send').disabled=!app||!connected||locked||commandPending;el('send').textContent=current.busy?'Auftrag vormerken ↗':'Auftrag senden ↗';el('prompt').disabled=locked;
      el('session-status').textContent=locked?'Datenschutz aktiv. Aufträge und Vorschau pausieren.':commandPending?'Auftrag wird an Hermes übergeben …':current.busy?'Hermes bearbeitet einen Auftrag.':connected?'Bearbeitung über deine ausgewählte Hermes-Session.':'Wähle eine verbundene Hermes-Session in der Kopfzeile.';
      el('empty-icon').replaceChildren(...(app?[icon(app)]:[]));el('empty-label').textContent=app?text(app.name).toUpperCase()+' / LOKAL':'NATIVE WERKZEUGE / LOKAL';
      el('empty-title').textContent=locked?'Vorschau pausiert.':!initialized?'Programme werden eingelesen.':!app?'Dein Arbeitsbereich wartet.':streamState.pending?'Fensterstream startet.':app.running?'Die Anwendung ist geöffnet.':'Dein Werkzeug ist bereit.';
      el('empty-text').textContent=locked?'Der Datenschutzmodus hält die Vorschau an.':!app?'Wähle ein Programm aus der linken Leiste.':!app.running?'Öffne '+text(app.name)+' in seinem eigenen Fenster. Aufträge kannst du über Hermes senden.':'Der Fensterstream startet automatisch. Die GUI-Steuerung liefert zusätzlich Dokumentstatus und Bearbeitung.';
      el('capture-time').textContent=streamState.active?'VIDEO AKTIV':streamState.pending?'STREAM STARTET':preview?'BILD '+time(preview.capturedAt):previewPending?'BILD WIRD ANGEFRAGT':'NOCH KEIN BILD';el('preview-label').textContent=streamState.active?'Lokaler Fensterstream':preview?'Einzelbild · Aufnahmezeit oben':'Automatischer Fensterstream';el('dimensions').textContent=streamState.active?'VIDEO · ZIEL 30 FPS':preview?preview.width+' × '+preview.height+' PX':'LOKAL';renderDocument(app);renderRecords(app);
      const supported=app?.id==='light'&&app?.inputSupported!==false;el('input-enable').disabled=!supported||!streamState.active||locked||inputState.pending;el('input-enable').textContent=inputState.enabled?'Eingabe pausieren':inputState.pending?'Fenster wird geprüft …':'Eingabe aktivieren';el('input-label').textContent=inputState.pending?'Eingabe wird geprüft / übertragen':inputState.enabled?'Eingabe aktiv · LightCraft':supported?'LightCraft · Eingabe bereit':'Vorschau · nur Ansicht';el('input-hint').textContent=!supported?'Für diese Anwendung ist eingebettete Eingabe noch nicht freigegeben.':inputState.enabled?'Klicken und scrollen im Bild; Text und einzelne Tasten unten. Fensteränderungen erfordern erneutes Aktivieren.':'Aktiviere die Eingabe bei laufendem Video. Das Quellfenster muss unminimiert bleiben.';el('input-form').hidden=!inputState.enabled;el('input-send').disabled=inputState.pending;el('input-enter').disabled=inputState.pending;el('input-escape').disabled=inputState.pending;el('stage').classList.toggle('ac-input-active',inputState.enabled);el('stage').classList.toggle('ac-input-pending',inputState.pending);el('stage').tabIndex=inputState.enabled?0:-1;el('stage').setAttribute('aria-label',inputState.enabled?'LightCraft-Eingabe: klicken, scrollen und einzelne Tasten':'Vorschau der laufenden Anwendung');el('input-mode').textContent=inputState.enabled?'LIGHTCRAFT · EINGABE AKTIV':'VORSCHAU · NUR ANSICHT';renderTeach();
    }
    function update(snapshot,acceptPreview=false){
      if(disposed||!snapshot||typeof snapshot!=='object')return;
      const {preview:frame,...metadata}=snapshot,previousId=current.selectedAppId;current={...current,...metadata,apps:Array.isArray(metadata.apps)?metadata.apps:current.apps};initialized=true;
      loop.setContext({selectedAppId:current.selectedAppId,privacyLocked:current.privacyLocked});
      const app=selected();videoStream.setContext({appId:current.selectedAppId,running:app?.running,privacyLocked:current.privacyLocked,windowVisible:current.windowVisible});if(previousId!==current.selectedAppId||current.privacyLocked||!app?.running||app.bridgeState!=='ready')clearPreview();
      inputRequests.setContext({appId:current.selectedAppId,active:streamState.active&&current.windowVisible!==false,privacyLocked:current.privacyLocked});
      if(acceptPreview&&!current.privacyLocked&&app?.running&&app.bridgeState==='ready'&&visible()&&validPreview(frame,current.selectedAppId)){preview={appId:frame.appId,width:frame.width,height:frame.height,capturedAt:frame.capturedAt};el('image').src=frame.image;el('image').alt='Vorschau von '+text(app.name);el('image').hidden=false;el('empty').hidden=true;}
      render();
    }
    const loop=createSnapshotRequests({invoke,isVisible:visible,onSnapshot:update,onPending(value){previewPending=value;render();},onError(error){warn(error?.message||'Die Anwendung konnte nicht abgefragt werden.');}});
    let streamState={active:false,pending:false};
    inputRequests=createInputRequests({invoke,isVisible:()=>visible(false)&&current.windowVisible!==false,onChange(value){inputState=value;render();},onError(error){warn(error?.message||'Eingabe konnte nicht übertragen werden.');}});
    const videoStream=global.WindowStream.createVideoStream({video:el('video'),invoke,isVisible:()=>visible(false),onChange(value){streamState=value;inputRequests.setContext({appId:current.selectedAppId,active:value.active,privacyLocked:current.privacyLocked});if(!disposed){if(value.active)warn('');if(!value.active){el('video').hidden=true;el('image').hidden=!preview;el('empty').hidden=!!preview;}render();}},onError(error){if(!disposed)warn(/Error starting capture/i.test(error?.message||'')?'Windows liefert kein Fensterbild. Klicke auf „App zeigen“; minimierte Quellfenster können kein Video liefern.':error?.message||'Fensterstream nicht verfügbar.');}});
    async function selectApp(appId){
      if(disposed)return;const ticket=++selectionGeneration;warn('');videoStream.stop();clearPreview();current={...current,selectedAppId:appId,selected:null};loop.setContext({selectedAppId:appId});render();
      try{const result=await invoke('craft-select',{appId});if(!disposed&&ticket===selectionGeneration)update(result);}catch(error){if(!disposed&&ticket===selectionGeneration)warn(error?.message||'Das Programm konnte nicht ausgewählt werden.');}
    }
    el('open').addEventListener('click',async()=>{const app=selected();if(!app||current.privacyLocked)return;const id=app.id,ticket=selectionGeneration;try{const result=await invoke(app.running?'craft-focus':'craft-open',{appId:id});if(!disposed&&ticket===selectionGeneration&&current.selectedAppId===id)update(result);}catch(error){if(!disposed&&ticket===selectionGeneration)warn(error?.message||'Die Anwendung konnte nicht geöffnet werden.');}});
    el('refresh').addEventListener('click',()=>{warn('');loop.refresh(false);void videoStream.start();});
    el('input-enable').addEventListener('click',async()=>{if(el('input-enable').disabled)return;if(inputRequests.enabled){inputRequests.reset();return;}warn('');const video=el('video'),settings=video.srcObject?.getVideoTracks()[0]?.getSettings()||{};const ok=await inputRequests.arm(video.videoWidth||settings.width,video.videoHeight||settings.height);if(ok)el('stage').focus();});
    el('input-stop').addEventListener('click',()=>{inputRequests.reset();videoStream.stop();void invoke('action',{name:'emergency-stop'});});
    function eventPoint(event){const video=el('video');return videoPoint(video.getBoundingClientRect(),video.videoWidth,video.videoHeight,event.clientX,event.clientY);}
    el('stage').addEventListener('click',event=>{if(!inputRequests.enabled)return;const point=eventPoint(event);if(point){el('stage').focus();void inputRequests.send({kind:'click',...point});}});
    el('stage').addEventListener('wheel',event=>{if(!inputRequests.enabled)return;const point=eventPoint(event);if(!point)return;event.preventDefault();const delta=Math.max(-2000,Math.min(2000,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?500:1)));if(delta)void inputRequests.send({kind:'scroll',...point,delta});},{passive:false});
    el('stage').addEventListener('keydown',event=>{if(!inputRequests.enabled||event.ctrlKey||event.metaKey||event.altKey)return;const keys=['Enter','Escape','Tab','Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown','Space'];const key=event.key===' '?'Space':event.key;if(keys.includes(key)||event.key?.length===1){event.preventDefault();event.stopPropagation();void inputRequests.send(keys.includes(key)?{kind:'key',key}:{kind:'text',text:event.key});}});
    el('input-form').addEventListener('submit',async event=>{event.preventDefault();const field=el('input-text'),value=field.value;if(!value||!inputRequests.enabled)return;if(await inputRequests.send({kind:'text',text:value})){if(field.value===value)field.value='';el('stage').focus();}});
    for(const [name,key]of [['input-enter','Enter'],['input-escape','Escape']])el(name).addEventListener('click',()=>{void inputRequests.send({kind:'key',key});});
    async function teachAction(method,payload){try{const result=await invoke(method,payload);if(result?.active!==undefined)update({teach:result});else if(method==='teach-save')notice('Lehre als Ablauf gespeichert.');}catch(error){warn(error?.message||'Die Lehre konnte nicht geändert werden.');}}
    el('teach-start-form').addEventListener('submit',event=>{event.preventDefault();const name=el('teach-name').value.trim();if(!name){warn('Gib der Lehre zuerst einen Namen.');return;}void teachAction('teach-start',{name});});el('teach-save-form').addEventListener('submit',event=>{event.preventDefault();const verification=el('teach-verification').value.trim();if(!verification){warn('Beschreibe das fertige Ergebnis.');return;}void teachAction('teach-save',{verification});});el('teach-cancel').addEventListener('click',()=>{void teachAction('teach-cancel');});
    const form=container.querySelector('.ac-composer');
    form.addEventListener('submit',async event=>{event.preventDefault();const app=selected(),prompt=el('prompt'),value=prompt.value.trim();if(!value||el('send').disabled||!app)return;const id=app.id;commandPending=true;warn('');render();
      try{await invoke('craft-command',{appId:id,text:value});if(!disposed){if(prompt.value.trim()===value)prompt.value='';notice('Auftrag an Hermes übergeben.');}}
      catch(error){if(!disposed)warn(error?.message||'Der Auftrag konnte nicht übergeben werden.');}
      finally{if(!disposed){commandPending=false;render();}}
    });
    el('prompt').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit();}});
    el('image').addEventListener('error',()=>{if(!disposed){clearPreview();warn('Die gelieferte Vorschau konnte nicht angezeigt werden.');render();}});
    const visibilityChanged=()=>{loop.visibilityChanged();videoStream.visibilityChanged();inputRequests.visibilityChanged();if(!visible())el('capture-time').textContent=preview?'BILD '+time(preview.capturedAt):'NOCH KEIN BILD';};doc.addEventListener('visibilitychange',visibilityChanged);
    const observer=typeof global.MutationObserver==='function'?new global.MutationObserver(visibilityChanged):null;
    if(observer)for(let at=container;at&&at.nodeType===1;at=at.parentElement)observer.observe(at,{attributes:true,attributeFilter:['hidden','style','class','aria-hidden']});
    render();loop.start();
    return {update:snapshot=>update(snapshot,false),stopStream(reason){inputRequests.reset();videoStream.stop(false);if(reason&&reason!=='Fensterstream beendet.')warn(reason);},dispose(){if(disposed)return;disposed=true;selectionGeneration++;inputRequests.dispose();videoStream.dispose();loop.dispose();observer?.disconnect();doc.removeEventListener('visibilitychange',visibilityChanged);clearPreview();container.replaceChildren();container.classList.remove('artcraft-view');}};
  }
  const api={mount,createSnapshotRequests,createInputRequests,videoPoint,validPreview,bridgeLabel,appTask};if(typeof module==='object'&&module.exports)module.exports=api;else global.ArtcraftView={mount};
})(typeof window==='object'?window:globalThis);
