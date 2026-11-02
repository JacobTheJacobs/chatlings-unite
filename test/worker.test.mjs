import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('real worker times out a fake generator, preserves default pet, and isolates PID/status',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'chatlings-worker-test-')),fake=path.join(dir,'fake-codex'),marker=path.join(dir,'generator-started');
 await writeFile(fake,`#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'started');setInterval(()=>{},1000);\n`,{mode:0o700});
 const env={...process.env,PORT:'3193',PUBLIC_URL:'http://localhost:3193',DATA_DIR:dir,DEMO_MODE:'true',HOST_KEY:'worker-test',TWITCH_CHAT_TOKEN:'',CODEX_PET_API_KEY:'',CODEX_EXECUTABLE:fake,GENERATOR_TEST_MARKER:marker,HATCH_TIMEOUT_MS:'500'};
 const server=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','pipe']});let worker;
 const post=async(route,body)=>{const r=await fetch('http://localhost:3193/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Host-Key':'worker-test'},body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());return r.json();};
 try{
  await once(server.stdout,'data');const {user}=await post('demo',{name:'TimeoutToast'});const job=await post('skins/host',{action:'assign',userId:user.id});
  worker=spawn(process.execPath,['scripts/hatchery-worker.mjs'],{env,stdio:['ignore','pipe','pipe']});
  let jobs=[];for(let i=0;i<100;i++){await wait(100);jobs=await(await fetch('http://localhost:3193/api/skins/host',{headers:{'X-Host-Key':'worker-test'}})).json();if(jobs.find(j=>j.id===job.id)?.status==='failed')break;}
  assert.equal(jobs.find(j=>j.id===job.id)?.status,'failed');try{await readFile(marker);}catch{throw Error(await readFile(path.join(dir,'hatchery',job.id,'generation.log'),'utf8'));}
  const state=await(await fetch('http://localhost:3193/api/state')).json();assert.ok(state.players.some(p=>p.id===user.id));assert.ok(!state.skins.some(j=>j.status==='ready'));
  assert.equal(Number(await readFile(path.join(dir,'hatchery-worker.pid'),'utf8')),worker.pid);
  const status=JSON.parse(await readFile(path.join(dir,'hatchery-worker-status.json'),'utf8'));assert.ok(['idle','generating'].includes(status.phase));
 }finally{if(worker&&worker.exitCode===null){worker.kill();await once(worker,'exit');}if(server.exitCode===null){server.kill();await once(server,'exit');}await rm(dir,{recursive:true,force:true});}
});
