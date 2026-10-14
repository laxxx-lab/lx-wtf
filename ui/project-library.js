(() => {
  'use strict';
  function mount({invoke,notice,onContext=()=>{}}){
    const $=id=>document.getElementById(id),make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
    let registry={projects:[],activeId:null},source=null,generation=0,sourceSequence=0,loading=false,locked=false,fingerprint='';
    const active=()=>registry.projects.find(project=>project.id===registry.activeId)||null;
    async function call(method,payload){try{return await invoke(method,payload);}catch(error){notice(error.message||'Projekt konnte nicht gelesen werden.');return null;}}
    function context(){const project=active();onContext({project,source,locked,loading});$('project-file-clear').hidden=!source&&!loading;}
    function clearSource(){sourceSequence++;loading=false;source=null;$('project-preview').hidden=true;$('project-preview-text').textContent='';$('project-preview-title').textContent='';$('project-preview-meta').textContent='';context();}
    async function openFile(project,entry){
      clearSource();const ticket=generation,selection=++sourceSequence;loading=true;context();const result=await call('project-read',{id:project.id,path:entry.path});
      if(locked||ticket!==generation||selection!==sourceSequence||active()?.id!==project.id)return;
      loading=false;if(!result){context();return;}
      source=result;$('project-preview').hidden=false;$('project-preview-title').textContent=project.name+' / '+result.path;
      $('project-preview-text').textContent=result.text||'';$('project-preview-meta').textContent=(result.truncated?'AUSZUG · ':'')+'Gelesen '+new Date(result.observedAt).toLocaleTimeString('de-DE');
      context();await call('tab','console');
    }
    async function directory(project,path,target){
      const ticket=generation;target.textContent='Wird geladen …';const result=await call('project-list',{id:project.id,path});
      if(locked||ticket!==generation||active()?.id!==project.id)return;
      target.replaceChildren();if(!result){target.append(make('p','Ordner nicht verfügbar.','project-empty'));return;}
      for(const entry of result.entries||[]){
        if(entry.kind==='directory'){
          const details=make('details',undefined,'project-folder'),summary=make('summary',entry.name),children=make('div',undefined,'project-children');let loaded=false;
          details.append(summary,children);details.addEventListener('toggle',()=>{if(details.open&&!loaded){loaded=true;void directory(project,entry.path,children);}});target.append(details);
        }else{
          const button=make('button',entry.name,'project-file');button.type='button';button.dataset.projectFile=entry.path;button.disabled=entry.readable!==true;
          button.title=entry.readable?'Datei ansehen und für einen Auftrag auswählen':'Diese Datei ist keine unterstützte Textvorschau.';
          button.addEventListener('click',()=>void openFile(project,entry));target.append(button);
        }
      }
      if(!result.entries?.length)target.append(make('p','Keine anzeigbaren Dateien.','project-empty'));
      if(result.truncated)target.append(make('p','Ausschnitt: Dieser Ordner enthält mehr Einträge.','project-empty'));
    }
    function render(value){
      if(locked)return;const next=JSON.stringify(value);if(next===fingerprint)return;fingerprint=next;
      registry={projects:Array.isArray(value?.projects)?value.projects:[],activeId:value?.activeId||null};generation++;clearSource();
      const list=$('project-list');list.replaceChildren();
      for(const project of registry.projects){const button=make('button',project.name,'project-choice');button.type='button';button.dataset.projectId=project.id;button.setAttribute('aria-pressed',String(project.id===registry.activeId));button.title=project.root;button.addEventListener('click',async()=>{const result=await call('project-select',{id:project.id});if(result&&!locked)render(result);});list.append(button);}
      if(!registry.projects.length)list.append(make('p','Wähle einen Ordner für unsere gemeinsame Arbeit.','project-empty'));
      const project=active();$('project-root').textContent=project?.root||'';$('project-name-edit').value=project?.name||'';
      $('project-manage').hidden=!project;$('project-tree').replaceChildren();$('project-tree-heading').textContent=project?'DATEIEN · '+project.name:'DATEIEN';
      if(project)void directory(project,'',$('project-tree'));context();
    }
    $('project-add').addEventListener('click',async()=>{const result=await call('project-pick');if(result&&!locked)render(result);});
    $('project-rename-form').addEventListener('submit',async event=>{event.preventDefault();const project=active();if(!project||locked)return;const result=await call('project-rename',{id:project.id,name:$('project-name-edit').value.trim()});if(result&&!locked)render(result);});
    $('project-remove').addEventListener('click',async()=>{const project=active();if(!project||locked)return;const result=await call('project-remove',{id:project.id});if(result&&!locked){render(result);notice('Aus der Projektliste entfernt. Deine Dateien bleiben erhalten.');}});
    $('project-file-clear').addEventListener('click',clearSource);
    async function refresh(){const ticket=generation,result=await call('project-snapshot');if(!locked&&ticket===generation&&result)render(result);}
    return {
      render,refresh,
      update({privacyLocked=false}={}){
        if(locked===privacyLocked)return;locked=privacyLocked;generation++;fingerprint='';
        if(locked){registry={projects:[],activeId:null};clearSource();for(const id of ['project-list','project-tree','project-root'])$(id).textContent='';$('project-name-edit').value='';$('project-manage').hidden=true;}
        $('project-add').disabled=locked;if(!locked)void refresh();context();
      },
      async command(text){const project=active();if(locked)throw Error('Datenschutz ist aktiv.');if(loading)throw Error('Die ausgewählte Datei lädt noch.');return call(project?'project-command':'command',project?{id:project.id,text,...(source?{path:source.path}:{})}:text);},
      context:()=>({project:active(),source,locked,loading}),
    };
  }
  window.ProjectLibraryView={mount};
})();
