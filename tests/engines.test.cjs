const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {engineSpecs}=require('../engines.cjs');
test('installed speech executables accept all startup arguments',()=>{
  for(const spec of engineSpecs(require('node:path').resolve(__dirname,'..'))){
    const result=spawnSync(spec.exe,[...spec.args,'--help'],{encoding:'utf8',windowsHide:true,timeout:10000});
    assert.ifError(result.error);
    assert.doesNotMatch(result.stderr+result.stdout,/unknown argument|unrecognized option/i,spec.name);
  }
});
