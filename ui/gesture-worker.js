importScripts('../node_modules/@mediapipe/tasks-vision/vision_bundle.js');
const {FilesetResolver,HandLandmarker}=Vision;
let detector=null;
self.onmessage=async({data})=>{
  const {id,type,image,timestamp}=data;
  try{
    if(type==='load'){
      const files=await FilesetResolver.forVisionTasks(new URL('../node_modules/@mediapipe/tasks-vision/wasm',self.location.href).href);
      const options={baseOptions:{modelAssetPath:new URL('../runtime/gestures/hand_landmarker.task',self.location.href).href},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.7,minHandPresenceConfidence:.7,minTrackingConfidence:.7};
      let delegate='GPU';
      try{detector=await HandLandmarker.createFromOptions(files,{...options,canvas:new OffscreenCanvas(1,1),baseOptions:{...options.baseOptions,delegate}});const warm=new OffscreenCanvas(320,240);warm.getContext('2d').fillRect(0,0,320,240);detector.detectForVideo(warm,0);}
      catch{detector?.close();delegate='CPU';detector=await HandLandmarker.createFromOptions(files,{...options,baseOptions:{...options.baseOptions,delegate}});}
      self.postMessage({id,ready:true,delegate});
    }else if(type==='detect'){
      if(!detector)throw new Error('Handmodell ist nicht bereit.');
      self.postMessage({id,result:detector.detectForVideo(image,timestamp)});
    }
  }catch(error){self.postMessage({id,error:String(error.message).slice(0,300)});}
  finally{image?.close();}
};
