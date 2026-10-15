'use strict';
const active = new WeakSet();
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
async function showHomeCamera({home, query, cameraEntity, allowed, waitMs=15000, now=Date.now, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
 if (!home || !['open','inventory','openCamera','cameraState','hide'].every(key=>typeof home[key]==='function') || typeof allowed!=='function' || typeof now!=='function' || typeof sleep!=='function' || !Number.isFinite(waitMs) || waitMs<=0 || waitMs>60000 || (cameraEntity!==undefined && (typeof cameraEntity!=='string' || !/^camera\.[a-z0-9_]{1,120}$/.test(cameraEntity))) || (!cameraEntity && (typeof query!=='string' || !normalize(query) || query.length>200))) throw new TypeError('Invalid camera workflow arguments.');
 let selected=cameraEntity || null, connected=false, playing=false, cameraRequested=false;
 const result=status=>({verified:status==='playing',status,cameraEntity:selected,observedAt:new Date(now()).toISOString(),evidence:{connected,playing:status==='playing' && playing}});
 if (active.has(home)) return result('busy');
 active.add(home);
 const controller=new AbortController();
 const deadline=now()+waitMs;
 const permitted=()=>{try{return allowed()===true;}catch{return false;}};
 const check=()=>{if(!permitted())throw 'cancelled';if(now()>=deadline)throw 'deadline';};
 // Bound even a renderer call that never settles; authorization is rechecked while waiting.
 async function call(fn) {
  check();let timer, timerDeadline;
  const boundary=new Promise((_,reject)=>{
   timer=setInterval(()=>{try{check();}catch(reason){reject(reason);}},Math.min(25,waitMs));
  });
  const timeout=new Promise((_,reject)=>{timerDeadline=setTimeout(()=>reject('deadline'),Math.max(1,deadline-now()));});

  try { const value=await Promise.race([Promise.resolve().then(fn),boundary,timeout]);check();return value; }
  finally {clearInterval(timer);clearTimeout(timerDeadline);}
 }
 try {
  check();await call(()=>home.open({signal:controller.signal}));
  let inventory;
  while(true) {
   inventory=await call(()=>home.inventory());connected=inventory?.connected===true;
   if(connected)break;
   if(inventory?.loginRequired===true || inventory?.status==='login-required')return result('login-required');
   await call(()=>sleep(Math.min(100,deadline-now())));
  }
  const cameras=(Array.isArray(inventory.entities)?inventory.entities:[]).filter(row=>/^camera\.[a-z0-9_]{1,120}$/.test(row?.id) && !/last_recording/i.test(row.id));
  let matches;
  if(cameraEntity)matches=cameras.filter(row=>row.id===cameraEntity);
  else {
   const text=normalize(query);
   matches=cameras.filter(row=>normalize(row.id).includes(text)||normalize(row.name).includes(text));
   const live=matches.filter(row=>/(^| )live( |$)/.test(normalize(row.id)+' '+normalize(row.name)));
   if(live.length)matches=live;
  }
  if(!matches.length)return result('not-found');
  if(matches.length!==1)return result('ambiguous');
  selected=matches[0].id;
  cameraRequested=true;await call(()=>home.openCamera(selected,{signal:controller.signal}));
  while(true) {
   const state=await call(()=>home.cameraState());connected=state?.connected===true;playing=state?.playing===true && state.cameraEntity===selected;
   if(playing){check();return result('playing');}
   if(state?.loginRequired===true || state?.status==='login-required')return result('login-required');
   await call(()=>sleep(Math.min(100,deadline-now())));
  }
 } catch(reason) {
  controller.abort();
  if(reason==='cancelled' || !permitted()) {try{home.hide({signal:controller.signal});}catch{}return result('cancelled');}
  return result(cameraRequested?'playback-unconfirmed':'unreachable');
 } finally {active.delete(home);}
}
module.exports={showHomeCamera};
