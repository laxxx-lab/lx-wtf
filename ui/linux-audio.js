(function(root){
  'use strict';
  const threshold=typeof module==='object'&&module.exports?require('./speech-activity.js').speechThreshold:root.speechThreshold;
  class SpeechSegmenter{
    constructor(){this.reset();}
    reset(){this.active=false;this.frames=[];this.preroll=[];this.prerollSamples=0;this.samples=0;this.voiced=0;this.silent=0;this.noise=.001;}
    push(chunk,{minimumRms=0}={}){
      let energy=0;for(const sample of chunk)energy+=sample*sample;const rms=Math.sqrt(energy/Math.max(1,chunk.length)),speaking=rms>=Math.max(minimumRms,threshold(this.noise));
      if(!this.active){
        if(!speaking){this.noise=this.noise*.98+rms*.02;this.preroll.push(chunk);this.prerollSamples+=chunk.length;while(this.prerollSamples>4000&&this.preroll.length>1)this.prerollSamples-=this.preroll.shift().length;return null;}
        this.active=true;this.frames=this.preroll;this.preroll=[];this.samples=this.prerollSamples;this.prerollSamples=0;
      }
      this.frames.push(chunk);this.samples+=chunk.length;if(speaking){this.voiced+=chunk.length;this.silent=0;}else this.silent+=chunk.length;
      if(this.silent<12000&&this.samples<16000*120)return null;
      const result=this.voiced>=3840?this.frames:null;this.reset();return result;
    }
  }
  function downsample(input,rate){
    if(!Number.isFinite(rate)||rate<16000)throw Error('Mikrofonrate unter 16 kHz.');
    const ratio=rate/16000,out=new Float32Array(Math.floor(input.length/ratio));
    for(let i=0;i<out.length;i++){const start=Math.floor(i*ratio),end=Math.min(input.length,Math.floor((i+1)*ratio));let sum=0;for(let j=start;j<end;j++)sum+=input[j];out[i]=sum/Math.max(1,end-start);}return out;
  }
  function wavBytes(chunks){
    const length=chunks.reduce((sum,item)=>sum+item.length,0),bytes=new Uint8Array(44+length*2),view=new DataView(bytes.buffer);
    const word=(at,text)=>{for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);};
    word(0,'RIFF');view.setUint32(4,36+length*2,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,length*2,true);
    let at=44;for(const chunk of chunks)for(const sample of chunk){const x=Math.max(-1,Math.min(1,sample));view.setInt16(at,x*(x<0?32768:32767),true);at+=2;}return bytes;
  }
  class PcmDecoder{
    constructor(){this.remainder=null;}
    reset(){this.remainder=null;}
    push(bytes){let data=bytes;if(this.remainder!==null){data=new Uint8Array(bytes.length+1);data[0]=this.remainder;data.set(bytes,1);this.remainder=null;}if(data.length%2){this.remainder=data[data.length-1];data=data.subarray(0,-1);}const view=new DataView(data.buffer,data.byteOffset,data.byteLength),floats=new Float32Array(data.length/2);for(let i=0;i<floats.length;i++)floats[i]=view.getInt16(i*2,true)/32768;return floats;}
  }
  const api={downsample,wavBytes,PcmDecoder,SpeechSegmenter};if(typeof module==='object'&&module.exports)module.exports=api;else root.LinuxAudio=api;
})(typeof window==='object'?window:globalThis);
