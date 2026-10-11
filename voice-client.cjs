'use strict';
class VoiceClient{
  constructor({registry,url='http://127.0.0.1:8870',fetcher=fetch}){this.registry=registry;this.url=url;this.fetcher=fetcher;this.ready=null;}
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
    // Very short text can immediately emit EOS in ICL mode. Retry with the
    // exact same speaker embedding, without the long reference-text context.
    const choices=text.trim().length<=32?[name+'-speaker']:[name,name+'-speaker'];
    for(const selectedVoice of choices){
      signal?.throwIfAborted();
      const response=await this.fetcher(this.url+'/v1/audio/speech',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({input:text,voice:selectedVoice,language:'German',response_format:'pcm',seed:42,max_new_tokens:1200})});
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
