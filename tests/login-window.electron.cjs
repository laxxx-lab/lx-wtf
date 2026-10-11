// Run with Electron --smoke --login under the same hidden launcher as the app.
const {app}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const resultFile=path.join(__dirname,'../.local/login-window-test.json');
fs.mkdirSync(path.dirname(resultFile),{recursive:true});
fs.writeFileSync(resultFile,JSON.stringify({ok:false,error:'Test noch nicht abgeschlossen.'}));
let finished=false;
const trace=[];
process.on('unhandledRejection',error=>trace.push({error:String(error)}));
function finish(error){
  if(finished)return;finished=true;
  fs.writeFileSync(resultFile,JSON.stringify({ok:!error,error:error?.message||null,trace}));
  app.quit();
}
app.on('browser-window-created',(_event,window)=>{
  window.on('show',()=>trace.push({show:window.id,visible:window.isVisible(),minimized:window.isMinimized(),bounds:window.getBounds()}));
  window.on('hide',()=>trace.push({hide:window.id}));
  window.webContents.on('did-finish-load',()=>{
    trace.push({loaded:window.id,url:window.webContents.getURL().split('?')[0]});
    if(!window.webContents.getURL().endsWith('/login'))return;
    setTimeout(()=>{
      try{
        assert.equal(window.isVisible(),true,'Das geladene Gateway-Anmeldefenster muss sichtbar sein.');
        finish();
      }catch(error){finish(error);}
    },700);
  });
});
require('../main.cjs');
setTimeout(()=>finish(new Error('Kein Gateway-Anmeldefenster geladen.')),6000);
