'use strict';
const os = require('node:os');
const fs = require('node:fs/promises');
function cpuTotals() {
  return os.cpus().reduce((sum,cpu) => ({idle:sum.idle+cpu.times.idle,total:sum.total+Object.values(cpu.times).reduce((a,b)=>a+b,0)}),{idle:0,total:0});
}
function createSystemSampler(drive = 'C:\\') {
  let previous = cpuTotals();
  return async function sample() {
    const current=cpuTotals(), total=current.total-previous.total, idle=current.idle-previous.idle;
    previous=current;
    const result={cpuPercent:total>0?Math.max(0,Math.min(100,(1-idle/total)*100)):undefined,memoryPercent:(1-os.freemem()/os.totalmem())*100,timestamp:Date.now()};
    try { const disk=await fs.statfs(drive); result.diskFreeGiB=disk.bavail*disk.bsize/2**30;result.diskTotalGiB=disk.blocks*disk.bsize/2**30; }
    catch { /* unknown disk remains unknown; it must not trigger a warning */ }
    return result;
  };
}
function germanAlert(alert) {
  const label={cpu:'CPU',memory:'Arbeitsspeicher',disk:'Laufwerk C:',gateway:'Hermes-Verbindung',mcp:'Windows-MCP'}[alert.kind] || alert.kind;
  if(alert.severity==='info') return `${label}: wieder im normalen Bereich.`;
  if(alert.unit==='online') return `${label} ist unterbrochen.`;
  return alert.kind==='disk'?`${label}: nur noch ${alert.value.toFixed(1)} GiB frei.`:`${label} ist dauerhaft zu ${Math.round(alert.value)} Prozent ausgelastet.`;
}
module.exports={createSystemSampler,germanAlert};
