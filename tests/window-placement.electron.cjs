'use strict';
// Actual native test, using only this process's disposable window.
const {app,BrowserWindow}=require('electron'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const root=path.dirname(__dirname),qa=path.join(root,'.local/window-placement-qa');fs.mkdirSync(qa,{recursive:true});app.setPath('userData',path.join(qa,'profile'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{let win;try{
 const native=require('../windows-control.cjs').createWindowsControl();win=new BrowserWindow({width:620,height:420,show:false,title:'Lilith · Fensterprüfung'});await win.loadURL('data:text/html,<title>Lilith · Fensterprüfung</title><body>Native Fensteranordnung – kontrolliertes Testfenster</body>');win.showInactive();
 const first=await native.read(),target=first.windows.find(w=>w.pid===process.pid);assert.ok(target,'Own visible test window is missing');const primary=first.desktop.monitors.find(m=>m.primary),placements=[];
 for(const monitor of first.desktop.monitors){const area=monitor.workArea,rect={x:area.x+40,y:area.y+80,width:Math.min(800,area.width-80),height:Math.min(500,area.height-160)},result=await native.place({id:target.id,pid:target.pid,processStartedAt:target.processStartedAt,monitorId:monitor.id,rect});assert.equal(result.verified,true,JSON.stringify(result));placements.push({monitorId:monitor.id,...result.evidence.rect});}
 win.maximize();const area=primary.workArea,rect={x:area.x+80,y:area.y+120,width:900,height:600},restored=await native.place({id:target.id,pid:target.pid,processStartedAt:target.processStartedAt,monitorId:primary.id,rect});assert.equal(restored.verified,true,JSON.stringify(restored));
 const fresh=await native.read(),current=fresh.windows.find(w=>w.id===target.id);assert.deepEqual(current.rect,rect);assert.equal(current.minimized,false);
 const result={ok:true,sessionId:first.desktop.sessionId,monitors:first.desktop.monitors,placements,maximizedRestoreVerified:restored.verified};fs.writeFileSync(path.join(qa,'result.json'),JSON.stringify(result));console.log(JSON.stringify(result));win.destroy();app.exit(0);
 }catch(error){fs.writeFileSync(path.join(qa,'result.json'),JSON.stringify({ok:false,error:error.message}));console.error(error.stack);win?.destroy();app.exit(1);}});
