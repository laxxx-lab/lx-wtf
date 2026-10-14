'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const current=Date.parse('2026-10-14T10:00:00+02:00');
function input(patch={}){return {action:'upsert',id:'oven',kind:'countdown',title:'Backofen',detail:'Programm läuft',source:'Home Assistant',observedAt:'2026-10-14T10:00:00+02:00',status:'running',deadline:'2026-10-14T10:00:10+02:00',...patch};}
test('absolute countdown survives restart and expiry never invents an authoritative completion',()=>{
 const {createActivityCards}=require('../activity-cards.cjs'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-cards-')),file=path.join(folder,'cards.json');let time=current;
 try{const first=createActivityCards({file,now:()=>time});first.execute(input());assert.equal(first.read().cards[0].remainingSeconds,10);time+=4000;const restored=createActivityCards({file,now:()=>time});assert.equal(restored.read().cards[0].remainingSeconds,6);time+=9000;const expired=restored.read().cards[0];assert.equal(expired.remainingSeconds,0);assert.equal(expired.overdue,true);assert.equal(expired.status,'running');restored.execute(input({observedAt:'2026-10-14T10:00:13+02:00',status:'complete',deadline:undefined}));assert.equal(restored.read().cards[0].status,'complete');}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('old and equal observations cannot replay dismissed cards or trigger another window',()=>{
 const {createActivityCards}=require('../activity-cards.cjs'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-cards-')),file=path.join(folder,'cards.json');let changes=0;
 try{const cards=createActivityCards({file,now:()=>current,onChange:()=>changes++});cards.execute(input());cards.execute(input({title:'Replay'}));cards.execute(input({observedAt:'2026-10-14T09:59:59+02:00'}));assert.equal(changes,1);assert.equal(cards.read().cards[0].title,'Backofen');cards.execute({action:'dismiss',id:'oven'});assert.equal(changes,2);const restored=createActivityCards({file,now:()=>current,onChange:()=>changes++});restored.execute(input());assert.equal(restored.read().cards.length,0);assert.equal(changes,2);restored.execute(input({observedAt:'2026-10-14T10:00:01+02:00'}));assert.equal(restored.read().cards.length,1);assert.equal(changes,3);}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('untrusted timestamps media URLs oversized inputs and a seventh active card are rejected',()=>{
 const {createActivityCards}=require('../activity-cards.cjs'),cards=createActivityCards({now:()=>current});
 for(const patch of [{id:'../escape'},{kind:'iframe'},{title:''},{title:'x'.repeat(121)},{detail:'x'.repeat(501)},{source:'x'.repeat(81)},{observedAt:'2026-10-14T10:00:00'},{observedAt:'2026-10-14T09:57:59+02:00'},{observedAt:'2026-10-14T10:00:06+02:00'},{deadline:'2026-10-14T10:00:00'},{deadline:'2026-10-22T10:00:00+02:00'},{deadline:undefined},{cameraUrl:'https://example.com/private'},{mediaUrl:'https://example.com'},{status:'finished'},{kind:'camera',cameraEntity:'switch.oven'}])assert.throws(()=>cards.execute(input(patch)),JSON.stringify(patch));
 for(let n=0;n<6;n++)cards.execute(input({id:'card-'+n}));assert.throws(()=>cards.execute(input({id:'overflow'})));cards.execute(input({id:'card-0',observedAt:'2026-10-14T10:00:01+02:00'}));assert.equal(cards.read().cards.length,6);
});
test('camera state contains a bounded entity identity without any supplied media URL',()=>{
 const {createActivityCards}=require('../activity-cards.cjs'),cards=createActivityCards({now:()=>current});cards.execute(input({id:'front-door',kind:'camera',title:'Haustür',status:'unavailable',cameraEntity:'camera.front_door',deadline:undefined}));const card=cards.read().cards[0];assert.equal(card.cameraEntity,'camera.front_door');assert.equal(card.dueAt,undefined);assert.equal(card.remainingSeconds,undefined);assert.equal(card.status,'unavailable');
});
test('invalid calendar dates and impossible start times cannot create a countdown',()=>{
 const {createActivityCards}=require('../activity-cards.cjs'),cards=createActivityCards({now:()=>current});
 for(const patch of [{deadline:'2026-02-30T10:00:00+02:00'},{deadline:'2026-10-14T24:00:00+02:00'},{startedAt:'2026-10-14T10:00:10+02:00'},{startedAt:'2026-10-14T10:00:06+02:00'}])assert.throws(()=>cards.execute(input(patch)));
});
test('read snapshots cannot mutate stored cards and write failures preserve existing state',()=>{
 const {createActivityCards}=require('../activity-cards.cjs'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-cards-')),file=path.join(folder,'cards.json');let changes=0;
 try{const cards=createActivityCards({file,now:()=>current,onChange:()=>changes++});cards.execute(input());cards.read().cards[0].title='Mutated';assert.equal(cards.read().cards[0].title,'Backofen');fs.unlinkSync(file);fs.mkdirSync(file);assert.throws(()=>cards.execute(input({title:'New',observedAt:'2026-10-14T10:00:01+02:00'})));assert.equal(cards.read().cards[0].title,'Backofen');assert.equal(changes,1);assert.throws(()=>cards.execute({action:'dismiss',id:'oven'}));assert.equal(cards.read().cards.length,1);}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('invalid saved JSON is preserved and never silently replaced with empty state',()=>{
 const {createActivityCards}=require('../activity-cards.cjs'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-cards-')),file=path.join(folder,'cards.json');
 try{fs.writeFileSync(file,'private malformed data');const cards=createActivityCards({file,now:()=>current});assert.match(cards.read().error,/gespeichert/i);assert.equal(cards.read().cards.length,0);assert.throws(()=>cards.execute(input()));assert.equal(fs.readFileSync(file,'utf8'),'private malformed data');}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
function renderer(snapshot){
 const vm=require('node:vm'),nodes=new Map(),listeners={},apiEvents=[],element=()=>({hidden:false,textContent:'',value:0,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},setAttribute(key,value){this[key]=value;},removeAttribute(key){delete this[key];},pause(){},load(){}}),$=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 let tick;const context=vm.createContext({window:{lilithCard:{snapshot:async()=>snapshot,dismiss:async id=>{apiEvents.push(id);return {cards:[]};},on:callback=>listeners.event=callback}},document:{getElementById:$,body:{classList:{toggle(){}}}},Date:class extends Date{static now(){return current;}},setInterval:fn=>tick=fn,console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/activity-card.js'),'utf8'),context);return {$,tick:()=>tick(),event:value=>listeners.event(value),dismissed:apiEvents};
}
test('card renderer displays real remaining time then waits for device status without inventing completion',async()=>{
 const {createActivityCards}=require('../activity-cards.cjs'),cards=createActivityCards({now:()=>current});cards.execute(input());const r=renderer(cards.read());await new Promise(resolve=>setImmediate(resolve));assert.equal(r.$('card-countdown').textContent,'0:10');assert.match(r.$('countdown-label').textContent,/laut Gerät/);assert.equal(r.$('card-progress').hidden,true);
 r.event({cards:[{...cards.read().cards[0],dueAt:current-1}]});assert.equal(r.$('card-countdown').textContent,'0:00');assert.match(r.$('card-time-status').textContent,/Gerätestatus abwarten/);assert.equal(r.$('card-status').textContent,'Läuft');
 r.event({cards:[{...cards.read().cards[0],status:'unavailable'}]});assert.equal(r.$('countdown-block').hidden,true);assert.equal(r.$('card-status').textContent,'Nicht verfügbar');
});
test('camera renderer labels a snapshot separately and confirms live only after video starts',async()=>{
 const card={id:'door',kind:'camera',title:'Haustür',detail:'',source:'Home Assistant',observedAt:'2026-10-14T08:00:00.000Z',status:'running'},r=renderer({cards:[card]});await new Promise(resolve=>setImmediate(resolve));assert.match(r.$('camera-state').textContent,/noch nicht verbunden/);
 r.event({cards:[{...card,previewKind:'snapshot',mediaUrl:'data:image/png;base64,AA=='}]});assert.equal(r.$('camera-video').hidden,true);r.$('camera-image').handlers.load();assert.equal(r.$('camera-state').textContent,'Momentaufnahme');
 r.event({cards:[{...card,previewKind:'stream',mediaUrl:'blob:trusted-stream'}]});assert.match(r.$('camera-state').textContent,/verbunden/);r.$('camera-video').handlers.playing();assert.equal(r.$('camera-state').textContent,'Livebild');
 r.event({cards:[card],privacyLocked:true});assert.equal(r.$('camera-video').src,undefined);assert.equal(r.$('card-content').hidden,true);
});
