const test=require('node:test'),assert=require('node:assert/strict');
const {gpuUtilization}=require('../system-monitor.cjs');
test('GPU usage combines processes on each hardware engine then uses the busiest engine',()=>{
  const row=(pid,engine,value)=>({Name:`pid_${pid}_luid_0x00000000_0x00014472_phys_0_eng_${engine}_engtype_3D`,UtilizationPercentage:value});
  assert.equal(gpuUtilization([row(1,0,20),row(2,0,30),row(1,1,40)]),50);
  assert.equal(gpuUtilization([]),undefined);
  assert.equal(gpuUtilization([{Name:'not-a-gpu',UtilizationPercentage:90}]),undefined);
  assert.equal(gpuUtilization([row(1,0,NaN)]),undefined);
});
