'use strict';
const {randomUUID}=require('node:crypto'),{normalizeRoutines}=require('./routines.cjs'),{redactContext}=require('./context-journal.cjs');
class TeachMode{
 constructor(){this.cancel();}
 start({name}={}){if(typeof name!=='string'||!name.trim()||name.length>80)throw Error('Bitte der Lehre einen kurzen Namen geben.');this.cancel();this.active=true;this.name=redactContext(name,80);return this.snapshot();}
 record(value){
  if(!this.active)return false;if(this.steps.length>=20)throw Error('Lehre: höchstens 20 Schritte.');
  if(!value||value.appId!=='light'||!['click','text','key','scroll'].includes(value.kind))throw Error('Dieser Schritt wird im Teach Mode noch nicht unterstützt.');
  if(typeof value.text==='string'&&/\b(?:password|passwort|token|secret|authorization|cookie|api[_-]?key)\b\s*[:=]|\b(?:sk-|ghp_|eyJ)[A-Za-z0-9_-]{12,}/i.test(value.text))throw Error('Sensible Texte werden nicht in einen Ablauf übernommen.');
  const step={appId:'light',kind:value.kind,label:redactContext(value.label,160)||({click:'Ausgewähltes Element anklicken',text:'Text eingeben',key:'Taste drücken',scroll:'Ansicht scrollen'})[value.kind],verified:false,verification:''};
  if(value.kind==='text'){if(typeof value.text!=='string'||value.text.length>500)throw Error('Teach Mode: Text ist zu lang.');step.text=value.text;}
  if(value.kind==='key')step.key=redactContext(value.key,40);this.steps.push(step);return this.snapshot();
 }
 confirm({index,verification,label}={}){if(!this.active||!Number.isInteger(index)||!this.steps[index])throw Error('Kein aktueller Lernschritt.');if(typeof verification!=='string'||!verification.trim()||verification.length>300)throw Error('Bitte beschreiben, woran der Erfolg dieses Schritts erkennbar ist.');const step=this.steps[index],description=label?redactContext(label,160):step.label;if(['click','scroll'].includes(step.kind)&&['Ausgewähltes Element anklicken','Ansicht scrollen'].includes(description))throw Error('Bitte benenne das konkrete Element und die Aktion dieses Schritts.');step.verified=true;step.verification=redactContext(verification,300);step.label=description;return this.snapshot();}
 save({verification,consume=true}={}){if(!this.active||!this.steps.length)throw Error('Keine beobachteten Schritte zum Speichern.');if(this.steps.some(s=>!s.verified))throw Error('Bitte jeden Lernschritt anhand des sichtbaren Ergebnisses bestätigen.');
  const instructions='Bediene die bestehende LightCraft-GUI. Ermittle für jeden Schritt frische UI-/MCP-Ziele; keine alten Klickkoordinaten wiederverwenden. Prüfe nach jedem Schritt den beschriebenen Zustand.\n'+this.steps.map((s,i)=>(i+1)+'. '+s.label+(s.kind==='text'?' · Text: '+JSON.stringify(s.text):s.kind==='key'?' · Taste: '+s.key:'')+'\nErfolg: '+s.verification).join('\n');
  const [routine]=normalizeRoutines([{id:'teach-'+randomUUID().slice(0,18),name:this.name,instructions,verification}]);if(consume)this.cancel();return routine;
 }
 snapshot(){return structuredClone({active:this.active,name:this.name,steps:this.steps});}
 cancel(){this.active=false;this.name='';this.steps=[];return this.snapshot();}
}
module.exports={TeachMode};
