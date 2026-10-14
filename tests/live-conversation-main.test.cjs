'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const events=[],prompts=[],sentences=[],dialogueCalls=[],history=[],app={setPath(){},setName(){},setAppUserModelId(){},on(){},isReady:()=>false,quit(){},requestSingleInstanceLock:()=>false};
 class Dialogue{constructor(){this.ready=true;}snapshot(){return {ready:true,busy:false};}async available(){return true;}async answer(text,options){dialogueCalls.push({text,options});options.onDelta('Ich bin da.');options.onSentence('Ich bin da.');return {text:'Ich bin da.',turnId:'local-result'};}interrupt(){this.interrupted=true;}clear(){history.length=0;}context(){return history;}confirmHeard(){this.confirmed=true;}rememberUser(){}rememberResult(){}}
 const context=vm.createContext({__dirname:path.resolve(__dirname,'..'),process,Buffer,setTimeout,clearTimeout,setInterval,clearInterval,AbortSignal,AbortController,performance,fetch,console,require:name=>{
  if(name==='electron')return {app,ipcMain:{handle(){}},Notification:{isSupported:()=>false}};
  if(name==='node:fs')return {...fs,mkdirSync(){},writeFileSync(){},readFileSync(){throw Error('test settings');}};
  if(name==='./local-dialogue.cjs')return {LocalDialogue:Dialogue};
  if(name.startsWith('./'))return require(path.resolve(__dirname,'..',name));return require(name);
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../main.cjs'),'utf8'),context);Object.assign(context,{events,prompts,sentences,dialogueCalls});
 vm.runInContext("actionHandlers=registerHandlers();connected=true;globalThis.testedSpeak=speak;emit=(type,data={})=>events.push({type,...data});speak=(text,voice,delivery,cached,options)=>sentences.push({text,options});conversation=new Conversation(async(method,params)=>{if(method==='config.get')return {value:'none'};if(method==='prompt.submit'){prompts.push(params);return {};}return {};});conversation.session={id:'runtime',storedId:'stored',profile:'default',title:'Test'};config.localDialogueEnabled=true;localDialogueReady=true;",context);
 return {events,prompts,sentences,dialogueCalls,context,run:code=>vm.runInContext(code,context)};
}
test('eligible spoken conversation uses local sentences without a Hermes model turn or job mutation',async()=>{
 const f=fixture();await f.run("submit('Hallo Lilith',{turnId:'local-hello',sessionId:'runtime'})");
 assert.equal(f.dialogueCalls.length,1);assert.equal(f.prompts.length,0);assert.equal(f.run('getJobs().list().length'),0);assert.deepEqual(f.sentences.map(x=>x.text),['Ich bin da.']);assert.equal(f.sentences[0].options.turnId,'local-hello');assert.equal(f.run('controlStatus().busy'),false);
});
test('PC work, personal memory and text input retain the existing Hermes lane',async()=>{
 for(const [text,options] of [['Was ist der Name meines Sohnes?',{}],['Öffne Outlook',{}],['Hallo Lilith',{speak:false}]]){
  const f=fixture();f.context.request=text;f.context.options=options;await f.run('submit(request,options)');assert.equal(f.dialogueCalls.length,0,text);assert.equal(f.prompts.length,1,text);
 }
});
test('local conversation remains available during an active Hermes task without overwriting its turn or ledger',async()=>{
 const f=fixture();await f.run("submit('Öffne Outlook',{speak:false,turnId:'hermes-work'})");const previous=f.run('currentTurnId'),task=f.run('tasks.view().id');await f.run("submit('Mir geht es heute gut.',{turnId:'local-followup'})");
 assert.equal(f.dialogueCalls.length,1);assert.equal(f.prompts.length,1);assert.equal(f.run('conversation.busy'),true);assert.equal(f.run('currentTurnId'),previous);assert.equal(f.run('tasks.view().id'),task);assert.equal(f.run('getJobs().active().turnId'),'hermes-work');
});
test('privacy and stale capture cannot send text to the local model',async()=>{
 const f=fixture();f.run('config.privacyLocked=true;');await assert.rejects(f.run("submit('Hallo Lilith',{sessionId:'runtime'})"),/Datenschutz/);assert.equal(f.dialogueCalls.length,0);
 f.run('config.privacyLocked=false;');await assert.rejects(f.run("submit('Hallo Lilith',{sessionId:'old'})"),/Session/);assert.equal(f.dialogueCalls.length,0);
});

test('a natural capture report cannot commit the unheard tail of a generated local answer',()=>{
 const f=fixture();f.run("pendingHeard={turnId:'heard',resultId:'model-result',session:conversation.session};voiceTiming.begin('heard');voiceTiming.mark('heard','playback-end');actionHandlers['client-state'](null,{speaking:false,listening:true});");
 assert.notEqual(f.run('localDialogue.confirmed'),true);assert.notEqual(f.run('pendingHeard'),null);
});

test('only a matching final audio drain can confirm a staged local reply',()=>{
 const f=fixture();assert.equal(typeof f.run("actionHandlers['playback-drained']"),'function');f.run("pendingHeard={turnId:'heard',resultId:'model-result',session:conversation.session};speechGeneration=8;ttsPending=0;");
 assert.equal(f.run("actionHandlers['playback-drained'](null,{turnId:'heard',generation:7})"),false);assert.equal(f.run("actionHandlers['playback-drained'](null,{turnId:'other',generation:8})"),false);
 assert.equal(f.run("actionHandlers['playback-drained'](null,{turnId:'heard',generation:8})"),true);assert.equal(f.run('localDialogue.confirmed'),true);
});

test('heard local audio can commit while a different Hermes reply is still being synthesized',()=>{
 const f=fixture();f.run("pendingHeard={turnId:'heard',resultId:'model-result',session:conversation.session};speechGeneration=8;ttsPending=2;");
 assert.equal(f.run("actionHandlers['playback-drained'](null,{turnId:'heard',generation:8})"),true);
});

test('a simultaneous Hermes failure does not cancel an unrelated local answer',async()=>{
 const f=fixture();f.run("localDialogue.answer=async(text,options)=>{reportTurnFailure();options.onSentence('Ich bin da.');return {text:'Ich bin da.',turnId:'local-result'};};");const result=await f.run("submit('Hallo Lilith',{turnId:'live-own'})");assert.equal(result.local,true);assert.equal(result.ok,true);assert.ok(f.sentences.some(s=>s.text==='Ich bin da.'));
});

test('empty, odd and aborted current-generation PCM never confirms a local reply',async()=>{
 for(const kind of ['empty','odd','abort','valid']){
  const f=fixture();f.context.kind=kind;
  f.run("pendingHeard={turnId:'audio',resultId:'model-result',session:conversation.session};voiceClient={speech:async()=>{if(kind==='abort'){const error=new Error('timeout');error.name='AbortError';throw error;}return {ok:true,body:(async function*(){if(kind!=='empty')yield Buffer.alloc(kind==='odd'?3:4);})()};}};testedSpeak('Ein Satz.','reference','normal',null,{turnId:'audio'});");
  await f.run('speechChain');assert.equal(f.run("localSpeechFailures.has('audio')"),kind!=='valid',kind);assert.equal(f.run("speechPendingByTurn.size"),0);assert.equal(f.run("actionHandlers['playback-drained'](null,{turnId:'audio',generation:speechGeneration})"),kind==='valid',kind);
 }
});
test('an already owned model server is not spawned again while it is loading',()=>{
 const f=fixture();f.run("ownedEngines.set('live',{});runEngine(process.execPath,[],process.cwd(),'live');");assert.equal(f.run('ownedEngines.size'),1);
});

test('unlock during an older warmup prepares the new privacy generation instead of remaining unavailable',async()=>{
 const f=fixture();let release,reads=0;f.context.health=()=>++reads===1?new Promise(resolve=>release=resolve):Promise.resolve(true);f.context.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'Bereit.'}}]})});f.run('localDialogue.health=health;voiceClient={prepare:async()=>{}};');const old=f.run('warmLocalDialogue()');await new Promise(resolve=>setImmediate(resolve));f.run('safetyGeneration++;');const fresh=f.run('warmLocalDialogue()');release(true);await Promise.all([old,fresh]);assert.equal(f.run('localDialogueReady'),true);assert.equal(reads,3);
});

test('local readiness waits for the real voice server and its fixed reference preparation',async()=>{
 const f=fixture();let release;f.context.voicePrepared=()=>new Promise(resolve=>release=resolve);f.context.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'Bereit.'}}]})});f.run('localDialogue.health=async()=>true;voiceClient={prepare:voicePrepared};');const warming=f.run('warmLocalDialogue()');await new Promise(resolve=>setImmediate(resolve));assert.equal(f.run('localDialogueReady'),false);assert.equal(typeof release,'function');release();await warming;assert.equal(f.run('localDialogueReady'),true);
});
