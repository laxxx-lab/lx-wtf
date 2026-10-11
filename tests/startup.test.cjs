'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const root='C:\\Voice workspace';
const name='Hermes.Voice.Windows';
function fixture(settings={}){
  const writes=[],reads=[];
  return {writes,reads,app:{isReady:()=>true,setLoginItemSettings:value=>writes.push(value),getLoginItemSettings:value=>{reads.push(value);return {openAtLogin:false,openAsHidden:false,wasOpenedAtLogin:false,wasOpenedAsHidden:false,restoreState:false,status:'not-registered',executableWillLaunchAtLogin:false,launchItems:[],...settings};}}};
}
test('startup helper exports its Windows integration contract',()=>{
  let helper={};try{helper=require('../startup.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
  assert.equal(typeof helper.syncStartup,'function');assert.equal(typeof helper.startupSnapshot,'function');
});
test('startup enable and disable update both the Run entry and StartupApproved',()=>{
  const {syncStartup}=require('../startup.cjs'),f=fixture();
  syncStartup(f.app,{root,enabled:true,smoke:false});syncStartup(f.app,{root,enabled:false,smoke:false});
  assert.deepEqual(f.writes,[
    {name,path:process.execPath,args:[root],openAtLogin:true,enabled:true},
    {name,path:process.execPath,args:[root],openAtLogin:false,enabled:false}
  ]);
});
test('smoke and pre-ready startup synchronization leave Windows settings alone',()=>{
  const {syncStartup}=require('../startup.cjs'),f=fixture();
  syncStartup(f.app,{root,enabled:true,smoke:true});f.app.isReady=()=>false;syncStartup(f.app,{root,enabled:true,smoke:false});
  assert.equal(f.writes.length,0);assert.equal(f.reads.length,0);
});
test('startup status checks the named workspace entry instead of another Electron launch',()=>{
  const {startupSnapshot}=require('../startup.cjs');
  const own={name,path:process.execPath,args:[root],scope:'user',enabled:false};
  const f=fixture({openAtLogin:true,executableWillLaunchAtLogin:true,launchItems:[{...own,name:'Hermes.Desktop',enabled:true},{...own,args:['C:\\Other workspace'],enabled:true},own]});
  assert.deepEqual(startupSnapshot(f.app,root),{name,openAtLogin:true,registered:true,enabled:false,executableWillLaunchAtLogin:true});
  own.enabled=true;assert.equal(startupSnapshot(f.app,root).enabled,true);
  assert.deepEqual(f.reads,[{path:process.execPath,args:[root]},{path:process.execPath,args:[root]}]);
});
test('a missing named startup entry is disabled even when another executable entry launches',()=>{
  const {startupSnapshot}=require('../startup.cjs'),f=fixture({openAtLogin:true,executableWillLaunchAtLogin:true,launchItems:[{name,path:'C:\\Other electron.exe',args:[root],scope:'user',enabled:true}]});
  assert.equal(startupSnapshot(f.app,root).registered,false);assert.equal(startupSnapshot(f.app,root).enabled,false);
});
test('pre-ready startup status does not call the native settings getter',()=>{
  const {startupSnapshot}=require('../startup.cjs'),f=fixture();f.app.isReady=()=>false;
  assert.deepEqual(startupSnapshot(f.app,root),{name,openAtLogin:false,registered:false,enabled:false,executableWillLaunchAtLogin:false});assert.equal(f.reads.length,0);
});
