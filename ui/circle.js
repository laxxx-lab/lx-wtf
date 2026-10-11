(()=>{'use strict';
 const $=id=>document.getElementById(id),canvas=$('selection'),ctx=canvas.getContext('2d');let points=[],drawing=false,region=null,loaded=false,selectionId=null,previewGeneration=0,pending=false;
 function resize(){canvas.width=innerWidth;canvas.height=innerHeight;paint();}window.addEventListener('resize',resize);
 function paint(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#02091688';ctx.fillRect(0,0,canvas.width,canvas.height);if(!points.length)return;const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
  ctx.clearRect(x,y,width,height);ctx.strokeStyle='#85efff';ctx.lineWidth=2;ctx.shadowBlur=16;ctx.shadowColor='#41cde8';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.shadowBlur=0;
  if(!drawing){ctx.setLineDash([7,6]);ctx.strokeRect(x,y,width,height);ctx.setLineDash([]);region={x:x/canvas.width,y:y/canvas.height,width:width/canvas.width,height:height/canvas.height};}
 }
 function clearPreview(){previewGeneration++;selectionId=null;$('explain').disabled=true;$('preview-image').hidden=true;$('preview-image').removeAttribute('src');$('error').hidden=true;}
 async function preview(){clearPreview();const ticket=previewGeneration;$('question').hidden=false;$('preview-status').textContent='Ausschnitt wird zugeschnitten …';
  try{const value=await window.circle.invoke('preview',{region});if(ticket!==previewGeneration)return;$('dimensions').textContent=value.width+' × '+value.height+' PX';
   $('preview-image').onload=()=>{if(ticket!==previewGeneration)return;selectionId=value.selectionId;$('preview-image').hidden=false;$('explain').disabled=false;$('preview-status').textContent='DIESER AUSSCHNITT GEHT AN LILITH';$('prompt').focus();$('prompt').select();};
   $('preview-image').onerror=()=>{if(ticket!==previewGeneration)return;$('error').hidden=false;$('error').textContent='Der Ausschnitt konnte nicht angezeigt werden. Bitte neu markieren.';};$('preview-image').src=value.image;
  }catch(error){if(ticket!==previewGeneration)return;$('error').hidden=false;$('error').textContent=error.message;}
 }
 canvas.addEventListener('pointerdown',event=>{if(!loaded||event.button!==0||pending)return;canvas.setPointerCapture(event.pointerId);drawing=true;points=[{x:event.clientX,y:event.clientY}];region=null;clearPreview();$('question').hidden=true;paint();});
 canvas.addEventListener('pointermove',event=>{if(!drawing)return;if(points.length<4096)points.push({x:Math.max(0,Math.min(innerWidth,event.clientX)),y:Math.max(0,Math.min(innerHeight,event.clientY))});paint();});
 canvas.addEventListener('pointerup',event=>{if(!drawing)return;points.push({x:Math.max(0,Math.min(innerWidth,event.clientX)),y:Math.max(0,Math.min(innerHeight,event.clientY))});drawing=false;paint();if(!region||region.width*canvas.width<8||region.height*canvas.height<8){reset();return;}void preview();});
 function reset(){clearPreview();points=[];region=null;drawing=false;$('question').hidden=true;paint();}
 const cancel=()=>window.circle.invoke('cancel').catch(()=>{});$('close').onclick=cancel;document.addEventListener('keydown',event=>{if(event.key==='Escape')cancel();if(event.key==='Enter'&&event.ctrlKey&&!$('question').hidden){event.preventDefault();$('question').requestSubmit();}});$('redraw').onclick=reset;
 $('question').addEventListener('submit',async event=>{event.preventDefault();if(!selectionId||pending)return;const question=$('prompt').value.trim();if(!question)return;pending=true;$('explain').disabled=true;try{await window.circle.invoke('ask',{selectionId,question});}catch(error){$('error').hidden=false;$('error').textContent=error.message;pending=false;$('explain').disabled=false;}});
 window.circle.on(value=>{$('screen').onload=()=>{loaded=true;resize();};$('screen').src=value.image;$('time').textContent=new Date(value.capturedAt).toLocaleTimeString('de-DE');});resize();
})();
