const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');
const {validAudioTarget}=require('./audio-output.cjs');
const {validBluetoothCommand}=require('./bluetooth.cjs');
const {validMicrophoneDeviceId}=require('./ui/microphone.js');
const {validateAppReference}=require('./modes.cjs');

const MAX_BODY_BYTES = 1024;
const ACTIONS = new Set(['camera', 'live', 'wakewords']);
function validHomeDisplay(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 if(value.action==='show')return Object.keys(value).every(k=>['action','query','cameraEntity','waitMs'].includes(k))&&(typeof value.query==='string'&&value.query.trim().length>0&&value.query.length<=120||typeof value.cameraEntity==='string'&&/^camera\.[a-z0-9_]{1,120}$/.test(value.cameraEntity))&&(value.query===undefined||typeof value.query==='string'&&value.query.trim().length>0&&value.query.length<=120)&&(value.cameraEntity===undefined||/^camera\.[a-z0-9_]{1,120}$/.test(value.cameraEntity))&&(value.waitMs===undefined||Number.isInteger(value.waitMs)&&value.waitMs>=100&&value.waitMs<=15000);
 return ['open','inventory','camera'].includes(value.action)&&Object.keys(value).every(k=>['action','cameraEntity'].includes(k))&&(value.action==='camera'?typeof value.cameraEntity==='string'&&/^camera\.[a-z0-9_]{1,120}$/.test(value.cameraEntity):value.cameraEntity===undefined);
}
const INTEL_KINDS=['earthquakes','cameras','ukraine','news','weather','flights','ships','stats','feed'];
function validIntelRequest(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['kind','query','region','lat','lon','radiusKm','date','feed'].includes(key))&&INTEL_KINDS.includes(value.kind)&&['query','region','date'].every(key=>value[key]===undefined||typeof value[key]==='string'&&value[key].length<=200)&&(value.kind!=='feed'||typeof value.feed==='string'&&/^[a-z][a-z0-9/-]{0,60}$/.test(value.feed))&&(value.feed===undefined||value.kind==='feed')&&['lat','lon','radiusKm'].every(key=>value[key]===undefined||Number.isFinite(value[key]))&&(value.lat===undefined||Math.abs(value.lat)<=90)&&(value.lon===undefined||Math.abs(value.lon)<=180)&&(value.radiusKm===undefined||value.radiusKm>0&&value.radiusKm<=1000)&&(value.date===undefined||/^\d{4}-\d{2}-\d{2}$/.test(value.date));}
function validGuideRequest(value){
  const rect=box=>!!box&&typeof box==='object'&&!Array.isArray(box)&&Object.keys(box).length===4&&['x','y','width','height'].every(key=>Number.isFinite(box[key]))&&box.width>1&&box.height>1&&box.width<=20000&&box.height<=20000;
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>['purpose','pid','windowId','windowRect','targetRect','observedAt','snapshotId','label','text','taskId','toolCallId','color','shape'].includes(key))&&['guide','activity'].includes(value.purpose)&&(value.color===undefined||value.purpose==='guide'&&['cyan','violet','amber','green'].includes(value.color))&&(value.shape===undefined||value.purpose==='guide'&&['frame','ellipse'].includes(value.shape))&&Number.isSafeInteger(value.pid)&&value.pid>0&&typeof value.windowId==='string'&&/^\d{1,20}$/.test(value.windowId)&&rect(value.windowRect)&&(value.targetRect===undefined||rect(value.targetRect))&&typeof value.observedAt==='string'&&Number.isFinite(Date.parse(value.observedAt))&&['snapshotId','taskId','toolCallId','label','text'].every(key=>value[key]===undefined||typeof value[key]==='string'&&value[key].length<=(key==='text'?500:160));
}

