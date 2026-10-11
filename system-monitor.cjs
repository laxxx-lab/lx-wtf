'use strict';
const os = require('node:os');
const fs = require('node:fs/promises');
const path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const runFile=promisify(execFile);
function gpuUtilization(rows){
  const engines=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const key=typeof row?.Name==='string'?row.Name.match(/(luid_0x[\da-f]+_0x[\da-f]+_phys_\d+_eng_\d+)_engtype_/i)?.[1]:null,value=row?.UtilizationPercentage;
    if(!key||!Number.isFinite(value)||value<0||value>100)continue;
    engines.set(key,(engines.get(key)||0)+value);
  }
  return engines.size?Math.min(100,Math.max(...engines.values())):undefined;
}
async function readGpuStats(){
  if(process.platform!=='win32')return undefined;
  try{
    const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
    const {stdout}=await runFile(exe,['-NoProfile','-NonInteractive','-File',path.join(__dirname,'scripts/gpu_stats.ps1')],{windowsHide:true,timeout:4500,maxBuffer:256*1024,encoding:'utf8'});
    return gpuUtilization(JSON.parse(stdout.replace(/^\uFEFF/,'')));
  }catch{return undefined;}
}
function cpuTotals() {
  return os.cpus().reduce((sum,cpu) => ({idle:sum.idle+cpu.times.idle,total:sum.total+Object.values(cpu.times).reduce((a,b)=>a+b,0)}),{idle:0,total:0});
}
function createSystemSampler(drive = 'C:\\', {gpuReader=readGpuStats}={}) {
  let previous = cpuTotals();
  return async function sample() {
    const current=cpuTotals(), total=current.total-previous.total, idle=current.idle-previous.idle;
    previous=current;
    const result={cpuPercent:total>0?Math.max(0,Math.min(100,(1-idle/total)*100)):undefined,memoryPercent:(1-os.freemem()/os.totalmem())*100,timestamp:Date.now()};
    await Promise.allSettled([
      fs.statfs(drive).then(disk=>{result.diskFreeGiB=disk.bavail*disk.bsize/2**30;result.diskTotalGiB=disk.blocks*disk.bsize/2**30;}),
      Promise.resolve().then(gpuReader).then(value=>{if(Number.isFinite(value)&&value>=0&&value<=100){result.gpuPercent=value;result.gpuTimestamp=Date.now();}})
    ]);
    return result;
  };
}
function germanAlert(alert) {
  const label={cpu:'CPU',memory:'Arbeitsspeicher',disk:'Laufwerk C:',gateway:'Hermes-Verbindung',mcp:'Windows-MCP'}[alert.kind] || alert.kind;
  if(alert.severity==='info') return alert.unit==='online'?`${label} ist wieder verbunden.`:`${label}: wieder im normalen Bereich.`;
  if(alert.unit==='online') return `${label} ist unterbrochen.`;
  return alert.kind==='disk'?`${label}: nur noch ${alert.value.toFixed(1)} GiB frei.`:`${label} ist dauerhaft zu ${Math.round(alert.value)} Prozent ausgelastet.`;
}
module.exports={createSystemSampler,germanAlert,gpuUtilization,readGpuStats};
