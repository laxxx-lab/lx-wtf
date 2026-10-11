(function(root){
  'use strict';
  class ScreenCapture{
    constructor({getUserMedia,video,canvas}={}){
      this.getUserMedia=getUserMedia||(constraints=>navigator.mediaDevices.getUserMedia(constraints));
      this.video=video||document.createElement('video');this.video.muted=true;this.video.playsInline=true;
      this.canvas=canvas||document.createElement('canvas');this.generation=0;this.stream=null;this.pending=false;
    }
    cancel(){this.generation++;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;this.video.srcObject=null;this.cancelRequest?.();}
    async capture(sourceId){
      if(!/^(window|screen):\d+:\d+$/.test(sourceId))throw new Error('Ungültige Bildschirm-Quelle.');
      if(this.pending)throw new Error('Ein Bildschirmblick läuft bereits.');
      this.pending=true;const generation=++this.generation;
      const current=()=>{if(generation!==this.generation)throw new Error('Bildschirmblick wurde abgebrochen.');};
      const cancelled=new Promise((_resolve,reject)=>{this.cancelRequest=()=>reject(new Error('Bildschirmblick wurde abgebrochen.'));});
      const timer=setTimeout(()=>this.cancel(),10000);
      try{
        const acquisition=this.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:sourceId,maxWidth:1440,maxHeight:900,maxFrameRate:2}}}).then(stream=>{if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());current();}return stream;});
        const stream=await Promise.race([acquisition,cancelled]);
        this.stream=stream;this.video.srcObject=stream;await Promise.race([this.video.play(),cancelled]);current();
        while(this.video.readyState<2||!this.video.videoWidth){await new Promise(resolve=>setTimeout(resolve,30));current();}
        const scale=Math.min(1,1440/this.video.videoWidth,900/this.video.videoHeight);
        this.canvas.width=Math.max(1,Math.round(this.video.videoWidth*scale));this.canvas.height=Math.max(1,Math.round(this.video.videoHeight*scale));
        this.canvas.getContext('2d').drawImage(this.video,0,0,this.canvas.width,this.canvas.height);current();
        return {image:this.canvas.toDataURL('image/jpeg',.88).split(',')[1],sourceId,capturedAt:new Date().toISOString()};
      }finally{clearTimeout(timer);this.cancelRequest=null;this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;this.video.srcObject=null;this.pending=false;}
    }
  }
  if(typeof module==='object'&&module.exports)module.exports={ScreenCapture};else root.ScreenCapture=ScreenCapture;
})(typeof window==='object'?window:globalThis);
