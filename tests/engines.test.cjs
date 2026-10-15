const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {existsSync}=require('node:fs');
const {engineSpecs}=require('../engines.cjs');
for(const spec of engineSpecs(require('node:path').resolve(__dirname,'..'))){
 test(`installed ${spec.name} executable accepts startup arguments`,{skip:existsSync(spec.exe)?false:'Native speech executable is not installed in this checkout'},()=>{
  const result=spawnSync(spec.exe,[...spec.args,'--help'],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.ifError(result.error);
  assert.equal(result.status,0,spec.name);
  assert.doesNotMatch(result.stderr+result.stdout,/unknown argument|unrecognized option/i,spec.name);
 });
}
