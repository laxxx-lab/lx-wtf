(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const cutFrame=rect=>{
    const x=rect.x+1,y=rect.y+1,right=rect.x+rect.width-1,bottom=rect.y+rect.height-1,cut=Math.min(16,rect.width/5,rect.height/5);
    return `M ${x+cut} ${y} H ${right-cut} L ${right} ${y+cut} V ${bottom-cut} L ${right-cut} ${bottom} H ${x+cut} L ${x} ${bottom-cut} V ${y+cut} Z`;
  };
  window.guide.on(event=>{
    if(event?.type!=='guide')return;
    $('outline').setAttribute('viewBox',`0 0 ${event.width} ${event.height}`);
    const frame=cutFrame(event.windowRect);$('frame-path').setAttribute('d',frame);$('halo-path').setAttribute('d',frame);
    const activity=event.purpose==='activity';$('purpose').textContent=activity?'WERKZEUG AKTIV':'GEFÜHRTER HINWEIS';
    $('label').textContent=event.label||'';$('text').textContent=event.text||'';$('text').hidden=!event.text;
    $('interaction').textContent=activity?'Beobachteter Werkzeugaufruf · keine Erfolgsbestätigung':'Du klickst selbst · Lilith zeigt nur die Stelle';
    $('card').hidden=!event.primary;
    $('card').style.left=Math.max(8,Math.min(event.windowRect.x+20,event.width-320))+'px';
    $('card').style.top=Math.max(8,Math.min(event.windowRect.y+18,event.height-110))+'px';
    $('card').style.maxWidth=Math.max(20,event.width-16)+'px';
    const target=activity?null:event.targetRect;$('pointer').hidden=!target;$('target').hidden=!target;
    if(target){
      const x=target.x+target.width/2,y=target.y+target.height/2;
      Object.assign($('target').style,{left:target.x+'px',top:target.y+'px',width:target.width+'px',height:target.height+'px'});
      Object.assign($('pointer').style,{left:(x-3)+'px',top:(y-3)+'px'});
      $('pointer-label').textContent='Hier klicken';
    }
  });
})();
