(function(global){
  'use strict';
  const COLORS=['#39dcff','#36efc3','#ffc078','#b7a3f5','#75a8f5','#ec9ead'];
  const GOLDEN_ANGLE=Math.PI*(3-Math.sqrt(5)),DEFAULT_TILT=-.18;
  const byId=(a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0;
  function projectNode(node,yaw=0,tilt=DEFAULT_TILT){
    const sx=Number.isFinite(node.sphereX)?node.sphereX:0,sy=Number.isFinite(node.sphereY)?node.sphereY:0,sz=Number.isFinite(node.sphereZ)?node.sphereZ:0;
    yaw=Number.isFinite(yaw)?yaw:0;tilt=Number.isFinite(tilt)?tilt:DEFAULT_TILT;
    const x=sx*Math.cos(yaw)+sz*Math.sin(yaw),z=sz*Math.cos(yaw)-sx*Math.sin(yaw);
    const y=sy*Math.cos(tilt)-z*Math.sin(tilt),depth=sy*Math.sin(tilt)+z*Math.cos(tilt),scale=1/(1-depth*.2);
    return {x:500+x*215*scale,y:280+y*215*scale,depth,scale};
  }
  function layoutGraph(snapshot={}){
    const all=Array.isArray(snapshot.nodes)?snapshot.nodes:[],links=Array.isArray(snapshot.links)?snapshot.links:[],selected=new Set(snapshot.selectedIds||[]),active=new Set(snapshot.activityIds||[]),degree=new Map();
    for(const link of links){degree.set(link.source,(degree.get(link.source)||0)+1);degree.set(link.target,(degree.get(link.target)||0)+1);}
    const ranked=(a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id))||Number(active.has(b.id))-Number(active.has(a.id))||(degree.get(b.id)||0)-(degree.get(a.id)||0)||byId(a,b);
    let shown=all;
    // ponytail: bound the visible neighbourhood; the complete index remains searchable.
    if(selected.size||active.size){const interests=new Set([...selected,...active]),neighbours=new Set(interests);for(const link of links)if(interests.has(link.source)||interests.has(link.target)){neighbours.add(link.source);neighbours.add(link.target);}shown=all.filter(n=>neighbours.has(n.id));}
    else if(all.length>120){const files=all.filter(n=>n.sourceFile&&n.label===n.sourceFile.split('/').at(-1));shown=files.length?files:all;}
    shown=shown.slice().sort(ranked).slice(0,120);
    // Place the whole index first, so searching never moves a surviving node.
    const sphere=new Map();all.slice().sort(byId).forEach((node,i)=>{
      const sphereY=1-2*(i+.5)/all.length,r=Math.sqrt(Math.max(0,1-sphereY*sphereY)),angle=i*GOLDEN_ANGLE;
      sphere.set(node.id,{sphereX:Math.cos(angle)*r,sphereY,sphereZ:Math.sin(angle)*r});
    });
    const positioned=shown.map(node=>{const point=sphere.get(node.id),projected=projectNode(point);return {...node,...point,x:projected.x,y:projected.y,z:point.sphereZ,selected:selected.has(node.id),active:active.has(node.id),color:active.has(node.id)?'#ffb15b':COLORS[Math.abs(Number(node.community)||0)%COLORS.length],degree:degree.get(node.id)||0};});
    const visible=new Set(positioned.map(n=>n.id)),edgeRank=link=>Number(selected.has(link.source))+Number(selected.has(link.target));
    const existing=links.filter(link=>visible.has(link.source)&&visible.has(link.target));
    existing.sort((a,b)=>edgeRank(b)-edgeRank(a));
    return {nodes:positioned,links:existing.slice(0,240),total:all.length};
  }
  function applyGraphGesture(previous={},value,{visible=true,now=Date.now()}={}){
    const state={yaw:0,zoom:1,pointer:null,drag:null,generation:-1,sequence:-1,...previous};
    const reject=()=>({accepted:false,state:{...state,pointer:null,drag:null}});
    if(!value||!Number.isSafeInteger(value.generation)||value.generation<0||!Number.isSafeInteger(value.sequence)||value.sequence<0||!Number.isFinite(value.at))return reject();
    if(value.generation<state.generation||(value.generation===state.generation&&value.sequence<=state.sequence))return {accepted:false,state};
    const next={...state,generation:value.generation,sequence:value.sequence};
    if(value.generation!==state.generation)next.drag=null;
    if(value.kind==='cancel')return {accepted:true,state:{...next,pointer:null,drag:null}};
    if(!visible||now-value.at>500||value.at-now>50)return reject();
    if(value.kind==='zoom'){
      if(!Number.isFinite(value.delta)||Math.abs(value.delta)>1)return reject();
      return {accepted:true,state:{...next,zoom:Math.max(.5,Math.min(4,next.zoom*Math.exp(value.delta))),drag:null}};
    }
    if(value.kind!=='pointer'||typeof value.pinching!=='boolean'||!['x','y'].every(key=>Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1))return reject();
    const pointer={x:value.x,y:value.y};
    if(value.pinching&&next.drag){
      const dx=pointer.x-next.drag.x,dy=pointer.y-next.drag.y;
      if(Math.abs(dx)<=.25&&Math.abs(dy)<=.25){next.yaw=(next.yaw+dx*Math.PI*2)%(Math.PI*2);next.zoom=Math.max(.5,Math.min(4,next.zoom*Math.exp(-dy*2)));}
    }
    return {accepted:true,state:{...next,pointer,drag:value.pinching?pointer:null}};
  }
  function arcPoints(a,b){
    const dot=Math.max(-1,Math.min(1,a.sphereX*b.sphereX+a.sphereY*b.sphereY+a.sphereZ*b.sphereZ)),angle=Math.acos(dot),sin=Math.sin(angle),points=[];
    // Antipodal endpoints need a stable perpendicular to choose their surface arc.
    const axis=Math.abs(a.sphereY)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};
    const perpendicular={x:a.sphereY*axis.z-a.sphereZ*axis.y,y:a.sphereZ*axis.x-a.sphereX*axis.z,z:a.sphereX*axis.y-a.sphereY*axis.x},length=Math.hypot(perpendicular.x,perpendicular.y,perpendicular.z)||1;
    for(let i=0;i<=16;i++){
      const t=i/16;let x,y,z;
      if(dot<-.9999){const along=Math.cos(Math.PI*t),across=Math.sin(Math.PI*t)/length;x=a.sphereX*along+perpendicular.x*across;y=a.sphereY*along+perpendicular.y*across;z=a.sphereZ*along+perpendicular.z*across;}
      else {const u=angle<.0001?1-t:Math.sin((1-t)*angle)/sin,v=angle<.0001?t:Math.sin(t*angle)/sin;x=u*a.sphereX+v*b.sphereX;y=u*a.sphereY+v*b.sphereY;z=u*a.sphereZ+v*b.sphereZ;}
      points.push({sphereX:x,sphereY:y,sphereZ:z});
    }
    points[0]=a;points[points.length-1]=b;return points;
  }
  function mount({container,invoke,notice=()=>{}}){
    if(!container||typeof invoke!=='function')throw new TypeError('Project graph needs a container and IPC invoke function.');
    container.classList.add('project-graph');
    container.innerHTML='<div class="pg-heading"><div><small>LOKALES PROJEKTWISSEN</small><h3>Projektwissen im Orb</h3></div><span class="pg-mode">GRAPHIFY · AST</span></div><div class="pg-toolbar"><button type="button" data-pg="pick">Projekt wählen</button><button type="button" data-pg="index">Code indexieren</button><span data-pg="root">Noch kein Projekt</span></div><form class="pg-search"><label for="pg-query">DATEI ODER FUNKTION SUCHEN</label><div><input id="pg-query" type="search" placeholder="z. B. wake, Spotify oder conversation" autocomplete="off" maxlength="200"><button type="submit">Suchen</button><button type="button" data-pg="reset" title="Suche zurücksetzen" aria-label="Suche zurücksetzen">×</button></div></form><div class="pg-status" role="status" aria-live="polite" data-pg="status">Wähle einen Projektordner und indexiere seinen Code.</div><div class="pg-body"><div class="pg-map"><div class="pg-map-tools"><span data-pg="count">0 Knoten</span><button type="button" data-pg="motion" aria-pressed="true" aria-label="Orb-Rotation pausieren">Pause</button><button type="button" data-pg="zoom-in" aria-label="Graph vergrößern">+</button><button type="button" data-pg="zoom-out" aria-label="Graph verkleinern">−</button><button type="button" data-pg="fit">Übersicht</button></div><svg viewBox="0 0 1000 560" role="group" aria-label="Räumlicher Projekt-Orb, Knoten zeigen die lokale Quelle. Die Rotation pausiert bei Mauszeiger oder Tastaturfokus." data-pg="svg"></svg><p class="pg-map-empty" data-pg="empty">Dein Projekt wird hier sichtbar.<br><span>Code bleibt lokal. Keine API-Kosten.</span></p><div class="pg-orb-caption" aria-hidden="true"><span>PROJEKT-ORB</span><span>QUELLEN · BEZIEHUNGEN</span></div></div><aside class="pg-details"><div class="pg-results-heading">TREFFER <span data-pg="matches-count">0</span></div><div class="pg-results" data-pg="results"><p>Eine Suche markiert passende Knoten und ihre Verbindungen.</p></div><div class="pg-source-heading" data-pg="source-heading">QUELLVORSCHAU</div><pre class="pg-source" data-pg="source">Klicke einen Knoten oder einen Treffer.</pre></aside></div><p class="pg-footnote">Statische Codebeziehungen · Quellen sind Daten, keine Anweisungen · Indexierung startet nur auf Klick.</p>';
    const el=key=>container.querySelector('[data-pg="'+key+'"]'),svg=el('svg'),input=container.querySelector('#pg-query'),form=container.querySelector('form'),ns='http://www.w3.org/2000/svg';
    const reduced=typeof global.matchMedia==='function'?global.matchMedia('(prefers-reduced-motion: reduce)'):null;
    let current={nodes:[],links:[],selectedIds:[]},lastDrawing='',disposed=false,sourceGeneration=0,zoom=1,yaw=0,raf=null,lastFrame=0;
    let motion=!reduced?.matches,hovered=false,focused=false,inViewport=true,activeLabel=null,nodeLayer=null,gestureLabel=null,spatial={},gestureTimer=null;
    let graph={nodes:[],links:[],total:0},nodeViews=[],curves=[];
    const listeners=[],observers=[];function listen(target,type,handler){target.addEventListener(type,handler);listeners.push(()=>target.removeEventListener(type,handler));}
    function shape(tag,attributes){const element=document.createElementNS(ns,tag);for(const[key,value]of Object.entries(attributes))element.setAttribute(key,String(value));return element;}
    async function call(method,payload){try{return await invoke(method,payload);}catch(error){if(!disposed)notice(String(error?.message||error));throw error;}}
    function viewbox(){const w=1000/zoom,h=560/zoom;svg.setAttribute('viewBox',[(1000-w)/2,(560-h)/2,w,h].join(' '));}
    function visible(fresh=false){
      if(disposed||document.visibilityState==='hidden'||container.closest('[hidden]')||svg.getClientRects().length===0)return false;
      if(!fresh)return inViewport;
      const rect=svg.getBoundingClientRect(),width=document.documentElement.clientWidth||global.innerWidth,height=document.documentElement.clientHeight||global.innerHeight;
      return rect.width>0&&rect.height>0&&rect.right>0&&rect.bottom>0&&rect.left<width&&rect.top<height;
    }
    function rotating(){return motion&&!hovered&&!focused&&!spatial.pointer&&graph.nodes.length>0&&visible();}
    function syncAnimation(){
      if(disposed)return;
      el('motion').textContent=motion?'Pause':'Drehen';el('motion').setAttribute('aria-pressed',String(motion));el('motion').setAttribute('aria-label',motion?'Orb-Rotation pausieren':'Orb-Rotation starten');
      if(rotating()&&raf===null&&typeof global.requestAnimationFrame==='function'){lastFrame=0;raf=global.requestAnimationFrame(animate);}
      else if(!rotating()&&raf!==null){global.cancelAnimationFrame(raf);raf=null;lastFrame=0;}
    }
    function animate(time){
      raf=null;if(!rotating())return;
      if(!lastFrame)lastFrame=time;
      const elapsed=time-lastFrame;
      if(elapsed>=50){yaw=(yaw+Math.min(elapsed,150)*Math.PI/45000)%(2*Math.PI);lastFrame=time;renderFrame();}
      raf=global.requestAnimationFrame(animate);
    }
    function curvePaths(points){
      const projected=points.map(point=>projectNode(point,yaw)),paths=['',''];let side=-1;
      for(let i=1;i<projected.length;i++){
        const a=projected[i-1],b=projected[i],next=(a.depth+b.depth)>=0?1:0;
        if(next!==side)paths[next]+='M'+a.x.toFixed(1)+' '+a.y.toFixed(1);paths[next]+='L'+b.x.toFixed(1)+' '+b.y.toFixed(1);side=next;
      }
      return paths;
    }
    function renderFrame(){
      const positioned=new Map();for(const view of nodeViews)positioned.set(view.node.id,projectNode(view.node,yaw));
      const labels=new Set(),occupied=[];
      const candidates=graph.nodes.slice().sort((a,b)=>Number(b.id===activeLabel||b.id===gestureLabel)-Number(a.id===activeLabel||a.id===gestureLabel)||Number(b.active)-Number(a.active)||Number(b.selected)-Number(a.selected)||b.degree-a.degree||byId(a,b));
      for(const node of candidates){
        const p=positioned.get(node.id),width=Math.min(29,String(node.label||node.id).length)*6.8+10,left=p.x>500?p.x-width-12*p.scale:p.x+12*p.scale,box={x:left,y:p.y-11,w:width,h:19};
        if(node.id!==activeLabel&&node.id!==gestureLabel&&occupied.some(other=>box.x<other.x+other.w&&box.x+box.w>other.x&&box.y<other.y+other.h&&box.y+box.h>other.y))continue;
        labels.add(node.id);occupied.push(box);if(labels.size===8)break;
      }
      for(const curve of curves){const paths=curvePaths(curve.points);curve.back.setAttribute('d',paths[0]);curve.front.setAttribute('d',paths[1]);}
      for(const view of nodeViews){
        const p=positioned.get(view.node.id),depth=(p.depth+1)/2;
        view.group.setAttribute('transform','translate('+p.x.toFixed(2)+' '+p.y.toFixed(2)+')');view.group.style.opacity=String(view.node.selected||view.node.active ? .55+.45*depth : .2+.8*depth);view.group.classList.toggle('gesture-pointed',view.node.id===gestureLabel);
        view.circle.setAttribute('r',((view.node.selected||view.node.active?7.5:3.3+Math.min(3,view.node.degree/10))*p.scale).toFixed(2));view.hit.setAttribute('r',(12*p.scale).toFixed(2));
        view.label.setAttribute('x',(p.x>500?-12:12)*p.scale);view.label.setAttribute('text-anchor',p.x>500?'end':'start');view.group.classList.toggle('labelled',labels.has(view.node.id));
      }
      // Keep DOM focus and pointer targets intact during interaction.
      if(!hovered&&!svg.contains(document.activeElement))for(const view of nodeViews.slice().sort((a,b)=>positioned.get(a.node.id).depth-positioned.get(b.node.id).depth))nodeLayer.append(view.group);
    }
    function addCurve(parent,points,className,titleText){
      const back=shape('path',{class:className+' back'}),front=shape('path',{class:className+' front'});parent.append(back,front);
      if(titleText){const title=shape('title',{});title.textContent=titleText;front.append(title);}
      curves.push({points,back,front});
    }
    function scaffold(){
      const ornament=shape('g',{class:'pg-orb-scaffold','aria-hidden':'true','pointer-events':'none'});
      ornament.append(shape('ellipse',{class:'pg-orb-shadow',cx:500,cy:519,rx:190,ry:10}),shape('circle',{class:'pg-orb-halo',cx:500,cy:280,r:220}),shape('circle',{class:'pg-orb-calibration',cx:500,cy:280,r:234}),shape('ellipse',{class:'pg-orb-orbit',cx:500,cy:280,rx:248,ry:84,transform:'rotate(-13 500 280)'}));
      svg.append(ornament);
      for(let meridian=0;meridian<4;meridian++){
        const longitude=meridian*Math.PI/4,points=[];for(let i=0;i<=64;i++){const angle=i*Math.PI/32;points.push({sphereX:Math.cos(angle)*Math.cos(longitude),sphereY:Math.sin(angle),sphereZ:Math.cos(angle)*Math.sin(longitude)});}addCurve(ornament,points,'pg-orb-grid');
      }
      for(const y of [-.72,-.42,0,.42,.72]){
        const r=Math.sqrt(1-y*y),points=[];for(let i=0;i<=64;i++){const angle=i*Math.PI/32;points.push({sphereX:Math.cos(angle)*r,sphereY:y,sphereZ:Math.sin(angle)*r});}addCurve(ornament,points,'pg-orb-grid');
      }
    }
    function draw(snapshot){
      graph=layoutGraph(snapshot);const nodesById=new Map(graph.nodes.map(n=>[n.id,n]));nodeViews=[];curves=[];activeLabel=null;svg.replaceChildren();scaffold();
      const lines=shape('g',{class:'pg-links','aria-hidden':'true'});svg.append(lines);
      for(const link of graph.links){const a=nodesById.get(link.source),b=nodesById.get(link.target);addCurve(lines,arcPoints(a,b),'pg-link'+(a.selected||b.selected?' selected':''),a.label+' → '+b.label+' · '+(link.relation||'Verbindung'));}
      nodeLayer=shape('g',{class:'pg-nodes'});svg.append(nodeLayer);
      for(const node of graph.nodes){
        const group=shape('g',{class:'pg-node'+(node.selected?' selected':'')+(node.active?' activity':''),role:'button',tabindex:'0','aria-label':node.label+(node.sourceFile?' · '+node.sourceFile:'')+(node.active?' · Werkzeug aktiv':'')}),hit=shape('circle',{class:'pg-node-hit',r:12}),circle=shape('circle',{class:'pg-node-core',fill:node.color}),title=shape('title',{}),label=shape('text',{x:12,y:4});
        const name=String(node.label||node.id);title.textContent=name+(node.sourceFile?'\n'+node.sourceFile+(node.line?':'+node.line:''):'');label.textContent=name.length>29?name.slice(0,28)+'…':name;group.append(title,hit,circle,label);nodeLayer.append(group);nodeViews.push({node,group,hit,circle,label});
        group.addEventListener('click',()=>preview(node.id));group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();preview(node.id);}});
        group.addEventListener('mouseenter',()=>{activeLabel=node.id;renderFrame();});group.addEventListener('mouseleave',()=>{if(!focused){activeLabel=null;renderFrame();}});
        group.addEventListener('focus',()=>{activeLabel=node.id;renderFrame();});
      }
      el('empty').hidden=graph.nodes.length>0;el('count').textContent=graph.nodes.length+' / '+graph.total+' Knoten';viewbox();renderFrame();focused=svg.contains(document.activeElement);syncAnimation();
    }
    function results(matches){const box=el('results');box.replaceChildren();el('matches-count').textContent=String(matches.length);
      if(!matches.length){const p=document.createElement('p');p.textContent=current.query?'Keine passenden Knoten. Suche nach einem Datei- oder Funktionsnamen.':'Eine Suche markiert passende Knoten und ihre Verbindungen.';box.append(p);return;}
      for(const node of matches){const button=document.createElement('button'),name=document.createElement('strong'),source=document.createElement('span');button.type='button';name.textContent=node.label;source.textContent=node.sourceFile?(node.sourceFile+(node.line?':'+node.line:'')):'Externe Referenz';button.append(name,source);button.addEventListener('click',()=>preview(node.id));box.append(button);}
    }
    async function preview(id){const ticket=++sourceGeneration;el('source').textContent='Lokale Quelle wird gelesen …';try{const result=await call('graph-source',{id});if(disposed||ticket!==sourceGeneration)return;el('source-heading').textContent=result.sourceFile+(result.line?':'+result.line:'');el('source').textContent=(result.truncated?'[Begrenzte Vorschau]\n':'')+(result.text||'');}catch{if(!disposed&&ticket===sourceGeneration){el('source-heading').textContent='QUELLVORSCHAU';el('source').textContent='Für diesen Knoten ist keine lokale Quelle verfügbar.';}}}
    function update(snapshot){if(disposed||!snapshot)return;current=snapshot;
      el('root').textContent=snapshot.rootName||'Noch kein Projekt';el('index').disabled=!!snapshot.busy;el('pick').disabled=!!snapshot.busy;input.disabled=!!snapshot.busy;
      const timestamp=snapshot.indexedAt?new Date(snapshot.indexedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'';
      el('status').classList.toggle('pg-error',!!snapshot.error);el('status').textContent=snapshot.busy?'Code wird lokal mit Graphify indexiert …':snapshot.error||(!snapshot.ready?'Wähle einen Projektordner und indexiere seinen Code.':(snapshot.stats?.files||0)+' Dateien · '+(snapshot.stats?.links||0)+' Verbindungen · '+(snapshot.watch?.limited?'Änderungsbeobachtung begrenzt — Projektstand prüfen.':snapshot.stale?'Projektstand veraltet oder unbestätigt — Index prüfen.':'Index '+timestamp));
      const selected=new Set(snapshot.selectedIds||[]),matches=(snapshot.nodes||[]).filter(n=>selected.has(n.id));results(matches);
      const signature=JSON.stringify([snapshot.indexedAt,snapshot.rootName,snapshot.query,snapshot.selectedIds,snapshot.activityIds,snapshot.nodes,snapshot.links]);if(signature!==lastDrawing){lastDrawing=signature;draw(snapshot);}
    }
    function stopGesture(){clearTimeout(gestureTimer);gestureTimer=null;spatial={...spatial,pointer:null,drag:null};gestureLabel=null;if(container.classList.contains('pg-gesture-active'))container.classList.remove('pg-gesture-active');if(!disposed){renderFrame();syncAnimation();}}
    function gesture(value){
      if(disposed)return false;const result=applyGraphGesture({...spatial,yaw,zoom},value,{visible:visible(true)&&graph.nodes.length>0});spatial=result.state;
      if(!result.accepted||value.kind==='cancel'){if(!spatial.pointer)stopGesture();return result.accepted;}
      yaw=spatial.yaw;zoom=spatial.zoom;gestureLabel=null;
      if(spatial.pointer){
        const w=1000/zoom,h=560/zoom,x=(1000-w)/2+spatial.pointer.x*w,y=(560-h)/2+spatial.pointer.y*h;
        let closest=28/zoom;
        for(const node of graph.nodes){const p=projectNode(node,yaw),distance=Math.hypot(x-p.x,y-p.y);if(distance<closest){closest=distance;gestureLabel=node.id;}}
      }
      container.classList.toggle('pg-gesture-active',!!spatial.pointer);clearTimeout(gestureTimer);gestureTimer=setTimeout(stopGesture,500);viewbox();renderFrame();syncAnimation();return true;
    }
    listen(el('pick'),'click',async()=>{try{const result=await call('graph-pick');if(result?.rootName)el('root').textContent=result.rootName;const snap=await call('graph-snapshot');update(snap);}catch{}});
    listen(el('index'),'click',async()=>{el('index').disabled=true;try{const snap=await call('graph-index');update(snap?.nodes?snap:await call('graph-snapshot'));}catch{if(!disposed)el('index').disabled=false;}});
    async function search(){try{const result=await call('graph-search',{query:input.value});if(disposed)return;update({...current,query:result.query,selectedIds:result.selectedIds});results(result.matches||[]);}catch{}}
    listen(form,'submit',event=>{event.preventDefault();search();});listen(el('reset'),'click',()=>{input.value='';search();});
    listen(el('zoom-in'),'click',()=>{zoom=Math.min(4,zoom*1.3);viewbox();});listen(el('zoom-out'),'click',()=>{zoom=Math.max(.5,zoom/1.3);viewbox();});listen(el('fit'),'click',()=>{zoom=1;yaw=0;viewbox();renderFrame();});
    listen(el('motion'),'click',()=>{motion=!motion;syncAnimation();});
    listen(svg,'mouseenter',()=>{hovered=true;syncAnimation();});listen(svg,'mouseleave',()=>{hovered=false;syncAnimation();});
    listen(svg,'focusin',()=>{focused=true;syncAnimation();});listen(svg,'focusout',event=>{focused=!!event.relatedTarget&&svg.contains(event.relatedTarget);if(!focused){activeLabel=null;renderFrame();}syncAnimation();});
    function visibilityChanged(){if(!visible())stopGesture();syncAnimation();}
    listen(document,'visibilitychange',visibilityChanged);
    if(reduced?.addEventListener)listen(reduced,'change',event=>{if(event.matches)motion=false;syncAnimation();});
    if(typeof global.IntersectionObserver==='function'){const observer=new global.IntersectionObserver(entries=>{inViewport=entries.some(entry=>entry.isIntersecting);visibilityChanged();});observer.observe(svg);observers.push(observer);}
    if(typeof global.MutationObserver==='function'){const observer=new global.MutationObserver(visibilityChanged);for(let ancestor=container;ancestor;ancestor=ancestor.parentElement)observer.observe(ancestor,{attributes:true,attributeFilter:['hidden','style','class']});observers.push(observer);}
    syncAnimation();call('graph-snapshot').then(update).catch(()=>{});
    return {update,gesture,cancelGesture(){stopGesture();spatial={...spatial,generation:-1,sequence:-1};},dispose(){disposed=true;sourceGeneration++;clearTimeout(gestureTimer);if(raf!==null)global.cancelAnimationFrame(raf);raf=null;for(const remove of listeners)remove();for(const observer of observers)observer.disconnect();container.replaceChildren();}};
  }
  const api={mount,layoutGraph,projectNode,applyGraphGesture};if(typeof module!=='undefined'&&module.exports)module.exports=api;else global.ProjectGraphView=api;
})(typeof window==='undefined'?globalThis:window);
