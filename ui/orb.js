(function(root){
  'use strict';
  const ORB_DEFAULTS=Object.freeze({idle:'#39dcff',listening:'#35e6c5',speaking:'#85dcff',thinking:'#ffc078',working:'#568bff',looking:'#b28aff',success:'#53e696',alert:'#ffc45b',error:'#ff5757',offline:'#657887'});
  function normalizeOrbColors(value){const result={...ORB_DEFAULTS};for(const key of Object.keys(result))if(typeof value?.[key]==='string'&&/^#[0-9a-f]{6}$/i.test(value[key]))result[key]=value[key].toLowerCase();return result;}
  function backgroundOrbState(value){
    const jobs=(value?.jobs||[]).filter(j=>['preparing','running','stopping','outcome-unknown'].includes(j.status));
    if(jobs.some(j=>j.status==='outcome-unknown'))return 'alert';
    if(jobs.some(j=>j.status==='preparing'||j.status==='running'&&j.children?.some(c=>c.status==='running'&&c.phase==='thinking')))return 'thinking';
    return jobs.length?'working':null;
  }
  function orbCountdown(value,now=Date.now()){
    if(value?.hidden||!Array.isArray(value?.items))return null;
    const item=value.items.filter(i=>i&&typeof i.id==='string'&&['reminder','alarm','shutdown','restart'].includes(i.kind)&&Number.isFinite(i.dueAt)&&Number.isFinite(i.startedAt)).sort((a,b)=>a.dueAt-b.dueAt)[0];if(!item)return null;
    const seconds=Math.max(0,Math.ceil((item.dueAt-now)/1000)),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),ss=String(seconds%60).padStart(2,'0');
    return {id:item.id,text:h?h+':'+String(m).padStart(2,'0')+':'+ss:String(m).padStart(2,'0')+':'+ss,label:{alarm:'TIMER',reminder:'ERINNERUNG',shutdown:'HERUNTERFAHREN',restart:'NEUSTART'}[item.kind],progress:Math.max(0,Math.min(1,(now-item.startedAt)/Math.max(1000,item.dueAt-item.startedAt)))};
  }
  function normalizeOrbIntensity(value){return Number.isFinite(value)?Math.max(.4,Math.min(2.4,value)):1;}
  function normalizeOrbMotion(value){return ['system','animate','reduce'].includes(value)?value:'system';}
  function orbReducedMotion(value,systemReduced=false){const mode=normalizeOrbMotion(value);return mode==='reduce'||mode==='system'&&systemReduced;}
  function orbState({phase='ready',speaking=false,capturing=false,looking=false,background=null,now=0,successUntil=0,alertUntil=0}={}){
    if(phase==='offline')return 'offline';if(phase==='error')return 'error';
    if(['approval','question'].includes(phase)||alertUntil>now)return 'alert';
    if(looking)return 'looking';
    if(successUntil>now&&!backgroundOrbState(background)&&['ready','listening'].includes(phase))return 'success';
    if(speaking)return 'speaking';if(capturing)return 'listening';
    if(['connecting','transcribing'].includes(phase))return 'thinking';
    if(['ready','listening'].includes(phase)&&backgroundOrbState(background))return backgroundOrbState(background);
    return Object.hasOwn(ORB_DEFAULTS,phase)?phase:'idle';
  }
  const TAU=Math.PI*2,clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  function orbDynamics(state,amplitude=0){
    const energy=clamp(Number.isFinite(amplitude)?amplitude:0,0,1),rest=state==='idle'||state==='offline';
    const speed={idle:.9,listening:1.35,speaking:1.9,thinking:3.4,working:2.5,looking:1.2,success:.8,alert:1.3,error:.8,offline:.45}[state]||.65;
    if(state==='speaking')return {scale:.76+energy*.24,spread:.78+energy*.22,speed};
    return {scale:rest?.62:Math.min(1,(state==='thinking'?.95:state==='working'?.92:.87)+(state==='listening'?energy*.08:0)),spread:rest?.7:1,speed};
  }
  const rgb=hex=>[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16));
  class OrbRenderer{
    constructor(canvas,{reducedMotion=false}={}){
      this.canvas=canvas;this.ctx=canvas.getContext('2d');this.reducedMotion=reducedMotion;
      this.colors=normalizeOrbColors();this.color=rgb(this.colors.idle);this.rotation=0;this.speed=.65;this.lastTime=null;this.level=0;this.size=.62;this.spread=.7;this.state='idle';this.stateTime=0;this.groupRotation=0;this.groupSpeed=0;
      this.pointer={x:0,y:0};this.tilt={x:0,y:0};this.pulses=[];
      // Deterministic particles: no per-frame randomness or new animation timers.
      this.particles=Array.from({length:160},(_,i)=>({a:i*2.399963,y:1-2*(i+.5)/160,r:128+(i%9)*4,seed:i*.731}));
      // Fibonacci sphere from the supplied Particle Core. Deterministic seeds
      // retain its texture while avoiding random rebuilds on every frame.
      this.coreParticles=Array.from({length:1700},(_,i)=>{const y=1-i/1699*2,r=Math.sqrt(1-y*y),a=i*2.39996,seed=Math.sin(i*12.9898+4)*43758.5453;return {x:Math.cos(a)*r,y,z:Math.sin(a)*r,seed:seed-Math.floor(seed)};});
      this.coreAngle=0;this.coreTime=0;this.coreSpin=.12;this.coreWeights={listen:0,think:0,speak:0};
    }
    setColors(value){this.colors=normalizeOrbColors(value);}
    setPointer(x,y){this.pointer={x:clamp(x,-1,1),y:clamp(y,-1,1)};}
    pulse(x=0,y=0,now=performance.now()){this.pulses.push({x:x*110,y:y*110,start:now});if(this.pulses.length>6)this.pulses.shift();}
    draw(now,{state='idle',amplitude=0,intensity=1}={}){
      const ctx=this.ctx;if(!ctx)return;
      const dt=this.lastTime===null?0:clamp((now-this.lastTime)/1000,0,.05);this.lastTime=now;
      const speaking=state==='speaking',listening=state==='listening',thinking=state==='thinking',working=state==='working',smooth=1-Math.exp(-dt*9),target=rgb(this.colors[state]||this.colors.idle);
      if(state!==this.state){this.state=state;this.stateTime=0;}else if(!this.reducedMotion)this.stateTime+=dt;
      const measured=clamp(Number.isFinite(amplitude)?amplitude:0,0,1),levelSmooth=speaking?1-Math.exp(-dt*(measured>this.level?32:12)):smooth;
      this.color=this.color.map((n,i)=>n+(target[i]-n)*smooth);this.level+=(measured-this.level)*levelSmooth;
      this.tilt.x+=(this.pointer.x-this.tilt.x)*smooth;this.tilt.y+=(this.pointer.y-this.tilt.y)*smooth;
      const dynamics=orbDynamics(state,this.level);
      if(this.reducedMotion&&(speaking||listening)){dynamics.scale=.87;dynamics.spread=1;}
      // Short attack and gentle release follow actual syllables, including quiet gaps.
      const sizeSmooth=this.reducedMotion?1:1-Math.exp(-dt*(speaking?(dynamics.scale>this.size?28:14):4.5));
      this.size+=(dynamics.scale-this.size)*sizeSmooth;this.spread+=(dynamics.spread-this.spread)*sizeSmooth;
      this.speed+=(dynamics.speed-this.speed)*smooth;
      const motion=normalizeOrbIntensity(intensity);
      if(!this.reducedMotion)this.rotation+=dt*this.speed*motion;
      const t=this.rotation,rest=state==='idle'||state==='offline',breathe=this.reducedMotion||speaking||listening?0:Math.sin(now*(rest?.0016:.0038))*(rest?.07:thinking?.025:.045)*motion,energy=rest||this.reducedMotion&&(speaking||listening)?0:this.level,excitation=this.reducedMotion?0:['thinking','working'].includes(state)?(.5+.5*Math.sin(t*2.8))*motion:0;
      const color=this.color.map(Math.round).join(','),ink=(alpha=1)=>`rgba(${color},${clamp(alpha*(state==='idle'?1.25:1),0,1)})`;
      const compact=(this.canvas.clientWidth||this.canvas.width)<240,drawScale=compact?Math.min(1,this.size*1.14):this.size;
      ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.save();ctx.scale(this.canvas.width/400,this.canvas.height/400);ctx.translate(200,200);ctx.scale(drawScale,drawScale);
      // The compact sleeping reactor has a visibly turning silhouette, not just
      // subpixel movement inside its rings. Keep all motion on the existing clock.
      this.groupSpeed+=((rest?(state==='idle'?.28:.14):0)-this.groupSpeed)*smooth;
      if(!this.reducedMotion)this.groupRotation+=dt*this.speed*motion*this.groupSpeed;
      ctx.rotate(this.groupRotation);
      // Adjacent shades retain each active status color throughout the reactor.
      // Lightness gives the rolling gradient depth without crossing other states.
      let spectrum=null,hue=0;
      if(thinking||working||listening){
        const [r,g,b]=target,max=Math.max(r,g,b),delta=max-Math.min(r,g,b);
        hue=delta?((max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta)*60+360)%360:210;
        const angle=t*(thinking?.7:working?.28:.12),x=Math.cos(angle)*155,y=Math.sin(angle)*155;
        spectrum=ctx.createLinearGradient(-x,-y,x,y);
        const light=(max+Math.min(r,g,b))/510*100,low=thinking?58:clamp(light-14,40,76),high=thinking?74:clamp(light+13,68,89);
        spectrum.addColorStop(0,ink(.95));spectrum.addColorStop(.22,`hsla(${hue-(listening?0:18)},88%,${low}%,.95)`);
        spectrum.addColorStop(.52,`hsla(${hue+18},92%,${high}%,.95)`);spectrum.addColorStop(.8,`hsla(${hue+7},90%,${thinking?64:light}%,.95)`);spectrum.addColorStop(1,ink(.95));
      }
      // Transparent atmospheric corona, leaving the desktop visible behind it.
      const corona=ctx.createRadialGradient(0,0,12,0,0,193);
      corona.addColorStop(0,ink(.17+this.level*.12));corona.addColorStop(.45,ink(.055+this.level*.05));corona.addColorStop(1,ink(0));ctx.fillStyle=corona;ctx.fillRect(-200,-200,400,400);
      // A circular dark veil makes fine light edges legible on bright wallpaper.
      // Only the reactor silhouette is shaded; the window corners stay transparent.
      const veil=ctx.createRadialGradient(0,0,25,0,0,176);
      veil.addColorStop(0,'rgba(4,10,17,.8)');veil.addColorStop(.65,'rgba(4,10,17,.72)');veil.addColorStop(.9,'rgba(4,10,17,.56)');veil.addColorStop(1,'rgba(4,10,17,0)');ctx.fillStyle=veil;ctx.beginPath();ctx.arc(0,0,176,0,TAU);ctx.fill();
      const arc=(radius,start,end,width=1,alpha=.6)=>{ctx.strokeStyle=spectrum||ink(alpha);ctx.globalAlpha=spectrum?clamp(alpha,0,1):1;ctx.lineWidth=width*(compact?1.4:1);ctx.beginPath();ctx.arc(0,0,radius,start,end);ctx.stroke();ctx.globalAlpha=1;};
      const line=(a,b,width,alpha)=>{ctx.strokeStyle=spectrum||ink(alpha);ctx.globalAlpha=spectrum?clamp(alpha,0,1):1;ctx.lineWidth=width*(compact?1.4:1);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.globalAlpha=1;};
      const project=(x,y,z)=>{
        const rx=.18+this.tilt.y*.18,ry=this.tilt.x*.2;
        const y1=y*Math.cos(rx)-z*Math.sin(rx),z1=y*Math.sin(rx)+z*Math.cos(rx);
        const x1=x*Math.cos(ry)+z1*Math.sin(ry),z2=-x*Math.sin(ry)+z1*Math.cos(ry),p=1/(1-z2/620);
        return {x:x1*p,y:y1*p,z:z2};
      };
      if(compact)arc(166,0,TAU,2.4,.78);
      // Calibrated outer scale: fine ticks and counter-rotating broken telemetry arcs.
      for(let i=0;i<96;i++){
        const a=i*TAU/96-t*.08,r=i%8===0?175:179;
        line({x:Math.cos(a)*r,y:Math.sin(a)*r},{x:Math.cos(a)*183,y:Math.sin(a)*183},i%8===0?1.2:.65,i%8===0?.55:.24);
      }
      for(let j=0;j<3;j++)arc(170,j*TAU/3+t*.22,j*TAU/3+t*.22+1.47,1.5,.48);
      for(let j=0;j<5;j++)arc(161,j*TAU/5-t*.37,j*TAU/5-t*.37+.3,.85,.38);
      if(rest){
        const a=t*.55;for(let i=0;i<12;i++)arc(144,a-i*.055,a-i*.055+.04,2.4,(1-i/12)*.85);
        ctx.fillStyle=ink(.95);ctx.beginPath();ctx.arc(Math.cos(a)*144,Math.sin(a)*144,4,0,TAU);ctx.fill();
        const pulse=this.reducedMotion?.5:(this.stateTime/4)%1;
        arc(63+pulse*39,0,TAU,1.3,(1-pulse)*.32);
      }
      // Counter-rotating plasma ribbons energize thinking without more particles.
      if(thinking)for(let k=0;k<2;k++){
        ctx.save();ctx.rotate(t*(k?-.85:1.15)+k*1.8);ctx.strokeStyle=spectrum;ctx.lineWidth=2.6;ctx.globalAlpha=.72;
        ctx.shadowColor=`hsla(${hue+(k?14:-12)},90%,65%,.7)`;ctx.shadowBlur=10;ctx.beginPath();
        for(let i=0;i<=72;i++){
          const a=i*TAU/72,r=111+k*19+Math.sin(a*3-t*1.6+k)*7*(this.reducedMotion?1:motion),x=Math.cos(a)*r,y=Math.sin(a)*r*.66;
          i?ctx.lineTo(x,y):ctx.moveTo(x,y);
        }
        ctx.stroke();ctx.restore();
      }
      // Five gyroscopic orbits. Segment depth controls opacity and luminous front edges.
      const rings=[{r:126,x:1.07,y:.36,z:t*.32},{r:133,x:-.65,y:1.15,z:-t*.43},{r:146,x:.5,y:.9,z:t*.27},{r:103,x:1.34,y:-.45,z:-t*.52},{r:150,x:.22,y:.25,z:t*.12}];
      for(let k=0;k<rings.length;k++){
        const ring=rings[k],rot=ring.z,xTilt=ring.x+Math.sin(t*.5+k)*.42*motion,yTilt=ring.y+t*(k%2?-.22:.18),cx=Math.cos(xTilt),sx=Math.sin(xTilt),cy=Math.cos(yTilt),sy=Math.sin(yTilt);
        const pts=[];
        for(let i=0;i<=96;i++){
          const a=i*TAU/96+rot,r=ring.r*this.spread*(1+breathe+energy*.075),x=Math.cos(a)*r,y=Math.sin(a)*r;
          pts.push(project(x*cy+y*sx*sy,y*cx,-x*sy+y*sx*cy));
        }
        for(let i=0;i<96;i++){
          const a=pts[i],b=pts[i+1],front=clamp((a.z+155)/310,0,1);
          if((i+k*7)%19>15)continue;
          line(a,b,(k===4?.8:1.2)+front,(.16+front*.62)*(listening?.65:1));
          if(i%12===0){ctx.fillStyle=spectrum||ink(.4+front*.5);ctx.beginPath();ctx.arc(a.x,a.y,1.1+front*.8,0,TAU);ctx.fill();}
        }
        const marker=pts[Math.floor((t*17+k*13)%96)];ctx.fillStyle=spectrum||ink(.96);ctx.beginPath();ctx.arc(marker.x,marker.y,2.7,0,TAU);ctx.fill();
      }
      // Drifting orbital data particles with a restrained constellation backbone.
      const particles=this.particles.map(p=>{
        const a=p.a+t*.22,r=p.r*this.spread*(1+breathe*.5),rr=Math.sqrt(1-p.y*p.y);
        return {...project(Math.cos(a)*rr*r,p.y*r,Math.sin(a)*rr*r),seed:p.seed};
      }).sort((a,b)=>a.z-b.z);
      for(let i=0;i<particles.length;i++){
        const p=particles[i],front=clamp((p.z+165)/330,0,1),flicker=this.reducedMotion?1:.7+.3*Math.sin(t+p.seed);
        if(i%13===0&&i+8<particles.length)line(p,particles[i+8],.6,.1+front*.11);
        ctx.fillStyle=spectrum||ink((.2+front*.55)*flicker);ctx.globalAlpha=spectrum?(.2+front*.55)*flicker:1;ctx.beginPath();ctx.arc(p.x,p.y,.6+front*1.35,0,TAU);ctx.fill();ctx.globalAlpha=1;
      }
      const core=28+breathe*95+energy*(speaking?34:24)+excitation*9;
      const bloom=ctx.createRadialGradient(0,0,2,0,0,core*2.7);bloom.addColorStop(0,ink(.06+energy*.12));bloom.addColorStop(.42,ink(.04));bloom.addColorStop(1,ink(0));ctx.fillStyle=bloom;ctx.beginPath();ctx.arc(0,0,core*2.7,0,TAU);ctx.fill();
      // Use the actual reference sphere, not a filled approximation. Only its
      // demo clock, theme buttons and synthetic/microphone input are replaced by
      // our existing clock, status palette and measured microphone/playback level.
      const [cr,cg,cb]=this.color.map(Math.round),maximum=Math.max(cr,cg,cb),minimum=Math.min(cr,cg,cb),delta=maximum-minimum;
      const bodyHue=delta?((maximum===cr?(cg-cb)/delta:maximum===cg?2+(cb-cr)/delta:4+(cr-cg)/delta)*60+360)%360:0;
      const saturation=delta?clamp(delta/maximum*100,0,100):0,w=this.coreWeights;
      for(const [key,active]of [['listen',listening],['think',thinking||working],['speak',speaking]]){w[key]+=(Number(active)-w[key])*smooth;if(Math.abs(Number(active)-w[key])<1e-6)w[key]=Number(active);}
      const coreSpeed={idle:.12,offline:.06,listening:.25,thinking:1.1,working:.8,speaking:.4,looking:.3,success:.18,alert:.22,error:.16}[state]||.12;
      this.coreSpin+=(coreSpeed-this.coreSpin)*smooth;
      if(!this.reducedMotion){this.coreAngle+=dt*this.coreSpin*motion;this.coreTime+=dt*motion;}
      const ct=Math.cos(.35),st=Math.sin(.35),ca=Math.cos(this.coreAngle),sa=Math.sin(this.coreAngle),time=this.coreTime;
      const radius=28*(1+energy*.07)*(1-w.think*.1+w.listen*.05),sweep=Math.sin(time*1.6);
      const particleInk=(light,alpha)=>`hsla(${bodyHue},${saturation}%,${light}%,${alpha})`;
      const aura=ctx.createRadialGradient(0,0,radius*.2,0,0,radius*2);
      aura.addColorStop(0,particleInk(60,.12+energy*.12));aura.addColorStop(.45,particleInk(50,.035));aura.addColorStop(1,ink(0));ctx.fillStyle=aura;ctx.beginPath();ctx.arc(0,0,radius*2,0,TAU);ctx.fill();
      // Source-over keeps custom hues intact over the existing luminous rings;
      // additive blending on those rings can clip RGB channels into another hue.
      ctx.save();
      for(const p of this.coreParticles){
        const sd=p.seed,x1=p.x*ca+p.z*sa,z1=-p.x*sa+p.z*ca,y2=p.y*ct-z1*st,z2=p.y*st+z1*ct,d=(z2+1)/2;
        const lobe=Math.sin(p.y*3.2+time*1.9)*Math.sin(Math.atan2(p.z,p.x)*2-time*1.4)+.4*Math.sin(p.y*7-time*3+sd);
        const ring=w.listen*Math.max(0,lobe)*(.2+energy*1.1),q=(p.y-sweep)*4,boost=ring+Math.exp(-q*q)*w.think;
        const disp=1+.03*Math.sin(sd*20+time*2)+w.listen*(.04+energy*.28)*lobe+w.speak*energy*.5*Math.max(0,Math.sin(sd*40+time*8))+w.think*.05*Math.sin(sd*70+time*10);
        const rr=radius*disp,s=(.7+d*1.9+boost*1.5+(disp-1)*3)*28/86;
        ctx.fillStyle=particleInk(Math.min(92,52+d*28+boost*40),Math.min(1,.1+d*.8+boost*.6));
        ctx.fillRect(x1*rr-s/2,y2*rr-s/2,s,s);
      }
      ctx.restore();
      // State signatures, beyond a color change.
      if(['thinking','working'].includes(state)){
        for(let i=0;i<6;i++){const a=t*(i%2?-.8:1.1)+i;arc(89+i*4+excitation*3,a,a+.45,1.5,.65+excitation*.12);}
      }
      if(state==='working')for(let i=0;i<12;i++){
        const a=i*TAU/12-t*.35,lit=this.reducedMotion?.7:.3+.7*(.5+.5*Math.cos(t*2-i*.52));
        arc(122,a,a+.18,2.6,lit*.8);
      }
      if(working)for(let k=0;k<3;k++){
        // Travelling light packets visualize activity, never percent completion.
        const a=t*(k===1?-.85:1.1)+k*TAU/3,point=angle=>project(Math.cos(angle)*141,Math.sin(angle)*90,Math.sin(angle)*38);
        for(let i=0;i<12;i++)line(point(a-i*.045),point(a-(i+1)*.045),2.4,(1-i/12)*.8);
        const head=point(a);ctx.shadowColor=ink(.9);ctx.shadowBlur=9;ctx.fillStyle=`hsla(${hue},90%,89%,.98)`;ctx.beginPath();ctx.arc(head.x,head.y,3.7,0,TAU);ctx.fill();ctx.shadowBlur=0;
      }
      if(['speaking','listening'].includes(state)){
        const bands=listening?24:40;
        for(let i=0;i<bands;i++){const a=i*TAU/bands;
          const r=listening?72:79,end=r+4+energy*(8+Math.sin(i*1.3)**2*23);
          line({x:Math.cos(a)*r,y:Math.sin(a)*r},{x:Math.cos(a)*end,y:Math.sin(a)*end},1.6,.35+energy*.5);
        }
        if(listening){
          const aperture=108+energy*13,widen=this.reducedMotion?0:Math.sin(t*.8)*.1;
          arc(aperture,-.68-widen,.68+widen,3.1,.9);arc(aperture,Math.PI-.68-widen,Math.PI+.68+widen,3.1,.9);
          for(let i=0;i<3;i++){const a=t*.3+i*TAU/3;arc(94+energy*8,a,a+.35,1.2,.48+energy*.35);}
          // A stylized microphone envelope. Silence stays flat; all wave height
          // comes from measured energy, without synthesizing speech peaks.
          for(let band=0;band<3;band++){
            ctx.strokeStyle=spectrum;ctx.globalAlpha=.75-band*.19;ctx.lineWidth=band===0?2.1:1;ctx.shadowColor=ink(.75);ctx.shadowBlur=band===0?8:0;ctx.beginPath();
            for(let i=0;i<=64;i++){const u=i/64,x=(u-.5)*176,y=Math.sin(u*TAU*2-t*2.1+band*.45)*Math.sin(u*Math.PI)*(energy*(21-band*5));i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
            ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;
          }
          for(const side of [-1,1]){const x=side*(86-energy*12);ctx.fillStyle=`hsla(${hue},95%,88%,.9)`;ctx.beginPath();ctx.arc(x,0,2.5+energy*1.5,0,TAU);ctx.fill();}
        }else{
          arc(69+energy*23,-.75,.75,2,.25+energy*.55);arc(69+energy*23,Math.PI-.75,Math.PI+.75,2,.25+energy*.55);
        }
      }
      if(state==='looking'){
        ctx.save();ctx.beginPath();ctx.arc(0,0,106,0,TAU);ctx.clip();const y=this.reducedMotion?0:Math.sin(t)*95;
        const scan=ctx.createLinearGradient(0,y-18,0,y+3);scan.addColorStop(0,ink(0));scan.addColorStop(1,ink(.18));ctx.fillStyle=scan;ctx.fillRect(-110,y-18,220,21);line({x:-108,y},{x:108,y},1.3,.75);ctx.restore();
        for(const [x,y]of [[-79,-79],[79,-79],[79,79],[-79,79]]){line({x:x-Math.sign(x)*13,y},{x,y},1.8,.75);line({x,y},{x,y:y-Math.sign(y)*13},1.8,.75);}
      }
      if(state==='success'){
        const release=this.reducedMotion?.5:Math.min(1,this.stateTime/1.8);arc(74+release*67,0,TAU,2.2,(1-release)*.65);
        arc(86,0,TAU,1.8,.65);ctx.strokeStyle=ink(.95);ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(78,-79);ctx.lineTo(83,-73);ctx.lineTo(95,-87);ctx.stroke();
      }
      if(state==='alert'||state==='error'){
        const alpha=this.reducedMotion ? .8 : .65+.15*Math.sin(t*1.4),opening=state==='error'?.32:.55;arc(188,-opening,opening,2.5,alpha);arc(188,Math.PI-opening,Math.PI+opening,2.5,alpha);
        if(state==='error'){arc(180,-opening,opening,1.2,alpha*.7);arc(180,Math.PI-opening,Math.PI+opening,1.2,alpha*.7);}
        ctx.strokeStyle=ink(.95);ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(0,-99);ctx.lineTo(10,-81);ctx.lineTo(-10,-81);ctx.closePath();ctx.stroke();ctx.fillStyle=ink(.95);ctx.fillRect(-.8,-93,1.6,6);ctx.fillRect(-.8,-85,1.6,1.6);
      }
      this.pulses=this.pulses.filter(p=>now-p.start<950);
      for(const p of this.pulses){const age=clamp((now-p.start)/950,0,1),r=this.reducedMotion?56:12+age*148;
        ctx.strokeStyle=ink((1-age)*.6);ctx.lineWidth=1.5*(1-age)+.5;ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.stroke();}
      ctx.restore();
    }
  }
  const api={ORB_DEFAULTS,normalizeOrbColors,normalizeOrbIntensity,normalizeOrbMotion,orbReducedMotion,orbCountdown,backgroundOrbState,orbState,orbDynamics,OrbRenderer};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.HermesOrb=api;
})(typeof window==='object'?window:globalThis);
