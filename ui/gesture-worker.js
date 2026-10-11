importScripts('../node_modules/@mediapipe/tasks-vision/vision_bundle.js');
const {FilesetResolver,HandLandmarker}=Vision;
let detector=null;
self.onmessage=async({data})=>{
  const {id,type,image,timestamp}=data;
  try{
    if(type==='load'){
      const files=await FilesetResolver.forVisionTasks(new URL('../node_modules/@mediapipe/tasks-vision/wasm',self.location.href).href);
      detector=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('../runtime/gestures/hand_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.7,minHandPresenceConfidence:.7,minTrackingConfidence:.7});
      self.postMessage({id,ready:true});
    }else if(type==='detect'){
      if(!detector)throw new Error('Handmodell ist nicht bereit.');
      self.postMessage({id,result:detector.detectForVideo(image,timestamp)});
    }
  }catch(error){self.postMessage({id,error:String(error.message).slice(0,300)});}
  finally{image?.close();}
};
