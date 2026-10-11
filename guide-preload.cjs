'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('guide',{
  on(callback){
    if(typeof callback!=='function')return ()=>{};
    const listener=(_event,value)=>callback(value);
    ipcRenderer.on('guide:event',listener);
    return ()=>ipcRenderer.removeListener('guide:event',listener);
  }
});
