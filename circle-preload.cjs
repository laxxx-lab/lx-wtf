'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('circle',{
 invoke(method,value){if(!['preview','ask','cancel'].includes(method))return Promise.reject(Error('Unbekannte Auswahlaktion.'));return ipcRenderer.invoke('circle:invoke',method,value);},
 on(callback){const listener=(_event,value)=>callback(value);ipcRenderer.on('circle:event',listener);return ()=>ipcRenderer.removeListener('circle:event',listener);}
});
