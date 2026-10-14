'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {sourcePath,allowedRelative,allowedDirectory}=require('./project-graph.cjs');
const {redactContext}=require('./context-journal.cjs');
const MAX_PROJECTS=32,MAX_ENTRIES=500,MAX_INPUT=1024*1024,MAX_PREVIEW=12000;
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

function localRoot(value){
  if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('\0')||value.includes('://')||value.startsWith('\\\\')||value.startsWith('//'))throw new Error('Bitte einen lokalen Projektordner auswählen.');
  const resolved=path.resolve(value),base=path.parse(resolved).root;
  if(resolved===base||!allowedDirectory(path.relative(base,resolved)))throw new Error('Dieser Projektordner ist ausgeschlossen.');
  // Recheck ancestors as well: an old canonical root can acquire a parent junction.
  let current=base;
  for(const part of path.relative(base,resolved).split(path.sep)){
    current=path.join(current,part);const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Projektordner verwendet einen symbolischen oder ungültigen Pfad.');
  }
  return fs.realpathSync(resolved);
}
function relativePath(value,empty=false){
  if(typeof value!=='string'||value.length>600||value.includes('\0')||value.includes(':')||path.isAbsolute(value)||path.win32.isAbsolute(value))throw new Error('Bitte einen relativen Projektpfad verwenden.');
  const normalized=value.replace(/\\/g,'/');
  if(normalized===''&&empty)return '';
  if(!normalized||normalized.split('/').some(part=>!part||part==='.'||part==='..')||!allowedDirectory(normalized.split('/').join(path.sep)))throw new Error('Dieser Projektpfad ist ausgeschlossen.');
  return normalized;
}
function projectName(value){
  if(typeof value!=='string'||!value.trim()||value.length>160||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Bitte einen gültigen Projektnamen angeben.');
  const name=redactContext(value,80);if(!name)throw new Error('Bitte einen Projektnamen angeben.');return name;
}
function directoryPath(root,relative){
  if(localRoot(root)!==root)throw new Error('Projektordner wurde ersetzt.');
  let current=root;
  for(const part of relative?relative.split('/'):[]){
    current=path.join(current,part);const stat=fs.lstatSync(current);
    if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Projektpfad ist kein sicherer Ordner.');
  }
  if(fs.realpathSync(current)!==current)throw new Error('Projektordner wurde ersetzt.');
  return current;
}
function createProjectLibrary({file,initialRoot,onChange=()=>{}}={}){
  if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0')||file.includes('://'))throw new TypeError('Project library requires an absolute local registry path.');
  let projects=[],activeId=null,loaded=false;
  try{
    if(!fs.lstatSync(file).isSymbolicLink()&&fs.statSync(file).size<=128*1024){
      const stored=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
      if(stored.version===1&&Array.isArray(stored.projects)&&stored.projects.length<=MAX_PROJECTS){
        loaded=true;
        const ids=new Set(),roots=new Set();
        for(const record of stored.projects){
          if(!record||typeof record.id!=='string'||!UUID.test(record.id)||ids.has(record.id)||typeof record.root!=='string'||!path.isAbsolute(record.root)||record.root!==path.resolve(record.root)||record.root.includes('\0')||record.root.includes('://')||record.root.startsWith('\\\\')||roots.has(record.root))continue;
          const base=path.parse(record.root).root;
          if(record.root===base||!allowedDirectory(path.relative(base,record.root)))continue;
          try{const name=projectName(record.name);projects.push({id:record.id,name,root:record.root});ids.add(record.id);roots.add(record.root);}catch{/* Invalid names do not become registry entries. */}
        }
        activeId=ids.has(stored.activeId)?stored.activeId:projects[0]?.id||null;
      }
    }
  }catch{/* Missing or corrupt storage cannot authorize a filesystem read. */}
  function snapshot(){return {projects:projects.map(record=>({...record})),activeId};}
  function active(){const record=projects.find(record=>record.id===activeId);return record?{...record}:null;}
  function find(id){const record=projects.find(record=>record.id===id);if(!record)throw new Error('Projekt wurde nicht gefunden.');return record;}
  function resolve(id=activeId){const record=find(id);directoryPath(record.root,'');return {...record};}
  function write(nextProjects,nextActive){
    fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
    try{
      fs.writeFileSync(temporary,JSON.stringify({version:1,projects:nextProjects,activeId:nextActive}),{encoding:'utf8',mode:0o600,flag:'wx'});
      fs.renameSync(temporary,file);
    }finally{try{fs.unlinkSync(temporary);}catch{}}
    projects=nextProjects;activeId=nextActive;const result=snapshot();
    try{onChange(snapshot());}catch{/* A disconnected renderer cannot roll back persisted selection. */}
    return result;
  }
  function add(value){
    const root=localRoot(value),existing=projects.find(record=>process.platform==='win32'?record.root.toLowerCase()===root.toLowerCase():record.root===root);
    if(existing)return write(projects,existing.id);
    if(projects.length>=MAX_PROJECTS)throw new Error('Maximal 32 Projekte können gespeichert werden.');
    const record={id:randomUUID(),name:projectName(path.basename(root)),root};return write([...projects,record],record.id);
  }
  function select(id){resolve(id);return write(projects,id);}
  function rename(id,value){find(id);const name=projectName(value);return write(projects.map(record=>record.id===id?{...record,name}:record),activeId);}
  function remove(id){find(id);const remaining=projects.filter(record=>record.id!==id);return write(remaining,activeId===id?remaining[0]?.id||null:activeId);}
  function list({id=activeId,path:value=''}={}){
    const record=find(id),relative=relativePath(value,true),directory=directoryPath(record.root,relative),entries=[];
    const stream=fs.opendirSync(directory);let visited=0,truncated=false;
    try{
      let entry;
      while((entry=stream.readSync())){
        if(++visited>MAX_ENTRIES){truncated=true;break;}
        const child=relative?relative+'/'+entry.name:entry.name;
        if(entry.isSymbolicLink()||!allowedDirectory(child.split('/').join(path.sep)))continue;
        if(!entry.isDirectory()&&!entry.isFile())continue;
        // Metadata only; no file content or recursive enumeration during browsing.
        try{
          const candidate=path.join(directory,entry.name),stat=fs.lstatSync(candidate);
          if(stat.isSymbolicLink()||fs.realpathSync(candidate)!==candidate)continue;
          if(!stat.isDirectory()&&!stat.isFile())continue;
          entries.push({name:entry.name,path:child,kind:stat.isDirectory()?'directory':'file',readable:stat.isFile()&&allowedRelative(child)&&stat.size<=MAX_INPUT});
        }catch{/* A disappearing entry is omitted from this observation. */}
      }
    }finally{stream.closeSync();}
    directoryPath(record.root,relative);
    entries.sort((a,b)=>(a.kind===b.kind?0:a.kind==='directory'?-1:1)||a.name.localeCompare(b.name));
    return {id:record.id,path:relative,entries,truncated};
  }
  function read({id=activeId,path:value}={}){
    const record=find(id),relative=relativePath(value);directoryPath(record.root,'');
    const source=sourcePath(record.root,relative),fd=fs.openSync(source.file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    let content;
    try{
      const before=fs.fstatSync(fd);if(!before.isFile()||before.size>MAX_INPUT)throw new Error('Quelldatei ist für die Vorschau zu groß oder ungültig.');
      const buffer=Buffer.alloc(MAX_INPUT+1);let bytes=0,count;
      while(bytes<buffer.length&&(count=fs.readSync(fd,buffer,bytes,buffer.length-bytes,null)))bytes+=count;
      if(bytes>MAX_INPUT)throw new Error('Quelldatei ist für die Vorschau zu groß.');
      directoryPath(record.root,'');const current=sourcePath(record.root,relative),after=fs.statSync(current.file);
      if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw new Error('Quelldatei wurde während der Vorschau verändert.');
      try{content=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,bytes));}catch{throw new Error('Nur UTF-8-Textdateien werden angezeigt.');}
      if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content))throw new Error('Binärdateien werden nicht angezeigt.');
    }finally{fs.closeSync(fd);}
    content=content.replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z ]+ )?PRIVATE KEY-----|$)/g,'[redacted]');
    const lines=content.split(/\r?\n/);let text='',truncated=false;
    for(let i=0;i<lines.length;i++){
      const line=redactContext(lines[i],MAX_PREVIEW+1),next=(i?'\n':'')+line;
      if(lines[i].length>32*1024||line.length>MAX_PREVIEW||text.length+next.length>MAX_PREVIEW){text=(text+next).slice(0,MAX_PREVIEW);truncated=true;break;}
      text+=next;
    }
    return {id:record.id,name:path.basename(source.file),path:source.relative,root:record.root,text,truncated,observedAt:Date.now(),untrusted:true};
  }
  if(!loaded&&initialRoot!=null){
    let migration;
    try{migration=localRoot(initialRoot);}catch{/* An obsolete graph root cannot block explicit project selection. */}
    if(migration)add(migration);
  }
  return {snapshot,active,resolve,add,select,rename,remove,list,read};
}
module.exports={createProjectLibrary};
