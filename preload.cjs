const {contextBridge,ipcRenderer}=require('electron');
const methods=['snapshot','connect','login','sessions','select','submit','interrupt','transcribe','audition','settings','expand','move','quit','wake-feed','wake-utterance','client-state','answer'];
contextBridge.exposeInMainWorld('hermes',{
  invoke:(method,payload)=>{
    if(!methods.includes(method)) return Promise.reject(new Error('Unbekannte Aktion.'));
    return ipcRenderer.invoke('companion:'+method,payload);
  },
  on:(callback)=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('companion:event',listener);return()=>ipcRenderer.removeListener('companion:event',listener);}
});
