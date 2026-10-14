'use strict';
// Isolated native verification: no microphone, user profile, gateway or cameras.
const {app,BrowserWindow,screen,ipcMain}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-activities-native-'));
app.setPath('userData',path.join(temp,'profile'));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 try{
  const root=path.join(temp,'app');fs.mkdirSync(path.join(root,'ui'),{recursive:true});
  for(const file of ['activity-card-preload.cjs','ui/activity-card.html','ui/activity-card.js','ui/activity-card.css'])fs.copyFileSync(path.join(__dirname,'..',file),path.join(root,file));
  const keep=new BrowserWindow({width:300,height:200,show:true});await keep.loadURL('data:text/html,<title>Native Prüfung</title>');keep.focus();
  let allowed=true;const cards=require('../activity-card-window.cjs').createActivityCardWindow({BrowserWindow,screen,ipcMain,root,allowed:()=>allowed}),payload={action:'upsert',id:'native-check',kind:'countdown',title:'Anzeigeprüfung',detail:'Keine Gerätedaten',source:'Prüfkarte',observedAt:new Date().toISOString(),deadline:new Date(Date.now()+300000).toISOString(),status:'estimate'};
  const result=await cards.execute(payload);assert.equal(result.display.shown,true);
  const popup=BrowserWindow.getAllWindows().find(win=>win!==keep);assert.ok(popup);assert.equal(popup.webContents.session===keep.webContents.session,false,'Card permission policy cannot replace microphone policy');assert.equal(popup.isAlwaysOnTop(),true);assert.equal(popup.isFocused(),false,'Proactive display does not steal keyboard focus');
  const state=await popup.webContents.executeJavaScript(`(async()=>{const s=await window.lilithCard.snapshot();return {s,title:document.getElementById('card-title').textContent,countdown:document.getElementById('card-countdown').textContent,label:document.getElementById('countdown-label').textContent,width:innerWidth,scroll:document.documentElement.scrollWidth};})()`);
  assert.equal(state.s.cards[0].title,'Anzeigeprüfung');assert.equal(state.title,'Anzeigeprüfung');assert.match(state.countdown,/^[45]:\d{2}$/);assert.match(state.label,/Geschätzte/);assert.ok(state.scroll<=state.width);
  if(process.env.ACTIVITY_PREVIEW_PATH){await popup.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const picture=await popup.webContents.capturePage();assert.equal(picture.isEmpty(),false);fs.writeFileSync(process.env.ACTIVITY_PREVIEW_PATH,picture.toPNG());}
  allowed=false;await cards.sync();assert.equal(popup.isDestroyed(),true);assert.deepEqual(cards.read().cards,[]);await assert.rejects(cards.execute(payload),/Datenschutz/);
  allowed=true;await cards.sync();const restored=BrowserWindow.getAllWindows().find(win=>win!==keep);assert.ok(restored);const persisted=require('../activity-cards.cjs').createActivityCards({file:path.join(root,'.local/activity-cards.json')});assert.equal(persisted.read().cards.length,1);
  await restored.webContents.executeJavaScript(`window.lilithCard.dismiss('native-check')`);assert.equal(cards.read().cards.length,0);assert.equal(restored.isVisible(),false);
  cards.hide();keep.destroy();console.log('Native activity popup: IPC, countdown, isolated permissions, no focus steal, privacy, persistence and dismiss verified.');app.exit(0);
 }catch(error){console.error(error.stack);app.exit(1);}
});
