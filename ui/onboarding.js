'use strict';
const form=document.getElementById('setup'),status=document.getElementById('status'),submit=document.getElementById('submit'),progress=document.getElementById('progress');
const fields=['assistantName','url','stt','tts','language'];
function selections(){return Object.fromEntries(fields.map(key=>[key,form.elements.namedItem(key).value]));}
function errorMessage(error){return String(error?.message||'Installation failed. Please retry.').replace(/^Error invoking remote method ['"]onboarding:save['"]:\s*(?:Error:\s*)?/,'').split(/\r?\n/)[0].replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,600);}
function summarize(){const {stt,tts}=selections(),rows=['Hermes Voice client + your gateway connection'];let estimate=[];
 if(stt==='none')rows.push('Text input · no recognition model');else if(stt==='existing')rows.push('Recognition · existing native runtime');else{rows.push('Whisper '+stt+' · local CPU recognition');estimate.push(stt==='small'?'Small model ~500 MB':'Base model ~150 MB');}
 if(tts==='none')rows.push('Text replies · no speech output model');else if(tts==='existing')rows.push('Speech output · existing runtime and current voice');else{rows.push('Piper '+(tts.startsWith('de_')?'Thorsten (German)':'Lessac (English)')+' · local CPU speech');estimate.push('voice ~60–100 MB');}
 if(['base','small'].includes(stt)||!['none','existing'].includes(tts))rows.push('Selected speech dependencies · isolated Python environment');
 document.getElementById('components').replaceChildren(...rows.map(text=>{const item=document.createElement('li');item.textContent=text;return item;}));
 document.getElementById('estimate').textContent=estimate.length?'Rough model download estimates: '+estimate.join('; ')+'. Python and dependency downloads add several hundred MB; installed size and download time vary.':'No public speech models will be downloaded. Existing runtimes must already be available.';
}
form.addEventListener('change',summarize);
window.onboarding.progress(value=>{status.textContent=value.message;});
form.addEventListener('submit',async event=>{event.preventDefault();if(!form.reportValidity())return;status.classList.remove('error');const choice=selections();for(const field of form.elements)field.disabled=true;progress.hidden=false;status.textContent='Installing and verifying your selected components…';
 try{await window.onboarding.save(choice);status.textContent='Verified. Opening Hermes Voice…';}catch(error){status.classList.add('error');status.textContent='Setup could not finish. '+errorMessage(error)+' Your setup has not been marked ready.';for(const field of form.elements)field.disabled=false;submit.textContent='Retry installation';}finally{progress.hidden=true;}
});
window.onboarding.snapshot().then(value=>{for(const key of fields)if(typeof value[key]==='string')form.elements.namedItem(key).value=value[key];summarize();}).catch(()=>{status.textContent='Setup could not load. Close this window and reopen setup.';submit.disabled=true;});
