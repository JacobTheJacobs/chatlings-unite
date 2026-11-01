import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('HTTP sessions isolate controllers, reject foreign origins, and stream shared state',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'chatlings-test-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3198',PUBLIC_URL:'http://localhost:3198',DEMO_MODE:'true',HOST_KEY:'test-host',DATA_DIR:dataDir,TWITCH_CHAT_TOKEN:'',CODEX_PET_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
 await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server startup timeout')),4000).unref())]);
 const base='http://localhost:3198';
 const post=(route,data,cookie='',extra={})=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',cookie,...extra},body:JSON.stringify(data)});
 assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/overlay')).status,200);assert.equal((await post('input',{id:'someone',x:1})).status,401);
 const a=await post('demo',{name:'alpha'}),cookie=a.headers.get('set-cookie').split(';')[0],u=(await a.json()).user;
 const b=await post('demo',{name:'beta'}),v=(await b.json()).user;assert.notEqual(u.id,v.id);
 assert.equal((await post('input',{id:v.id,x:1},cookie)).status,200);
 const skin=await post('skins',{prompt:'sleepy cyber frog with a golden crown',userId:v.id},cookie);assert.equal(skin.status,200);const job=await skin.json();assert.equal(job.userId,u.id);
 assert.equal((await post('skins/host',{action:'claim',id:job.id},cookie)).status,403);
 assert.equal((await post('skins/host',{action:'claim',id:job.id},cookie,{'X-Host-Key':'test-host'})).status,200);
 assert.equal((await post('skins/host',{action:'complete',id:job.id,asset:'/pets/missing.png'},cookie,{'X-Host-Key':'test-host'})).status,400);
 assert.equal((await post('join',{},cookie,{Origin:'https://evil.example'})).status,403);
 assert.equal((await post('host',{action:'bots'},cookie)).status,403);
 assert.equal((await post('pet',{enabled:true,personality:'hero',instruction:''},cookie)).status,403);
 assert.equal((await post('pet',{enabled:true,personality:'hero',instruction:''},cookie,{'X-Host-Key':'test-host'})).status,200);
 assert.equal((await post('pet',{enabled:false,personality:'hero',instruction:''},cookie,{'X-Host-Key':'test-host'})).status,200);
 assert.equal((await post('host',{action:'build'},cookie,{'X-Host-Key':'test-host'})).status,200);
 assert.equal((await post('host',{action:'fuse-demo'},cookie,{'X-Host-Key':'test-host'})).status,200);
 const abort=new AbortController();const stream=await fetch(base+'/api/events',{signal:abort.signal}),reader=stream.body.getReader();let data='';while(!data.includes('data: ')){data+=new TextDecoder().decode((await reader.read()).value);}abort.abort();
 const state=JSON.parse(data.split('data: ')[1].split('\n')[0]);assert.equal(state.fusion.team[0].id,u.id);assert.equal(state.fusion.team.length,3);assert.equal(state.players.find(p=>p.id===v.id).x,189);
 assert.equal((await post('host',{action:'challenge'},cookie,{'X-Host-Key':'test-host'})).status,200);
 }finally{if(child.exitCode===null && child.signalCode===null){child.kill();await once(child,'exit');}await rm(dataDir,{recursive:true,force:true});}
});
