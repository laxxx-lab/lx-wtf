const test=require('node:test'),assert=require('node:assert/strict');
const {systemReportIntent,buildSystemReport,desktopConnection}=require('../system-report.cjs');
test('only a standalone local system-status request bypasses Hermes',()=>{
  for(const text of ['Systemstatus','Lilith, gib mir einen Statusbericht.','Wie geht es meinem PC?','Wie ist die Systemauslastung?'])assert.equal(systemReportIntent(text),true,text);
  for(const text of ['Kein Systemstatus','Systemstatus und starte Spotify','Erkläre den Systemstatus','Wie ist der Status von Spotify?','Geh in den Standby'])assert.equal(systemReportIntent(text),false,text);
});
test('reports known fresh facts, links and unknowns without inventing a healthy system',()=>{
  const r=buildSystemReport({cpuPercent:12,memoryPercent:48,gpuPercent:9,diskFreeGiB:120,timestamp:1000},{connected:true,mcpOnline:undefined,mcpCheckedAt:1000},2000);
  assert.match(r.text,/12.*48/);assert.match(r.text,/nicht geprüft/);assert.equal(r.fresh,true);
  const stale=buildSystemReport({cpuPercent:12,timestamp:1000},{connected:false},100000);
  assert.equal(stale.fresh,false);assert.match(stale.text,/nicht aktuell/);assert.ok(!stale.text.includes('12 Prozent'));
});
test('only an explicit usable Cua transport indicates a connected Windows bridge',()=>{
  assert.equal(desktopConnection({servers:[{name:'cua-driver',connected:true,tools:61}]}),true);
  assert.equal(desktopConnection({servers:[{name:'cua-driver',connected:false,status:'failed'}]}),false);
  assert.equal(desktopConnection({servers:[{name:'other',connected:true,tools:61}]}),undefined);
  assert.equal(desktopConnection({servers:[{name:'cua-driver',connected:true,tools:0}]}),undefined);
});
