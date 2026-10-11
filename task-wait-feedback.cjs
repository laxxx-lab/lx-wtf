'use strict';
class TaskWaitFeedback {
 constructor({now=Date.now,schedule=setTimeout,cancel=clearTimeout,current=()=>false,onNotice=()=>{},delayMs=20000}={}){Object.assign(this,{now,schedule,cancel,current,onNotice,delayMs});this.turn=null;}
 begin(id,enabled=true){
  if(this.turn?.id===id)return;
  this.finish();if(!enabled)return;
  const turn={id,lastActivity:null,fired:false};this.turn=turn;
  turn.timer=this.schedule(()=>{if(this.turn!==turn||turn.fired||!this.current(id))return;turn.fired=true;
   // An open request alone is not evidence that an engine is making progress.
   const recent=turn.lastActivity!==null&&this.now()-turn.lastActivity<=10000;
   Promise.resolve().then(()=>{if(this.turn===turn&&this.current(id))return this.onNotice(recent?'Einen kleinen Moment noch, ich arbeite noch daran.':'Das dauert länger. Ich warte noch auf eine Rückmeldung.',{id,recentActivity:recent});}).catch(()=>{});
  },this.delayMs);turn.timer?.unref?.();
 }
 activity(id){if(this.turn?.id===id)this.turn.lastActivity=this.now();}
 finish(id){if(id!==undefined&&this.turn?.id!==id)return;if(this.turn)this.cancel(this.turn.timer);this.turn=null;}
}
module.exports={TaskWaitFeedback};
