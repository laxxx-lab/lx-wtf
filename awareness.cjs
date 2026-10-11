'use strict';
const {createHash}=require('node:crypto'),{redactContext}=require('./context-journal.cjs');
class Awareness{
 constructor({now=Date.now}={}){this.now=now;this.cards=[];this.dismissed=new Set();this.project={name:'',confidence:'unknown'};this.foreground=null;}
 update({context={},graph={},jobs={},privacyLocked=false}={}){
  this.cards=[];this.foreground=null;this.project={name:redactContext(context.project||graph.rootName,80),confidence:context.project?'manual':graph.rootName?'registered':'unknown'};
  if(privacyLocked)return this.snapshot();
  if(context.enabled&&!context.foreground?.excluded&&context.foreground?.app)this.foreground={app:redactContext(context.foreground.app,80),windowTitle:redactContext(context.foreground.windowTitle,180),timestamp:context.foreground.timestamp};
  const add=(kind,key,value)=>{const id=createHash('sha256').update(kind+':'+key).digest('hex').slice(0,24);if(!this.dismissed.has(id))this.cards.push({id,kind,...value});};
  const sources=new Set();
  if(context.enabled)for(const event of (context.events||[]).slice(0,80).sort((a,b)=>b.timestamp-a.timestamp)){
   if(!['build-error','build-success'].includes(event.type)||sources.has(event.source)||!Number.isFinite(event.timestamp)||event.timestamp>this.now()||this.now()-event.timestamp>15*60*1000)continue;sources.add(event.source);
   if(event.type==='build-error')add('build-error',event.source+':'+event.timestamp,{title:'Build fehlgeschlagen',detail:redactContext(event.summary,450),source:redactContext(event.source,180),timestamp:event.timestamp,action:{kind:'investigate-build'},actionLabel:'Fehler untersuchen'});
  }
  if(graph.ready&&graph.stale)add('graph-stale',graph.rootName+':'+graph.indexedAt,{title:'Projektgraph ist veraltet',detail:'Projektdateien haben sich geändert. Der Index zeigt noch den vorherigen Stand.',source:redactContext(graph.rootName,80),timestamp:this.now(),action:{kind:'show-graph'},actionLabel:'Projektgraph öffnen'});
  for(const job of (jobs.jobs||[]).slice(0,50))if(['outcome-unknown','paused','error'].includes(job.status))add('job-attention',job.id+':'+job.status+':'+job.updatedAt,{title:job.status==='outcome-unknown'?'Auftragsergebnis prüfen':'Auftrag wartet',detail:redactContext(job.title||job.summary,200),timestamp:job.updatedAt||this.now(),action:{kind:'show-jobs',jobId:job.id},actionLabel:'Auftrag ansehen'});
  this.cards=this.cards.slice(0,8);return this.snapshot();
 }
 snapshot(){return structuredClone({project:this.project,foreground:this.foreground,cards:this.cards});}
 action(id){const card=this.cards.find(c=>c.id===id);if(!card)throw Error('Dieser Hinweis ist nicht mehr aktuell.');return {...card.action,source:card.source,detail:card.detail};}
 dismiss(id){if(!this.cards.some(c=>c.id===id))throw Error('Dieser Hinweis ist nicht mehr aktuell.');this.dismissed.add(id);if(this.dismissed.size>100)this.dismissed.delete(this.dismissed.values().next().value);this.cards=this.cards.filter(c=>c.id!==id);}
 clear(){this.cards=[];this.foreground=null;this.dismissed.clear();}
}
module.exports={Awareness};
