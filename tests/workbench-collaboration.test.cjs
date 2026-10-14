'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const jobId='37b9ad63-5a29-48a1-83b2-37984291c46a';
function renderer(){
 const nodes=new Map(),calls=[];let receive;
 const make=()=>({children:[],_text:'',value:'',hidden:false,disabled:false,dataset:{},events:{},style:{setProperty(){}},classList:{toggle(){}},set textContent(value){this._text=String(value);this.children=[];},get textContent(){return this._text+this.children.map(c=>c.textContent).join('');},append(...children){this.children.push(...children);},replaceChildren(...children){this._text='';this.children=children;},setAttribute(){},addEventListener(type,fn){this.events[type]=fn;},focus(){doc.activeElement=this;}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);},doc={body:make(),hidden:true,getElementById:get,createElement:tag=>{const n=make();n.tagName=tag.toUpperCase();return n;},createTextNode:text=>{const n=make();n.textContent=text;return n;},createDocumentFragment:make,querySelector:get,querySelectorAll:()=>[],addEventListener(){}};
 const window={workbench:{invoke:async(method,payload)=>{calls.push({method,payload});return method==='snapshot'?null:{ok:true};},on:fn=>receive=fn},matchMedia:()=>({matches:true}),HermesOrb:{OrbRenderer:class{},backgroundOrbState:()=>null},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/workbench.js'),'utf8'),{window,document:doc,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1,clearTimeout(){},console});
 return {get,calls,update:value=>receive({type:'snapshot',snapshot:{connected:true,status:'ready',tab:'console',...value}})};
}
function descendants(node){return [node,...node.children.flatMap(descendants)];}
test('workshop renders observed goal, step, result uncertainty, stale attention and content-free health',()=>{
 const f=renderer();f.update({busy:true,voiceHealth:{state:'degraded',summary:'Sprache wird geprüft',checks:[{key:'microphone',state:'degraded',summary:'Keine neuen Frames'}],repair:{kind:'microphone-reconnect',reason:'Ausgewähltes Mikrofon neu verbinden'}},attention:{kind:'window',label:'Editor',selection:'remembered',stale:true,observedAt:'2026-10-12T12:00:00Z',summary:'Frühere Quelle'},tasks:[{title:'Foto bearbeiten',status:'running',tools:[{name:'Belichtung',status:'running'}]}]});
 assert.equal(f.get('activity-title').textContent,'Foto bearbeiten');assert.match(f.get('mission-detail').textContent,/Belichtung/);assert.match(f.get('activity-result').textContent,/offen|unbekannt/i);assert.match(f.get('attention-summary').textContent,/Frühere|ALT/i);assert.match(f.get('voice-health-checks').textContent,/Keine neuen Frames/);
 f.update({tasks:[{title:'Foto bearbeiten',status:'agent-finished',verification:'unknown'}]});assert.match(f.get('activity-result').textContent,/Agent beendet/);assert.doesNotMatch(f.get('activity-result').textContent,/bestätigt\.$/);
 f.update({tasks:[{title:'Foto bearbeiten',status:'agent-finished',verification:'verified'}]});assert.match(f.get('activity-result').textContent,/Werkzeugwirkung bestätigt/);
 f.update({jobQueue:{jobs:[{id:jobId,title:'Foto geprüft',status:'completed'}]}});assert.equal(f.get('mission-title').textContent,'Foto geprüft');assert.match(f.get('activity-result').textContent,/Werkzeugwirkung bestätigt/);
 f.update({privacyLocked:true,attention:{label:'PRIVATE'},voiceHealth:null});assert.equal(f.get('attention-card').hidden,true);assert.equal(f.get('attention-summary').textContent,'');
});
test('queue correction preserves typed draft across progress refreshes and sends only the current exact job action',async()=>{
 const f=renderer(),jobs=[{id:jobId,title:'Foto',status:'queued',revision:2}];f.update({jobQueue:{jobs}});
 const row=f.get('job-queue-list').children[0],form=descendants(row).find(n=>n.className==='job-amend-form');assert.ok(form,'correction form missing');const input=descendants(form).find(n=>n.tagName==='TEXTAREA');input.value='Bitte heller.';input.events.input();f.update({jobQueue:{jobs:[{...jobs[0],summary:'Neue Meldung'},{id:'old',title:'Anderer Auftrag',status:'completed'}]},awareness:{cards:[{id:'hint',title:'Neue Meldung',detail:'Aktualisiert'}]}});assert.equal(f.get('job-queue-list').children.at(-1),row);assert.match(row.textContent,/Neue Meldung/);assert.match(f.get('awareness-cards').textContent,/Aktualisiert/);
 await form.events.submit({preventDefault(){}});assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))),{method:'job-amend',payload:{id:jobId,instruction:'Bitte heller.'}});
 f.update({jobQueue:{blocked:true,jobs:[{...jobs[0],status:'outcome-unknown'}]}});await form.events.submit({preventDefault(){}});assert.equal(f.calls.filter(c=>c.method==='job-amend').length,1);
});
