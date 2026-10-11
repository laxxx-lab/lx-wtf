(function(root){
  'use strict';
  const ORB_DEFAULTS=Object.freeze({idle:'#39dcff',listening:'#36efc3',speaking:'#85dcff',thinking:'#ffc078',working:'#659bff',looking:'#aaa9ff',success:'#66f0a6',alert:'#ff9955',error:'#ff5679',offline:'#647d95'});
  function normalizeOrbColors(value){const result={...ORB_DEFAULTS};for(const key of Object.keys(result))if(typeof value?.[key]==='string'&&/^#[0-9a-f]{6}$/i.test(value[key]))result[key]=value[key].toLowerCase();return result;}
  function orbState({phase='ready',speaking=false,capturing=false,looking=false,now=0,successUntil=0,alertUntil=0}={}){
    if(phase==='offline')return 'offline';if(phase==='error')return 'error';
    if(['approval','question'].includes(phase)||alertUntil>now)return 'alert';
    if(looking)return 'looking';
    if(successUntil>now&&['ready','listening'].includes(phase))return 'success';
    if(speaking)return 'speaking';if(capturing)return 'listening';
    if(['connecting','transcribing'].includes(phase))return 'thinking';
    return Object.hasOwn(ORB_DEFAULTS,phase)?phase:'idle';
  }
  const TAU=Math.PI*2,clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  function orbDynamics(state,amplitude=0){
    const energy=clamp(Number.isFinite(amplitude)?amplitude:0,0,1),rest=state==='idle'||state==='offline';
    const speed={idle:.65,listening:1.15,speaking:1.55,thinking:2.4,working:1.8,looking:.85,success:.8,alert:1.3,error:.8,offline:.45}[state]||.65;
    return {scale:rest?.62:Math.min(1,.87+(state==='speaking'?energy*.13:state==='listening'?energy*.08:0)),spread:rest?.7:1,speed};
  }
  const rgb=hex=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16));
  class OrbRenderer{
    constructor(canvas,{reducedMotion=false}={}){
      this.canvas=canvas;this.ctx=canvas.getContext('2d');this.reducedMotion=reducedMotion;
      this.colors=normalizeOrbColors();this.color=rgb(this.colors.idle);this.rotation=0;this.speed=.65;this.lastTime=null;this.level=0;this.size=.62;this.spread=.7;
      this.pointer={x:0,y:0};this.tilt={x:0,y:0};this.pulses=[];
      // Deterministic particles: no per-frame randomness or new animation timers.
      this.particles=Array.from({length:160},(_,i)=>({a:i*2.399963,y:1-2*(i+.5)/160,r:128+(i%9)*4,seed:i*.731}));
    }
    setColors(value){this.colors=normalizeOrbColors(value);}
    setPointer(x,y){this.pointer={x:clamp(x,-1,1),y:clamp(y,-1,1)};}
    pulse(x=0,y=0,now=performance.now()){this.pulses.push({x:x*110,y:y*110,start:now});if(this.pulses.length>6)this.pulses.shift();}
    draw(now,{state='idle',amplitude=0,intensity=1}={}){
      const ctx=this.ctx;if(!ctx)return;
      const dt=this.lastTime===null?0:clamp((now-this.lastTime)/1000,0,.05);this.lastTime=now;
      const smooth=1-Math.exp(-dt*9),target=rgb(this.colors[state]||this.colors.idle);
      this.color=this.color.map((n,i)=>n+(target[i]-n)*smooth);this.level+=(clamp(amplitude,0,1)-this.level)*smooth;
      this.tilt.x+=(this.pointer.x-this.tilt.x)*smooth;this.tilt.y+=(this.pointer.y-this.tilt.y)*smooth;
      const dynamics=orbDynamics(state,this.level);
      const sizeSmooth=this.reducedMotion?1:1-Math.exp(-dt*4.5);
      this.size+=(dynamics.scale-this.size)*sizeSmooth;this.spread+=(dynamics.spread-this.spread)*sizeSmooth;
      this.speed+=(dynamics.speed-this.speed)*smooth;
      const motion=clamp(Number.isFinite(intensity)?intensity:1,.4,1.6);
      if(!this.reducedMotion)this.rotation+=dt*this.speed*motion;
      const t=this.rotation,rest=state==='idle'||state==='offline',breathe=this.reducedMotion?0:Math.sin(now*.0023)*(rest?.022:.035),energy=this.level;
      const color=this.color.map(Math.round).join(','),ink=(alpha=1)=>`rgba(${color},${clamp(alpha,0,1)})`;
      ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.save();ctx.scale(this.canvas.width/400,this.canvas.height/400);ctx.translate(200,200);ctx.scale(this.size,this.size);
      // Transparent atmospheric corona, leaving the desktop visible behind it.
      const corona=ctx.createRadialGradient(0,0,12,0,0,193);
      corona.addColorStop(0,ink(.17+energy*.12));corona.addColorStop(.45,ink(.055+energy*.05));corona.addColorStop(1,ink(0));ctx.fillStyle=corona;ctx.fillRect(-200,-200,400,400);
      const arc=(radius,start,end,width=1,alpha=.6)=>{ctx.strokeStyle=ink(alpha);ctx.lineWidth=width;ctx.beginPath();ctx.arc(0,0,radius,start,end);ctx.stroke();};
      const line=(a,b,width,alpha)=>{ctx.strokeStyle=ink(alpha);ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();};
      const project=(x,y,z)=>{
        const rx=.18+this.tilt.y*.18,ry=this.tilt.x*.2;
        const y1=y*Math.cos(rx)-z*Math.sin(rx),z1=y*Math.sin(rx)+z*Math.cos(rx);
        const x1=x*Math.cos(ry)+z1*Math.sin(ry),z2=-x*Math.sin(ry)+z1*Math.cos(ry),p=1/(1-z2/620);
        return {x:x1*p,y:y1*p,z:z2};
      };
      // Calibrated outer scale: fine ticks and counter-rotating broken telemetry arcs.
      for(let i=0;i<96;i++){
        const a=i*TAU/96-t*.08,r=i%8===0?175:179;
        line({x:Math.cos(a)*r,y:Math.sin(a)*r},{x:Math.cos(a)*183,y:Math.sin(a)*183},i%8===0?1.2:.65,i%8===0?.55:.24);
      }
      for(let j=0;j<3;j++)arc(170,j*TAU/3+t*.22,j*TAU/3+t*.22+1.47,1.5,.48);
      for(let j=0;j<5;j++)arc(161,j*TAU/5-t*.37,j*TAU/5-t*.37+.3,.85,.38);
      // Five gyroscopic orbits. Segment depth controls opacity and luminous front edges.
      const rings=[{r:126,x:1.07,y:.36,z:t*.32},{r:133,x:-.65,y:1.15,z:-t*.43},{r:146,x:.5,y:.9,z:t*.27},{r:103,x:1.34,y:-.45,z:-t*.52},{r:150,x:.22,y:.25,z:t*.12}];
      for(let k=0;k<rings.length;k++){
        const ring=rings[k],rot=ring.z,xTilt=ring.x+Math.sin(t*.35+k)*.3,yTilt=ring.y+t*(k%2?-.22:.18),cx=Math.cos(xTilt),sx=Math.sin(xTilt),cy=Math.cos(yTilt),sy=Math.sin(yTilt);
        const pts=[];
        for(let i=0;i<=96;i++){
          const a=i*TAU/96+rot,r=ring.r*this.spread*(1+breathe+energy*.075),x=Math.cos(a)*r,y=Math.sin(a)*r;
          pts.push(project(x*cy+y*sx*sy,y*cx,-x*sy+y*sx*cy));
        }
        for(let i=0;i<96;i++){
          const a=pts[i],b=pts[i+1],front=clamp((a.z+155)/310,0,1);
          if((i+k*7)%19>15)continue;
          line(a,b,(k===4?.8:1.2)+front,.16+front*.62);
          if(i%12===0){ctx.fillStyle=ink(.4+front*.5);ctx.beginPath();ctx.arc(a.x,a.y,1.1+front*.8,0,TAU);ctx.fill();}
        }
        const marker=pts[Math.floor((t*17+k*13)%96)];ctx.fillStyle=ink(.96);ctx.beginPath();ctx.arc(marker.x,marker.y,2.7,0,TAU);ctx.fill();
      }
      // Drifting orbital data particles with a restrained constellation backbone.
      const particles=this.particles.map(p=>{
        const a=p.a+t*.22,r=p.r*this.spread*(1+breathe*.5),rr=Math.sqrt(1-p.y*p.y);
        return {...project(Math.cos(a)*rr*r,p.y*r,Math.sin(a)*rr*r),seed:p.seed};
      }).sort((a,b)=>a.z-b.z);
      for(let i=0;i<particles.length;i++){
        const p=particles[i],front=clamp((p.z+165)/330,0,1),flicker=this.reducedMotion?1:.7+.3*Math.sin(t+p.seed);
        if(i%13===0&&i+8<particles.length)line(p,particles[i+8],.6,.1+front*.11);
        ctx.fillStyle=ink((.2+front*.55)*flicker);ctx.beginPath();ctx.arc(p.x,p.y,.6+front*1.35,0,TAU);ctx.fill();
      }
      // Three moving magnetic filaments run through the reactor, visibly alive at idle.
      for(let i=0;i<3;i++){
        ctx.save();ctx.rotate(t*.43+i*TAU/3);ctx.strokeStyle=ink(.3+energy*.25);ctx.lineWidth=.9;
        const bend=this.reducedMotion?18:18+Math.sin(t*.9+i)*17+energy*35;
        ctx.beginPath();ctx.moveTo(-106,0);ctx.bezierCurveTo(-46,-bend,39,bend,106,0);ctx.stroke();ctx.restore();
      }
      const core=28+breathe*80+energy*24;
      const bloom=ctx.createRadialGradient(0,0,2,0,0,core*2.7);bloom.addColorStop(0,'rgba(229,251,255,.9)');bloom.addColorStop(.15,ink(.75));bloom.addColorStop(.42,ink(.16));bloom.addColorStop(1,ink(0));ctx.fillStyle=bloom;ctx.beginPath();ctx.arc(0,0,core*2.7,0,TAU);ctx.fill();
      for(let i=0;i<6;i++)arc(core+7,i*TAU/6-t*.65,i*TAU/6-t*.65+.65,3.2,.67);
      arc(core-2,0,TAU,.8,.62);arc(58+energy*7,t, t+1.8,1.2,.72);arc(64,-t*.7,-t*.7+.8,.8,.4);
      ctx.save();ctx.rotate(-t*.33);ctx.strokeStyle=ink(.72);ctx.lineWidth=1.1;ctx.beginPath();
      for(let i=0;i<=6;i++){const a=i*TAU/6-Math.PI/2;const x=Math.cos(a)*20,y=Math.sin(a)*20;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();ctx.restore();
      ctx.shadowColor=ink(1);ctx.shadowBlur=15+energy*12;ctx.fillStyle='rgba(226,251,255,.95)';ctx.beginPath();ctx.arc(0,0,6+energy*5,0,TAU);ctx.fill();ctx.shadowBlur=0;
      // State signatures, beyond a color change.
      if(['thinking','working'].includes(state)){
        for(let i=0;i<4;i++){arc(91+i*4,t*(i%2?-.7:.9)+i,t*(i%2?-.7:.9)+i+.35,1.3,.8);}
      }
      if(['speaking','listening'].includes(state)){
        for(let i=0;i<40;i++){const a=i*TAU/40,band=this.reducedMotion?0:Math.sin(t*2+i*.65)*4;
          const r=79,end=r+4+energy*(8+Math.sin(i*1.3)**2*23)+band;
          line({x:Math.cos(a)*r,y:Math.sin(a)*r},{x:Math.cos(a)*end,y:Math.sin(a)*end},1.6,.35+energy*.5);
        }
      }
      if(state==='looking'){
        ctx.save();ctx.beginPath();ctx.arc(0,0,106,0,TAU);ctx.clip();const y=this.reducedMotion?0:Math.sin(t)*95;
        const scan=ctx.createLinearGradient(0,y-18,0,y+3);scan.addColorStop(0,ink(0));scan.addColorStop(1,ink(.18));ctx.fillStyle=scan;ctx.fillRect(-110,y-18,220,21);line({x:-108,y},{x:108,y},1.3,.75);ctx.restore();
      }
      if(state==='success'){
        arc(86,0,TAU,1.8,.65);ctx.strokeStyle=ink(.95);ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(78,-79);ctx.lineTo(83,-73);ctx.lineTo(95,-87);ctx.stroke();
      }
      if(state==='alert'||state==='error'){
        const alpha=this.reducedMotion ? .8 : .55+.25*Math.sin(now*.004);arc(188,-.45,.45,2.5,alpha);arc(188,Math.PI-.45,Math.PI+.45,2.5,alpha);
        ctx.strokeStyle=ink(.95);ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(0,-99);ctx.lineTo(10,-81);ctx.lineTo(-10,-81);ctx.closePath();ctx.stroke();ctx.fillStyle=ink(.95);ctx.fillRect(-.8,-93,1.6,6);ctx.fillRect(-.8,-85,1.6,1.6);
      }
      this.pulses=this.pulses.filter(p=>now-p.start<950);
      for(const p of this.pulses){const age=clamp((now-p.start)/950,0,1),r=this.reducedMotion?56:12+age*148;
        ctx.strokeStyle=ink((1-age)*.6);ctx.lineWidth=1.5*(1-age)+.5;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.stroke();}
      ctx.restore();
    }
  }
  const api={ORB_DEFAULTS,normalizeOrbColors,orbState,orbDynamics,OrbRenderer};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.HermesOrb=api;
})(typeof window==='object'?window:globalThis);
