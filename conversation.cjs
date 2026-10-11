'use strict';
class Conversation {
  constructor(request,{onReasoning=()=>{}}={}) { this.request = request; this.session = null; this.busy = false; this.error = ''; this.selecting=false;this.speakReply=true;this.onReasoning=onReasoning;this.reasoningState={mode:'automatic',phase:'idle',requested:null,effective:null,error:null};this.reasoningRestore=null;this.reasoningRestoring=null;this.preparing=false;this.remoteRunning=false;this.submissionGeneration=0; }
  reportReasoning(values){this.reasoningState={...this.reasoningState,...values};try{this.onReasoning(this.reasoningState);}catch{/* Views cannot affect dispatch. */}}
  async setReasoning(session,value){
    const params={session_id:session.id,profile:session.profile,key:'reasoning'};
    await this.request('config.set',{...params,value,scope:'session'},8000);
    const observed=await this.request('config.get',params,8000);
    if(observed?.value!==value)throw Error('Hermes hat die Thinking-Einstellung nicht bestätigt.');
    return observed.value;
  }
  async restoreReasoning(){
    const record=this.reasoningRestore;if(!record)return;
    try{
      // A user/menu change takes precedence over restoring our temporary setting.
      const current=await this.request('config.get',{session_id:record.session.id,profile:record.session.profile,key:'reasoning'},8000);
      if(this.remoteRunning&&!this.preparing)return; // A different remote turn began; restore after its terminal event.
      const effective=current.value===record.effort?await this.setReasoning(record.session,record.previous):current.value;
      this.reasoningRestore=null;this.reportReasoning({phase:'idle',effective,error:null});
    }catch(error){this.reportReasoning({phase:'error',error:'Thinking-Rückstellung nicht bestätigt: '+error.message});}
  }
  async select(row) {
    if (this.busy) throw new Error('Ein Auftrag läuft. Zuerst abschließen oder unterbrechen.');
    if(this.selecting)throw new Error('Die Session wird gerade gewechselt.');
    if (!row?.id) throw new Error('Bitte eine Hermes-Session auswählen.');
    this.selecting=true;
    try{
    const result = await this.request('session.resume', {session_id:row.id,profile:row.profile || 'default',omit_messages:true,inline_images:false});
    if (!result?.session_id) throw new Error('Hermes hat die Session nicht geöffnet.');
    this.session = {storedId:row.id,id:result.session_id,profile:row.profile || 'default',title:row.title || row.id};
    this.busy = this.remoteRunning = !!result.running; this.reasoningState={mode:'automatic',phase:'idle',requested:null,effective:null,error:null};this.error = ''; return result;
    }finally{this.selecting=false;}
  }
  async submit(text,{speak=true,sessionId,reasoningEffort,isCurrent=()=>true}={}) {
    if(this.selecting)throw new Error('Die Session wird gerade gewechselt.');
    if (!this.session) throw new Error('Bitte zuerst die gewünschte Hermes-Session auswählen.');
    if(sessionId&&sessionId!==this.session.id)throw new Error('Die Session hat sich seit der Aufnahme geändert. Bitte den Auftrag wiederholen.');
    if (this.busy) throw new Error('Ein Auftrag läuft. Zuerst unterbrechen oder abschließen.');
    if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw new Error('Der Auftrag ist leer oder zu lang.');
    if(reasoningEffort!==undefined&&!['none','medium','high'].includes(reasoningEffort))throw Error('Ungültige automatische Thinking-Stufe.');
    this.busy = true; this.error = '';this.speakReply=speak;
    const session=this.session,generation=++this.submissionGeneration;let dispatched=false;this.preparing=true;
    const check=()=>{if(generation!==this.submissionGeneration||session!==this.session||!isCurrent())throw Error('Auftrag während Thinking-Vorbereitung gestoppt.');};
    try {
      check();if(this.reasoningRestore){await this.restoreReasoning();if(this.reasoningRestore)throw Error('Vorherige Thinking-Einstellung noch unbestätigt.');}check();
      if(reasoningEffort!==undefined){
        this.reportReasoning({phase:'preparing',requested:reasoningEffort,error:null});
        const previous=(await this.request('config.get',{session_id:session.id,profile:session.profile,key:'reasoning'},8000))?.value;check();
        if(typeof previous!=='string'||!previous)throw Error('Hermes meldet keine gültige Thinking-Einstellung.');
        if(previous!==reasoningEffort){this.reasoningRestore={session,previous,effort:reasoningEffort};await this.setReasoning(session,reasoningEffort);check();}
        this.reportReasoning({phase:'running',effective:reasoningEffort});
      }
      check();this.preparing=false;dispatched=true;this.remoteRunning=true;
      return await this.request('prompt.submit', {session_id:session.id,profile:session.profile,text:text.trim(),...(speak?{surface:'voice-live'}:{})});
    }catch(error){
      if(!dispatched){error.notSubmitted=true;await this.restoreReasoning();}
      this.busy=!!this.reasoningRestoring;this.remoteRunning=false;this.error=error.message;throw error;
    }finally{this.preparing=false;}
  }
  receive(event) {
    if (!this.session || event.session_id !== this.session.id) return false;
    const data = event.data || event.payload || {};
    if (event.type === 'message.start') this.busy = this.remoteRunning = true;
    if (event.type === 'message.complete') { this.remoteRunning=false;this.busy=!!(this.preparing||this.reasoningRestoring);this.error = data.error || (data.status === 'error' ? data.failure_reason || 'Hermes-Auftrag fehlgeschlagen.' : ''); }
    if (event.type === 'error') { this.remoteRunning=false;this.busy=!!(this.preparing||this.reasoningRestoring);this.error = data.message || 'Hermes-Fehler.'; }
    if(['message.complete','error'].includes(event.type)&&this.reasoningRestore&&!this.preparing&&!this.reasoningRestoring){
      this.busy=true;this.reasoningRestoring=this.restoreReasoning().finally(()=>{this.busy=this.remoteRunning;this.reasoningRestoring=null;this.reportReasoning({phase:this.reasoningRestore?'error':'idle'});});
    }else if(['message.complete','error'].includes(event.type)&&!this.reasoningRestore)this.reportReasoning({phase:'idle'});
    return true;
  }
  async interrupt() {
    if (!this.session || !this.busy) return;
    this.submissionGeneration++;if(this.preparing||this.reasoningRestoring)return;
    // An interrupted turn stays busy until the gateway confirms its terminal event.
    return this.request('session.interrupt', {session_id:this.session.id,profile:this.session.profile});
  }
}
class SentenceBuffer {
  constructor() { this.text = ''; }
  push(delta) {
    this.text += String(delta || ''); const result = [];
    const boundaries = /[.!?]+["'»“”\)\]]*(?=\s|$)/g;
    let match, consumed = 0;
    while ((match = boundaries.exec(this.text))) {
      const end = match.index + match[0].length, prefix = this.text.slice(consumed, end);
      // A period in a title, abbreviation, initial or unfinished number is not a sentence.
      // ponytail: common German abbreviations; extend this list when rare forms are observed.
      if(match[0] === '.' && /(?:\b(?:dr|prof|bzw|ca|usw|etc|nr|vgl|ggf|sog|abb|tel|inkl|zzgl|evtl|bsp|str)\.|\b[a-zäöü]\.|\b\d+\.)$/i.test(prefix))continue;
      const sentence = prefix.trim(); if(sentence)result.push(sentence);
      consumed = end;
    }
    this.text = this.text.slice(consumed).replace(/^\s+/, '');
    return result;
  }
  flush() { const result = this.text.trim(); this.text = ''; return result; }
}
module.exports = { Conversation, SentenceBuffer };
