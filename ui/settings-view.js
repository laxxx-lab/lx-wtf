(function(factory){if(typeof module==='object'&&module.exports)module.exports=factory();else window.LilithSettingsView=factory();})(function(){
 'use strict';
 function create({root,platform,onOpenChange,notice=()=>{}}){
  const doc=root.ownerDocument,notebook=platform==='linux',groups=notebook?[['connection','Verbindung'],['devices','Audio & Mikrofon'],['orb','Orb'],['general','Allgemein']]:[['connection','Verbindung'],['voice','Sprache'],['devices','Geräte'],['orb','Orb'],['camera','Kamera'],['workplace','Arbeitsplatz'],['general','Allgemein']];
  let opened=false,built=false,active=groups[0][0],previousFocus;const panels=new Map(),buttons=new Map();
  function element(tag,className,text){const node=doc.createElement(tag);node.className=className;if(text)node.textContent=text;return node;}
  function select(id){active=id;for(const [key,panel] of panels){panel.hidden=key!==id;buttons.get(key).setAttribute('aria-current',key===id?'page':'false');}}
  function groupFor(node){
   const aria=node.getAttribute('aria-label');
   if(aria==='Kamera')return 'camera';if(aria==='Orb-Darstellung')return 'orb';if(aria==='JARVIS Arbeitsplatz')return 'workplace';
   if(['Mikrofon','Audioausgabe','Bluetooth'].includes(aria))return 'devices';if(aria==='Sprachbedienung')return 'voice';
   if(node.querySelector('#url'))return 'connection';
   if(['voice','delivery','wakeWord','bareNames'].some(id=>node.querySelector('#'+id)))return 'voice';
   return 'general';
  }
  function build(){
   if(built)return;built=true;const source=notebook?root.children[1]:root,original=Array.from(source.children);
   const heading=element('div','settings-view-heading'),title=element('div','settings-view-title'),back=element('button','settings-view-back','← Zurück zum Gespräch');back.type='button';back.addEventListener('click',close);title.append(element('span','settings-view-eyebrow',notebook?'LILITH / NOTEBOOK':'LILITH / WINDOWS'),element('h1','','Einstellungen'));heading.append(title,back);
   const nav=element('nav','settings-view-nav');nav.setAttribute('aria-label','Einstellungsbereiche');const content=element('div','settings-view-content'),footer=element('footer','settings-view-footer');
   for(const [id,label] of groups){const button=element('button','settings-view-tab',label);button.type='button';button.setAttribute('aria-controls','settings-view-'+id);button.addEventListener('click',()=>select(id));nav.append(button);buttons.set(id,button);const panel=element('section','settings-view-panel');panel.id='settings-view-'+id;panel.append(element('h2','',label));content.append(panel);panels.set(id,panel);}
   let current='connection',afterSave=false;
   for(const node of original){
    if(!notebook&&node.id==='save'){afterSave=true;footer.append(node);continue;}if(afterSave){footer.append(node);continue;}
    if(notebook){const field=node.getAttribute('for');if(field==='gateway-url')current='connection';if(field==='microphone'||field==='voice')current='devices';if(field==='orb-theme'||field==='orb-motion-mode')current='orb';if(field==='idle-standby-minutes')current='general';panels.get(current).append(node);}
    else panels.get(groupFor(node)).append(node);
   }
   footer.append(element('p','settings-view-help',notebook?'Änderungen werden direkt auf diesem Notebook gespeichert.':'Theme und Geräteauswahl direkt, übrige Änderungen mit „Einstellungen speichern“.'));
   root.append(heading,nav,content,footer);select(active);
  }
  function changed(value){try{Promise.resolve(onOpenChange?.(value)).catch(error=>notice(error.message));}catch(error){notice(error.message);}}
  function open(){if(opened)return;build();previousFocus=doc.activeElement;opened=true;root.hidden=false;if(notebook)root.open=true;doc.body.classList.add('settings-open');changed(true);buttons.get(active).focus({preventScroll:true});}
  function close({notify=true}={}){if(!opened)return;opened=false;doc.body.classList.remove('settings-open');if(notebook)root.open=false;else root.hidden=true;if(notify)changed(false);previousFocus?.focus?.();}
  if(notebook)root.querySelector('summary')?.addEventListener('click',event=>{event.preventDefault();open();});
  doc.addEventListener('keydown',event=>{if(opened&&event.key==='Escape'){event.preventDefault();close();}});
  return {open,close,isOpen:()=>opened};
 }
 return {create};
});
