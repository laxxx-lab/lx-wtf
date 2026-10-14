const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('lilithCard',{
 snapshot:()=>ipcRenderer.invoke('lilith-card:snapshot'),dismiss:id=>ipcRenderer.invoke('lilith-card:dismiss',id),
 openCamera:id=>ipcRenderer.invoke('lilith-card:camera',id),
 on:callback=>{const listener=(_event,snapshot)=>callback(snapshot);ipcRenderer.on('lilith-card:state',listener);return()=>ipcRenderer.removeListener('lilith-card:state',listener);}
});
