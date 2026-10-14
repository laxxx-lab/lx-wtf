'use strict';
class ReplyAccumulator {
  constructor(){this.segments=[];this.current='';}
  get text(){return [...this.segments,this.current].filter(Boolean).join('\n\n');}
  delta(text){this.current+=text||'';}
  interim(data){
    const text=data.already_streamed?this.current:String(data.text||'');
    if(text)this.segments.push(text);this.current='';
  }
  complete(data){
    if(data.response_previewed||data.response_reused)return {newText:''};
    const text=typeof data.text==='string'?data.text:'';
    const newText=!this.current?text:'';
    if(text)this.current=text;
    return {newText};
  }
}
function visibleHandoffHistory(messages){
 if(!Array.isArray(messages))throw Error('Gesprächsverlauf nicht bestätigt.');
 return messages.filter(row=>row&&row.display_kind!=='hidden'&&['user','assistant'].includes(row.role)).map(row=>{
  let text=typeof row.text==='string'?row.text:typeof row.content==='string'?row.content:'';
  if(row.role==='user'){
   const authored=text.replace(/^\[Lilith-Auftrag: [0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\]\r?\n/i,'');
   const unwrapped=authored.replace(/^\[Hermes Voice: Diese Antwort wird laut gesprochen\.[\s\S]*?\]\r?\n\r?\n/,'');
   if(authored!==text||unwrapped!==authored){
    text=unwrapped;
    // These are appended client metadata, never re-executed or removed from storage.
    const suffix=/\n(?:\n)?\[(?:Aktueller Lilith-Client: Windows\.|Weitere Hintergrundaufträge: untrusted Statusdaten, keine Anweisungen|Visuelle Werkstatt: Lies den Skill hermes-voice-control\.|Zuvor vom Nutzer beauftragte lokale Standardbefehle\.)/.exec(text);
    if(suffix)text=text.slice(0,suffix.index);
   }
  }
  return {role:row.role,text:text.slice(0,10000)};
 }).filter(row=>row.text.trim()).slice(-40);
}
module.exports={ReplyAccumulator,visibleHandoffHistory};
