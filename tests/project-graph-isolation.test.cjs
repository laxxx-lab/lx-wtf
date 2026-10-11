'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createProjectGraph}=require('../project-graph.cjs');
const python=path.join(__dirname,'../runtime/graphify/Scripts/python.exe');

test('installed Graphify extraction cannot execute a project module named graphify',{skip:!fs.existsSync(python),timeout:60000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-graph-isolation-')),root=path.join(dir,'project'),cacheRoot=path.join(dir,'cache');
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'example.cjs'),'function greet() { return "hello"; }\n');
  fs.writeFileSync(path.join(root,'graphify.py'),'raise SystemExit("PROJECT_SHADOW_MODULE_EXECUTED")\n');
  const model=createProjectGraph({cacheRoot,deadlineMs:45000});
  t.after(()=>{model.dispose();fs.rmSync(dir,{recursive:true,force:true});});
  const result=await model.index(root);
  assert.equal(result.error,null,result.error);
  assert.equal(result.ready,true);
  assert.ok(result.nodes.some(node=>node.sourceFile==='example.cjs'),'the real installed parser must index the example source');
});

test('installed Graphify extraction cannot execute a repository filesystem monitor hook',{skip:!fs.existsSync(python),timeout:60000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lilith-graph-hook-')),root=path.join(dir,'project'),cacheRoot=path.join(dir,'cache');
  fs.mkdirSync(root);fs.writeFileSync(path.join(root,'example.cjs'),'function greet() { return "hello"; }\n');
  fs.writeFileSync(path.join(root,'.gitignore'),'ignored/*\n');
  const model=createProjectGraph({cacheRoot,deadlineMs:45000});
  t.after(()=>{model.dispose();fs.rmSync(dir,{recursive:true,force:true});});
  function git(args){const result=spawnSync('git',['-c','core.fsmonitor=false','-C',root,...args],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr||result.error?.message);}
  git(['init','-q']);git(['add','example.cjs','.gitignore']);
  const marker=path.join(root,'.git','fsmonitor-ran');
  fs.writeFileSync(path.join(root,'.git','fsmonitor-test.sh'),'#!/bin/sh\nprintf invoked > .git/fsmonitor-ran\nprintf "1234567\\0"\n');
  git(['config','core.fsmonitor','sh .git/fsmonitor-test.sh']);
  const result=await model.index(root);
  assert.equal(result.error,null,result.error);assert.equal(result.ready,true);
  assert.equal(fs.existsSync(marker),false,'static code extraction must not execute repository Git helpers');
});
