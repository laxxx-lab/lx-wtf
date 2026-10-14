(function(root){
  'use strict';
  const ORB_DEFAULTS=Object.freeze({idle:'#39dcff',listening:'#35e6c5',speaking:'#85dcff',thinking:'#ffc078',working:'#568bff',looking:'#b28aff',success:'#53e696',alert:'#ffc45b',error:'#ff5757',offline:'#657887'});
  const ORB_THEMES=Object.freeze({classic:'Lilith Classic','voice-orb':'Voice Orb','ai-interface':'AI Interface','particle-core':'Particle Core','hud-core':'HUD Core',venom:'Venom'});
  function normalizeOrbTheme(value){return typeof value==='string'&&Object.hasOwn(ORB_THEMES,value)?value:'classic';}
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
      this.theme='classic';this.themeTime=0;
      // Deterministic particles: no per-frame randomness or new animation timers.
      this.particles=Array.from({length:160},(_,i)=>({a:i*2.399963,y:1-2*(i+.5)/160,r:128+(i%9)*4,seed:i*.731}));
    }
    setColors(value){this.colors=normalizeOrbColors(value);}
    setTheme(value){this.theme=normalizeOrbTheme(value);}
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
      if(this.theme==='classic'){
        dynamics.speed={idle:.65,listening:1.15,speaking:1.55,thinking:2.4,working:1.8,looking:.85,success:.8,alert:1.3,error:.8,offline:.45}[state]||.65;
        if(!speaking)dynamics.scale=state==='idle'||state==='offline'?.62:Math.min(1,.87+(listening?this.level*.08:0));
      }
      if(this.reducedMotion&&(speaking||listening)){dynamics.scale=.87;dynamics.spread=1;}
      // Short attack and gentle release follow actual syllables, including quiet gaps.
      const sizeSmooth=this.reducedMotion?1:1-Math.exp(-dt*(speaking?(dynamics.scale>this.size?28:14):4.5));
      this.size+=(dynamics.scale-this.size)*sizeSmooth;this.spread+=(dynamics.spread-this.spread)*sizeSmooth;
      this.speed+=(dynamics.speed-this.speed)*smooth;
      const motion=normalizeOrbIntensity(intensity);
      if(!this.reducedMotion){this.rotation+=dt*this.speed*motion;this.themeTime+=dt*motion;}
      const rest=state==='idle'||state==='offline',energy=rest||this.reducedMotion?0:this.level;
      const compact=(this.canvas.clientWidth||this.canvas.width)<240;
      const drawScale=this.theme==='classic'?this.size:compact?Math.min(1,this.size*1.14):this.size;
      ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.save();ctx.scale(this.canvas.width/400,this.canvas.height/400);ctx.translate(200,200);ctx.scale(drawScale,drawScale);
      if(this.theme==='classic'){
        const classic=typeof module==='object'&&module.exports?require('./orb-classic.js'):root.HermesOrbClassic;
        // Keep real speech pauses and reduced-motion geometry still.
        const breathe=this.reducedMotion||speaking||listening?0:Math.sin(now*.0023)*(rest?.022:.035);
        this.pulses=classic.drawClassicOrb(ctx,{now,state,rotation:this.rotation,color:this.color,tilt:this.tilt,spread:this.spread,energy,breathe,reducedMotion:this.reducedMotion,particles:this.particles,pulses:this.pulses});
      }else{
        const themes=typeof module==='object'&&module.exports?require('./orb-reference-themes.js'):root.HermesOrbReferenceThemes;
        themes.drawReferenceTheme(ctx,this.theme,{time:this.themeTime,angle:this.rotation,state,amplitude:energy,color:this.color,reducedMotion:this.reducedMotion,intensity:motion,compact});
      }
      ctx.restore();
    }
  }
  const api={ORB_DEFAULTS,ORB_THEMES,normalizeOrbTheme,normalizeOrbColors,normalizeOrbIntensity,normalizeOrbMotion,orbReducedMotion,orbCountdown,backgroundOrbState,orbState,orbDynamics,OrbRenderer};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.HermesOrb=api;
})(typeof window==='object'?window:globalThis);
