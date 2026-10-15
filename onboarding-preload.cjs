'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('onboarding',Object.freeze({snapshot:()=>ipcRenderer.invoke('onboarding:snapshot'),save:value=>ipcRenderer.invoke('onboarding:save',value),progress:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('onboarding:progress',listener);return ()=>ipcRenderer.removeListener('onboarding:progress',listener);}}));
