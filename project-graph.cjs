'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {redactContext}=require('./context-journal.cjs');
const GRAPHIFY_VERSION='0.9.84',MAX_NODES=5000,MAX_LINKS=12000;
const MAX_WATCHERS=128,MAX_WATCH_ENTRIES=4096,MAX_WATCH_DEPTH=16;
const SOURCE_EXTENSIONS=new Set('.js .cjs .mjs .jsx .ts .tsx .py .ps1 .sh .c .h .cpp .hpp .cs .go .rs .java .rb .php .swift .kt .lua .sql .html .css .md .json .toml .yaml .yml'.split(' '));
const EXCLUDED_DIRS=new Set(['.git','.local','runtime','node_modules','voices','attachments','werkstatt-bilder','dist','build','target','graphify-out','__pycache__']);
const EXCLUDES=['.local/**','runtime/**','node_modules/**','voices/**','.git/**','attachments/**','werkstatt-bilder/**','**/.env*','**/*credential*','**/*secret*','**/*password*','**/*private_key*'];
// Code extraction is local; block Python network calls as a second boundary.
const OFFLINE_ENTRY="import sys, socket, os, importlib.metadata\nassert importlib.metadata.version('graphifyy') == '0.9.84', 'Graphify version mismatch'\nos.environ['PYTHONHASHSEED'] = '0'\nos.environ['GRAPHIFY_NO_AUTO_REFRESH'] = '1'\ndef offline(*args, **kwargs): raise RuntimeError('Network and interpreter re-execution disabled for project indexing')\nsocket.socket.connect = offline\nsocket.socket.connect_ex = offline\nsocket.create_connection = offline\nsocket.getaddrinfo = offline\nsys.argv = ['graphify'] + sys.argv[1:]\nfrom graphify import __main__ as cli\ncli._reexec = offline\ncli.main()";
function within(root,file){const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function allowedRelative(value){
  if(typeof value!=='string'||!value||value.length>600||value.includes('\0'))return false;
  const parts=value.replace(/\\/g,'/').split('/');
  return parts.every(p=>p&&!p.startsWith('.')&&!EXCLUDED_DIRS.has(p)&&!/credential|secret|password|passwd|token|private[_-]?key|id_rsa|id_ed25519/i.test(p))&&SOURCE_EXTENSIONS.has(path.extname(value).toLowerCase());
}
function allowedDirectory(value){return !value||value.split(path.sep).every(p=>p&&!p.startsWith('.')&&!EXCLUDED_DIRS.has(p)&&!/credential|secret|password|passwd|token|private[_-]?key|id_rsa|id_ed25519/i.test(p));}
function sourcePath(root,value){
  if(typeof value!=='string'||value.includes('://')||value.includes('\0'))throw new Error('Quelle ist kein lokaler Projektpfad.');
  if(fs.lstatSync(root).isSymbolicLink()||fs.realpathSync(root)!==root)throw new Error('Projektordner wurde durch einen symbolischen Pfad ersetzt.');
  const candidate=path.isAbsolute(value)?path.resolve(value):path.resolve(root,value.replace(/\\/g,path.sep));
  if(!within(root,candidate))throw new Error('Quellpfad liegt außerhalb des Projekts.');
  const relative=path.relative(root,candidate);
  if(!allowedRelative(relative))throw new Error('Diese Quelle ist von der Vorschau ausgeschlossen.');
  let current=root;
  for(const part of relative.split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw new Error('Quelle verwendet einen symbolischen Pfad.');}
  const real=fs.realpathSync(candidate);
  if(!within(root,real)||!fs.statSync(real).isFile())throw new Error('Ungültige Projektquelle.');
  return {file:real,relative:relative.split(path.sep).join('/')};
}
function runGraphify({root,outRoot,signal}){
  const command=path.join(__dirname,'runtime','graphify','Scripts','python.exe');
  if(!fs.existsSync(command))throw new Error('Graphify fehlt. scripts/install-graphify.ps1 ausführen.');
  const env={...process.env,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',PYTHONHASHSEED:'0',GRAPHIFY_NO_AUTO_REFRESH:'1',GRAPHIFY_NO_TIPS:'1',GRAPHIFY_NO_CTA:'1',GRAPHIFY_MAX_WORKERS:'2'};
  for(const key of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD|ANTHROPIC|OPENAI|GOOGLE|GEMINI|MOONSHOT|BEDROCK|AWS_|OLLAMA/i.test(key)||/^GIT_CONFIG(?:_|$)/.test(key))delete env[key];
  // Graphify uses git ls-files; its read must not execute repository fsmonitor helpers.
  Object.assign(env,{GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.fsmonitor',GIT_CONFIG_VALUE_0:'false'});
  const args=['-I','-c',OFFLINE_ENTRY,'extract',root,'--code-only','--out',outRoot];
  for(const pattern of EXCLUDES)args.push('--exclude',pattern);
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,env,windowsHide:true,shell:false,signal});
    let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString('utf8')).slice(-4000);});
    child.stdout.resume();child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('Graphify konnte den Code nicht indexieren (Exit '+code+'). '+redactContext(stderr,280))));
  });
}
function createProjectGraph({cacheRoot,runner=runGraphify,now=Date.now,onChange=()=>{},deadlineMs=120000}={}){
  if(typeof cacheRoot!=='string'||!path.isAbsolute(cacheRoot))throw new TypeError('Graph cache requires an absolute path.');
  let root=null,nodes=[],links=[],stamps=new Map(),rootStamp=null,restoredStale=false,generation=0,controller=null,disposed=false,watchStale=false,activityEnabled=false;
  const watchers=[],activity=new Map();let watch={active:false,directories:0,limited:false};
  let state={ready:false,busy:false,error:null,rootName:'',indexedAt:null,stale:false,stats:{nodes:0,links:0,files:0},selectedIds:[],query:''};
  const text=(value,limit=180)=>redactContext(String(value||'').split(root||'\0').join(state.rootName),limit).replace(/[A-Za-z]:[\\/][^\s]+/g,'[Pfad]');
  function stale(){
    if(!state.ready)return false;
    if(restoredStale||watchStale)return true;
    try{if(fs.lstatSync(root).isSymbolicLink()||fs.realpathSync(root)!==root||(rootStamp&&fs.statSync(root).mtimeMs!==rootStamp))return true;}catch{return true;}
    for(const [file,stamp]of stamps){try{const source=sourcePath(root,file),stat=fs.statSync(source.file);if(stat.mtimeMs!==stamp.mtime||stat.size!==stamp.size)return true;}catch{return true;}}
    return false;
  }
  function activityIds(){
    const files=new Set();for(const paths of activity.values())for(const file of paths){try{const source=sourcePath(root,file);if(source.file===file)files.add(source.relative);}catch{/* A replaced or removed source is no longer evidence. */}}
    return nodes.filter(node=>files.has(node.sourceFile)).map(node=>node.id);
  }
  function snapshot(){return {...state,stale:stale(),stats:{...state.stats},watch:{...watch},nodes:nodes.map(n=>({...n})),links:links.map(l=>({...l})),selectedIds:[...state.selectedIds],activityIds:activityIds()};}
  function publish(){try{onChange(snapshot());}catch{/* An unavailable renderer must not fail indexing. */}}
  function closeWatch(){for(const watcher of watchers){try{watcher.close();}catch{}}watchers.length=0;watch={...watch,active:false,directories:0};}
  function cancel(){generation++;controller?.abort();controller=null;state.busy=false;activityEnabled=false;activity.clear();closeWatch();if(state.ready)watchStale=true;publish();return snapshot();}
  function startWatch(){
    closeWatch();watch={active:false,directories:0,limited:false};const ticket=generation,queue=[{dir:root,depth:0}];let visited=0;
    const changed=()=>{if(disposed||ticket!==generation||watchStale)return;watchStale=true;closeWatch();publish();};
    // ponytail: metadata-only directory walk, capped at 128 watches/4096 entries/16 levels; refresh on demand.
    while(queue.length){
      if(watchers.length>=MAX_WATCHERS){watch.limited=true;break;}
      const {dir,depth}=queue.shift();let stream;
      try{
        if(!allowedDirectory(path.relative(root,dir))||fs.lstatSync(dir).isSymbolicLink()||fs.realpathSync(dir)!==dir)throw new Error('Project directory changed');
        const watcher=fs.watch(dir,{persistent:false},(_event,filename)=>{
          if(filename==null){changed();return;}
          const target=path.resolve(dir,String(filename)),relative=path.relative(root,target);
          if(!within(root,target)||!allowedDirectory(path.dirname(relative)==='.'?'':path.dirname(relative)))return;
          if(allowedRelative(relative)){changed();return;}
          if(!allowedDirectory(relative))return;
          try{const stat=fs.lstatSync(target);if(stat.isDirectory()&&!stat.isSymbolicLink())changed();}catch{changed();}
        });watcher.on('error',changed);watchers.push(watcher);
        stream=fs.opendirSync(dir);let entry;
        while((entry=stream.readSync())){
          if(++visited>MAX_WATCH_ENTRIES){watch.limited=true;break;}
          if(!entry.isDirectory()||entry.isSymbolicLink())continue;
          const child=path.join(dir,entry.name),relative=path.relative(root,child);if(!allowedDirectory(relative))continue;
          if(depth>=MAX_WATCH_DEPTH){watch.limited=true;continue;}
          if(fs.lstatSync(child).isSymbolicLink())continue;queue.push({dir:child,depth:depth+1});
        }
      }catch{watch.limited=true;}finally{try{stream?.closeSync();}catch{}}
      if(visited>MAX_WATCH_ENTRIES)break;
    }
    watch.active=watchers.length>0;watch.directories=watchers.length;
    if(watch.limited){watchStale=true;closeWatch();}
  }
  function observeTool(event){
    if(disposed||!activityEnabled||!state.ready||state.busy||typeof event?.toolId!=='string'||!event.toolId||event.toolId.length>180)return snapshot();
    if(['success','error','cancelled','complete'].includes(event.status)){activity.delete(event.toolId);publish();return snapshot();}
    if(event.status!=='running'||!Array.isArray(event.paths)||(!activity.has(event.toolId)&&activity.size>=128))return snapshot();
    const files=new Set(activity.get(event.toolId)||[]);
    for(const value of event.paths.slice(0,32)){
      if(typeof value!=='string'||value.length>1200||!path.isAbsolute(value)||path.resolve(value)!==value)continue;
      try{const source=sourcePath(root,value);if(source.file===value&&nodes.some(node=>node.sourceFile===source.relative)&&files.size<32)files.add(source.file);}catch{/* Only explicit current project source evidence may pulse a node. */}
    }
    if(files.size)activity.set(event.toolId,files);publish();return snapshot();
  }
  function normalize(raw){
    const rawLinks=raw?.links||raw?.edges;
    if(!raw||!Array.isArray(raw.nodes)||!Array.isArray(rawLinks))throw new Error('Graphify lieferte kein gültiges Graphformat.');
    if(raw.nodes.length>MAX_NODES||rawLinks.length>MAX_LINKS)throw new Error('Projektgraph zu groß: maximal 5000 Knoten und 12000 Verbindungen.');
    const schema=raw.graph?.schema_version;if(schema!==undefined&&schema!==1&&schema!=='1')throw new Error('Graphify-Graphformat wird noch nicht unterstützt.');
    const normalized=[],ids=new Set(),newStamps=new Map();
    for(const item of raw.nodes){
      if(!item||typeof item.id!=='string'||!item.id||item.id.length>400||ids.has(item.id))continue;
      let sourceFile='',file;
      if(item.source_file){try{const source=sourcePath(root,item.source_file);sourceFile=source.relative;file=source.file;}catch{continue;}}
      const id=text(item.id,400),label=text(item.label||item.id);if(!id||!label||ids.has(id))continue;
      const loc=typeof item.source_location==='number'?item.source_location:Number(String(item.source_location||'').match(/^(?:L|line[: ]*)?(\d+)/i)?.[1]);
      normalized.push({id,label,kind:text(item.file_type||'code',32),sourceFile,line:Number.isInteger(loc)&&loc>0?loc:null,community:Number.isInteger(item.community)?item.community:0});ids.add(id);
      if(file){const stat=fs.statSync(file);newStamps.set(file,{mtime:stat.mtimeMs,size:stat.size});}
    }
    const normalizedLinks=[];
    for(const item of rawLinks){if(!item||typeof item.source!=='string'||typeof item.target!=='string')continue;const source=text(item.source,400),target=text(item.target,400);if(ids.has(source)&&ids.has(target))normalizedLinks.push({source,target,relation:text(item.relation||'relates_to',60)});}
    return {nodes:normalized,links:normalizedLinks,stamps:newStamps};
  }
  async function index(chosenRoot){
    if(disposed)throw new Error('Projektgraph wurde geschlossen.');
    if(typeof chosenRoot!=='string'||!path.isAbsolute(chosenRoot))throw new Error('Bitte einen lokalen Projektordner auswählen.');
    const verified=fs.realpathSync(chosenRoot);
    if(!fs.statSync(verified).isDirectory()||verified===path.parse(verified).root)throw new Error('Bitte einen benannten Projektordner auswählen.');
    cancel();root=verified;nodes=[];links=[];stamps=new Map();rootStamp=null;restoredStale=false;watchStale=false;watch.limited=false;
    state={...state,ready:false,busy:true,error:null,rootName:typeof path.basename(root)==='string'?redactContext(path.basename(root),80):'Projekt',indexedAt:null,stats:{nodes:0,links:0,files:0},selectedIds:[],query:''};
    const ticket=generation,abort=new AbortController();controller=abort;publish();
    const outRoot=path.join(cacheRoot,'run-'+randomUUID());fs.mkdirSync(outRoot,{recursive:true});let timer;
    try{
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error('Indexierung hat das Zeitlimit erreicht.'));},deadlineMs);});
      await Promise.race([Promise.resolve().then(()=>runner({root,outRoot,signal:abort.signal})),timeout]);
      if(disposed||ticket!==generation)return snapshot();
      const output=path.join(outRoot,'graphify-out','graph.json');
      if(fs.lstatSync(output).isSymbolicLink()||fs.statSync(output).size>24*1024*1024)throw new Error('Graphify-Ausgabe ist ungültig oder zu groß.');
      const parsed=normalize(JSON.parse(fs.readFileSync(output,'utf8')));nodes=parsed.nodes;links=parsed.links;stamps=parsed.stamps;rootStamp=fs.statSync(root).mtimeMs;
      state.ready=true;state.indexedAt=now();state.stats={nodes:nodes.length,links:links.length,files:stamps.size};
      const manifest={version:GRAPHIFY_VERSION,root,output,indexedAt:state.indexedAt,rootStamp,stamps:[...stamps].map(([file,stamp])=>({sourceFile:path.relative(root,file),...stamp}))};
      const temporary=path.join(cacheRoot,'last-index-'+randomUUID()+'.tmp');fs.writeFileSync(temporary,JSON.stringify(manifest));fs.renameSync(temporary,path.join(cacheRoot,'last-index.json'));
      activityEnabled=true;startWatch();
    }catch(error){if(!disposed&&ticket===generation)state.error=text(error?.message||error,350);}
    finally{clearTimeout(timer);if(ticket===generation){controller=null;state.busy=false;publish();}}
    return snapshot();
  }
  function search(query=''){
    state.query=text(typeof query==='string'?query:'',200);
    const terms=state.query.toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0,12);
    const matches=terms.length?nodes.filter(n=>{const haystack=(n.label+' '+n.sourceFile).toLocaleLowerCase();return terms.every(term=>haystack.includes(term));}).slice(0,60):[];
    state.selectedIds=matches.map(n=>n.id);publish();return {query:state.query,selectedIds:[...state.selectedIds],matches:matches.map(n=>({...n}))};
  }
  function restore(chosenRoot){
    if(disposed||typeof chosenRoot!=='string'||!path.isAbsolute(chosenRoot))return false;
    try{const manifest=JSON.parse(fs.readFileSync(path.join(cacheRoot,'last-index.json'),'utf8')),verified=fs.realpathSync(chosenRoot);
      if(manifest.version!==GRAPHIFY_VERSION||manifest.root!==verified||typeof manifest.output!=='string'||!within(cacheRoot,manifest.output)||fs.lstatSync(manifest.output).isSymbolicLink()||fs.statSync(manifest.output).size>24*1024*1024||!Array.isArray(manifest.stamps)||!Number.isFinite(manifest.indexedAt))return false;
      cancel();root=verified;state.rootName=redactContext(path.basename(root),80);const parsed=normalize(JSON.parse(fs.readFileSync(manifest.output,'utf8')));
      nodes=parsed.nodes;links=parsed.links;stamps=parsed.stamps;restoredStale=false;watchStale=false;
      for(const item of manifest.stamps){try{const file=sourcePath(root,item.sourceFile).file,stat=fs.statSync(file);if(!Number.isFinite(item.mtime)||!Number.isFinite(item.size)||stat.mtimeMs!==item.mtime||stat.size!==item.size)restoredStale=true;if(stamps.has(file)&&Number.isFinite(item.mtime)&&Number.isFinite(item.size))stamps.set(file,{mtime:item.mtime,size:item.size});}catch{restoredStale=true;}}
      rootStamp=manifest.rootStamp;state.ready=true;state.busy=false;state.error=null;state.indexedAt=manifest.indexedAt;state.stats={nodes:nodes.length,links:links.length,files:stamps.size};state.selectedIds=[];state.query='';activityEnabled=true;startWatch();publish();return true;
    }catch{return false;}
  }
  function readSource(id){
    if(!state.ready||state.busy||disposed)throw new Error('Projektgraph ist noch nicht bereit.');
    const node=nodes.find(n=>n.id===id);if(!node?.sourceFile)throw new Error('Keine lesbare Projektquelle für diesen Knoten.');
    const source=sourcePath(root,node.sourceFile),stat=fs.statSync(source.file);if(stat.size>1024*1024)throw new Error('Quelldatei ist für die Vorschau zu groß.');
    const content=fs.readFileSync(source.file,'utf8');if(content.includes('\0'))throw new Error('Binärdateien werden nicht angezeigt.');
    const allLines=content.split(/\r?\n/),start=Math.max(0,(node.line||1)-16),end=Math.min(allLines.length,start+120);
    const preview=allLines.slice(start,end).map(line=>redactContext(line,2000)).join('\n');
    return {name:node.label,sourceFile:node.sourceFile,line:node.line,startLine:start+1,text:preview.slice(0,16000),truncated:start>0||end<allLines.length||preview.length>16000||allLines.slice(start,end).some(line=>line.length>2000)};
  }
  return {index,snapshot,search,readSource,cancel,restore,observeTool,dispose(){cancel();disposed=true;nodes=[];links=[];stamps.clear();state.ready=false;}};
}
module.exports={createProjectGraph,GRAPHIFY_VERSION};
