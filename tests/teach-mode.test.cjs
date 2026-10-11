'use strict';const test=require('node:test'),assert=require('node:assert/strict');const load=()=>{try{return require('../teach-mode.cjs');}catch(e){if(e.code==='MODULE_NOT_FOUND')return {};throw e;}};
test('teach mode records only intentional supported input, requires human verification and saves semantic routine without stale coordinates',()=>{
 const {TeachMode}=load();assert.equal(typeof TeachMode,'function');const t=new TeachMode();t.start({name:'Foto prüfen'});t.record({appId:'light',kind:'click',label:'Entwickeln öffnen'});assert.throws(()=>t.save({verification:'Das Foto ist sichtbar.'}),/bestätig/i);t.confirm({index:0,verification:'Entwicklungsansicht sichtbar'});const r=t.save({verification:'Das gewählte Foto zeigt die geprüfte Entwicklung.'});assert.match(r.instructions,/Entwickeln/);assert.match(r.instructions,/frische/i);assert.doesNotMatch(r.instructions,/windowId|\"x\"|\"y\"/);assert.equal(t.snapshot().active,false);
});
test('inactive and cancelled teaching cannot retain or replay inputs; secret text is excluded',()=>{
 const {TeachMode}=load();const t=new TeachMode();assert.equal(t.record({appId:'light',kind:'click'}),false);t.start({name:'Test'});assert.throws(()=>t.record({appId:'light',kind:'text',text:'password=SECRET'}),/sensibl/i);t.record({appId:'light',kind:'key',key:'Enter'});t.cancel();assert.equal(t.snapshot().steps.length,0);assert.throws(()=>t.save({verification:'fertig'}));
});
test('click and scroll learning need a descriptive target before becoming reusable steps',()=>{
 const {TeachMode}=load(),t=new TeachMode();t.start({name:'Suchen'});t.record({appId:'light',kind:'click'});
 assert.throws(()=>t.confirm({index:0,verification:'Suchfeld fokussiert'}),/benenne|beschreib/i);
 t.confirm({index:0,label:'Das Suchfeld Fotos suchen anklicken',verification:'Suchfeld fokussiert'});assert.equal(t.snapshot().steps[0].verified,true);
});
