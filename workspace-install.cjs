'use strict';
const fs=require('node:fs'),path=require('node:path');
function defaultWorkspace({platform=process.platform,env=process.env,home=require('node:os').homedir(),appData}={}){
 if(env.HERMES_VOICE_HOME){if(!path.isAbsolute(env.HERMES_VOICE_HOME))throw Error('HERMES_VOICE_HOME muss absolut sein.');return path.resolve(env.HERMES_VOICE_HOME);}
 if(platform==='win32')return path.join(env.LOCALAPPDATA||appData||home,'Hermes Voice','workspace');
 if(platform==='linux')return path.join(env.XDG_DATA_HOME||path.join(home,'.local/share'),'hermes-voice','workspace');
 return path.join(appData||path.join(home,'Library/Application Support'),'Hermes Voice','workspace');
}
function publicPath(file){return typeof file==='string'&&!file.includes('\\')&&!path.isAbsolute(file)&&!file.split('/').some(part=>!part||part==='.'||part==='..')&&/^(?:[^/.][^/]*\.cjs|package\.json|(?:ui|scripts|assets|node_modules)\/[^\0]+)$/.test(file)&&!/(?:^|\/)(?:\.local|runtime|voices|models|tests|\.git)(?:\/|$)|\.bak(?:[-.]|$)|\.log$/i.test(file);}
function noSymlink(target,base){for(let current=target;current.length>=base.length;current=path.dirname(current)){try{if(fs.lstatSync(current).isSymbolicLink())throw Error('Symlink im Installationspfad.');}catch(error){if(error.code!=='ENOENT')throw error;}if(current===base)break;}}
function installPublicWorkspace({source,destination,version,files}){
 source=path.resolve(source);destination=path.resolve(destination);
 if(source===destination||destination.startsWith(source+path.sep))throw Error('Ungültiger Installationspfad.');
 if(!Array.isArray(files)||!files.length||files.some(file=>!publicPath(file)))throw Error('Invalid public file path.');
 for(const file of files){const input=path.join(source,...file.split('/'));noSymlink(input,source);if(!fs.statSync(input).isFile())throw Error('Public file missing.');}
 noSymlink(destination,path.parse(destination).root);fs.mkdirSync(destination,{recursive:true,mode:0o700});
 for(const file of files){const input=path.join(source,...file.split('/')),output=path.join(destination,...file.split('/'));noSymlink(output,destination);fs.mkdirSync(path.dirname(output),{recursive:true});const temp=output+'.install-'+process.pid;fs.copyFileSync(input,temp);fs.renameSync(temp,output);}
 const local=path.join(destination,'.local');noSymlink(local,destination);fs.mkdirSync(local,{recursive:true,mode:0o700});
 const stamp=path.join(local,'package-version.json'),temp=stamp+'.new';fs.writeFileSync(temp,JSON.stringify({version,installedAt:new Date().toISOString()}),{mode:0o600});fs.renameSync(temp,stamp);
 return destination;
}
module.exports={defaultWorkspace,installPublicWorkspace};
