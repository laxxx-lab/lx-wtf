'use strict';
class Conversation {
  constructor(request) { this.request = request; this.session = null; this.busy = false; this.error = ''; this.selecting=false;this.speakReply=true; }
  async select(row) {
    if (this.busy) throw new Error('Ein Auftrag läuft. Zuerst abschließen oder unterbrechen.');
    if(this.selecting)throw new Error('Die Session wird gerade gewechselt.');
    if (!row?.id) throw new Error('Bitte eine Hermes-Session auswählen.');
    this.selecting=true;
    try{
    const result = await this.request('session.resume', {session_id:row.id,profile:row.profile || 'default',omit_messages:true,inline_images:false});
    if (!result?.session_id) throw new Error('Hermes hat die Session nicht geöffnet.');
    this.session = {storedId:row.id,id:result.session_id,profile:row.profile || 'default',title:row.title || row.id};
    this.busy = !!result.running; this.error = ''; return result;
    }finally{this.selecting=false;}
  }
  async submit(text,{speak=true,sessionId}={}) {
    if(this.selecting)throw new Error('Die Session wird gerade gewechselt.');
    if (!this.session) throw new Error('Bitte zuerst die gewünschte Hermes-Session auswählen.');
    if(sessionId&&sessionId!==this.session.id)throw new Error('Die Session hat sich seit der Aufnahme geändert. Bitte den Auftrag wiederholen.');
    if (this.busy) throw new Error('Ein Auftrag läuft. Zuerst unterbrechen oder abschließen.');
    if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw new Error('Der Auftrag ist leer oder zu lang.');
    this.busy = true; this.error = '';this.speakReply=speak;
    try { return await this.request('prompt.submit', {session_id:this.session.id,profile:this.session.profile,text:text.trim(),...(speak?{surface:'voice-live'}:{})}); }
    catch (error) { this.busy = false; this.error = error.message; throw error; }
  }
  receive(event) {
    if (!this.session || event.session_id !== this.session.id) return false;
    const data = event.data || event.payload || {};
    if (event.type === 'message.start') this.busy = true;
    if (event.type === 'message.complete') { this.busy = false; this.error = data.error || (data.status === 'error' ? data.failure_reason || 'Hermes-Auftrag fehlgeschlagen.' : ''); }
    if (event.type === 'error') { this.busy = false; this.error = data.message || 'Hermes-Fehler.'; }
    return true;
  }
  async interrupt() {
    if (!this.session || !this.busy) return;
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
