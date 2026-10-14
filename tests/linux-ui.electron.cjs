'use strict';
// Isolated real Chromium renderer. This never opens a microphone, model or gateway.
const {app,BrowserWindow,ipcMain,screen}=require('electron'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {createLinuxOrbWindow}=require('../linux-window.cjs');
const root=path.join(__dirname,'..'),output=path.join(root,'.local/linux-ui-qa'),calls=[],errors=[];
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));if(process.platform!=='linux')app.disableHardwareAcceleration();
let win,windowShell,state={panelOpen:true,status:'ready',detail:'Notebook-Renderer prüfen',connected:true,busy:false,session:{id:'linux-runtime',storedId:'linux-stored',title:'Notebook'},sessions:[{id:'linux-stored',title:'Notebook'}],settings:{url:'https://example.invalid',voice:'reference'},privacyLocked:false,generation:2,device:'QA Notebook',voiceReady:true,sttReady:true,voiceProfiles:[{id:'reference',label:'Deine Referenzstimme'}],approval:null};
const pause=()=>new Promise(resolve=>setTimeout(resolve,100));
ipcMain.handle('linux:snapshot',()=>state);
for(const method of ['submit','select','privacy','workbench','answer','interrupt','settings','login','audition','transcribe','panel','handoff','recall','input-state','activity','wake-resume','standby'])ipcMain.handle('linux:'+method,async(_event,value)=>{calls.push({method,value});if(method==='standby'){state={...state,standby:{active:true},generation:state.generation+1};win.webContents.send('linux:event',{type:'standby-state',active:true,generation:state.generation});return state;}if(method==='panel'){state={...state,panelOpen:value===true};win.webContents.send('linux:event',{type:'panel-state',expanded:value===true});return {expanded:value===true};}if(method==='privacy'){state={...state,privacyLocked:value,generation:state.generation+1};win.webContents.send('linux:event',{type:'state',snapshot:state});return state;}if(method==='settings'){state={...state,settings:{...state.settings,...value}};return state;}if(method==='select')return state;return {ok:true};});
async function update(values){state={...state,...values};win.webContents.send('linux:event',{type:'state',snapshot:state});await pause();}
async function run(){
  windowShell=createLinuxOrbWindow({BrowserWindow,screen,root});win=windowShell.win;win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});await win.loadFile(path.join(root,'ui/linux.html'));windowShell.setPanel(true);await pause();
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('sessions').value`),'linux-stored');
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('record').disabled`),false);
  await win.webContents.executeJavaScript(`document.getElementById('standby').click()`);await pause();assert.ok(calls.some(call=>call.method==='standby'));assert.equal(await win.webContents.executeJavaScript(`document.getElementById('phase').textContent`),'Standby');
  await update({standby:{active:false},generation:2});
  // Boundary contract: exact session identity accompanies every text submission.
  await win.webContents.executeJavaScript(`document.getElementById('command').value='Bitte diesen Text erklären';document.getElementById('command-form').requestSubmit();`);await pause();
  assert.ok(calls.some(call=>call.method==='submit'&&call.value.text==='Bitte diesen Text erklären'&&call.value.captured.sessionId==='linux-runtime'&&call.value.captured.generation===2));
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('idle-standby-minutes').value`),'15');
  await win.webContents.executeJavaScript(`document.getElementById('orb-motion-mode').value='animate';document.getElementById('orb-motion-mode').dispatchEvent(new Event('change'));`);await pause();
  assert.ok(calls.some(call=>call.method==='settings'&&call.value.orbMotion==='animate'));assert.equal(state.settings.orbMotion,'animate');
  await win.webContents.executeJavaScript(`document.getElementById('orb-motion-mode').value='reduce';document.getElementById('orb-motion-mode').dispatchEvent(new Event('change'));`);await pause();assert.equal(state.settings.orbMotion,'reduce');
  await win.webContents.executeJavaScript(`const field=document.getElementById('idle-standby-minutes');field.value='0';field.dispatchEvent(new Event('change'));`);await pause();assert.ok(calls.some(call=>call.method==='settings'&&call.value.idleStandbyMinutes===0));
  await update({status:'thinking',busy:true});assert.equal(await win.webContents.executeJavaScript(`document.getElementById('phase').textContent`),'Ich denke nach.');
  await update({status:'working'});assert.equal(await win.webContents.executeJavaScript(`document.getElementById('phase').textContent`),'Ich kümmere mich.');
  await update({status:'ready',busy:false});
  win.webContents.send('linux:event',{type:'reply',text:'<img src=x onerror="window.__injected=1">'});await pause();
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#transcript img')===null&&window.__injected!==1`),true);
  await update({handoff:{available:false,phase:'unavailable',detail:'Übergabe noch nicht verfügbar',pending:null},canSubmit:true});
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('handoff-status').textContent`),'Übergabe noch nicht verfügbar');
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('handoff').disabled`),true);
  await update({handoff:{available:true,phase:'idle',detail:'',pending:null}});
  await win.webContents.executeJavaScript(`document.getElementById('handoff').click()`);await pause();assert.ok(calls.some(call=>call.method==='handoff'&&call.value==='windows'));
  const submitted=calls.filter(call=>call.method==='submit').length;
  win.webContents.send('linux:event',{type:'history',sessionId:'linux-stored',messages:[{role:'user',content:'<img src=x onerror="window.__historyInjected=1">'},{role:'assistant',content:'Übernommener Verlauf'},{role:'tool',content:'Private Werkzeugausgabe'}]});await pause();
  assert.deepEqual(await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#transcript .message p'),node=>node.textContent)`),['<img src=x onerror="window.__historyInjected=1">','Übernommener Verlauf']);
  assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#transcript img')===null&&window.__historyInjected!==1`),true);assert.equal(calls.filter(call=>call.method==='submit').length,submitted);
  await update({canSubmit:false,handoff:{available:true,phase:'committed',detail:'Gespräch wurde übernommen',pending:null}});assert.deepEqual(await win.webContents.executeJavaScript(`({send:document.getElementById('send').disabled,record:document.getElementById('record').disabled})`),{send:true,record:true});
  await update({panelOpen:false,canSubmit:false,handoff:{available:true,pending:null,presence:{remote:true,name:'<img src=x> LaxXx-Gaming',online:false}}});
  assert.deepEqual(await win.webContents.executeJavaScript(`({label:document.getElementById('handoff-location').textContent,visible:getComputedStyle(document.getElementById('handoff-location')).display!=='none',recall:document.getElementById('orb-recall').disabled,injected:!!document.querySelector('#handoff-location img')})`),{label:'Auf <img src=x> LaxXx-Gaming · offline',visible:true,recall:false,injected:false});
  await win.webContents.executeJavaScript(`document.getElementById('orb-recall').click()`);await pause();assert.ok(calls.some(call=>call.method==='recall'));
  windowShell.setPanel(false);await pause();fs.writeFileSync(path.join(output,'linux-away.png'),(await win.webContents.capturePage()).toPNG());
  assert.equal(await win.webContents.executeJavaScript(`(()=>{const b=document.getElementById('orb-recall').getBoundingClientRect();return b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth})()`),true);
  windowShell.setPanel(true);
  await update({privacyLocked:true});assert.equal(await win.webContents.executeJavaScript(`document.getElementById('orb-recall').disabled`),true);
  await update({privacyLocked:false,panelOpen:true});
  await update({canSubmit:true,handoff:{available:true,phase:'idle',detail:'',pending:null}});
  await update({handoff:{available:true,phase:'uncertain',detail:'Vorherige Übergabe unklar',pending:{role:'source',session:{id:'different-session',profile:'default'}}}});
  assert.equal(await win.webContents.executeJavaScript(`document.getElementById('send').disabled`),false,'Another selected conversation remains usable during a transfer of the old conversation');
  await update({handoff:{available:true,phase:'idle',detail:'',pending:null}});
  await update({busy:true,status:'working'});assert.deepEqual(await win.webContents.executeJavaScript(`({send:document.getElementById('send').disabled,record:document.getElementById('record').disabled,stop:document.getElementById('stop').disabled})`),{send:true,record:true,stop:false});
  await update({busy:false,status:'question',approval:{id:'qa-question',kind:'clarify',scope:{gatewayId:1,sessionId:'linux-runtime',generation:2},questions:[{qid:'target',question:'Auf welchem Gerät?'},{qid:'format',question:'Welches Format?'}]}});
  await win.webContents.executeJavaScript(`document.querySelector('[data-qid="target"]').value='Notebook';document.querySelector('[data-qid="format"]').value='Text';document.getElementById('answer').click()`);await pause();
  assert.ok(calls.some(call=>call.method==='answer'&&call.value.answers.target==='Notebook'&&call.value.answers.format==='Text'&&call.value.approvalId==='qa-question'&&call.value.scope.gatewayId===1));
  await win.webContents.executeJavaScript(`document.getElementById('privacy').click()`);await pause();
  assert.deepEqual(await win.webContents.executeJavaScript(`({send:document.getElementById('send').disabled,record:document.getElementById('record').disabled,workbench:document.getElementById('workbench').disabled,approval:document.getElementById('approval').hidden,pressed:document.getElementById('privacy').getAttribute('aria-pressed')})`),{send:true,record:true,workbench:true,approval:true,pressed:'true'});
  await update({privacyLocked:false,connected:false,status:'offline',approval:null});assert.equal(await win.webContents.executeJavaScript(`document.getElementById('record').disabled`),true);
  await update({connected:true,status:'ready'});
  const sizes=[];for(const [width,height]of [[420,600],[520,760]]){win.setContentSize(width,height);await pause();assert.equal(await win.webContents.executeJavaScript(`document.documentElement.scrollWidth>innerWidth`),false);fs.writeFileSync(path.join(output,`linux-${width}.png`),(await win.webContents.capturePage()).toPNG());sizes.push({width,height});}
  win.setContentSize(190,230);state={...state,panelOpen:false};win.webContents.send('linux:event',{type:'panel-state',expanded:false});await pause();
  assert.equal(await win.webContents.executeJavaScript(`getComputedStyle(document.body).backgroundColor`),'rgba(0, 0, 0, 0)','The compact orb must leave the desktop visible');
  assert.equal(await win.webContents.executeJavaScript(`document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight`),false,'The compact orb must not contain the hidden conversation panel');
  await win.webContents.executeJavaScript(`document.getElementById('orb-panel').click()`);await pause();
  assert.ok(calls.some(call=>call.method==='panel'&&call.value===true));
  assert.equal(await win.webContents.executeJavaScript(`document.body.classList.contains('compact')`),false);
  win.setContentSize(190,230);state={...state,panelOpen:false};win.webContents.send('linux:event',{type:'panel-state',expanded:false});await pause();
  await win.webContents.executeJavaScript(`document.getElementById('orb-workbench').click()`);await pause();assert.ok(calls.some(call=>call.method==='workbench'));
  await update({privacyLocked:true});assert.equal(await win.webContents.executeJavaScript(`document.getElementById('orb-workbench').disabled`),true);
  await win.webContents.executeJavaScript(`document.getElementById('orb-stop').click()`);await pause();assert.ok(calls.some(call=>call.method==='interrupt'));
  fs.writeFileSync(path.join(output,'linux-orb.png'),(await win.webContents.capturePage()).toPNG());
  const renderer=win.webContents.id;windowShell.setPanel(false);await pause();const anchor=win.getBounds();assert.equal(anchor.width,190);assert.equal(anchor.height,230);assert.equal(win.isAlwaysOnTop(),true);
  const corner=(await win.webContents.capturePage()).getBitmap();assert.equal(corner[3],0,'The native orb window must preserve transparent corner pixels');
  windowShell.setPanel(true);await pause();assert.equal(win.webContents.id,renderer,'Opening the panel must preserve the audio owner and renderer');assert.equal(win.isAlwaysOnTop(),false);windowShell.setPanel(false);await pause();assert.deepEqual(win.getBounds(),anchor,'Closing the panel must return to the dragged orb position');
  let composite;
  if(process.platform==='linux'&&process.env.LILITH_QA_PYTHON){
    // Inspect only a deliberately blank fixture below our own orb, never the user's desktop contents.
    const area=screen.getPrimaryDisplay().workArea,back=new BrowserWindow({x:area.x+32,y:area.y+32,width:260,height:290,frame:false,alwaysOnTop:true,skipTaskbar:true,backgroundColor:'#174c6b',show:false});
    await back.loadURL('data:text/html,<body style="margin:0;background:%23174c6b"></body>');back.show();back.moveTop();await new Promise(resolve=>setTimeout(resolve,500));const behind=back.getContentBounds();win.setBounds({x:behind.x+30,y:behind.y+30,width:190,height:230});await pause();
    const bounds=win.getContentBounds(),python='import sys,json;from PIL import ImageGrab; x,y=map(int,sys.argv[1:]); image=ImageGrab.grab(bbox=(x,y,x+2,y+2),xdisplay=None); print(json.dumps(list(image.getpixel((0,0))[:3])))',pixel=()=>JSON.parse(execFileSync(process.env.LILITH_QA_PYTHON,['-c',python,String(bounds.x),String(bounds.y)],{encoding:'utf8'}));
    const before=pixel();win.show();win.moveTop();await new Promise(resolve=>setTimeout(resolve,500));composite={before,after:pixel(),scaleFactor:screen.getDisplayMatching(bounds).scaleFactor};fs.writeFileSync(path.join(output,'composite.json'),JSON.stringify(composite));assert.deepEqual(composite.after,composite.before,'The real X11 compositor must show the fixture through the transparent orb corner');win.hide();back.destroy();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,sizes,errors,composite,calls:calls.map(call=>call.method)},null,2));app.quit();
}
app.whenReady().then(run).catch(error=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.message,errors},null,2));app.exit(1);});
