const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// Shared with the packaged workspace copier. Never traverse developer data.
function listPublicFiles(root) {
 const files=[];
 const excluded=/^(?:\.|runtime$|voices$|models$|tests?$|backups?$|captures$|credentials$|__pycache__$|electron$|electron-builder$|\.bin$)/i;
 function walk(relative) {
  const absolute=path.join(root,relative);
  const stat=fs.lstatSync(absolute);
  if(stat.isSymbolicLink()) return;
  if(stat.isDirectory()) {
   for(const entry of fs.readdirSync(absolute).sort()) if(!excluded.test(entry)) walk(relative+'/'+entry);
  } else if(!/(?:_test\.(?:py|cjs)|\.test\.cjs|\.(?:log|bak|backup|wav|mp3|pem|key|env))$/i.test(relative)) {
   if(relative.startsWith('node_modules/')&&/(?:\/readme(?:\.[^/]*)?|\.d\.ts)$/i.test(relative))return;
   if(relative.startsWith('node_modules/') || /\.(?:cjs|js|mjs|html|css|svg|png|ico|icns|json|py|ps1|sh)$/.test(relative) || /^assets\/licenses\/[a-zA-Z0-9.-]+\.txt$/.test(relative) || /^scripts\/requirements-portable-[a-z-]+\.txt$/.test(relative)) files.push(relative);
  }
 }
 for(const entry of fs.readdirSync(root).sort()) {
  if(entry==='package.json'||(/\.cjs$/.test(entry)&&!/(?:backup|test)/i.test(entry))) walk(entry);
  else if(['ui','scripts','assets'].includes(entry)) walk(entry);
  else if(entry==='node_modules') for(const dependency of ['ws','@mediapipe/tasks-vision']) {const relative='node_modules/'+dependency;if(fs.existsSync(path.join(root,relative))) walk(relative);}
 }
 return files.sort();
}
function prepare(root, destination) {
 const files=listPublicFiles(root);
 fs.mkdirSync(destination,{recursive:true});
 for(const file of files) {const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}
 fs.writeFileSync(path.join(destination,'public-files.json'),JSON.stringify(files,null,2)+'\n');
 fs.writeFileSync(path.join(destination,'SHA256SUMS'),files.map(file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(destination,file))).digest('hex')+'  '+file).join('\n')+'\n');
 return files;
}
module.exports={listPublicFiles,prepare};
if(require.main===module) {
 const root=path.resolve(__dirname,'..');
 const destination=path.join(root,'dist','public');
 if(fs.existsSync(destination)) fs.rmSync(destination,{recursive:true,force:true});
 console.log(JSON.stringify({destination,files:prepare(root,destination).length}));
}
