'use strict';
function hasAudioSignal(bytes){
  if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('Ungültige Mikrofonaufnahme.');
  let rate=0,data=null;
  for(let at=12;at+8<=bytes.length;){
    const name=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),start=at+8;
    if(start+size>bytes.length)throw new Error('Unvollständige Mikrofonaufnahme.');
    if(name==='fmt '){if(size<16||bytes.readUInt16LE(start)!==1||bytes.readUInt16LE(start+2)!==1||bytes.readUInt16LE(start+14)!==16)throw new Error('Mono-PCM16 erforderlich.');rate=bytes.readUInt32LE(start+4);}
    if(name==='data')data=bytes.subarray(start,start+size);
    at=start+size+(size%2);
  }
  if(!data||rate!==16000||data.length%2)throw new Error('16-kHz-Mikrofonaufnahme erforderlich.');
  const frame=320;let activeSamples=0;
  for(let at=0;at<data.length/2;at+=frame){
    const count=Math.min(frame,data.length/2-at);let energy=0;
    for(let i=0;i<count;i++){const sample=data.readInt16LE((at+i)*2)/32768;energy+=sample*sample;}
    if(Math.sqrt(energy/count)>.003)activeSamples+=count;
  }
  return activeSamples>=16000*.12;
}
async function transcribeAudio(bytes,{fetcher=fetch,url='http://127.0.0.1:8871/inference',signal=AbortSignal.timeout(60000)}={}){
  if(!hasAudioSignal(bytes))return '';
  const body=new FormData();body.set('file',new Blob([bytes],{type:'audio/wav'}),'command.wav');body.set('response_format','verbose_json');body.set('language','de');body.set('vad','true');
  // Language is fixed. whisper.cpp's extra probability pass indexes a negative
  // language id when VAD removes all samples, which can crash the resident server.
  body.set('no_language_probabilities','true');
  const response=await fetcher(url,{method:'POST',body,signal});
  if(!response.ok)throw new Error('Lokale Spracherkennung ist nicht bereit.');
  const result=await response.json();
  return (result.segments||[]).filter(s=>Number.isFinite(s.avg_logprob)&&s.avg_logprob>=-1&&Number.isFinite(s.no_speech_prob)&&s.no_speech_prob<.8).map(s=>String(s.text||'').trim()).filter(Boolean).join(' ');
}
module.exports={hasAudioSignal,transcribeAudio};
