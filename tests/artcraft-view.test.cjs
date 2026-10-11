'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let api={};try{api=require('../ui/artcraft-view.js');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('app feedback is bound to its tagged task, and unrelated replies are not shown as app results',()=>{
 assert.equal(typeof api.appTask,'function');const tasks=[{appId:'photo',summary:'Anderes Bild geändert.'},{appId:'light',summary:'Ein Foto angepasst.',status:'agent-finished'}];assert.equal(api.appTask(tasks,'light').summary,'Ein Foto angepasst.');assert.equal(api.appTask([{summary:'Globale Rückmeldung'}],'light'),null);
});
function fixture(){
  const calls=[],snapshots=[],errors=[],timers=new Map();let visible=true,nextTimer=0;
  const loop=api.createSnapshotRequests({
    invoke(method,payload){const result=deferred();calls.push({method,payload,result});return result.promise;},
    onSnapshot:(snapshot,preview)=>snapshots.push({snapshot,preview}),onError:error=>errors.push(error),
    isVisible:()=>visible,setTimer(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimer:id=>timers.delete(id),
  });
  loop.setContext({selectedAppId:'photo',privacyLocked:false});
  return {loop,calls,snapshots,errors,timers,setVisible(value){visible=value;loop.visibilityChanged();},tick(){const [id,timer]=timers.entries().next().value||[];if(timer){timers.delete(id);timer.fn();}},};
}

test('preview loop exists and status loading does not request an image or start polling',async()=>{
  assert.equal(typeof api.createSnapshotRequests,'function','the guarded preview loop is missing');
  const f=fixture();const status=f.loop.start();assert.equal(f.calls[0].method,'craft-snapshot');assert.equal(f.calls[0].payload,undefined);
  f.calls[0].result.resolve({selectedAppId:'photo'});await status;
  assert.equal(f.snapshots[0].preview,false);assert.equal(f.timers.size,0);f.loop.dispose();
});

test('manual snapshots cannot overlap and a hidden pane drops a late capture without polling',async()=>{
 const f=fixture();const pending=f.loop.refresh();assert.equal(f.calls[0].method,'craft-refresh');await f.loop.refresh();assert.equal(f.calls.length,1);f.setVisible(false);f.calls[0].result.resolve({selectedAppId:'photo'});await pending;assert.equal(f.snapshots.length,0);f.setVisible(true);await flush();assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);f.loop.dispose();
});

test('selection, privacy and disposal each reject late captures',async()=>{
  assert.equal(typeof api.createSnapshotRequests,'function');
  for(const change of [f=>f.loop.setContext({selectedAppId:'word'}),f=>f.loop.setContext({privacyLocked:true}),f=>f.loop.dispose()]){
    const f=fixture();f.loop.refresh();change(f);
    f.calls[0].result.resolve({selectedAppId:'photo',preview:{image:'private'}});await flush();assert.equal(f.snapshots.length,0);
    f.loop.dispose();assert.equal(f.timers.size,0);
  }
});

test('locked panes refuse manual preview requests',async()=>{
  assert.equal(typeof api.createSnapshotRequests,'function');const f=fixture();f.loop.setContext({privacyLocked:true});
  await f.loop.refresh();assert.equal(f.calls.length,0);assert.equal(f.timers.size,0);f.loop.dispose();
});

test('only PNG previews for the selected app can be rendered',()=>{
  assert.equal(typeof api.validPreview,'function');
  const png={appId:'photo',image:'data:image/png;base64,iVBORw0KGgo=',width:800,height:600,capturedAt:123};
  assert.equal(api.validPreview(png,'photo'),true);
  for(const image of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','https://example.com/image.png','data:image/png;base64,'])assert.equal(api.validPreview({...png,image},'photo'),false);
  assert.equal(api.validPreview(png,'word'),false);assert.equal(api.validPreview({...png,width:0},'photo'),false);
});

test('connection labels never call installation or an unknown bridge a live connection',()=>{
  assert.equal(typeof api.bridgeLabel,'function');
  assert.match(api.bridgeLabel('ready'),/verbunden/i);
  for(const state of ['unconfigured','closed','unavailable','unlinked','unexpected'])assert.doesNotMatch(api.bridgeLabel(state),/^Live verbunden$/);
  assert.match(api.bridgeLabel('unexpected'),/Unbekannt/i);
});
