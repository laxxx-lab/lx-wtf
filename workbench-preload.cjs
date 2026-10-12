'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const methods=['snapshot','tab','command','action','browser','hide','graph-pick','graph-index','graph-snapshot','graph-search','graph-source','intel-snapshot','intel-query','intel-open','guide-clear','gesture-help','background-stop','background-reconcile','circle-open','craft-snapshot','craft-select','craft-open','craft-focus','craft-refresh','craft-command','craft-stream-start','craft-stream-stop','craft-input','job-retry','job-cancel','job-reconcile','job-resume','awareness-action','awareness-dismiss','teach-start','teach-confirm','teach-save','teach-cancel'];
contextBridge.exposeInMainWorld('workbench',{
  invoke(method,payload){if(!methods.includes(method))return Promise.reject(new Error('Unbekannte Aktion.'));return ipcRenderer.invoke('workbench:invoke',method,payload);},
  on(callback){const listener=(_event,data)=>callback(data);ipcRenderer.on('workbench:event',listener);return ()=>ipcRenderer.removeListener('workbench:event',listener);}
});
