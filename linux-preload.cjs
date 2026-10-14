'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const methods=['snapshot','connect','login','select','submit','interrupt','privacy','workbench','settings','transcribe','audition','answer','mcp-enroll','panel','quit','handoff','recall','input-state','activity','wake-resume'];
contextBridge.exposeInMainWorld('lilith',{invoke(method,value){if(!methods.includes(method))return Promise.reject(Error('Unbekannte Aktion.'));return ipcRenderer.invoke('linux:'+method,value);},on(callback){const listener=(_event,data)=>callback(data);ipcRenderer.on('linux:event',listener);return()=>ipcRenderer.removeListener('linux:event',listener);}});
