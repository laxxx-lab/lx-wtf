(function(root){
  'use strict';
  class Microphone {
    constructor(acquire){this.acquire=acquire;this.stream=null;this.pending=null;this.generation=0;}
    async get(){
      const generation=this.generation;
      if(this.stream)return this.stream;
      if(!this.pending){
        const pending=(async()=>{const stream=await this.acquire();if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return null;}this.stream=stream;return stream;})();
        this.pending=pending;pending.then(()=>{if(this.pending===pending)this.pending=null;},()=>{if(this.pending===pending)this.pending=null;});
      }
      const stream=await this.pending;
      if(generation!==this.generation)return null;
      return stream||this.get();
    }
    release(){this.generation++;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;}
  }
  if(typeof module==='object'&&module.exports)module.exports={Microphone};else root.Microphone=Microphone;
})(typeof window==='object'?window:globalThis);
