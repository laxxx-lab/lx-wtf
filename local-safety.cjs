'use strict';

class LocalSafety {
  constructor({stop=()=>{},quiesce=()=>{},onChange=()=>{},now=Date.now,initialLocked=false}={}){
    this.stop=stop;this.quiesce=quiesce;this.onChange=onChange;this.now=now;
    this.locked=initialLocked===true;this.reason=this.locked?'privacy':null;this.generation=0;this.changedAt=this.locked?now():null;this.pending=null;this.errors=[];this.remoteStop='unavailable';
  }
  snapshot(){return {locked:this.locked,reason:this.reason,generation:this.generation,changedAt:this.changedAt,remoteStop:this.remoteStop,remoteProcessesStopped:false,errors:[...this.errors]};}
  publish(){try{this.onChange(this.snapshot());}catch(error){this.errors.push(String(error?.message||error));}}
  lock(reason='privacy'){
    if(this.locked){if(reason==='emergency'&&this.reason!=='emergency'){this.reason='emergency';this.publish();}return this.pending||Promise.resolve(this.snapshot());}
    return this.shutdown(reason,true);
  }
  shutdown(reason,includeSensors){
    this.locked=true;this.reason=reason;this.generation++;this.changedAt=this.now();this.errors=[];this.remoteStop='unavailable';
    this.publish();
    const run=fn=>{try{return Promise.resolve(fn());}catch(error){return Promise.reject(error);}};
    this.pending=Promise.allSettled([includeSensors?run(this.quiesce):Promise.resolve(),run(this.stop)]).then(([sensors,actions])=>{
      for(const result of [sensors,actions])if(result.status==='rejected')this.errors.push(String(result.reason?.message||result.reason));
      if(actions.status==='rejected')this.remoteStop='failed';
      else if(['requested','unavailable','failed'].includes(actions.value?.remoteStop))this.remoteStop=actions.value.remoteStop;
      this.pending=null;this.publish();return this.snapshot();
    });
    return this.pending;
  }
  unlock(){
    if(this.pending)throw new Error('Lokales Abschalten läuft noch.');
    if(this.locked){this.locked=false;this.reason=null;this.generation++;this.changedAt=this.now();this.publish();}
    return this.snapshot();
  }
  emergencyStop(){return !this.locked||this.pending?this.lock('emergency'):this.shutdown('emergency',false);}
}
module.exports={LocalSafety};
