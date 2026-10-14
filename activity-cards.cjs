'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const MAX_CARDS=6,MAX_DISMISSED=128,FRESH_MS=120000,MAX_FUTURE_MS=7*86400000;
const validId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
function timestamp(value,name){
 if(typeof value!=='string'||value.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw Error(name+' braucht einen ISO-Zeitpunkt mit Zeitzone.');
 const [year,month,day,hour,minute,second]=value.slice(0,19).split(/[-T:]/).map(Number);if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||hour>23||minute>59||second>59)throw Error(name+' ist ungültig.');
 const time=Date.parse(value);if(!Number.isFinite(time))throw Error(name+' ist ungültig.');return time;
}
function text(value,name,max,required=false){if(value===undefined&&!required)return '';if(typeof value!=='string'||value.length>max||required&&!value.trim())throw Error(name+' ist ungültig.');return value.trim();}
function normalize(value,current,persisted=false){
 if(!value||typeof value!=='object'||Array.isArray(value)||!validId(value.id))throw Error('Ungültige Aktivitätskarte.');
 const allowed=persisted?['id','kind','title','detail','source','observedAt','status','dueAt','startedAt','cameraEntity']:['action','id','kind','title','detail','source','observedAt','status','deadline','startedAt','cameraEntity'];
 if(Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Unbekannte Felder der Aktivitätskarte. Medienadressen werden separat freigegeben.');
 if(!['status','countdown','camera'].includes(value.kind)||!['running','complete','unavailable','estimate'].includes(value.status))throw Error('Ungültiger Kartentyp oder Gerätestatus.');
 const observed=timestamp(value.observedAt,'Beobachtungszeit');if(!persisted&&(current-observed>FRESH_MS||observed-current>5000))throw Error('Die Gerätebeobachtung ist nicht aktuell.');
 const card={id:value.id,kind:value.kind,title:text(value.title,'Titel',120,true),detail:text(value.detail,'Beschreibung',500),source:text(value.source,'Quelle',80),observedAt:new Date(observed).toISOString(),status:value.status};
 if(value.kind==='camera'){
  if(typeof value.cameraEntity!=='string'||!/^camera\.[a-z0-9_]{1,120}$/.test(value.cameraEntity))throw Error('Ungültige Kamera-Entität.');card.cameraEntity=value.cameraEntity;
 }else if(value.cameraEntity!==undefined)throw Error('Kamera-Entität nur für Kamerakarten.');
 const deadline=persisted?value.dueAt:value.deadline;
 if(deadline!==undefined){
  if(value.kind!=='countdown')throw Error('Endzeit nur für Countdown-Karten.');
  const dueAt=persisted?deadline:timestamp(deadline,'Endzeit');if(!Number.isFinite(dueAt)||!persisted&&dueAt-current>MAX_FUTURE_MS)throw Error('Endzeit darf höchstens sieben Tage entfernt liegen.');card.dueAt=dueAt;
 }
 if(value.kind==='countdown'&&['running','estimate'].includes(value.status)&&card.dueAt===undefined)throw Error('Ein laufender Countdown braucht eine Endzeit.');
 if(value.startedAt!==undefined){const start=persisted?value.startedAt:timestamp(value.startedAt,'Startzeit');if(value.kind!=='countdown'||!Number.isFinite(start)||card.dueAt===undefined||start>=card.dueAt||!persisted&&start>current+5000)throw Error('Ungültige Countdown-Startzeit.');card.startedAt=start;}
 return card;
}
function createActivityCards({file=null,now=Date.now,onChange=()=>{}}={}){
 let state={version:1,cards:[],dismissed:{}},loadError=null;
 if(file){try{
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!saved||saved.version!==1||!Array.isArray(saved.cards)||saved.cards.length>MAX_CARDS||!saved.dismissed||typeof saved.dismissed!=='object'||Array.isArray(saved.dismissed)||Object.keys(saved.dismissed).length>MAX_DISMISSED)throw Error('Ungültiger Speicherstand.');
  const cards=saved.cards.map(card=>normalize(card,now(),true));if(new Set(cards.map(card=>card.id)).size!==cards.length)throw Error('Doppelte Karten.');
  const dismissed={};for(const [id,time] of Object.entries(saved.dismissed)){if(!validId(id)||!Number.isFinite(time)||cards.some(card=>card.id===id))throw Error('Ungültige geschlossene Karte.');dismissed[id]=time;}state={version:1,cards,dismissed};
 }catch(error){if(error.code!=='ENOENT')loadError='Gespeicherte Aktivitätskarten konnten nicht gelesen werden. Die Datei bleibt erhalten.';}}
 function read(){const current=now();return {cards:state.cards.map(card=>{const copy={...card};if(card.dueAt!==undefined){copy.remainingSeconds=Math.max(0,Math.ceil((card.dueAt-current)/1000));copy.overdue=card.dueAt<=current&&['running','estimate'].includes(card.status);}return copy;}).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt)),...(loadError?{error:loadError}:{})};}
 function commit(next){
  if(file){const temporary=file+'.'+randomUUID()+'.tmp';try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(temporary,JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(temporary,file);}finally{try{fs.unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}}
  state=next;const snapshot=read();onChange(snapshot);return snapshot;
 }
 function execute(value){
  if(loadError)throw Error(loadError);if(!value||typeof value!=='object'||Array.isArray(value)||!validId(value.id))throw Error('Ungültige Aktivitätskarte.');
  const current=now(),next={version:1,cards:state.cards.map(card=>({...card})),dismissed:{...state.dismissed}},index=next.cards.findIndex(card=>card.id===value.id);
  if(value.action==='upsert'){
   const card=normalize(value,current),previous=index>=0?Date.parse(next.cards[index].observedAt):next.dismissed[value.id];if(previous!==undefined&&Date.parse(card.observedAt)<=previous)return read();
   if(index<0&&next.cards.length>=MAX_CARDS)throw Error('Es sind bereits sechs Aktivitätskarten geöffnet.');
   delete next.dismissed[value.id];if(index>=0)next.cards[index]=card;else next.cards.push(card);
  }else if(value.action==='dismiss'){
   if(Object.keys(value).some(key=>!['action','id'].includes(key)))throw Error('Ungültige Schließanforderung.');if(index<0)return read();
   for(const [id,time] of Object.entries(next.dismissed))if(current-time>FRESH_MS)delete next.dismissed[id];
   if(Object.keys(next.dismissed).length>=MAX_DISMISSED)throw Error('Zu viele geschlossene Aktivitätskarten. Bitte kurz warten.');next.dismissed[value.id]=Date.parse(next.cards[index].observedAt);next.cards.splice(index,1);
  }else throw Error('Unbekannte Kartenaktion.');
  return commit(next);
 }
 return {execute,read};
}
module.exports={createActivityCards};
