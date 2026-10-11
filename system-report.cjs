'use strict';
function systemReportIntent(text){
  const value=String(text||'').trim().toLowerCase().replace(/^(?:hey\s+)?(?:lilith|lillis|hermes)[,\s]+/,'').replace(/[.!?]+$/,'').trim();
  return /^(?:systemstatus|statusbericht|systembericht|(?:gib|zeig)(?:e)? mir (?:einen |den )?(?:systemstatus|statusbericht)|wie geht es meinem (?:pc|computer)|wie (?:ist|sieht) (?:die systemauslastung|der systemstatus)(?: aus)?)$/.test(value);
}
function desktopConnection(data){
  const server=Array.isArray(data?.servers)?data.servers.find(s=>s?.name==='cua-driver'):null;
  if(!server)return undefined;
  if(server.connected===true&&Number.isFinite(server.tools)&&server.tools>0&&!server.disabled)return true;
  if(server.connected===false||server.disabled===true)return false;
  return undefined;
}
function buildSystemReport(sample={},connection={},now=Date.now()){
  const age=Number.isFinite(sample.timestamp)?now-sample.timestamp:Infinity,fresh=age>=0&&age<=45000;
  const valid=(n)=>Number.isFinite(n)&&n>=0;
  const metrics=[['cpu','CPU',sample.cpuPercent,'%'],['memory','RAM',sample.memoryPercent,'%'],['gpu','GPU',sample.gpuPercent,'%'],['disk','C: frei',sample.diskFreeGiB,'GiB']].map(([key,label,value,unit])=>({key,label,value:fresh&&valid(value)&&(unit!=='%'||value<=100)?Math.round(value):null,unit,available:fresh&&valid(value)&&(unit!=='%'||value<=100)}));
  const mcpFresh=Number.isFinite(connection.mcpCheckedAt)&&now-connection.mcpCheckedAt>=0&&now-connection.mcpCheckedAt<=75000;
  const link=(key,label,value)=>({key,label,state:value===true?'online':value===false?'offline':'unknown'});
  const links=[link('gateway','Hermes',connection.connected),link('mcp','Windows-Anbindung',mcpFresh?connection.mcpOnline:undefined)];
  const readings=metrics.filter(m=>m.available).map(m=>m.key==='disk'?`auf C: ${m.value} GiB frei`:`${m.label} ${m.value} Prozent`);
  const unavailable=metrics.filter(m=>!m.available).map(m=>m.label);
  const measured=!fresh?'Die Messwerte sind nicht aktuell.':readings.length?readings.join(', ')+'.':'Es liegen noch keine Messwerte vor.';
  const connections=links.map(l=>`${l.label} ${l.state==='online'?'verbunden':l.state==='offline'?'unterbrochen':'noch nicht geprüft'}`).join('; ')+'.';
  return {timestamp:now,fresh,ageSeconds:Number.isFinite(age)?Math.max(0,Math.round(age/1000)):null,metrics,links,text:measured+' '+connections+(fresh&&unavailable.length?' Nicht verfügbar: '+unavailable.join(', ')+'.':'')};
}
module.exports={systemReportIntent,desktopConnection,buildSystemReport};
