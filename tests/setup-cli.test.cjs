const test=require('node:test'),assert=require('node:assert/strict');

test('scripted setup shares validation and rejects duplicate or unknown options',()=>{

 const {setupFromArgs}=require('../setup-options.cjs');assert.equal(typeof setupFromArgs,'function');

 assert.equal(setupFromArgs(['electron','.']),null);

 assert.deepEqual(setupFromArgs(['app','--configure','--gateway','https://hermes.example','--assistant-name','Athena','--stt','small','--tts','none','--language','en']),{assistantName:'Athena',url:'https://hermes.example',stt:'small',tts:'none',language:'en'});

 for(const args of [['--configure'],['--configure','--gateway','https://user:pass@hermes.example'],['--configure','--gateway','https://example.com','--stt','bad'],['--configure','--gateway','https://example.com','--command','echo'],['--configure','--gateway','https://example.com','--stt','none','--stt','small']])assert.throws(()=>setupFromArgs(args));

});
 test('reopening setup preserves the Windows gateway authentication partition and login paths',()=>{

 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');

 const {applyClientSettings}=require('../setup-options.cjs'),{validateGatewayUrl}=require('../gateway.cjs');

 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hermes-auth-'));

 try{fs.mkdirSync(path.join(root,'.local'));const previous={url:validateGatewayUrl('https://Hermes.example:443/'),session:'keep',voice:'dark'};fs.writeFileSync(path.join(root,'.local/settings.json'),JSON.stringify(previous));

 const result=applyClientSettings(root,'win32',{assistantName:'Athena',url:'https://Hermes.example:443/',stt:'none',tts:'none',language:'de'});

 const partition=url=>'persist:hermes-voice-'+crypto.createHash('sha256').update(url).digest('hex').slice(0,12);

 assert.equal(partition(result.url),partition(previous.url));assert.equal(result.session,'keep');assert.equal(result.url+'/login','https://hermes.example/login');assert.equal(result.url+'/api/auth/me','https://hermes.example/api/auth/me');

 }finally{fs.rmSync(root,{recursive:true});}

 });

test('Windows startup preserves disabled speech and uses the selected greeting identity',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../main.cjs'),'utf8');
 const startup=source.slice(source.indexOf("if(config.voice!=='off'"),source.indexOf('function state(next'));
 const context=vm.createContext({config:{voice:'off',delivery:'normal',assistantName:'Athena'},validVoice:()=>false,validVoiceDelivery:()=>false});vm.runInContext(startup,context);assert.equal(context.config.voice,'off');assert.match(vm.runInContext('wakeGreetings[2]',context),/^Athena /);
 assert.match(source,/speak\('Ich bin '\+\(config.assistantName\|\|'Lilith'\)/);
});
