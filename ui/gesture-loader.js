(function(root){
  async function loadGestureDetector(){
    const worker=new Worker(new URL('gesture-worker.js',location.href)),pending=new Map();let sequence=0,closed=false;
    function fail(error){for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();}
    worker.onerror=()=>fail(new Error('Das lokale Handmodell konnte nicht geladen werden.'));
    worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(new Error(data.error)):p.resolve(data);};
    function send(data,transfer=[]){
      if(closed)return Promise.reject(new Error('Gestenerkennung wurde beendet.'));
      return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Gestenerkennung antwortet nicht.'));},15000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,...data},transfer);});
    }
    const close=()=>{if(closed)return;closed=true;worker.terminate();fail(new Error('Gestenerkennung wurde beendet.'));};
    try{await send({type:'load'});}catch(error){close();throw error;}
    return {async detectForVideo(video,timestamp){const image=await createImageBitmap(video);if(closed){image.close();throw new Error('Gestenerkennung wurde beendet.');}try{return (await send({type:'detect',image,timestamp},[image])).result;}catch(error){image.close();throw error;}},close};
  }
  root.loadGestureDetector=loadGestureDetector;
})(window);
