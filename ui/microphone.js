(function(root){
  'use strict';
  const validMicrophoneDeviceId=id=>typeof id==='string'&&id.length<=256&&(id===''||/^[A-Za-z0-9+/_=-]+$/.test(id));
  const validMicrophoneLabel=label=>typeof label==='string'&&label.length<=300&&!/[\p{Cc}\p{Cf}]/u.test(label);
  function resolveMicrophoneDevice({deviceId='',label=''},devices){
    if(!validMicrophoneDeviceId(deviceId)||!validMicrophoneLabel(label))throw Error('Ungültiges Mikrofon.');
    if(!deviceId)return {deviceId:'',label:''};
    const inputs=devices.filter(item=>item.kind==='audioinput'&&validMicrophoneDeviceId(item.deviceId)&&validMicrophoneLabel(item.label));
    const exact=inputs.filter(item=>item.deviceId===deviceId);
    const name=value=>value.normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\(\d+-\s*/g,'(').trim();
    const matches=exact.length?exact:label?inputs.filter(item=>!['default','communications'].includes(item.deviceId)&&name(item.label)===name(label)):[];
    if(matches.length!==1)throw Error(matches.length?'Mehrere gleichnamige Mikrofone verfügbar. Bitte eines auswählen.':'Gespeichertes Mikrofon ist nicht verfügbar. Bitte anschließen oder unter Audio / Mikrofon auswählen.');
    return {deviceId:matches[0].deviceId,label:matches[0].label};
  }
  function microphoneConstraints(deviceId=''){
    if(!validMicrophoneDeviceId(deviceId))throw Error('Ungültiges Mikrofon.');
    return {audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(deviceId?{deviceId:{exact:deviceId}}:{})},video:false};
  }
  class Microphone {
    constructor(acquire){this.acquire=acquire;this.stream=null;this.pending=null;this.generation=0;}
    async get(){
      if(this.stream?.getTracks().some(track=>track.readyState==='ended'))this.release();
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
  if(typeof module==='object'&&module.exports)module.exports={Microphone,microphoneConstraints,validMicrophoneDeviceId,validMicrophoneLabel,resolveMicrophoneDevice};else Object.assign(root,{Microphone,microphoneConstraints,validMicrophoneDeviceId,validMicrophoneLabel,resolveMicrophoneDevice});
})(typeof window==='object'?window:globalThis);
