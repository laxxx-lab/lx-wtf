'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('the local workbench may toggle its gesture guide through the real preload bridge',async()=>{
 let api;const calls=[],ctx=vm.createContext({require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>api=value},ipcRenderer:{invoke:async(...args)=>{calls.push(args);return {ok:true};}}})});vm.runInContext(fs.readFileSync(path.join(__dirname,'../workbench-preload.cjs'),'utf8'),ctx);
 await api.invoke('gesture-help',{enabled:true});assert.deepEqual(calls,[['workbench:invoke','gesture-help',{enabled:true}]]);await assert.rejects(api.invoke('arbitrary-command'),/Unbekannte/);
});
