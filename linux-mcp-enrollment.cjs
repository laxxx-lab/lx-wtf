'use strict';
const fs=require('node:fs'),path=require('node:path');
function validateMcpUrl(value){
  const url=new URL(value),parts=url.hostname.split('.').map(Number);
  if(url.protocol!=='http:'||url.username||url.password||url.port!=='8876'||url.pathname!=='/mcp'||url.search||url.hash||parts.length!==4||parts.some(part=>!Number.isInteger(part)||part<0||part>255)||parts[0]!==100||parts[1]<64||parts[1]>127)throw Error('Notebook-MCP benötigt die Tailscale-IPv4-Adresse mit Port 8876 und /mcp.');
  return url.href;
}
function readPrivateToken(file){
  if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Lokale Token-Datei fehlt.');
  const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>128)throw Error('Lokale Token-Datei ist ungültig.');
  if(process.platform==='linux'&&((stat.mode&0o077)!==0||stat.uid!==process.getuid()))throw Error('Lokale Token-Datei benötigt private Besitzerrechte (0600).');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{const opened=fs.fstatSync(fd);if(opened.ino!==stat.ino||opened.dev!==stat.dev||opened.size!==stat.size||process.platform==='linux'&&((opened.mode&0o077)!==0||opened.uid!==process.getuid()))throw Error('Lokale Token-Datei wurde verändert.');const token=fs.readFileSync(fd,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(token))throw Error('Lokales Notebook-Token ist ungültig.');return token;}finally{fs.closeSync(fd);}
}
async function enrollLinuxMcp({url,tokenFile,request}){
  const validated=validateMcpUrl(url),name='lilith-zorin';let stage='list';
  try{
    const listing=await request('mcp.servers.list',{profile:'default'});
    if(!Array.isArray(listing?.servers))throw Error('Unknown response');
    const existing=listing.servers.find(server=>server.name===name);
    if(existing&&existing.url!==validated)throw Error('Reserved name belongs to a different server');
    if(!existing){stage='add';const bearerToken=readPrivateToken(tokenFile);await request('mcp.servers.add',{profile:'default',name,config:{url:validated},bearer_token:bearerToken});}
    stage='test';const tested=await request('mcp.servers.test',{profile:'default',name});
    if(tested?.ok!==true||!Array.isArray(tested.tools))throw Error('Probe did not confirm success');
    return {ok:true,alreadyRegistered:!!existing,toolCount:tested.tools.length};
  }catch{
    // Never echo backend messages or list/config payloads: they may contain
    // the bearer token. Only the authenticated client transmits that token.
    throw Error(stage==='list'?'Notebook-Werkzeuge nicht verbunden. Vorhandenen Eintrag und Gateway prüfen; kein Eintrag wurde überschrieben.':stage==='add'?'Notebook-Werkzeuge nicht registriert. Lokale private Token-Datei und Gateway prüfen.':'Notebook-Werkzeuge registriert, aber Funktionsprüfung noch nicht bestätigt.');
  }
}
module.exports={enrollLinuxMcp,validateMcpUrl};
