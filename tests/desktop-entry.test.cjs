const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('a second instance cannot copy an upgrade over the active workspace',()=>{
 const events=[],app={isPackaged:true,getPath:()=>path.resolve('app-data'),setName(){},setPath(){},requestSingleInstanceLock(){events.push('lock');return false;},quit(){events.push('quit');}};
 const context={__dirname:path.resolve('bundle'),process:{env:{},argv:['app'],platform:'win32'},console,setTimeout,clearTimeout,require(name){if(name==='electron')return {app,dialog:{}};if(name==='./package.json')return {version:'new'};if(name==='./workspace-install.cjs')return {defaultWorkspace:()=>path.resolve('user-workspace'),installPublicWorkspace:()=>events.push('copy')};if(name==='./scripts/prepare-package.cjs')return {listPublicFiles:()=>['main.cjs']};if(name==='node:fs')return {...fs,mkdirSync(){},existsSync:()=>false,readFileSync(){throw Object.assign(Error('No stamp'),{code:'ENOENT'});}};return require(name);}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../desktop-entry.cjs'),'utf8'),context);assert.deepEqual(events,['lock','quit']);
});
