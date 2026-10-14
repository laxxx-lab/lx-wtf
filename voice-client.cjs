'use strict';
class VoiceClient{
  constructor({registry,url='http://127.0.0.1:8870',fetcher=fetch}){this.registry=registry;this.url=url;this.fetcher=fetcher;this.ready=null;}
  get profiles(){
    const profiles=new Map(),labels={dark:'Samtig & kraftvoll',sovereign:'Souverän & präzise',playful:'Warm & frech',reference:'Deine Referenzstimme'};
    for(const entry of this.registry){
      const match=/^hermes-([a-z][a-z0-9-]{0,63})-(normal|whisper|power)$/.exec(entry.name||'');if(!match)continue;
      const [,id,delivery]=match,label=typeof entry.display_name==='string'&&entry.display_name.length<=100&&!/[\p{Cc}\p{Cf}]/u.test(entry.display_name)?entry.display_name:labels[id]||id;
      if(!profiles.has(id))profiles.set(id,{id,label,deliveries:[]});const profile=profiles.get(id);if(!profile.deliveries.includes(delivery))profile.deliveries.push(delivery);
    }
    return [...profiles.values()];
  }
  async prepare(){
    if(!this.ready)this.ready=(async()=>{
      for(const entry of this.registry){
        for(const reference of [entry,{...entry,name:entry.name+'-speaker',ref_text:''}]){
          const response=await this.fetcher(this.url+'/v1/audio/voices',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify(reference)});
          if(!response.ok)throw new Error('Die feste Stimme konnte nicht geladen werden.');
        }
      }
    })().catch(error=>{this.ready=null;throw error;});
    return this.ready;
  }
  async speech(text,voice,delivery='normal',signal){
    const name=`hermes-${voice}-${delivery}`;
    if(!this.registry.some(entry=>entry.name===name))throw new Error('Unbekannte feste Stimme oder Sprechweise.');
    await this.prepare();signal?.throwIfAborted();
    // Normal short text can emit EOS in ICL mode. Its speaker-only fallback
    // keeps the identity, but drops style; whispered/projected speech must
    // retain its reference even for short replies.
    const choices=delivery==='normal'?(text.trim().length<=32?[name+'-speaker']:[name,name+'-speaker']):[name];
    // English pronunciation hint for German TTS; displayed text and voice references stay unchanged.
    const input=text.replace(/(?<![\p{L}\p{N}\p{M}_])wake-?word(s)?(?![\p{L}\p{N}\p{M}_])/giu,(_term,plural)=>plural?'Weik Wörds':'Weik Wörd');
    for(const selectedVoice of choices){
      signal?.throwIfAborted();
      const response=await this.fetcher(this.url+'/v1/audio/speech',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({input,voice:selectedVoice,language:'German',response_format:'pcm',seed:42,max_new_tokens:1200})});
      if(!response.ok)return response;
      const reader=response.body.getReader();let first=await reader.read();
      while(!first.done&&!first.value?.length)first=await reader.read();
      if(first.done){reader.releaseLock();continue;}
      let pending=first.value;
      return new Response(new ReadableStream({
        async pull(controller){if(pending){controller.enqueue(pending);pending=null;return;}try{const next=await reader.read();if(next.done){reader.releaseLock();controller.close();}else controller.enqueue(next.value);}catch(error){controller.error(error);}},
        cancel(reason){return reader.cancel(reason);}
      }),{status:response.status,headers:response.headers});
    }
    throw new Error('Die lokale Stimme hat kein Audio erzeugt.');
  }
}
module.exports={VoiceClient};
