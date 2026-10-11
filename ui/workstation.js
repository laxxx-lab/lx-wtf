(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  class WorkstationControls{
    constructor({invoke,notice,getSession,sendCamera,onSettings}){
      this.invoke=invoke;this.notice=notice;this.getSession=getSession;this.sendCamera=sendCamera;this.onSettings=onSettings;
      this.config={};this.modes=[];this.selectedMode='gaming';this.capture=new ScreenCapture();
      this.privacyLocked=false;
      for(const id of ['privacy-toggle','privacy-toggle-settings'])$(id).onclick=async()=>{try{await this.invoke('privacy',!this.privacyLocked);}catch(error){this.notice(error.message);}};
      for(const id of ['emergency-stop','emergency-stop-settings'])$(id).onclick=async()=>{try{await this.invoke('emergency-stop');}catch(error){this.notice(error.message);}};
      $('context-open').onclick=async()=>{try{await this.invoke('workbench-show','context');}catch(error){this.notice(error.message);}};
      root.hermes?.on(event=>{
        if(event.type==='privacy-state')this.syncSafety(event.locked===true);
        else if(event.type==='state'&&event.privacyLocked===true)this.syncSafety(true);
        else if(event.type==='settings-config'&&event.settings?.privacyLocked===true)this.syncSafety(true);
      });
      $('hudEnabled').onchange=()=>void this.change({hudEnabled:$('hudEnabled').checked});
      $('screenEnabled').onchange=()=>{if(!$('screenEnabled').checked)this.capture.cancel();void this.change({screenEnabled:$('screenEnabled').checked});};
      $('screenSourceId').onchange=()=>{this.capture.cancel();void this.change({screenSourceId:$('screenSourceId').value});};
      $('screen-refresh').onclick=()=>void this.refreshSources();
      $('screen-look').onclick=()=>void this.inspect('Was ist auf dem ausgewählten Bildschirm sichtbar?').catch(error=>this.notice(error.message));
      $('highlight-clear').onclick=()=>void this.invoke('highlight-clear');
      $('mode-select').onchange=()=>{this.readMode();this.selectedMode=$('mode-select').value;this.renderMode();};
      $('mode-app-pick').onclick=()=>void this.pickApps();
      $('mode-folder-pick').onclick=()=>this.pickFolders();
      $('mode-save').onclick=()=>void this.saveModes().catch(error=>this.notice(error.message));
      $('mode-run').onclick=()=>void this.saveModes().then(()=>this.run(this.selectedMode)).catch(error=>this.notice(error.message));
      $('apps-refresh').onclick=()=>void this.refreshApps();
      $('apps-add').onclick=()=>{const id=$('apps-catalog').value;if(!id)return;this.readMode();const mode=this.modes.find(m=>m.id===this.selectedMode);if(mode&&!mode.apps.includes(id)&&mode.apps.length<8){mode.apps.push(id);this.renderMode();}};
    }
    async change(values){try{const data=await this.invoke('settings',values);this.onSettings(data);this.config=data.settings;}catch(error){this.notice(error.message);}}
    async refreshApps(){try{const rows=await this.invoke('apps-catalog'),select=$('apps-catalog');select.replaceChildren();const blank=document.createElement('option');blank.value='';blank.textContent='Anwendung auswählen';select.append(blank);for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=row.name;select.append(option);}}catch(error){this.notice(error.message);}}
    sync(config){
      this.config=config;$('hudEnabled').checked=config.hudEnabled!==false;$('screenEnabled').checked=!!config.screenEnabled;
      $('screen-look').disabled=!config.screenEnabled;
      this.syncSafety(config.privacyLocked===true||this.privacyLocked);
      this.ensureSource(config.screenSourceId||'current-monitor');
      this.modes=(config.modes||[]).map(mode=>({...mode,apps:[...(mode.apps||[])],folders:[...(mode.folders||[])],sites:(mode.sites||[]).map(site=>typeof site==='string'?{url:site,name:''}:{...site})}));const select=$('mode-select');select.replaceChildren();
      for(const mode of this.modes){const option=document.createElement('option');option.value=mode.id;option.textContent=mode.name;select.append(option);}
      if(!this.modes.some(mode=>mode.id===this.selectedMode))this.selectedMode=this.modes[0]?.id||'';
      select.value=this.selectedMode;this.renderMode();
    }
    syncSafety(locked){
      this.privacyLocked=locked;
      for(const id of ['privacy-toggle','privacy-toggle-settings'])$(id).textContent=locked?'Entsperren':'Datenschutz sperren';
      $('privacy-status').textContent=locked?'Datenschutz aktiv · Sensoren gesperrt':'Sensoren unter deiner Kontrolle';
      for(const id of ['screenEnabled','wakeWord','cameraEnabled','gesturesEnabled']){$(id).disabled=locked;if(locked)$(id).checked=false;}
      if(locked){this.capture.cancel();this.config={...this.config,privacyLocked:true,screenEnabled:false};}
      else this.config={...this.config,privacyLocked:false};
      $('screen-look').disabled=locked||!$('screenEnabled').checked;
    }
    ensureSource(id){const select=$('screenSourceId');if(![...select.options].some(option=>option.value===id)){const option=document.createElement('option');option.value=id;option.textContent='Ausgewählte Quelle';select.append(option);}select.value=id;}
    async refreshSources(){
      try{const sources=await this.invoke('screen-sources'),select=$('screenSourceId'),selected=this.config.screenSourceId||'current-monitor';select.replaceChildren();
        const current=document.createElement('option');current.value='current-monitor';current.textContent='Monitor, auf dem Lilith steht';select.append(current);
        for(const source of sources){const option=document.createElement('option');option.value=source.id;option.textContent=(source.id.startsWith('screen:')?'Monitor · ':'Fenster · ')+source.name;select.append(option);}
        this.ensureSource(selected);
      }catch(error){this.notice(error.message);}
    }
    readMode(){const mode=this.modes.find(item=>item.id===this.selectedMode);if(!mode)return;
      mode.name=$('mode-name').value.trim()||mode.name;mode.apps=$('mode-apps').value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
      mode.folders=$('mode-folders').value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
      mode.sites=$('mode-sites').value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
        const named=!/^https?:\/\//i.test(line)&&line.match(/^(.*?)\s*\|\s*(https?:\/\/.*)$/i);
        return named?{name:named[1].trim(),url:named[2]}:{name:'',url:line};
      });
      mode.instructions=$('mode-instructions').value;for(const key of ['quiet','cameraOff','standby'])mode[key]=$('mode-'+key).checked;
    }
    renderMode(){const mode=this.modes.find(item=>item.id===this.selectedMode);if(!mode)return;
      $('mode-name').value=mode.name;$('mode-apps').value=mode.apps.join('\n');$('mode-instructions').value=mode.instructions;
      $('mode-folders').value=mode.folders.join('\n');$('mode-sites').value=mode.sites.map(site=>site.name?site.name+' | '+site.url:site.url).join('\n');
      for(const key of ['quiet','cameraOff','standby'])$('mode-'+key).checked=!!mode[key];
    }
    values(){this.readMode();return {hudEnabled:$('hudEnabled').checked,screenEnabled:$('screenEnabled').checked,screenSourceId:$('screenSourceId').value,modes:this.modes};}
    async saveModes(){this.readMode();const data=await this.invoke('settings',{modes:this.modes});this.onSettings(data);this.sync(data.settings);this.notice('Einsatzmodus gespeichert.');}
    async pickApps(){try{this.readMode();const paths=await this.invoke('mode-app-pick');const mode=this.modes.find(item=>item.id===this.selectedMode);if(mode){mode.apps=[...new Set([...mode.apps,...paths])].slice(0,8);this.renderMode();}}catch(error){this.notice(error.message);}}
    async pickFolders(){try{this.readMode();const paths=await this.invoke('mode-folder-pick');const mode=this.modes.find(item=>item.id===this.selectedMode);if(mode){mode.folders=[...new Set([...mode.folders,...paths])].slice(0,8);this.renderMode();}}catch(error){this.notice(error.message);}}
    modeStatus(result){const steps=[...(result.apps||[]),...(result.folders||[]),...(result.sites||[])];$('mode-status').textContent=result.name+(result.ok?(steps.length?' · Öffnen angefordert':' · Einstellungen angewendet'):' · Aktionen fehlgeschlagen')+(result.instructionsSubmitted?' · Ablauf an Hermes übermittelt':'');return steps;}
    async run(id){const result=await this.invoke('mode-run',id),steps=this.modeStatus(result);if(!result.ok)this.notice(steps.filter(step=>step.accepted===false).map(step=>step.error).filter(Boolean).join(' · ')||'Bitte die Aktionen im Einsatzmodus prüfen.');return result;}
    async look(question,sessionId=this.getSession()?.id){const scene=await this.invoke('screen-look',{question,sessionId});this.scene(scene);return scene;}
    async inspect(question){const scene=await this.invoke('screen-inspect',{question});this.scene(scene);return scene;}
    scene(scene){$('screen-description').textContent=scene.source.name+' · '+scene.description+(scene.uncertain?'\nNicht sicher erkennbar.':'');}
    async send(text,sessionId){
      if(await this.invoke('stop-intent',text))return this.invoke('stop-task',{sessionId,speak:true});
      const workspace=String(text).trim().toLowerCase().replace(/^(?:lilith|hermes|lillis)[,\s]+/,'').replace(/[.!]$/,'');
      if(/^(?:öffne|zeige|öffne die|zeige die) (?:digitale )?(?:werkstatt|workbench)$/.test(workspace))return this.invoke('workbench-show','system');
      if(/^(?:schließe|verberge|schließe die|verberge die) (?:digitale )?(?:werkstatt|workbench)$/.test(workspace))return this.invoke('workbench-hide');
      const content=await this.invoke('current-content-intent',text);if(content)return this.invoke('current-content-read',{kind:content.kind,question:content.question,sessionId});
      if(await this.invoke('system-intent',text))return this.invoke('system-report',{speak:true,sessionId});
      const intel=await this.invoke('intel-intent',text);if(intel)return this.invoke('intel-look',{question:text,request:intel,sessionId});
      const mode=await this.invoke('mode-intent',text);if(mode)return this.run(mode);
      if(await this.invoke('screen-intent',text))return this.look(text,sessionId);
      return this.sendCamera(text,sessionId);
    }
  }
  root.WorkstationControls=WorkstationControls;
})(window);
