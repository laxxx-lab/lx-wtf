'use strict';
const STAGES=new Set(['capture-start','capture-first-frame','vad-speech','vad-end','capture-end','capture-discarded','transcribe-start','transcribe-end','dispatch-start','hermes-submit','hermes-first-delta','hermes-end','tts-queued','tts-start','tts-first-pcm','tts-end','renderer-first-pcm','playback-start','playback-end','barge-confirmed','interrupted','failed']);
for(const stage of ['tts-queued','tts-start','tts-first-pcm','tts-end','renderer-first-pcm','playback-start','playback-end'])STAGES.add('ack-'+stage);
for(const stage of ['local-model-submit','local-model-first-delta','local-model-end','turn-predict-start','turn-predict-end'])STAGES.add(stage);
const DURATIONS={localFirstTokenMs:['local-model-submit','local-model-first-delta'],localModelMs:['local-model-submit','local-model-end'],turnPredictionMs:['turn-predict-start','turn-predict-end'],captureMs:['capture-start','capture-end'],vadDecisionMs:['capture-start','vad-speech'],transcribeMs:['transcribe-start','transcribe-end'],hermesFirstTokenMs:['hermes-submit','hermes-first-delta'],hermesMs:['hermes-submit','hermes-end'],ttsQueueMs:['tts-queued','tts-start'],ttsFirstPcmMs:['tts-start','tts-first-pcm'],ttsMs:['tts-start','tts-end'],playbackDelayMs:['renderer-first-pcm','playback-start'],firstAudioMs:['vad-end','playback-start'],endToEndMs:['capture-end','playback-end']};
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_.:-]{1,96}$/.test(id);
class VoiceTiming{
  constructor({clock=()=>performance.timeOrigin+performance.now(),limit=80,maxSkewMs=60000}={}){
    this.clock=clock;this.limit=Math.max(1,Math.min(200,Math.floor(limit)||80));this.maxSkewMs=maxSkewMs;this.rows=new Map();
  }
  begin(turnId,{kind='voice'}={}){
    if(!validId(turnId))return false;
    if(this.rows.has(turnId))return true;
    this.rows.set(turnId,{turnId,kind:['voice','text','local'].includes(kind)?kind:'voice',status:'pending',stages:{}});
    while(this.rows.size>this.limit)this.rows.delete(this.rows.keys().next().value);
    return true;
  }
  mark(turnId,stage,at=this.clock()){
    if(!validId(turnId)||!STAGES.has(stage)||!Number.isFinite(at)||at<0||Math.abs(at-this.clock())>this.maxSkewMs)return false;
    this.begin(turnId);const stages=this.rows.get(turnId).stages;
    if(stages[stage]===undefined||stage==='playback-end')stages[stage]=at;
    return true;
  }
  finish(turnId,status='complete'){
    const row=this.rows.get(turnId);if(!row)return false;
    row.status=['complete','interrupted','error','discarded'].includes(status)?status:'unknown';return true;
  }
  snapshot(){
    const rows=[...this.rows.values()].map(row=>{
      const durations={};for(const [name,[start,end]]of Object.entries(DURATIONS)){const a=row.stages[start],b=row.stages[end];if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a)durations[name]=Math.round((b-a)*100)/100;}
      return {...row,stages:{...row.stages},durations};
    });
    const summary={};for(const name of Object.keys(DURATIONS)){const values=rows.map(row=>row.durations[name]).filter(Number.isFinite).sort((a,b)=>a-b);if(values.length)summary[name]={count:values.length,p50:values[Math.ceil(values.length*.5)-1],p95:values[Math.ceil(values.length*.95)-1]};}
    return {limit:this.limit,count:rows.length,rows,summary};
  }
}
module.exports={VoiceTiming,STAGES,DURATIONS,validId};
