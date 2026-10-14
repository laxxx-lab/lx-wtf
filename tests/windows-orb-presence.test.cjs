'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){const root=path.resolve(__dirname,'..'),calls=[],context=vm.createContext({__dirname:root,process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,fetch,console,require:name=>{
 if(name==='electron')return {app:{setPath(){},setName(){},setAppUserModelId(){},setLoginItemSettings(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false},ipcMain:{handle(){}},Notification:{isSupported:()=>false},screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:5120,height:1392}})}};
 if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(){},readFileSync(){throw Error('Isolated preferences');}};
 return require(name.startsWith('./')?path.resolve(root,name):name);
}});vm.runInContext(fs.readFileSync(path.join(root,'main.cjs'),'utf8'),context);context.calls=calls;vm.runInContext("emit=()=>{};positionHud=()=>{};globalThis.bounds={x:4930,y:1150,width:190,height:230};win={isDestroyed:()=>false,isVisible:()=>true,getBounds:()=>bounds,setBounds:value=>{bounds=value;},setAlwaysOnTop:(...args)=>calls.push(['top',...args]),moveTop:()=>calls.push(['raise'])};",context);return {calls,run:s=>vm.runInContext(s,context)};}
test('compact Windows orb is enlarged by 20 percent and docks fully above the taskbar',()=>{
 const f=fixture();f.run('expand(false)');assert.equal(f.run('bounds.width'),228);assert.equal(f.run('bounds.height'),276);assert.equal(f.run('bounds.x+bounds.width'),5108);assert.equal(f.run('bounds.y+bounds.height'),1380);
});
test('compact orb restores topmost level without stealing focus, while settings and explicit hiding remain respected',()=>{
 const f=fixture();assert.equal(f.run('typeof keepOrbOnTop'),'function');f.run('keepOrbOnTop()');assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[['top',true,'screen-saver'],['raise']]);f.calls.length=0;f.run('settingsWindowView={active:true};keepOrbOnTop()');assert.equal(f.calls.length,0);f.run('settingsWindowView=null;win.isVisible=()=>false;keepOrbOnTop()');assert.equal(f.calls.length,0);f.run('win.isVisible=()=>true;bounds.width=460;keepOrbOnTop()');assert.equal(f.calls.length,0);
});
