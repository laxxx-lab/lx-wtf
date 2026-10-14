(() => {
 'use strict';
 const api=window.lilithCard,$=id=>document.getElementById(id),statuses={running:'Läuft',complete:'Abgeschlossen',unavailable:'Nicht verfügbar',estimate:'Schätzung'};
 let state={cards:[]},selectedId=null,mediaKey='';
 function card(){return state.cards.find(row=>row.id===selectedId)||state.cards[0]||null;}
 function notice(message){$('card-notice').textContent=String(message||'');$('card-notice').hidden=!message;}
 function clearMedia(){mediaKey='';$('camera-video').pause();$('camera-video').removeAttribute('src');$('camera-video').load();$('camera-video').hidden=true;$('camera-image').removeAttribute('src');$('camera-image').hidden=true;}
 function media(value){
  const key=value?.kind==='camera'&&value.mediaUrl&&['stream','snapshot'].includes(value.previewKind)?JSON.stringify([value.id,value.previewKind,value.mediaUrl]):'';
  if(key&&key===mediaKey)return;clearMedia();mediaKey=key;$('camera-state').textContent='Kamerabild noch nicht verbunden.';
  if(!key)return;
  const stream=value.previewKind==='stream',node=$(stream?'camera-video':'camera-image');node.hidden=false;if(stream)node.muted=true;node.src=value.mediaUrl;$('camera-state').textContent=stream?'Kamerabild wird verbunden …':'Momentaufnahme wird geladen …';
 }
 function countdown(){
  const value=card(),visible=!!value&&!state.privacyLocked&&value.kind==='countdown'&&['running','estimate'].includes(value.status)&&Number.isFinite(value.dueAt);$('countdown-block').hidden=!visible;if(!visible)return;
  const seconds=Math.max(0,Math.ceil((value.dueAt-Date.now())/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),remaining=seconds%60;
  $('card-countdown').textContent=hours?hours+':'+String(minutes).padStart(2,'0')+':'+String(remaining).padStart(2,'0'):minutes+':'+String(remaining).padStart(2,'0');
  $('countdown-label').textContent=value.status==='estimate'?'Geschätzte Restzeit':'Restzeit laut Gerät';$('card-time-status').textContent=seconds===0?'Zeit abgelaufen · Gerätestatus abwarten':'';
  const progress=Number.isFinite(value.startedAt)&&value.startedAt<value.dueAt;$('card-progress').hidden=!progress;if(progress)$('card-progress').value=Math.max(0,Math.min(1,(Date.now()-value.startedAt)/(value.dueAt-value.startedAt)));
 }
 function render(snapshot){
  state={...snapshot,cards:Array.isArray(snapshot?.cards)?snapshot.cards.slice(0,6):[]};const value=state.privacyLocked?null:card();selectedId=value?.id||null;
  $('card-content').hidden=!value;$('card-empty').hidden=!!value;$('card-empty').textContent=state.privacyLocked?'Datenschutz aktiv.':state.error||'Noch keine aktuelle Aktivität.';$('card-dismiss').disabled=!value;$('card-navigation').hidden=!value||state.cards.length<2;
  document.body.classList.toggle('unavailable',value?.status==='unavailable');document.body.classList.toggle('complete',value?.status==='complete');
  if(!value){clearMedia();$('card-observed').textContent='';countdown();return;}
  $('card-title').textContent=value.title;$('card-detail').textContent=value.detail||'';$('card-status').textContent=value.kind==='camera'&&value.status==='running'?'Kamera verfügbar':statuses[value.status]||'Status unbekannt';$('card-source').textContent=value.source||'';
  const observed=new Date(value.observedAt);$('card-observed').textContent=Number.isFinite(observed.getTime())?'Stand '+observed.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Beobachtungszeit unbekannt';
  $('card-position').textContent=(state.cards.findIndex(row=>row.id===value.id)+1)+' / '+state.cards.length;$('camera-block').hidden=value.kind!=='camera';media(value);countdown();
 }
 $('camera-video').addEventListener('playing',()=>{if(card()?.previewKind==='stream'&&mediaKey&&!state.privacyLocked)$('camera-state').textContent='Livebild';});
 $('camera-video').addEventListener('waiting',()=>{if(mediaKey)$('camera-state').textContent='Livebild wartet auf Daten …';});
 $('camera-image').addEventListener('load',()=>{if(card()?.previewKind==='snapshot'&&mediaKey&&!state.privacyLocked)$('camera-state').textContent='Momentaufnahme';});
 for(const id of ['camera-video','camera-image'])$(id).addEventListener('error',()=>{if(mediaKey)$('camera-state').textContent='Kamerabild nicht verfügbar.';});
 $('card-dismiss').addEventListener('click',()=>{const value=card();if(value)void api.dismiss(value.id).then(render).catch(error=>notice(error.message));});
 $('camera-open').addEventListener('click',()=>{const value=card();if(value?.kind==='camera')void api.openCamera(value.id).then(result=>notice(result.error|| (result.cameraOpened?'Kameraansicht geöffnet.':result.connected?'Kamera noch nicht verfügbar.':'Bitte in Home Assistant anmelden.'))).catch(error=>notice(error.message));});
 for(const [id,step] of [['card-previous',-1],['card-next',1]])$(id).addEventListener('click',()=>{if(!state.cards.length)return;const at=state.cards.findIndex(row=>row.id===selectedId);selectedId=state.cards[(at+step+state.cards.length)%state.cards.length].id;render(state);});
 api.on(event=>render(event?.snapshot||event));setInterval(countdown,1000);void api.snapshot().then(render).catch(error=>notice(error.message));
})();
