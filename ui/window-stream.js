(function(global){
 'use strict';
 function createVideoStream({video,invoke,getDisplayMedia=options=>global.navigator.mediaDevices.getDisplayMedia(options),isVisible,onChange=()=>{},onError=()=>{},autoStart=true,now=Date.now}){
  let appId=null,running=false,locked=false,windowVisible=true,generation=0,pending=false,disposed=false,stream=null,retryAfter=0;
  const allowed=()=>!disposed&&!locked&&windowVisible&&running&&appId&&isVisible();
  function stop(notify=true){generation++;pending=false;const previous=stream;stream=null;previous?.getTracks().forEach(track=>track.stop());video.pause();video.srcObject=null;onChange({active:false,pending:false});if(notify)Promise.resolve(invoke('craft-stream-stop')).catch(()=>{});}
  const controller={
   async start(){
    if(!allowed()||pending||stream)return;pending=true;const ticket=++generation,selected=appId;onChange({active:false,pending:true});
    const valid=()=>ticket===generation&&allowed()&&selected===appId;
    let acquired;
    try{
     await invoke('craft-stream-start',{appId:selected});if(!valid())return;
     acquired=await getDisplayMedia({audio:false,video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}}});
     if(!valid()){acquired.getTracks().forEach(track=>track.stop());return;}
     stream=acquired;const track=stream.getVideoTracks()[0];if(!track)throw Error('Kein Fenster-Video verfügbar.');
     track.addEventListener('ended',()=>{if(stream===acquired){stop();onError(Error('Anwendungsfenster wurde geschlossen oder Aufnahme beendet.'));}},{once:true});
     video.srcObject=stream;await video.play();if(!valid()){acquired.getTracks().forEach(track=>track.stop());return;}
     pending=false;onChange({active:true,pending:false,settings:track.getSettings()});
    }catch(error){if(valid()){stop();retryAfter=now()+3000;onError(error);}}
    finally{if(ticket===generation){pending=false;if(!stream)onChange({active:false,pending:false});}}
   },
   setContext(context){const next=context.appId??appId,nextLocked=context.privacyLocked===true,nextRunning=context.running===true,nextVisible=context.windowVisible!==false;const changed=next!==appId||nextLocked!==locked||nextRunning!==running||nextVisible!==windowVisible;if(next!==appId||nextLocked||!nextRunning||!nextVisible){if(stream||pending)stop();}appId=next;locked=nextLocked;running=nextRunning;windowVisible=nextVisible;if(changed)retryAfter=0;if(autoStart&&now()>=retryAfter)return controller.start();},
   visibilityChanged(){if(!isVisible()){if(stream||pending)stop();}else if(autoStart&&now()>=retryAfter)return controller.start();},
   stop,
   dispose(){stop();disposed=true;},
   get active(){return !!stream;},
   get pending(){return pending;},
  };
  return controller;
 }
 const api={createVideoStream};if(typeof module==='object'&&module.exports)module.exports=api;else global.WindowStream=api;
})(typeof window==='object'?window:globalThis);
