'use strict';
const fs=require('node:fs'),path=require('node:path'),{gradeAgentRun}=require('../agent-evaluations.cjs');
const scenarios=require('../evals/device-scenarios.json');
const file=process.argv[2];if(!file){console.error('Usage: node scripts/grade-device-evals.cjs <private recorded outcomes.json>');process.exitCode=2;}else{
 const info=fs.statSync(file);if(!info.isFile()||info.size>1048576)throw Error('Expected a bounded evaluation record');
 const runs=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));if(!Array.isArray(runs))throw Error('Expected evaluation records');
 const result=scenarios.map(scenario=>gradeAgentRun(scenario,runs.find(run=>run.id===scenario.id)));
 console.log(JSON.stringify({results:result,passed:result.filter(r=>r.passed).length,failed:result.filter(r=>r.status==='failed').length,untested:result.filter(r=>r.status==='untested').length},null,2));
 if(result.some(r=>r.status==='failed'))process.exitCode=1;
}
