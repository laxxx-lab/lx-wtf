(function(root){
  'use strict';
  const TAU=Math.PI*2,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const seed=i=>{const n=Math.sin(i*12.9898+4)*43758.5453;return n-Math.floor(n);};
  // Same Fibonacci geometry as the supplied HTMLs, cached once with stable seeds.
  const sphere=count=>Array.from({length:count},(_,i)=>{
    const y=1-i/(count-1)*2,r=Math.sqrt(1-y*y),a=i*2.39996;
    return {x:Math.cos(a)*r,y,z:Math.sin(a)*r,seed:seed(i)};
  });
  const particles={ 'ai-interface':sphere(600),'particle-core':sphere(1700),'hud-core':sphere(650) };
  const dust=Array.from({length:160},(_,i)=>({th:seed(i+1800)*TAU,ph:Math.acos(2*seed(i+2100)-1),r:1.25+seed(i+2400)*1.1,v:(seed(i+2700)-.5)*.6,s:seed(i+3000)}));

  function palette(rgb){
    const [r,g,b]=rgb.map(v=>clamp(v,0,255)/255),hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2;
    const hue=d?((hi===r?(g-b)/d:hi===g?2+(b-r)/d:4+(r-g)/d)*60+360)%360:0;
    const saturation=d?d/(1-Math.abs(2*l-1))*100:0;
    // Luminance varies for sphere depth; hue/saturation always come from the
    // user's smoothed status color, including neutral/grayscale palettes.
    return (light,alpha)=>`hsla(${hue},${saturation}%,${clamp(light,0,100)}%,${clamp(alpha,0,1)})`;
  }
  function arc(ctx,col,r,a0,a1,width,light,alpha,glow=false){
    ctx.beginPath();ctx.arc(0,0,r,a0,a1);
    if(glow){ctx.lineWidth=width*4;ctx.strokeStyle=col(light,alpha*.16);ctx.stroke();}
    ctx.lineWidth=width;ctx.strokeStyle=col(light,alpha);ctx.stroke();
  }
  function radialLine(ctx,col,r0,r1,a,width,light,alpha){
    ctx.beginPath();ctx.moveTo(Math.cos(a)*r0,Math.sin(a)*r0);ctx.lineTo(Math.cos(a)*r1,Math.sin(a)*r1);
    ctx.lineWidth=width;ctx.strokeStyle=col(light,alpha);ctx.stroke();
  }
  function aura(ctx,col,r,alpha,inner=0){
    const g=ctx.createRadialGradient(0,0,inner,0,0,r);
    g.addColorStop(0,col(60,alpha));g.addColorStop(.45,col(50,alpha*.3));g.addColorStop(1,col(50,0));
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();
  }
  function rotate(p,angle){
    const ca=Math.cos(angle),sa=Math.sin(angle),ct=Math.cos(.35),st=Math.sin(.35);
    const x=p.x*ca+p.z*sa,z=-p.x*sa+p.z*ca;
    return {x,y:p.y*ct-z*st,z:p.y*st+z*ct};
  }
  function point(ctx,col,p,r,size,light,alpha){
    ctx.fillStyle=col(light,alpha);ctx.fillRect(p.x*r-size/2,p.y*r-size/2,size,size);
  }
  function wave(ctx,col,r,phase,alpha,width,t,amp,w,U){
    ctx.beginPath();
    for(let i=0;i<=180;i++){
      const a=i/180*TAU,n=Math.sin(a*5+t*3+phase)*.5+Math.sin(a*9-t*4+phase*2)*.3+Math.sin(a*13+t*6)*.2;
      const rr=r+U*(.008+.075*amp*(.2+w.speak+w.listen*.7))*n;
      i?ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);
    }
    ctx.closePath();ctx.lineWidth=width*4;ctx.strokeStyle=col(60,alpha*.15);ctx.stroke();
    ctx.lineWidth=width;ctx.strokeStyle=col(72,alpha);ctx.stroke();
  }

  function organic(ctx,p){
    const {t,angle:phase,amp,col,w}=p;
    const radius=(w.listen?96:w.speak?100:w.think?83:90)*(1+amp*.12);
    const wob=(w.listen?.12:w.speak?.2:w.think?.08:.05)+amp*.12;
    aura(ctx,col,188,.35+amp*.25,radius*.4);
    if(w.listen)for(let i=0;i<3;i++){
      const f=(t*.45+i/3)%1;
      arc(ctx,col,Math.min(186,radius*(1.15+f*.9)),0,TAU,2,60,(1-f)*.5*(.4+amp));
    }
    if(w.think)for(let i=0;i<14;i++){
      const a=phase*1.2+i/14*TAU,r=radius*1.4+Math.sin(t*3+i)*radius*.05,s=Math.max(1,3+2*Math.sin(t*4+i*1.7));
      ctx.fillStyle=col(65,.8);ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,s,0,TAU);ctx.fill();
    }
    if(w.speak)for(let i=0;i<48;i++){
      const a=i/48*TAU,h=radius*(.06+.28*amp*Math.abs(Math.sin(i*1.9+t*9))),r=radius*1.22;
      ctx.lineCap='round';radialLine(ctx,col,r,r+h,a,3,62,.85);
    }
    // The reference's three harmonically deformed, overlapping blob layers.
    for(let layer=0;layer<3;layer++){
      ctx.beginPath();
      for(let i=0;i<=140;i++){
        const a=i/140*TAU,o=layer*1.7,n=Math.sin(a*3+phase*1.3+o)*.5+Math.sin(a*5-phase*1.7+o*2)*.3+Math.sin(a*2+phase*.9-o)*.4;
        const r=radius*(1-layer*.07)*(1+wob*n);
        i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);
      }
      ctx.closePath();
      const g=ctx.createRadialGradient(-radius*.3,-radius*.35,radius*.1,0,0,radius*1.15);
      g.addColorStop(0,col(78-layer*6,.9-layer*.2));g.addColorStop(.6,col(58,.7-layer*.15));g.addColorStop(1,col(42,.55-layer*.1));
      ctx.fillStyle=g;ctx.fill();
    }
    const g=ctx.createRadialGradient(-radius*.35,-radius*.4,0,-radius*.35,-radius*.4,radius*.5);
    g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,radius*.95,0,TAU);ctx.fill();
  }

  function particleCore(ctx,p){
    const {t,angle,amp,col,w}=p,R=85*(1+amp*.07)*(1-w.think*.1+w.listen*.05),sweep=Math.sin(t*1.6);
    aura(ctx,col,188,.22+amp*.3,R*.2);
    for(const q of particles['particle-core']){
      const v=rotate(q,angle),d=(v.z+1)/2,sd=q.seed;
      const lobe=Math.sin(q.y*3.2+t*1.9)*Math.sin(Math.atan2(q.z,q.x)*2-t*1.4)+.4*Math.sin(q.y*7-t*3+sd);
      const band=(q.y-sweep)*4,boost=w.listen*Math.max(0,lobe)*(.2+amp*1.1)+Math.exp(-band*band)*w.think;
      const disp=1+.03*Math.sin(sd*20+t*2)+w.listen*(.04+amp*.28)*lobe+w.speak*amp*.5*Math.max(0,Math.sin(sd*40+t*8))+w.think*.05*Math.sin(sd*70+t*10);
      const size=Math.max(.3,.7+d*1.9+boost*1.5+(disp-1)*3);
      point(ctx,col,v,R*disp,size,Math.min(92,52+d*28+boost*40),.1+d*.8+boost*.6);
    }
    for(const q of dust){
      const a=q.th+q.v*t*(1+w.think*3),s=Math.sin(q.ph),v=rotate({x:Math.cos(a)*s,y:Math.cos(q.ph),z:Math.sin(a)*s},angle),d=(v.z+1)/2;
      const r=Math.min(186,R*(q.r+w.speak*amp*.5*q.s-w.listen*.25*(.5+amp)));
      point(ctx,col,v,r,1+d*1.4,75,.1+d*.4);
    }
    const g=ctx.createRadialGradient(0,0,0,0,0,R*.55);
    g.addColorStop(0,col(85,.18+amp*.3));g.addColorStop(1,col(60,0));
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,R*.55,0,TAU);ctx.fill();
  }

  function aiInterface(ctx,p){
    const {t,angle,amp,col,w,stroke}=p,U=174,rot=angle*.7,R=U*.2*(1+amp*.1)*(1-w.think*.08);
    aura(ctx,col,R*2.4,.28+amp*.35);
    for(const q of particles['ai-interface']){
      const v=rotate(q,angle),d=(v.z+1)/2,sd=q.seed;
      const disp=1+.03*Math.sin(sd*20+t*2)+w.speak*amp*.4*Math.max(0,Math.sin(sd*40+t*8))+w.think*.05*Math.sin(sd*70+t*10)+w.listen*amp*.1*Math.sin(q.y*6-t*4);
      point(ctx,col,v,R*disp,.6+d*1.5,58+d*28,.1+d*.8);
    }
    arc(ctx,col,U*.32,0,TAU,stroke,60,.35);
    for(let i=0;i<3;i++){const a=rot*2+i*TAU/3;arc(ctx,col,U*.32,a,a+.9,3*stroke,66,.95,true);}
    for(let i=0;i<144;i++){
      const a=i/144*TAU-rot*.5,big=i%12===0,m=i%4===0;
      radialLine(ctx,col,U*.38,U*(.38+(big?.028:m?.018:.01)),a,(big?1.6:1)*stroke,big?78:58,big?.95:.5);
    }
    ctx.font='7px ui-monospace,Menlo,Consolas,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=col(70,.7);
    for(let i=0;i<12;i++){
      const a=i/12*TAU-rot*.5;ctx.fillText(String(i*30).padStart(3,'0'),Math.cos(a)*U*.445,Math.sin(a)*U*.445);
    }
    arc(ctx,col,U*.5,0,TAU,.8*stroke,50,.3);
    [[0,1.1],[1.5,2.1],[2.6,3.9],[4.3,5],[5.4,6.1]].forEach((s,i)=>{
      const o=-rot*(.7+i*.15);arc(ctx,col,U*.5,s[0]+o,s[1]+o,5*stroke,58,.55,true);
    });
    wave(ctx,col,U*.57,0,.95,1.4*stroke,t,amp,w,U);
    wave(ctx,col,U*.57,2,.5,stroke,t,amp,w,U);wave(ctx,col,U*.57,4,.3,stroke,t,amp,w,U);
    for(let i=0;i<80;i++){
      const a=i/80*TAU+rot*.2,lv=.03+(w.speak+w.listen*.6)*amp*(.3+.7*Math.abs(Math.sin(i*.7+t*5)*Math.sin(i*.31-t*3)));
      radialLine(ctx,col,U*.66,U*(.664+.09*lv),a,2*stroke,60+lv*40,.5+lv);
    }
    arc(ctx,col,U*.76,0,TAU,.8*stroke,50,.3);
    for(let i=0;i<4;i++){
      const a=-rot*.4+i*TAU/4;arc(ctx,col,U*.76,a-.2,a+.2,3*stroke,68,.9,true);arc(ctx,col,U*.8,a-.08,a+.08,1.2*stroke,70,.8);
    }
    for(let i=0;i<8;i++){
      const a=rot*.3+i*TAU/8;ctx.fillStyle=col(75,.8);ctx.fillRect(Math.cos(a)*U*.76-1.5,Math.sin(a)*U*.76-1.5,3,3);
    }
    for(const side of [-1,1])radialLine(ctx,col,U*.8,187,side<0?Math.PI:0,.8*stroke,60,.4);
    if(w.listen)for(let i=0;i<3;i++){
      const f=(t*.5+i/3)%1;arc(ctx,col,U*(.76-f*.28),0,TAU,1.2*stroke,70,Math.sin(f*Math.PI)*.5*(.4+amp));
    }
    if(w.think)for(let i=0;i<30;i++)radialLine(ctx,col,0,U*.5,t*3-i*.04,2*stroke,62,(1-i/30)*.32);
  }

  function hudCore(ctx,p){
    const {t,angle,amp,col,w,stroke}=p,U=188,rot=angle*.6,R=U*.3*(1+amp*.08);
    aura(ctx,col,U*.7,.25+amp*.35);
    for(const q of particles['hud-core']){
      const v=rotate(q,angle),d=(v.z+1)/2,sd=q.seed;
      const disp=1+.03*Math.sin(sd*20+t*2)+amp*.3*Math.sin(sd*40+t*6)*(w.speak+w.listen*.5)+w.think*.07*Math.sin(sd*70+t*10);
      point(ctx,col,v,R*disp,.7+d*1.8,55+d*30,.12+d*.8);
    }
    ctx.beginPath();
    for(let i=0;i<=180;i++){
      const a=i/180*TAU,r=R*1.32+Math.sin(a*8+t*7)*R*.07*amp*(1+w.speak)+Math.sin(a*3-t*2)*R*.02;
      i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);
    }
    ctx.closePath();ctx.lineWidth=1.6*stroke;ctx.strokeStyle=col(65,.55+amp*.4);ctx.stroke();
    arc(ctx,col,U*.5,0,TAU,stroke,50,.35);
    for(let i=0;i<3;i++){const a=rot*2+i*TAU/3;arc(ctx,col,U*.5,a,a+.9,4*stroke,62,.9);}
    for(let i=0;i<120;i++){
      const a=i/120*TAU-rot*.6,big=i%10===0,m=i%5===0;
      radialLine(ctx,col,U*.58,U*(.58+(big?.05:m?.03:.015)),a,(big?2:1)*stroke,big?75:58,big?.9:.5);
    }
    ctx.setLineDash([U*.12,U*.03,U*.02,U*.03]);ctx.lineDashOffset=-rot*U*1.5;
    arc(ctx,col,U*.7,0,TAU,2*stroke,55,.55);ctx.setLineDash([]);
    arc(ctx,col,U*.67,-rot*1.4,-rot*1.4+1.4,stroke,70,.8);arc(ctx,col,U*.67,-rot*1.4+3.2,-rot*1.4+4,stroke,70,.8);
    for(let i=0;i<96;i++){
      const a=i/96*TAU+rot*.2,lv=.04+(w.speak+w.listen*.6)*amp*(.4+.6*Math.abs(Math.sin(i*.7+t*5)*Math.sin(i*.31-t*3)));
      radialLine(ctx,col,U*.78,U*(.788+.14*lv),a,2.2*stroke,60+lv*60,.5+lv);
    }
    arc(ctx,col,U*.93,0,TAU,stroke,45,.3);
    for(let i=0;i<4;i++){
      const a=-rot*.5+i*TAU/4;ctx.fillStyle=col(70,.9);ctx.beginPath();ctx.arc(Math.cos(a)*U*.93,Math.sin(a)*U*.93,3,0,TAU);ctx.fill();
      arc(ctx,col,U*.93+6,a-.12,a+.12,2*stroke,70,.8);
    }
    if(w.listen)for(let i=0;i<3;i++){
      const f=(t*.5+i/3)%1;arc(ctx,col,U*(.95-f*.5),0,TAU,1.5*stroke,70,Math.sin(f*Math.PI)*.6*(.4+amp));
    }
    if(w.think){
      for(let i=0;i<36;i++)radialLine(ctx,col,0,U*.66,t*3.2-i*.035,U*.012,60,(1-i/36)*.35);
      arc(ctx,col,U*.66,0,TAU,stroke,70,.5);
    }
  }

  const themes={'voice-orb':organic,'ai-interface':aiInterface,'particle-core':particleCore,'hud-core':hudCore};
  // Caller supplies the existing clock (seconds/radians), state and real audio
  // envelope. This module owns no session state, input device or animation loop.
  function drawReferenceTheme(ctx,theme,{time=0,angle=0,state='idle',amplitude=0,color=[57,220,255],reducedMotion=false,intensity=1,compact=false}={}){
    const draw=themes[theme];if(!draw)return false;
    const t=reducedMotion?0:Number.isFinite(time)?time:0,a=reducedMotion?0:Number.isFinite(angle)?angle:0;
    const amp=reducedMotion?0:clamp(Number.isFinite(amplitude)?amplitude:0,0,1);
    const w={listen:Number(state==='listening'),think:Number(state==='thinking'||state==='working'),speak:Number(state==='speaking')};
    const rgb=Array.isArray(color)&&color.length===3&&color.every(Number.isFinite)?color:[57,220,255];
    const col=palette(rgb),strength=clamp(Number.isFinite(intensity)?intensity:1,.4,2.4);
    ctx.save();ctx.beginPath();ctx.arc(0,0,190,0,TAU);ctx.clip();
    ctx.globalAlpha*=clamp(.85+strength*.15,.6,1)*(state==='offline'?.55:1);
    ctx.globalCompositeOperation='source-over';ctx.lineCap='butt';
    // The source demos have dark stages. A fading circular veil preserves their
    // fine edges over bright wallpaper while the window corners remain clear.
    const veil=ctx.createRadialGradient(0,0,25,0,0,184);
    veil.addColorStop(0,'rgba(4,10,17,.8)');veil.addColorStop(.65,'rgba(4,10,17,.72)');
    veil.addColorStop(.9,'rgba(4,10,17,.45)');veil.addColorStop(1,'rgba(4,10,17,0)');
    ctx.fillStyle=veil;ctx.beginPath();ctx.arc(0,0,184,0,TAU);ctx.fill();
    draw(ctx,{t,angle:a,amp,col,w,stroke:compact?1.2:1});
    ctx.restore();return true;
  }
  const api={drawReferenceTheme};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.HermesOrbReferenceThemes=api;
})(typeof window==='object'?window:globalThis);
