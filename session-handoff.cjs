'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function handoffRequest(gateway,payload){
 const url=new URL(gateway.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Ungültiger Hermes-Gateway.');
 const body=JSON.stringify(payload);if(Buffer.byteLength(body)>8192)throw Error('Übergabeanfrage ist zu groß.');
 const response=await gateway.fetcher(gateway.url.replace(/\/$/,'')+'/api/lilith/handoff',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(15000)});
 let result;try{result=await response.json();}catch{if(response.ok)throw Error('Übergabevertrag nicht bestätigt.');}
 if(!response.ok){const code=typeof result?.error==='string'&&/^[a-z_]{1,64}$/.test(result.error)?result.error:null;const error=Error(code||`Hermes antwortet mit HTTP ${response.status}.`);error.status=response.status;error.code=code;throw error;}
 return result;
}
function handoffIntent(text){
 if(typeof text!=='string')return null;
 const value=text.trim().toLocaleLowerCase('de-DE').replace(/[.!]+$/,'').replace(/\bbitte\b/g,' ').replace(/,/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:ich wechsel(?:e)?|ich wechsle) (?:aufs|auf das) notebook$/.test(value)||/^(?:übergib|übergebe) das gespräch an (?:das )?notebook$/.test(value))return 'notebook';
 if(/^(?:ich wechsel(?:e)?|ich wechsle) (?:zurück )?(?:an den|auf den|zum) pc$/.test(value)||/^(?:übergib|übergebe) das gespräch an (?:den )?pc$/.test(value))return 'windows';
 for(const expression of [
  /^(?:lass(?:t)? uns(?: (?:mal|doch))?|ich (?:möchte|will)|wir (?:möchten|wollen)) (?:jetzt )?(?:gern(?:e)? )?(?:(?:zurück|wieder) )?(?:auf dem|am|an dem) (notebook|laptop|pc|gaming[ -]?pc|laxxx-gaming|rechner|computer) (?:weiter(?:arbeiten| arbeiten|machen| machen)|arbeiten)$/,
  /^(?:ich (?:wechsel(?:e)?|wechsle|switche)|wechsel(?:e)?|wechsle|switche|wir wechseln) (?:jetzt )?(?:(?:zurück|wieder) )?(?:aufs|auf das|zum|an den|auf den) (notebook|laptop|pc|gaming[ -]?pc|laxxx-gaming|rechner|computer)$/,
  /^(?:lass(?:t)? uns(?: (?:mal|doch))?) (?:jetzt )?(?:(?:zurück|wieder) )?(?:aufs|auf das|zum|an den|auf den) (notebook|laptop|pc|gaming[ -]?pc|laxxx-gaming|rechner|computer) wechseln$/
 ]){const match=expression.exec(value);if(match)return ['notebook','laptop'].includes(match[1])?'notebook':'windows';}
 return null;
}
function recallIntent(text){
 if(typeof text!=='string')return false;
 const value=text.trim().toLocaleLowerCase('de-DE').replace(/[.!]+$/,'').trim();
 return /^(?:hierher zurückholen|(?:hol|hole) (?:lilith|das gespräch) hierher zurück)$/.test(value);
}
const same=(a,b)=>!!a&&!!b&&a.id===b.id&&a.profile===b.profile;
const storedSession=value=>value?.id?{id:value.id,profile:value.profile||'default',title:value.title||value.id}:null;
function failureDetail(code){const messages={target_offline:'Zielgerät nicht erreichbar.',target_busy:'Zielgerät ist beschäftigt.',target_locked:'Datenschutz ist auf dem Zielgerät aktiv.',target_ambiguous:'Zielgerät ist nicht eindeutig.',source_offline:'Verbindung zum Quellgerät fehlt.',source_online:'Quellgerät ist wieder erreichbar.',source_busy:'Quellgerät ist noch beschäftigt.',source_locked:'Datenschutz ist auf dem Quellgerät aktiv.',source_not_ready:'Quellgerät ist noch nicht zur Übergabe bereit.',source_not_owner:'Gespräch ist auf einem anderen Gerät aktiv.',ownership_changed:'Gespräch ist inzwischen auf einem anderen Gerät aktiv.',source_session_changed:'Gespräch wurde geändert.',session_mismatch:'Gespräch wurde geändert.',target_changed:'Zielgerät oder Gespräch wurde geändert.',source_instance_changed:'Verbindung zum Quellgerät wurde geändert.',target_instance_mismatch:'Verbindung zum Zielgerät wurde geändert.',instance_conflict:'Dieses Gerät ist bereits mit einer anderen App verbunden.',expired:'Bestätigung ist abgelaufen.',rejected:'Zielgerät hat die Übergabe abgelehnt.'};return Object.hasOwn(messages,code)?messages[code]:'Übergabe konnte nicht bestätigt werden.';}
function checkPrivateFile(file){
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024||process.platform!=='win32'&&((stat.mode&0o077)!==0||process.getuid&&stat.uid!==process.getuid()))throw Error('Private Übergabedatei hat unsichere Metadaten.');
}
function validateSaved(value){
 const token=text=>typeof text==='string'&&text.length>0&&text.length<=256&&!/[\x00-\x1f]/.test(text),session=row=>row&&token(row.id)&&token(row.profile),scope=row=>row&&typeof row.gatewayUrl==='string'&&row.gatewayUrl.length<=2048&&session(row.session)&&Number.isSafeInteger(row.revision)&&row.revision>=0;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['version','clientId','pending','ownership','passive','cacheIncomplete'].includes(key))||value.version!==1||value.cacheIncomplete!==undefined&&typeof value.cacheIncomplete!=='boolean'||!token(value.clientId)||!Array.isArray(value.ownership)||value.ownership.length>256||!value.ownership.every(row=>scope(row)&&token(row.ownerId))||!Array.isArray(value.passive)||value.passive.length>256||!value.passive.every(scope))throw Error('Private Übergabedatei ist ungültig.');
 const record=value.pending;if(record!==null&&(!record||!['source','target'].includes(record.role)||!token(record.requestId)||!session(record.session)||!token(record.profile)||record.profile!==record.session.profile||typeof record.gatewayUrl!=='string'||record.gatewayUrl.length>2048||!['waiting','requesting','selecting','accepting'].includes(record.stage)||record.role==='source'&&!['notebook','windows'].includes(record.targetKind)||record.recall!==undefined&&typeof record.recall!=='boolean'||record.offlineRecovery!==undefined&&typeof record.offlineRecovery!=='boolean'||record.role==='target'&&record.stage==='waiting'&&record.recall!==true||record.previous!==undefined&&record.previous!==null&&!session(record.previous)))throw Error('Private Übergabe ist ungültig.');
 return value;
}
function createSessionHandoff(options){
 const {stateFile}=options;if(!stateFile)throw Error('Private Übergabedatei fehlt.');
 let saved={};try{checkPrivateFile(stateFile);saved=validateSaved(JSON.parse(fs.readFileSync(stateFile,'utf8')));}catch(error){if(error.code!=='ENOENT')throw Error('Private Übergabedatei ist nicht lesbar oder ungültig.');}
 if(options.clientId&&saved.clientId&&options.clientId!==saved.clientId)throw Error('Private Übergabe gehört zu einem anderen Client.');
 const clientId=options.clientId||saved.clientId||crypto.randomUUID(),instanceId=crypto.randomUUID();
 let pending=saved.pending||null,ownership=saved.ownership||[],passive=saved.passive||[],cacheIncomplete=saved.cacheIncomplete===true,storageFailed=false,coordinatorReady=false,confirmedOwnership=new Set(),available=null,phase=pending?'uncertain':'idle',detail=pending?'Übergabestatus wird abgefragt':'',clients=[],timer=null,running=null,closed=false,verifiedRecall=null;
 const state=()=>{const value=options.getState();return {...value,session:storedSession(value.session),profile:value.profile||value.session?.profile||'default',gatewayUrl:value.gatewayUrl||''};};
 function trimCache(){const current=state(),needed=row=>row.gatewayUrl===current.gatewayUrl&&(same(row.session,current.session)||same(row.session,pending?.session)||same(row.session,pending?.previous)),trim=rows=>{if(rows.length<=256)return rows;cacheIncomplete=true;return [...rows.filter(needed),...rows.filter(row=>!needed(row)).sort((a,b)=>b.revision-a.revision)].slice(0,256);};ownership=trim(ownership);passive=trim(passive);}
 const persist=()=>{try{trimCache();fs.mkdirSync(path.dirname(stateFile),{recursive:true,mode:0o700});try{checkPrivateFile(stateFile);}catch(error){if(error.code!=='ENOENT')throw error;}const value={version:1,clientId,pending,ownership,passive,cacheIncomplete};validateSaved(value);const temporary=stateFile+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});fs.renameSync(temporary,stateFile);}finally{try{fs.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}storageFailed=false;}catch(error){storageFailed=true;throw error;}};
 function presence(){const current=state(),owner=ownership.find(row=>scoped(row,current)&&same(row.session,current.session));if(!owner)return null;const device=clients.find(row=>row.clientId===owner.ownerId);return {remote:owner.ownerId!==clientId,name:device?.name||(owner.ownerId===clientId?options.name:'Anderes Gerät'),kind:device?.kind||(owner.ownerId===clientId?options.kind:null),online:current.connected&&coordinatorReady&&device?.online===true,clientId:owner.ownerId};}
 const snapshot=()=>({available,phase,detail,presence:presence(),pending:pending?structuredClone(pending):null,passive:structuredClone(passive),clients:structuredClone(clients)});
 const publish=()=>{persist();if(!closed)options.onState?.(snapshot());};
 const scoped=(row,current)=>row.gatewayUrl===current.gatewayUrl;
 const ownerKey=(session,gatewayUrl)=>JSON.stringify([gatewayUrl,session.profile,session.id]);
 const canSubmit=session=>{const current=state(),selected=storedSession(session);if(!selected)return true;if(storageFailed||available===null&&current.connected)return false;if(pending&&pending.gatewayUrl===current.gatewayUrl&&(pending.stage!=='waiting'||pending.role==='target'&&pending.recall)&&(same(selected,pending.session)||same(selected,pending.previous)))return false;const owner=ownership.find(row=>scoped(row,current)&&same(row.session,selected));if(available===true&&(!coordinatorReady||!owner||owner.ownerId!==clientId||!confirmedOwnership.has(ownerKey(selected,current.gatewayUrl))))return false;if(cacheIncomplete&&!owner)return false;return !passive.some(row=>scoped(row,current)&&same(row.session,selected));};
 function registration(){const current=state();return {operation:'register',clientId,instanceId,profile:current.profile,name:options.name,kind:options.kind,session:current.session,busy:current.busy===true,privacyLocked:current.privacyLocked===true,connected:current.connected===true};}
 async function send(operation,values={}){const current=state(),result=await options.request({operation,clientId,instanceId,profile:pending?.profile||current.profile,...values});if(!result||result.supported!==true||result.error)throw Error(result?.error||'Übergabevertrag nicht bestätigt.');return result;}
 function ingest(result,current){
  available=true;coordinatorReady=true;clients=Array.isArray(result.clients)?result.clients:[];
  for(const row of result.ownership||[]){if(typeof row.sessionId!=='string'||row.profile!==current.profile||!Number.isSafeInteger(row.revision))continue;const old=ownership.find(value=>scoped(value,current)&&same(value.session,{id:row.sessionId,profile:row.profile}));if(old&&old.revision>row.revision)continue;ownership=ownership.filter(value=>!(scoped(value,current)&&same(value.session,{id:row.sessionId,profile:row.profile})));ownership.push({...row,session:{id:row.sessionId,profile:row.profile},gatewayUrl:current.gatewayUrl});passive=passive.filter(value=>!(scoped(value,current)&&same(value.session,{id:row.sessionId,profile:row.profile})));if(row.ownerId!==clientId)passive.push({session:{id:row.sessionId,profile:row.profile},gatewayUrl:current.gatewayUrl,revision:row.revision});}
  trimCache();const observed=new Set((result.ownership||[]).map(row=>ownerKey({id:row.sessionId,profile:row.profile},current.gatewayUrl)));confirmedOwnership=new Set(ownership.filter(row=>observed.has(ownerKey(row.session,row.gatewayUrl))).map(row=>ownerKey(row.session,row.gatewayUrl)));
  if(!pending&&phase==='unavailable'&&(!current.session||confirmedOwnership.has(ownerKey(current.session,current.gatewayUrl)))){phase='idle';detail=canSubmit(current.session)?'':'Gespräch auf dem anderen Gerät aktiv';}
 }
 async function settle(receipt){
  if(closed||!pending||receipt?.requestId!==pending.requestId||!same(receipt.session,pending.session))return;
  if(receipt.state==='committed'){
   const record=pending;if(!Number.isSafeInteger(receipt.revision)||receipt.revision<1)throw Error('Übergaberevision fehlt.');
   const newer=ownership.find(row=>row.gatewayUrl===record.gatewayUrl&&same(row.session,record.session)&&row.revision>receipt.revision);
   if(record.role==='source'&&!newer){passive=passive.filter(value=>!(value.gatewayUrl===record.gatewayUrl&&same(value.session,record.session)));passive.push({session:record.session,gatewayUrl:record.gatewayUrl,revision:receipt.revision});}
   pending=null;phase='committed';detail=newer?.ownerId===clientId?'Gespräch wieder auf diesem Gerät':record.role==='source'?'Gespräch wurde übernommen':'Gespräch übernommen';publish();if(record.role==='source'&&!newer)await options.onTransferred?.(record.session);if(record.role==='target'&&!newer&&identityValid(state(),record)&&same(state().session,record.session)&&canSubmit(record.session))await options.onReceived?.(record.session);return;
  }
  if(receipt.state==='failed'){
   const record=pending;
   if(record.role==='target'&&record.stage!=='waiting'){
    const current=state(),previousSelected=same(current.session,record.previous)||!current.session&&!record.previous||!!current.session&&!same(current.session,record.session);if(!current.connected||current.privacyLocked||current.busy||current.gatewayUrl!==record.gatewayUrl){phase='frozen';detail='Übernahme fehlgeschlagen · Auswahl bleibt gesperrt';publish();return;}
    try{if(!previousSelected){if(record.previous){await options.selectSession(record.previous);const restored=state();if(!identityValid(restored,record)||!same(restored.session,record.previous)||restored.generation!==current.generation)throw Error('restore_unconfirmed');}else{phase='frozen';detail='Übernahme fehlgeschlagen · Sessionauswahl erforderlich';publish();return;}}}catch{phase='frozen';detail='Vorherige Session noch nicht wiederhergestellt';publish();return;}
   }
   pending=null;phase='failed';detail=failureDetail(receipt.error);publish();
  }
 }
 const identityValid=(current,record)=>!closed&&current.connected&&!current.privacyLocked&&!current.busy&&current.gatewayUrl===record.gatewayUrl&&current.profile===record.profile;
 const recallSelectionValid=(current,record)=>!closed&&current.connected&&!current.privacyLocked&&current.gatewayUrl===record.gatewayUrl&&current.profile===record.profile&&same(current.session,record.session)&&current.generation===record.generation;
 async function verifyRecall(record){
  if(verifiedRecall===record.requestId)return;
  try{await options.selectSession(record.session);}catch(error){if(!recallSelectionValid(state(),record)||!state().busy)throw error;}
  if(!recallSelectionValid(state(),record))throw Error('target_changed');verifiedRecall=record.requestId;
 }
 async function receive(receipt){
  const before=state(),recalling=pending?.role==='target'&&pending.recall&&pending.stage==='waiting'&&pending.requestId===receipt.requestId&&same(pending.session,receipt.session);
  if(receipt.state!=='preparing'||receipt.targetId!==clientId||receipt.targetInstanceId!==instanceId||pending&&!recalling||!identityValid(before,{gatewayUrl:before.gatewayUrl,profile:receipt.session?.profile})||recalling&&!recallSelectionValid(before,pending))return;
  pending={role:'target',requestId:receipt.requestId,session:storedSession(receipt.session),profile:receipt.session.profile,gatewayUrl:before.gatewayUrl,previous:before.session,generation:before.generation,stage:'selecting',...(recalling?{recall:true,offlineRecovery:receipt.offlineRecovery===true}:{})};phase='preparing';detail='Gespräch wird übernommen';publish();
  let accepting=false;
  try{
   await options.selectSession(pending.session);let current=state();if(!identityValid(current,pending)||!same(current.session,pending.session)||current.generation!==before.generation)throw Error('target_changed');
   const selectedGeneration=current.generation;await options.showHistory?.(pending.session);current=state();if(!identityValid(current,pending)||!same(current.session,pending.session)||current.generation!==selectedGeneration)throw Error('target_changed');
   const registered=await options.request(registration());if(registered?.supported!==true||registered.error)throw Error(registered?.error||'target_changed');current=state();if(!identityValid(current,pending)||!same(current.session,pending.session)||current.generation!==selectedGeneration)throw Error('target_changed');
   pending.stage='accepting';publish();accepting=true;const response=await send('accept',{requestId:pending.requestId});ingest(response,current);await settle(response.receipt||response.request);
  }catch(error){
   if(closed)return;
   if(recalling&&!accepting&&pending&&recallSelectionValid(state(),pending)&&state().busy){pending.stage='waiting';phase='waiting';detail='Zurückholen wartet auf den laufenden Auftrag';publish();return;}
   if(accepting){phase='uncertain';detail='Bestätigung unklar · Gespräch bleibt gesperrt';publish();return;}
   try{const response=await send('reject',{requestId:pending.requestId,error:'target_changed'});await settle(response.receipt||response.request);}catch{phase='uncertain';detail='Übernahme unklar · Gespräch bleibt gesperrt';publish();}
  }
 }
 async function performTick(){
  const current=state();if(!current.connected){if(pending){phase='uncertain';detail='Verbindung fehlt · Übergabestatus unklar';publish();}return snapshot();}
  if(pending&&(pending.gatewayUrl!==current.gatewayUrl||pending.profile!==current.profile)){phase='uncertain';detail='Gateway oder Profil geändert · Übergabestatus dort prüfen';publish();return snapshot();}
  try{
   const registered=await options.request(registration());if(closed)return snapshot();if(registered?.supported!==true||registered.error)throw Error(registered?.error||'Übergabevertrag nicht bestätigt.');
   const result=await send('poll');if(closed)return snapshot();if(state().gatewayUrl!==current.gatewayUrl||state().profile!==current.profile)return snapshot();ingest(result,current);
   if(!pending){const recall=(result.outgoing||[]).find(row=>row.state==='requested'&&row.recall===true&&row.sourceId===clientId&&row.sourceInstanceId===instanceId&&same(row.session,current.session));const owner=ownership.find(row=>scoped(row,current)&&same(row.session,current.session));const target=recall&&clients.find(row=>row.clientId===recall.targetId&&row.instanceId===recall.targetInstanceId);if(recall&&owner?.ownerId===clientId&&['windows','notebook'].includes(target?.kind)){pending={role:'source',requestId:recall.requestId,targetKind:target.kind,session:storedSession(recall.session),profile:current.profile,gatewayUrl:current.gatewayUrl,generation:current.generation,stage:'waiting',recall:true};phase='waiting';detail='Rückgabe wartet auf den laufenden Auftrag';publish();}}
   if(pending){const receipt=[...(result.outgoing||[]),...(result.incoming||[])].find(row=>row.requestId===pending.requestId);if(receipt)await settle(receipt);
    if(pending?.role==='target'&&pending.stage==='accepting'&&receipt?.state==='preparing'&&receipt.targetInstanceId===instanceId){
     const latest=state(),valid=identityValid(latest,pending)&&same(latest.session,pending.session)&&latest.generation===pending.generation;
     const response=await send(valid?'accept':'reject',{requestId:pending.requestId,...(valid?{}:{error:'target_changed'})});ingest(response,latest);await settle(response.receipt||response.request);
    }
    if(pending?.role==='target'&&pending.recall&&pending.stage==='waiting'){
     const record=pending;
     if(!recallSelectionValid(state(),record)){
      if(receipt&&['requested','preparing'].includes(receipt.state)){const response=await send('reject',{requestId:record.requestId,error:'target_changed'});ingest(response,state());await settle(response.receipt||response.request);}
      else if(!receipt){pending=null;verifiedRecall=null;phase='failed';detail=failureDetail('target_changed');}
      else{phase='uncertain';detail='Zurückholen wartet auf einen bestätigten Übergabestatus';}
      publish();return snapshot();
     }
     await verifyRecall(record);
     if(state().busy){phase='waiting';detail='Zurückholen wartet auf den laufenden Auftrag';publish();return snapshot();}
     const response=await send('recall',{requestId:record.requestId,session:record.session});if(!recallSelectionValid(state(),record)){phase='frozen';detail='Session wurde während des Zurückholens geändert';publish();return snapshot();}ingest(response,state());const confirmed=response.receipt||response.request;await settle(confirmed);if(pending&&confirmed?.state==='preparing')await receive(confirmed);publish();return snapshot();
    }
    if(pending?.role==='source'&&(!receipt||receipt.state==='requested'&&pending.recall)){
     const latest=state();if(pending.stage==='waiting'&&(latest.busy||latest.privacyLocked)){phase='waiting';detail='Übergabe wartet auf den laufenden Auftrag';publish();return snapshot();}
     if(!same(latest.session,pending.session)||latest.profile!==pending.profile||pending.recall&&latest.generation!==pending.generation){if(pending.stage==='waiting'){pending=null;phase='failed';detail='Session wurde geändert';publish();}return snapshot();}
     pending.stage='requesting';phase='preparing';detail='Übergabe wird vorbereitet';publish();const response=await send('request',{requestId:pending.requestId,targetKind:pending.targetKind,session:pending.session});ingest(response,latest);await settle(response.receipt||response.request);
    }
   }
   if(!pending){const receipt=(result.incoming||[]).find(row=>row.state==='preparing'&&row.targetId===clientId);if(receipt)await receive(receipt);}
   publish();
  }catch(error){
   coordinatorReady=false;
   if(error.status===404||/HTTP 404|\b404\b/.test(error.message)){available=false;phase='unavailable';detail='Gesprächsübergabe am Gateway noch nicht verfügbar';if(pending?.role==='source'&&pending.stage==='waiting')pending=null;}
   else{if(available===false)available=null;phase=pending?'uncertain':'unavailable';detail=pending?'Übergabestatus unklar · Eingang bleibt gesperrt':failureDetail(error.code||error.message);}
   publish();
  }
  return snapshot();
 }
 function tick(){if(closed)return Promise.resolve(snapshot());if(running)return running;running=performTick().finally(()=>{running=null;});return running;}
 async function requestTransfer(targetKind){
  if(!['windows','notebook'].includes(targetKind)||targetKind===options.kind)throw Error('Ungültiges Übergabeziel.');if(pending)throw Error('Eine Gesprächsübergabe ist bereits offen.');const current=state();if(!current.connected||current.privacyLocked||!current.session)throw Error('Bitte verbinden und eine freigegebene Session wählen.');if(passive.some(row=>scoped(row,current)&&same(row.session,current.session)))throw Error('Dieses Gespräch gehört zum anderen Gerät.');
  pending={role:'source',requestId:crypto.randomUUID(),targetKind,session:current.session,profile:current.profile,gatewayUrl:current.gatewayUrl,stage:'waiting'};phase='waiting';detail='Übergabe wartet auf Leerlauf';publish();await tick();return snapshot();
 }
 async function requestRecall(){
  if(pending)throw Error('Eine Gesprächsübergabe ist bereits offen.');const current=state();if(!current.connected||current.privacyLocked||!current.session)throw Error('Bitte verbinden und eine freigegebene Session wählen.');
  if(ownership.some(row=>scoped(row,current)&&same(row.session,current.session)&&row.ownerId===clientId))throw Error('Dieses Gespräch ist bereits auf diesem Gerät.');
  pending={role:'target',requestId:crypto.randomUUID(),session:current.session,profile:current.profile,gatewayUrl:current.gatewayUrl,generation:current.generation,stage:'waiting',recall:true};phase='waiting';detail='Gespräch wird hierher zurückgeholt';publish();await tick();return snapshot();
 }
 function start(){if(closed)return Promise.resolve(snapshot());if(!timer){timer=setInterval(()=>{void tick().catch(()=>{cacheIncomplete=true;phase='frozen';detail='Übergabestatus konnte nicht sicher gespeichert werden';if(!closed)options.onState?.(snapshot());});},2000);timer.unref?.();}return tick();}
 function close(){closed=true;clearInterval(timer);timer=null;}
 persist();return {start,close,requestTransfer,requestRecall,tick,canSubmit,snapshot};
}
module.exports={handoffIntent,recallIntent,createSessionHandoff,handoffRequest};
