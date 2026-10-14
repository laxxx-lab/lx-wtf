'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function dom(){
 const handlers={},classes=new Set(),document={body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}},addEventListener:(type,fn)=>handlers[type]=fn,activeElement:null};
 function node(tag='div',id=''){
  const attrs={},events={};return {tagName:tag.toUpperCase(),id,children:[],hidden:false,value:'',ownerDocument:document,parentNode:null,className:'',textContent:'',
   append(...items){for(const item of items){if(item.parentNode)item.parentNode.children.splice(item.parentNode.children.indexOf(item),1);item.parentNode=this;this.children.push(item);}},
   setAttribute:(key,value)=>attrs[key]=String(value),getAttribute:key=>attrs[key],addEventListener:(type,fn)=>events[type]=fn,click(){events.click?.({preventDefault(){}});},focus(){document.activeElement=this;},
   querySelector(selector){return this.querySelectorAll(selector)[0]||null;},querySelectorAll(selector){const found=[];for(const child of this.children){if(selector[0]==='#'?child.id===selector.slice(1):child.tagName===selector.toUpperCase())found.push(child);found.push(...child.querySelectorAll(selector));}return found;},
   get firstElementChild(){return this.children[0];},get nextElementSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]||null;}};
 }
 document.createElement=tag=>node(tag);return {node,document,handlers,classes};
}
test('settings navigation moves existing controls once and preserves values listeners and hidden sensor state',()=>{
 const {create}=require('../ui/settings-view.js'),d=dom(),root=d.node('section','settings'),gateway=d.node('label'),url=d.node('input','url'),camera=d.node('section'),preview=d.node('video','camera-preview'),save=d.node('button','save');camera.setAttribute('aria-label','Kamera');url.value='https://hermes.example';preview.hidden=true;gateway.append(url);camera.append(preview);root.append(gateway,camera,save);
 let saves=0;save.addEventListener('click',()=>saves++);const changes=[],view=create({root,platform:'windows',onOpenChange:value=>changes.push(value)});
 view.open();assert.equal(view.isOpen(),true);assert.equal(root.querySelector('#url'),url);assert.equal(root.querySelector('#camera-preview'),preview);assert.equal(url.value,'https://hermes.example');assert.equal(preview.hidden,true);
 const nav=root.querySelector('nav');nav.children.find(button=>button.textContent==='Kamera').click();assert.equal(preview.parentNode.parentNode.hidden,false);assert.equal(url.parentNode.parentNode.hidden,true);save.click();assert.equal(saves,1);
 d.handlers.keydown({key:'Escape',preventDefault(){}});assert.equal(view.isOpen(),false);assert.equal(d.classes.has('settings-open'),false);view.open();view.close();assert.equal(root.querySelectorAll('#url').length,1);assert.equal(root.querySelectorAll('#save').length,1);assert.deepEqual(changes,[true,false,true,false]);view.open();view.close({notify:false});assert.deepEqual(changes,[true,false,true,false,true]);
});
test('notebook settings opens and closes its existing details without touching its audio controls',()=>{
 const {create}=require('../ui/settings-view.js'),d=dom(),root=d.node('details','settings'),summary=d.node('summary'),body=d.node('div'),mic=d.node('select','microphone'),label=d.node('label');body.className='settings-body';label.setAttribute('for','microphone');mic.value='selected-device';root.append(summary,body);body.append(label,mic);
 const view=create({root,platform:'linux',onOpenChange(){}});summary.click();assert.equal(root.open,true);assert.equal(view.isOpen(),true);assert.equal(root.querySelector('#microphone'),mic);assert.equal(mic.value,'selected-device');view.close();assert.equal(root.open,false);assert.equal(mic.value,'selected-device');
});
