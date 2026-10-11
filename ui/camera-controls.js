(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  class CameraControls{
    constructor({invoke,notice,onSettings,getSession}){
      this.invoke=invoke;this.notice=notice;this.onSettings=onSettings;this.getSession=getSession;this.config={};this.device='';this.enrolling=false;this.settingRequest=0;
      this.controller=new CameraController({video:$('camera-preview'),canvas:$('camera-frame'),onFrame:image=>this.invoke('camera-frame',image),onState:state=>this.render(state)});
      for(const key of ['cameraEnabled','cameraRecognize','cameraGreetings'])$(key).onchange=()=>void this.change({[key]:$(key).checked});
      $('cameraDeviceId').onchange=()=>void this.change({cameraDeviceId:$('cameraDeviceId').value});
      $('camera-refresh').onclick=()=>void this.refreshDevices();
      $('camera-look').onclick=()=>void this.look('Was siehst du durch meine Kamera?').catch(error=>this.notice(error.message));
      $('camera-enroll').onclick=()=>void this.enroll();
      $('camera-forget').onclick=()=>void this.forget();
      $('camera-look').disabled=true;$('camera-enroll').disabled=true;$('camera-forget').disabled=true;
    }
    async change(values){
      const request=++this.settingRequest;
      if(values.cameraEnabled===false)this.controller.disable();
      try{const data=await this.invoke('settings',values);if(request===this.settingRequest)this.onSettings(data);}catch(error){if(request===this.settingRequest)this.notice(error.message);}
    }
    async sync(config){
      this.config={...config};
      for(const key of ['cameraEnabled','cameraRecognize','cameraGreetings'])$(key).checked=!!config[key];
      const device=config.cameraDeviceId||'';
      if(device&&![...$('cameraDeviceId').options].some(option=>option.value===device)){const option=document.createElement('option');option.value=device;option.textContent='Ausgewählte Kamera';$('cameraDeviceId').append(option);}
      $('cameraDeviceId').value=device;
      if(!config.cameraEnabled){this.controller.disable();return;}
      if(this.controller.active&&this.device===device)return;
      this.device=device;
      const active=await this.controller.enable(device);
      if(active)void this.refreshDevices();
    }
    async refreshDevices(){
      const rows=await this.controller.devices();const selected=this.config.cameraDeviceId||'';
      const select=$('cameraDeviceId');select.replaceChildren();
      const blank=document.createElement('option');blank.value='';blank.textContent='Standardkamera';select.append(blank);
      for(const [index,row]of rows.entries()){const option=document.createElement('option');option.value=row.deviceId;option.textContent=row.label||'Kamera '+(index+1);select.append(option);}
      if(selected&&!rows.some(row=>row.deviceId===selected)){const option=document.createElement('option');option.value=selected;option.textContent='Ausgewählte Kamera (nicht verfügbar)';select.append(option);}
      select.value=selected;
    }
    async refreshProfiles(){try{const result=await this.invoke('camera-profiles');this.profiles(result.profileNames);}catch(error){this.notice(error.message);}}
    profiles(names){
      const select=$('camera-profile'),current=select.value;
      if(JSON.stringify(names)===this.profileSignature)return;this.profileSignature=JSON.stringify(names);
      select.replaceChildren();
      if(!names.length){const option=document.createElement('option');option.value='';option.textContent='Keine Gesichter eingerichtet';select.append(option);}
      for(const name of names){const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);}
      if(names.includes(current))select.value=current;
      $('camera-forget').disabled=!names.length;
    }
    render(state){
      $('camera-indicator').hidden=!state.active;$('camera-preview-wrap').hidden=!state.active;
      $('camera-look').disabled=!state.active;$('camera-enroll').disabled=!state.active||this.enrolling;
      $('camera-status').textContent=state.active?'Kamera aktiv · lokal':'Kamera aus';
      if(state.error){$('camera-status').textContent='Kamera: '+this.errorText(state.error);return;}
      const overlay=$('camera-overlay'),context=overlay.getContext('2d');
      if(!state.active){context.clearRect(0,0,overlay.width,overlay.height);return;}
      if(!state.result)return;
      this.profiles(state.result.profileNames||[]);
      overlay.width=$('camera-frame').width;overlay.height=$('camera-frame').height;context.clearRect(0,0,overlay.width,overlay.height);
      const faces=state.result.faces||[];
      for(const face of faces){const [x,y,w,h]=face.box;context.strokeStyle=face.name?'#70f2e0':'#ffbd70';context.lineWidth=2;context.strokeRect(x,y,w,h);context.font='24px Segoe UI, sans-serif';context.fillStyle=context.strokeStyle;context.fillText(face.name||'Gesicht',Math.max(3,x),Math.max(26,y-7));}
      $('camera-status').textContent=faces.length?faces.map(face=>face.name||'Gesicht sichtbar').join(' · '):'Kamera aktiv · kein Gesicht sichtbar';
    }
    errorText(text){
      if(/exactly one/.test(text))return 'Bitte genau ein Gesicht zeigen.';
      if(/Move closer|well-lit|fully visible/.test(text))return 'Bitte näher kommen und das Gesicht gut beleuchten.';
      if(/did not match/.test(text))return 'Die Bilder passen nicht zusammen. Bitte neu einrichten.';
      if(/camera.*(not active|not ready)/i.test(text))return 'Bitte Kamera einschalten und die Vorschau abwarten.';
      if(/Permission|NotAllowed|denied/i.test(text))return 'Kamerazugriff wurde nicht erlaubt.';
      return text;
    }
    async enroll(){
      if(this.enrolling)return;this.enrolling=true;$('camera-enroll').disabled=true;
      const generation=this.controller.generation,name=$('camera-name').value.trim();
      try{
        if(!name)throw new Error('Bitte deinen Namen eingeben.');
        for(let i=0;i<3;i++){
          if(!this.controller.active||generation!==this.controller.generation)throw new Error('Einrichtung abgebrochen.');
          const result=await this.invoke('camera-enroll',{name,image:this.controller.capture()});
          if(generation!==this.controller.generation)throw new Error('Einrichtung abgebrochen.');
          $('camera-status').textContent=`Gesichtsreferenz ${result.enrollment.count} / ${result.enrollment.required}`;
          if(result.enrollment.complete){this.profiles(result.profileNames);this.notice(name+' ist jetzt lokal eingerichtet.');break;}
          await new Promise(resolve=>setTimeout(resolve,700));
        }
      }catch(error){this.notice(this.errorText(error.message));}
      finally{this.enrolling=false;$('camera-enroll').disabled=!this.controller.active;}
    }
    async forget(){const name=$('camera-profile').value;if(!name)return;try{const result=await this.invoke('camera-forget',name);this.profiles(result.profileNames);this.notice('Lokale Gesichtsreferenz gelöscht.');}catch(error){this.notice(error.message);}}
    scene(scene){$('camera-description').textContent=scene.description+(scene.uncertain?'\nNicht eindeutig erkennbar.':'');}
    source(){const track=this.controller.stream?.getVideoTracks?.()[0],data=track?.getSettings?.()||{};return {deviceId:data.deviceId||this.device||'',label:track?.label||''};}
    capture(){const image=this.controller.capture();return {image,source:this.source(),capturedAt:new Date().toISOString()};}
    async look(question,sessionId=this.getSession()?.id){if(!this.controller.active)throw new Error('Bitte zuerst die Kamera einschalten.');return this.invoke('camera-look',{...this.capture(),question,sessionId});}
    async send(text,sessionId){if(VoiceInteraction.isStandbyRequest(text))return this.invoke('standby',{sessionId});if(this.controller.active&&await this.invoke('camera-intent',text))return this.look(text,sessionId);return this.invoke('submit',{text,sessionId});}
  }
  root.CameraControls=CameraControls;
})(window);
