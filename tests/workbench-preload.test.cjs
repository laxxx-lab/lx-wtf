'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('project library and bounded workspace layout are available only through the local preload allowlist',async()=>{
 let api;const calls=[],ctx=vm.createContext({require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>api=value},ipcRenderer:{invoke:async(...args)=>{calls.push(args);return {ok:true};}}})});vm.runInContext(fs.readFileSync(path.join(__dirname,'../workbench-preload.cjs'),'utf8'),ctx);
 for(const method of ['project-snapshot','project-pick','project-select','project-rename','project-remove','project-list','project-read','project-command','workspace-layout'])await api.invoke(method);
 assert.equal(calls.length,9);await assert.rejects(api.invoke('project-shell'),/Unbekannte/);
});
test('the local workbench may toggle its gesture guide through the real preload bridge',async()=>{
 let api;const calls=[],ctx=vm.createContext({require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>api=value},ipcRenderer:{invoke:async(...args)=>{calls.push(args);return {ok:true};}}})});vm.runInContext(fs.readFileSync(path.join(__dirname,'../workbench-preload.cjs'),'utf8'),ctx);
 await api.invoke('gesture-help',{enabled:true});assert.deepEqual(calls,[['workbench:invoke','gesture-help',{enabled:true}]]);await assert.rejects(api.invoke('arbitrary-command'),/Unbekannte/);
});
test('the real workbench preload forwards only the exact bounded amendment method to local IPC',async()=>{
 let api;const calls=[],ctx=vm.createContext({require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>api=value},ipcRenderer:{invoke:async(...args)=>{calls.push(args);return {ok:true};}}})});vm.runInContext(fs.readFileSync(path.join(__dirname,'../workbench-preload.cjs'),'utf8'),ctx);
 const payload={id:'37b9ad63-5a29-48a1-83b2-37984291c46a',instruction:'Bitte heller.'};await api.invoke('job-amend',payload);assert.deepEqual(calls,[['workbench:invoke','job-amend',payload]]);await assert.rejects(api.invoke('job-amend-shell',payload),/Unbekannte/);assert.equal(calls.length,1);
});
