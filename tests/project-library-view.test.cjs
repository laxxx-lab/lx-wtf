'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const nodes=new Map(),reads=[],calls=[];const make=()=>({children:[],events:{},dataset:{},textContent:'',hidden:false,value:'',append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},addEventListener(event,fn){this.events[event]=fn;},setAttribute(){}});
 const element=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};const document={getElementById:element,createElement:make},window={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui/project-library.js'),'utf8'),{document,window,Date});
 const project={id:'test',name:'QA',root:'C:/QA'},view=window.ProjectLibraryView.mount({notice(){},invoke:async(method,payload)=>{calls.push({method,payload});if(method==='project-list')return {entries:['A.md','B.md'].map(name=>({name,path:name,kind:'file',readable:true}))};if(method==='project-read')return new Promise(resolve=>reads.push({path:payload.path,resolve}));return {ok:true};}});
 view.render({projects:[project],activeId:'test'});
 return {view,reads,calls,element,clickFile(name){element('project-tree').children.find(node=>node.dataset.projectFile===name).events.click();},resolve(index){const read=reads[index];read.resolve({path:read.path,text:read.path,observedAt:new Date().toISOString()});}};
}
test('the last explicit file choice wins and an old read cannot attach itself after clear',async()=>{
 const f=fixture();await tick();f.clickFile('A.md');f.clickFile('B.md');f.resolve(1);await tick();f.resolve(0);await tick();assert.equal(f.view.context().source.path,'B.md');
 f.clickFile('A.md');f.element('project-file-clear').events.click();f.resolve(2);await tick();assert.equal(f.view.context().source,null);assert.equal(f.element('project-preview').hidden,true);
});
test('a pending file selection cannot submit the previous file or an unbound project task',async()=>{
 const f=fixture();await tick();f.clickFile('A.md');f.resolve(0);await tick();f.clickFile('B.md');assert.equal(f.view.context().source,null);await assert.rejects(f.view.command('Bearbeite diese Datei'),/lädt/);assert.equal(f.calls.some(call=>call.method==='project-command'),false);
 f.view.update({privacyLocked:true});f.resolve(1);await tick();assert.equal(f.view.context().source,null);assert.equal(f.element('project-preview-text').textContent,'');
});
