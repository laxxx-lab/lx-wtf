'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function verifyPackage(root){
 const files=JSON.parse(fs.readFileSync(path.join(root,'public-files.json'),'utf8'));
 const sums=new Map(fs.readFileSync(path.join(root,'SHA256SUMS'),'utf8').trim().split(/\r?\n/).map(line=>[line.slice(66),line.slice(0,64)]));
 if(sums.size!==files.length)throw Error('Packaged checksum inventory differs.');
 for(const file of files){
  if(typeof file!=='string'||path.isAbsolute(file)||file.split(/[\\/]/).some(part=>['..','.local','runtime','voices','models','.git','tests'].includes(part)))throw Error('Unexpected packaged file path.');
  const target=path.join(root,file);if(!fs.existsSync(target)||fs.lstatSync(target).isSymbolicLink()||crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==sums.get(file))throw Error('Packaged file missing or changed: '+file);
 }
 return files.length;
}
async function afterPack(context){
 const resources=context.electronPlatformName==='darwin'?path.join(context.appOutDir,context.packager.appInfo.productFilename+'.app','Contents','Resources'):path.join(context.appOutDir,'resources');
 const root=path.join(resources,'app');finalizePackage(root,context.packager.info.appDir);
 console.log('Verified '+verifyPackage(root)+' public packaged files.');
}
function finalizePackage(root,source){
 const sumsFile=path.join(root,'SHA256SUMS'),lines=fs.readFileSync(sumsFile,'utf8').trim().split(/\r?\n/);
 const updated=lines.map(line=>{
  const file=line.slice(66);if(file!=='package.json'&&!/^node_modules\/.+\/package\.json$/.test(file))return line;
  const expected=JSON.parse(fs.readFileSync(path.join(source,file),'utf8')),actual=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  // Electron removes package metadata; runtime fields must remain identical.
  for(const value of [expected,actual])for(const key of ['scripts','devDependencies','keywords','bugs'])delete value[key];
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Packaged runtime metadata changed: '+file);
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')+'  '+file;
 });
 fs.writeFileSync(sumsFile,updated.join('\n')+'\n');verifyPackage(root);
}
module.exports=afterPack;module.exports.verifyPackage=verifyPackage;module.exports.finalizePackage=finalizePackage;
