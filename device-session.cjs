'use strict';
const {Conversation}=require('./conversation.cjs');
// The gateway deliberately leaves empty drafts unpersisted. Explicitly creating
// a device conversation saves that exact new identity, without touching its parent.
async function createDeviceSession({profile='default',title,request,json,isCurrent=()=>true}){
 if(typeof profile!=='string'||!profile||profile.length>120||typeof title!=='string'||!title.trim()||title.length>120)throw Error('Ungültiges neues Gespräch.');
 const check=()=>{if(!isCurrent())throw Error('Verbindung oder Auswahl wurde während des neuen Gesprächs geändert.');};check();
 const created=await request('session.create',{profile,source:'desktop',title,follow_profile_config:true},15000);check();
 const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(id);
 if(!valid(created?.session_id)||!valid(created?.stored_session_id))throw Error('Hermes hat das neue Gespräch nicht bestätigt.');
 const row={id:created.stored_session_id,title,profile},route='/api/sessions/'+encodeURIComponent(row.id)+'?profile='+encodeURIComponent(profile);
 const imported=await json('/api/sessions/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,sessions:[{id:row.id,title,profile_name:profile,source:'desktop',cwd:null,started_at:Date.now()/1000,messages:[]}]})});check();
 if(imported?.ok!==true)throw Error('Das neue Gespräch konnte nicht gespeichert werden.');
 const observed=await json(route);check();if(observed?.id!==row.id||observed.title!==title||Number(observed.message_count)!==0)throw Error('Das gespeicherte neue Gespräch wurde nicht bestätigt.');
 const conversation=new Conversation(request);conversation.session={storedId:row.id,id:created.session_id,profile,title};return {conversation,row};
}
module.exports={createDeviceSession};