const CRAFT_IDS=['photo','vector','design','deck','grid','word','cad','light','sound','effect','film','pdf'];
function validCraftAppRequest(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&CRAFT_IDS.includes(value.appId);}
function validCraftLinkRequest(value){
  const local=file=>typeof file==='string'&&file.length<=500&&!/[\x00-\x1f]/.test(file)&&/^[A-Za-z]:[\\/]/.test(file);
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&CRAFT_IDS.includes(value.appId)&&Object.keys(value).every(k=>['appId','port','tokenFile','endpointFile'].includes(k))&&(value.port===undefined||Number.isInteger(value.port)&&value.port>0&&value.port<=65535)&&['tokenFile','endpointFile'].every(k=>value[k]===undefined||local(value[k]))&&(value.appId==='pdf'?!!value.endpointFile:value.port!==undefined);
}
function validEverydayRequest(action,v){
 const exact=keys=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 const optionalJob=keys=>exact(keys)||exact([...keys,'jobId'])&&typeof v.jobId==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v.jobId);
 if(action==='microphone')return exact(['deviceId'])&&validMicrophoneDeviceId(v.deviceId);
 if(action==='volume')return exact(['action'])&&['up','down','mute','unmute'].includes(v.action)||exact(['action','value'])&&v.action==='set'&&Number.isInteger(v.value)&&v.value>=0&&v.value<=100;
 if(action==='app-open'){if(!optionalJob(['appId']))return false;try{return validateAppReference(v.appId)===v.appId;}catch{return false;}}
 if(action==='window-focus')return optionalJob(['id','pid','processStartedAt'])&&typeof v.id==='string'&&/^[1-9][0-9]{0,19}$/.test(v.id)&&Number.isSafeInteger(v.pid)&&v.pid>0&&typeof v.processStartedAt==='string'&&v.processStartedAt.length<=64&&Number.isFinite(Date.parse(v.processStartedAt));
 if(action==='window-place'){if(!optionalJob(['id','pid','processStartedAt','monitorId','rect']))return false;const {jobId,...target}=v;return require('./windows-control.cjs').validPlacement(target);}
 if(action==='power')return exact(['action'])&&v.action==='cancel'||exact(['action','delaySeconds'])&&['shutdown','restart'].includes(v.action)&&Number.isInteger(v.delaySeconds)&&v.delaySeconds>=30&&v.delaySeconds<=86400;
 if(action==='reminders')return exact(['action','id'])&&v.action==='cancel'&&typeof v.id==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v.id)||exact(['action','kind','text','at'])&&v.action==='create'&&['reminder','alarm'].includes(v.kind)&&typeof v.text==='string'&&v.text.trim().length>0&&v.text.length<=500&&typeof v.at==='string'&&v.at.length<=64&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v.at)&&Number.isFinite(Date.parse(v.at));
 return false;
}
async function createControlApi({ port = 8872, token, readStatus, onCommand, onLook, onScreen, onContent, onHighlight, onMode, readModes, onWorkbench,readContext,readTasks,readRoutines,onRoutine,onStop,onStopTask,readGraph,onGraphSearch,onGraphSource,readIntelCatalog,onIntel,onGuide,clearGuide,readArtcraft,onArtcraft,readAudioOutputs,onAudioOutput,readBluetooth,onBluetooth,readMicrophones,onMicrophone,readVolume,onVolume,readApps,onAppOpen,readWindows,onWindowFocus,onWindowPlace,readPower,onPower,readReminders,onReminder,onBrowser,onClipboard,readActivityCards,onActivityCard,onHomeDisplay,onSessionHandoff,onNewSession,enabledActions=null }) {
  if (typeof token !== 'string' || !token || typeof readStatus !== 'function' || typeof onCommand !== 'function') {
    throw new Error('Invalid control API configuration');
  }
  const expectedAuthorization = Buffer.from(`Bearer ${token}`);
  let commandChain = Promise.resolve(),controlEpoch=0;
  const server = http.createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    const reply = (status, value) => {
      if (res.writableEnded || res.destroyed) return;
      const body = JSON.stringify(value);
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': Buffer.byteLength(body),
        ...(status === 413 ? { Connection: 'close' } : {}),
      });
      res.end(body);
    };
    try {
      if (req.headers.origin !== undefined) return reply(403, { error: 'Browser requests are forbidden' });
      if (!req.url.startsWith('/v1/')) return reply(404, { error: 'Not found' });
      const authorization = Buffer.from(req.headers.authorization || '');
      if (authorization.length !== expectedAuthorization.length || !timingSafeEqual(authorization, expectedAuthorization)) {
        return reply(401, { error: 'Unauthorized' });
      }
      const action = req.url.slice('/v1/'.length);
      if(enabledActions&&!enabledActions.includes(action))return reply(404,{error:'Not found'});
      if (!['session-handoff','session-new','activity-cards','home-display','clipboard','browser','status','look','standby','screen','current-content','highlight','mode','modes','workbench','context','tasks','routines','routine','privacy','stop','emergency-stop','graph','graph-search','graph-source','intel-catalog','intel','guide','guide-clear','artcraft','artcraft-select','artcraft-open','artcraft-link','audio-outputs','audio-output','bluetooth-devices','bluetooth','microphones','microphone','volume','apps','app-open','windows','window-focus','window-place','power','reminders'].includes(action) && !ACTIONS.has(action)) return reply(404, { error: 'Not found' });
      const bodyLimit=action==='clipboard'?131072:action==='activity-cards'?4096:MAX_BODY_BYTES;
      const dual=['activity-cards','browser','volume','power','reminders'].includes(action);
      if (!dual&&req.method !== (['status','modes','context','tasks','routines','graph','intel-catalog','artcraft','audio-outputs','bluetooth-devices','microphones','apps','windows'].includes(action) ? 'GET' : 'POST')||dual&&!['GET','POST'].includes(req.method)) return reply(405, { error: 'Method not allowed' });
      if (Number(req.headers['content-length'] || 0) > bodyLimit) {
        req.resume();
        return reply(413, { error: 'Payload too large' });
      }
      const body = await new Promise((resolve, reject) => {
        let bytes = 0;
        const chunks = [];
        req.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > bodyLimit) {
            chunks.length = 0;
            reject(Object.assign(new Error('Payload too large'), { status: 413 }));
          } else chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', () => reject(Object.assign(new Error('Invalid request'), { status: 400 })));
        req.on('aborted', () => reject(Object.assign(new Error('Invalid request'), { status: 400 })));
      });
      const everydayRead={microphones:readMicrophones,volume:readVolume,apps:readApps,windows:readWindows,power:readPower,reminders:readReminders}[action];
      if(req.method==='GET'&&['microphones','volume','apps','windows','power','reminders'].includes(action))return typeof everydayRead==='function'?reply(200,await everydayRead()):reply(503,{error:'Control unavailable'});
      if(action==='bluetooth-devices')return typeof readBluetooth==='function'?reply(200,await readBluetooth()):reply(503,{error:'Bluetooth unavailable'});
      if(action==='audio-outputs')return typeof readAudioOutputs==='function'?reply(200,await readAudioOutputs()):reply(503,{error:'Audio unavailable'});
      if(action==='activity-cards'&&req.method==='GET'){
        if(typeof readActivityCards!=='function')return reply(503,{error:'Activity cards unavailable'});
        const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});
        return reply(200,await readActivityCards());
      }
      if(action==='browser'&&req.method==='GET'){if(typeof onBrowser!=='function')return reply(503,{error:'Browser unavailable'});const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});return reply(200,{ok:true,browser:await onBrowser({action:'state'})});}
      if (action === 'status') return reply(200, await readStatus());
      if (action === 'modes') return typeof readModes==='function'?reply(200,{modes:await readModes()}):reply(503,{error:'Modes are unavailable'});
      const reader={context:readContext,tasks:readTasks,routines:readRoutines,graph:readGraph,'intel-catalog':readIntelCatalog,artcraft:readArtcraft}[action];
      if(['context','tasks','routines','graph','intel-catalog','artcraft'].includes(action))return typeof reader==='function'?reply(200,await reader()):reply(503,{error:'Resource unavailable'});
      let payload;
      try { payload = JSON.parse(body); } catch { return reply(400, { error: 'Invalid JSON' }); }
      const expectedSession=req.headers['x-lilith-session'];
      if(expectedSession!==undefined){const current=await readStatus();if(current?.privacyLocked||current?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});if(typeof expectedSession!=='string'||!expectedSession||expectedSession.length>128||current?.sessionContext?.id!==expectedSession)return reply(409,{error:'Selected device conversation changed'});}
      if(action==='session-handoff'){
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||!['state','recall','transfer'].includes(payload.action)||Object.keys(payload).some(k=>!['action','target'].includes(k))||(payload.action==='transfer'?!['windows','notebook'].includes(payload.target):payload.target!==undefined))return reply(400,{error:'Invalid handoff request'});
        const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});
        if(typeof onSessionHandoff!=='function')return reply(503,{error:'Conversation handoff unavailable'});
        return reply(200,await onSessionHandoff(payload,{expectedSession}));
      }
      if(['activity-cards','home-display'].includes(action)){
        const callback=action==='activity-cards'?onActivityCard:onHomeDisplay;
        if(typeof callback!=='function')return reply(503,{error:'Activity display unavailable'});
        if(action==='home-display'&&!validHomeDisplay(payload))return reply(400,{error:'Invalid home display request'});
        const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});
        return reply(200,await callback(payload,{expectedSession}));
      }
      if(action==='session-new'){
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length)return reply(400,{error:'New session requires an empty body'});
        if(typeof onNewSession!=='function')return reply(503,{error:'New device conversation unavailable'});
        const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});
        return reply(200,await onNewSession());
      }
      if(action==='clipboard'){
        const plain=payload&&typeof payload==='object'&&!Array.isArray(payload),keys=plain?Object.keys(payload):[];
        const read=plain&&payload.action==='read'&&keys.every(k=>['action','maxChars'].includes(k))&&(payload.maxChars===undefined||Number.isInteger(payload.maxChars)&&payload.maxChars>=1&&payload.maxChars<=20000);
        const write=plain&&payload.action==='write'&&keys.length===2&&keys.includes('text')&&typeof payload.text==='string'&&payload.text.length>0&&payload.text.length<=20000&&!payload.text.includes('\0');
        if(!read&&!write)return reply(400,{error:'Invalid clipboard request'});
        if(typeof onClipboard!=='function')return reply(503,{error:'Clipboard unavailable'});
        const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});
        return reply(200,await onClipboard(payload));
      }
      if(action==='browser'){try{require('./workbench.cjs').validateWorkbenchBrowserRequest(payload);}catch{return reply(400,{error:'Invalid browser request'});}if(typeof onBrowser!=='function')return reply(503,{error:'Browser unavailable'});const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});return reply(200,{ok:true,browser:await onBrowser(payload)});}
      if(['microphone','volume','app-open','window-focus','window-place','power','reminders'].includes(action)){
        if(!validEverydayRequest(action,payload))return reply(400,{error:'Invalid typed control request'});
        const callback={microphone:onMicrophone,volume:onVolume,'app-open':onAppOpen,'window-focus':onWindowFocus,'window-place':onWindowPlace,power:onPower,reminders:onReminder}[action];
        if(typeof callback!=='function')return reply(503,{error:'Control unavailable'});
        if(action==='window-place'){const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)return reply(423,{error:'Local privacy lock is active'});}
        req.socket.setTimeout(35000);const epoch=controlEpoch,command=commandChain.then(async()=>{if(epoch!==controlEpoch)throw Object.assign(new Error('Stopped'),{status:423});if(expectedSession!==undefined){const current=await readStatus();if(current?.privacyLocked||current?.privacy?.locked)throw Object.assign(Error('Privacy locked'),{status:423});if(current?.sessionContext?.id!==expectedSession||current.sessionContext.canSubmit!==true)throw Object.assign(Error('Selected conversation changed'),{status:409});}if(action==='window-place'){const state=await readStatus();if(state?.privacyLocked||state?.privacy?.locked)throw Object.assign(Error('Privacy locked'),{status:423});}return callback(payload);});commandChain=command.catch(()=>{});
        const result=await command;return reply(200,{ok:['power','reminders'].includes(action)?result.ok===true:result.verified===true,action,result});
      }
      if(action==='bluetooth'){
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.hasOwn(payload,'type')||!validBluetoothCommand({...payload,type:'bluetooth'}))return reply(400,{error:'Expected a typed Bluetooth operation and exact device ID'});
        if(typeof onBluetooth!=='function')return reply(503,{error:'Bluetooth unavailable'});
        req.socket.setTimeout(50000);const epoch=controlEpoch,command=commandChain.then(()=>{if(epoch!==controlEpoch)throw Object.assign(new Error('Stopped'),{status:423});return onBluetooth({...payload,type:'bluetooth'});});commandChain=command.catch(()=>{});
        const result=await command;return reply(200,{ok:result.verified===true,action,result});
      }
      if(action==='audio-output'){
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==1||!validAudioTarget(payload.target))return reply(400,{error:'Expected a render output or configured alias'});
        if(typeof onAudioOutput!=='function')return reply(503,{error:'Audio unavailable'});
        const epoch=controlEpoch,command=commandChain.then(()=>{if(epoch!==controlEpoch)throw Object.assign(new Error('Stopped'),{status:423});return onAudioOutput(payload.target);});commandChain=command.catch(()=>{});
        const result=await command;return reply(200,{ok:result.verified===true,action,result});
      }
      if(action==='current-content'){
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!['kind','question','selection'].includes(key))||!['clipboard','window','remembered'].includes(payload.kind)||typeof payload.question!=='string'||!payload.question.trim()||payload.question.length>500||payload.selection!==undefined&&(payload.kind!=='window'||payload.selection!=='pointer'))return reply(400,{error:'Expected an explicit content kind, short question and optional pointer selection for a window'});
        if(typeof onContent!=='function')return reply(503,{error:'Current content unavailable'});
        const observation=await onContent({kind:payload.kind,question:payload.question.trim(),...(payload.selection==='pointer'?{selection:'pointer'}:{})});
        return reply(200,{ok:true,action,observation,status:await readStatus()});
      }
      if(['artcraft-select','artcraft-open','artcraft-link'].includes(action)){
        if(!(action==='artcraft-link'?validCraftLinkRequest(payload):validCraftAppRequest(payload)))return reply(400,{error:'Invalid Artcraft request'});
        if(typeof onArtcraft!=='function')return reply(503,{error:'Artcraft unavailable'});
        return reply(200,{ok:true,result:await onArtcraft(action,payload)});
      }
      if(action==='graph-search'){
        if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.query!=='string'||!payload.query.trim()||payload.query.length>300)return reply(400,{error:'Expected a short query'});
        if(typeof onGraphSearch!=='function')return reply(503,{error:'Graph unavailable'});
        return reply(200,{ok:true,result:await onGraphSearch(payload.query.trim())});
      }
      if(action==='graph-source'){
        if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.id!=='string'||!payload.id||payload.id.length>400)return reply(400,{error:'Expected a graph node identifier'});
        if(typeof onGraphSource!=='function')return reply(503,{error:'Graph unavailable'});return reply(200,{ok:true,result:await onGraphSource(payload.id)});
      }
      if(action==='intel'){
        if(!validIntelRequest(payload))return reply(400,{error:'Invalid intelligence query'});
        if(typeof onIntel!=='function')return reply(503,{error:'Intelligence unavailable'});
        req.socket.setTimeout(45000);return reply(200,{ok:true,result:await onIntel(payload)});
      }
      if(action==='guide'){
        if(!validGuideRequest(payload))return reply(400,{error:'Invalid observed guide target'});
        if(typeof onGuide!=='function')return reply(503,{error:'Guidance unavailable'});
        return reply(200,{ok:true,guide:await onGuide(payload)});
      }
      if(action==='guide-clear'){
        if(!payload||Array.isArray(payload)||Object.keys(payload).length)return reply(400,{error:'Expected an empty object'});
        if(typeof clearGuide!=='function')return reply(503,{error:'Guidance unavailable'});
        clearGuide();return reply(200,{ok:true});
      }
      // Safety controls must never wait behind a pending sensor confirmation.
      if(action==='stop'){
        if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length)return reply(400,{error:'Expected an empty object'});
        if(typeof onStopTask!=='function')return reply(503,{error:'Task stop unavailable'});
        controlEpoch++;return reply(200,{ok:true,action,result:await onStopTask(),status:await readStatus()});
      }
      if(action==='emergency-stop'){
        if(!payload||Array.isArray(payload)||Object.keys(payload).length)return reply(400,{error:'Expected an empty object'});
        if(typeof onStop!=='function')return reply(503,{error:'Stop unavailable'});
        controlEpoch++;return reply(200,{ok:true,action,result:await onStop(),status:await readStatus()});
      }
      if(action==='privacy'){
        if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.enabled!=='boolean')return reply(400,{error:'Expected only an enabled boolean'});
        if(!payload.enabled)return reply(403,{error:'Unlock privacy locally in Lilith'});
        controlEpoch++;await onCommand('privacy',true);return reply(200,{ok:true,action,status:await readStatus()});
      }
      if(action==='routine'){
        if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(payload.id))return reply(400,{error:'Expected only a routine id'});
        if(typeof onRoutine!=='function')return reply(503,{error:'Routines unavailable'});
        return reply(200,{ok:true,action,routine:await onRoutine(payload.id),status:await readStatus()});
      }
      if(action==='workbench'){
        if(!payload||Array.isArray(payload)||Object.keys(payload).some(k=>!['enabled','tab','url','agent','requestId','reason'].includes(k))||typeof payload.enabled!=='boolean'||(payload.tab!==undefined&&!['system','console','browser','context','graph','intel','artcraft'].includes(payload.tab))||(payload.url!==undefined&&(typeof payload.url!=='string'||payload.url.length>800))||
          (payload.agent!==undefined&&typeof payload.agent!=='boolean')||(payload.requestId!==undefined&&(typeof payload.requestId!=='string'||!(/^[A-Za-z0-9_-]{1,80}$/).test(payload.requestId)))||(payload.reason!==undefined&&(typeof payload.reason!=='string'||payload.reason.length>160||/[\x00-\x1f\x7f]/.test(payload.reason)))||(payload.agent===true&&payload.enabled===false&&!payload.requestId))return reply(400,{error:'Invalid workspace request'});
        if(typeof onWorkbench!=='function')return reply(503,{error:'Workspace unavailable'});
        if(payload.url!==undefined){try{require('./workbench.cjs').validateBrowserUrl(payload.url);}catch{return reply(400,{error:'Invalid browser URL'});}}
        const result=await onWorkbench(payload);return reply(200,{ok:true,action,result,status:await readStatus()});
      }
      if (action === 'look'||action==='screen') {
        if (!payload || Array.isArray(payload) || Object.keys(payload).length !== 1 || typeof payload.question !== 'string' || !payload.question.trim() || payload.question.length > 500) return reply(400, { error: 'Expected only a short question string' });
        const look=action==='look'?onLook:onScreen;
        if (typeof look !== 'function') return reply(503, { error: 'Look is unavailable' });
        // A camera-off command must remain able to cancel a pending look.
        req.socket.setTimeout(150000);
        const observation = await look(payload.question.trim());
        return reply(200, { ok: true, action, observation, status: await readStatus() });
      }
      if(action==='highlight'){
        const allowed=['x','y','width','height','label','capturedAt','coordinateSpace'];
        if(!payload||Array.isArray(payload)||Object.keys(payload).some(key=>!allowed.includes(key))||!['x','y','width','height'].every(key=>Number.isFinite(payload[key]))||payload.width<2||payload.height<2||typeof payload.capturedAt!=='string'||(payload.label!==undefined&&(typeof payload.label!=='string'||payload.label.length>60))||(payload.coordinateSpace!==undefined&&!['physical','dip'].includes(payload.coordinateSpace)))return reply(400,{error:'Invalid highlight'});
        if(typeof onHighlight!=='function')return reply(503,{error:'Highlight unavailable'});
        return reply(200,{ok:true,action,highlight:await onHighlight(payload)});
      }
      if(action==='mode'){
        if(!payload||Array.isArray(payload)||Object.keys(payload).length!==1||typeof payload.id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(payload.id))return reply(400,{error:'Expected only a mode id'});
        if(typeof onMode!=='function')return reply(503,{error:'Modes unavailable'});
        const epoch=controlEpoch,command=commandChain.then(()=>{if(epoch!==controlEpoch)throw Object.assign(new Error('Stopped'),{status:423});return onMode(payload.id);});commandChain=command.catch(()=>{});
        const mode=await command;return reply(200,{ok:mode.ok===true,action,mode,status:await readStatus()});
      }
      if (action==='standby' ? !payload||Array.isArray(payload)||Object.keys(payload).length!==0 : !payload || Array.isArray(payload) || Object.keys(payload).length !== 1 || typeof payload.enabled !== 'boolean') {
        return reply(400, { error: 'Expected only an enabled boolean' });
      }
      const epoch=controlEpoch,command = commandChain.then(async () => {
        if(epoch!==controlEpoch)throw Object.assign(new Error('Stopped'),{status:423});
        await onCommand(action, payload.enabled);
        return readStatus();
      });
      commandChain = command.catch(() => {});
      return reply(200, { ok: true, action, ...(action==='standby'?{}:{enabled:payload.enabled}), status: await command });
    } catch (error) {
      const status = [400,409,413,423].includes(error?.status)?error.status:500;
      reply(status, { error: status === 413 ? 'Payload too large' : status === 400 ? 'Invalid request' : status===423?'Local privacy lock is active':status===409?'Control conflicts with active work':'Action failed' });
    }
  });
  server.maxHeadersCount = 32;
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 1000;
  server.invalidateControls=()=>{controlEpoch++;};
  server.setTimeout(20000, socket => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  return server;
}

module.exports = { createControlApi,validIntelRequest,validGuideRequest,validCraftAppRequest,validCraftLinkRequest };
