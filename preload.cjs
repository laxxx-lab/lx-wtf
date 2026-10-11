const {contextBridge,ipcRenderer}=require('electron');
const methods=['snapshot','audio-outputs','audio-output','system-intent','system-report','workbench-toggle','workbench-show','workbench-hide','gesture-action','gesture-state','apps-catalog','connect','login','sessions','select','submit','standby','interrupt','transcribe','vad-reset','vad-feed','audition','settings','expand','move','quit','wake-feed','wake-utterance','wake-greet','wake-match','control-ack','client-state','answer','camera-intent','camera-profiles','camera-frame','camera-enroll','camera-forget','camera-look','screen-intent','screen-sources','screen-look','screen-inspect','mode-intent','mode-run','mode-app-pick','highlight-clear'];
methods.push('privacy','emergency-stop','context-read','context-clear','routine-intent','routine-run','routine-save','routine-delete','logs-pick','wake-offline');
methods.push('intel-intent','intel-look');
methods.push('wake-resume');
methods.push('voice-timing');
methods.push('current-content-intent','current-content-read','stop-intent','stop-task','mode-folder-pick');
contextBridge.exposeInMainWorld('hermes',{
  invoke:(method,payload)=>{
    if(!methods.includes(method)) return Promise.reject(new Error('Unbekannte Aktion.'));
    return ipcRenderer.invoke('companion:'+method,payload);
  },
  on:(callback)=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('companion:event',listener);return()=>ipcRenderer.removeListener('companion:event',listener);}
});
