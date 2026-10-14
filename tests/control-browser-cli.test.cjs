const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {createControlApi}=require('../control-api.cjs');
test('PowerShell browser status stays GET while explicit navigation posts its typed URL',{skip:process.platform!=='win32'},async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-browser-cli-')),token=crypto.randomBytes(32).toString('hex'),calls=[];
 const api=await createControlApi({port:0,token,readStatus:()=>({privacyLocked:false}),onCommand:()=>{},onBrowser:value=>{calls.push(value);return {ready:true,url:'https://example.com/',title:'Example',visible:true,loading:false};}});
 t.after(async()=>{await new Promise(resolve=>api.close(resolve));fs.rmSync(folder,{recursive:true,force:true});});
 fs.mkdirSync(path.join(folder,'.local'));fs.writeFileSync(path.join(folder,'.local/control-api.json'),JSON.stringify({url:`http://127.0.0.1:${api.address().port}`,token}));fs.copyFileSync(path.join(__dirname,'../control.ps1'),path.join(folder,'control.ps1'));
 const run=async args=>JSON.parse((await promisify(execFile)('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(folder,'control.ps1'),'-Action','browser',...args],{timeout:15000,windowsHide:true})).stdout);
 assert.equal((await run([])).browser.loading,false);assert.deepEqual(calls[0],{action:'state'});
 assert.equal((await run(['-Operation','navigate','-Url','https://example.com'])).browser.url,'https://example.com/');assert.deepEqual(calls[1],{action:'navigate',url:'https://example.com'});
});
