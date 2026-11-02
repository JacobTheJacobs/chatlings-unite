import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {request as httpRequest} from 'node:http';
function rawFetch(url,options={}){return new Promise((resolve,reject)=>{const req=httpRequest(url,{method:options.method||'GET',headers:options.headers},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,headers:{get:name=>res.headers[name]?.toString()},json:async()=>JSON.parse(body)}));});req.on('error',reject);req.end(options.body);});}
test('HTTP sessions isolate controllers, reject foreign origins, and stream shared state',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'chatlings-test-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3198',PUBLIC_URL:'http://localhost:3198',DEMO_MODE:'true',HOST_KEY:'test-host',DATA_DIR:dataDir,TWITCH_CHAT_TOKEN:'',TWITCH_CLIENT_ID:'test-client',TWITCH_CLIENT_SECRET:'test-secret',CODEX_PET_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
 await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server startup timeout')),4000).unref())]);
 const base='http://localhost:3198';
 const post=(route,data,cookie='',extra={})=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',cookie,...extra},body:JSON.stringify(data)});
 const chatAuth=await fetch(base+'/auth/chat',{redirect:'manual'});assert.equal(chatAuth.status,302);const authUrl=new URL(chatAuth.headers.get('location'));assert.equal(authUrl.hostname,'id.twitch.tv');assert.equal(authUrl.searchParams.get('scope'),'user:read:chat');assert.equal(authUrl.searchParams.get('redirect_uri'),base+'/auth/callback');assert.ok(chatAuth.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await fetch(base+'/auth/callback?state=bad')).status,403);
 assert.equal((await post('admin/desktop-settings',{mode:'walk'})).status,403);
 assert.equal((await post('admin/desktop-settings',{mode:'invalid'},'',{'X-Host-Key':'test-host'})).status,400);
 for(const mode of ['physics','walk']){
  assert.equal((await post('admin/desktop-settings',{mode},'',{'X-Host-Key':'test-host'})).status,200);
  assert.equal((await (await fetch(base+'/api/admin/status',{headers:{'X-Host-Key':'test-host'}})).json()).desktop.mode,mode);
 }
 const settingsRace=await Promise.all(['walk','physics','walk'].map(mode=>post('admin/desktop-settings',{mode},'',{'X-Host-Key':'test-host'})));
 assert.ok(settingsRace.every(r=>r.status===200));
 await new Promise(resolve=>setTimeout(resolve,1050));
 assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/admin')).status,200);assert.equal((await fetch(base+'/api/admin/status')).status,403);assert.equal((await fetch(base+'/api/admin/status',{headers:{'X-Host-Key':'test-host'}})).status,200);assert.equal((await post('admin/desktop',{enabled:false})).status,403);assert.equal((await post('admin/desktop',{enabled:'yes'},'',{'X-Host-Key':'test-host'})).status,400);assert.equal((await fetch(base+'/overlay')).status,200);assert.equal((await post('input',{id:'someone',x:1})).status,401);
 const a=await post('demo',{name:'alpha'}),cookie=a.headers.get('set-cookie').split(';')[0],u=(await a.json()).user;
 const b=await post('demo',{name:'beta'}),v=(await b.json()).user;assert.notEqual(u.id,v.id);
 assert.equal((await post('input',{id:v.id,x:1},cookie)).status,200);
 assert.equal((await post('skins',{prompt:'sleepy cyber frog',userId:v.id},cookie)).status,403);
 assert.equal((await post('skins/host',{action:'assign',userId:v.id},cookie)).status,403);
 const skin=await post('skins/host',{action:'assign',userId:v.id},cookie,{'X-Host-Key':'test-host'});assert.equal(skin.status,200);const job=await skin.json();assert.equal(job.userId,v.id);assert.equal(job.nickname,'beta');assert.equal(job.requestedBy,'admin');assert.ok(job.prompt.includes('beta'));
 assert.equal((await post('skins/host',{action:'assign',userId:'unknown'},cookie,{'X-Host-Key':'test-host'})).status,400);
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

test('public proxy origin keeps local login working and does not grant loopback host privileges',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'chatlings-public-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3196',PUBLIC_URL:'https://viewers.example',DEMO_MODE:'false',HOST_KEY:'private-host-key',DATA_DIR:dataDir,TWITCH_CHAT_TOKEN:'',TWITCH_CLIENT_ID:'test-client',TWITCH_CLIENT_SECRET:'test-secret',CODEX_PET_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timeout')),4000).unref())]);
  const base='http://localhost:3196',publicHeaders={Host:'viewers.example'};
  const me=await(await rawFetch(base+'/api/me',{headers:publicHeaders})).json();assert.equal(me.demo,false);assert.equal(me.host,false);assert.equal(me.viewerUrl,'https://viewers.example/controller');
  const state=await rawFetch(base+'/api/state',{headers:publicHeaders});assert.equal(state.status,200);assert.ok(Array.isArray((await state.json()).players));
  const remoteAuth=await rawFetch(base+'/auth/twitch',{headers:publicHeaders,redirect:'manual'});assert.equal(new URL(remoteAuth.headers.get('location')).searchParams.get('redirect_uri'),'https://viewers.example/auth/callback');assert.ok(remoteAuth.headers.get('set-cookie').includes('Secure'));
  const localAuth=await rawFetch(base+'/auth/twitch',{redirect:'manual'});assert.equal(new URL(localAuth.headers.get('location')).searchParams.get('redirect_uri'),base+'/auth/callback');assert.ok(!localAuth.headers.get('set-cookie').includes('Secure'));
  assert.equal((await rawFetch(base+'/auth/chat',{headers:publicHeaders,redirect:'manual'})).status,403);
  assert.equal((await rawFetch(base+'/api/host',{method:'POST',headers:{...publicHeaders,'Content-Type':'application/json',Origin:'https://viewers.example'},body:JSON.stringify({action:'bots'})})).status,403);
  assert.equal((await rawFetch(base+'/api/demo',{method:'POST',headers:{...publicHeaders,'Content-Type':'application/json',Origin:'https://viewers.example'},body:'{}'})).status,403);
  assert.equal((await rawFetch(base+'/api/me',{headers:{Host:'evil.example'}})).status,403);
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill();await once(child,'exit');}await rm(dataDir,{recursive:true,force:true});}
});

test('chat OAuth also signs broadcaster into admin in the same callback',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'chatlings-oauth-')),envFile=path.join(dir,'test.env');
 const {writeFile,readFile}=await import('node:fs/promises');await writeFile(envFile,'');
 const script=`globalThis.fetch=async url=>({ok:true,status:200,json:async()=>url.endsWith('/token')?{access_token:'testaccess',refresh_token:'testrefresh'}:{user_id:'test-user',client_id:'test-client',login:'testhost',scopes:['user:read:chat'],expires_in:3600}});globalThis.WebSocket=class{close(){}};await import('./server.mjs');`;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3192',PUBLIC_URL:'http://localhost:3192',DATA_DIR:dir,CHAT_ENV_FILE:envFile,DEMO_MODE:'false',HOST_KEY:'test-host',TWITCH_BROADCASTER_ID:'test-user',TWITCH_CLIENT_ID:'test-client',TWITCH_CLIENT_SECRET:'test-secret',TWITCH_CHAT_TOKEN:'',TWITCH_CHAT_REFRESH_TOKEN:'',CODEX_PET_API_KEY:''},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timeout')),4000).unref())]);
  const base='http://localhost:3192';const auth=await fetch(base+'/auth/chat',{redirect:'manual'}),state=new URL(auth.headers.get('location')).searchParams.get('state'),cookie=auth.headers.get('set-cookie').split(';')[0];
  const callback=await fetch(base+'/auth/callback?state='+state+'&code=fake',{headers:{cookie},redirect:'manual'});
  assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),'/admin?chat=connecting');
  const session=callback.headers.get('set-cookie');assert.ok(session?.startsWith('session='));assert.ok(session.includes('HttpOnly'));
  const headers={cookie:session.split(';')[0]};const me=await(await fetch(base+'/api/me',{headers})).json();assert.equal(me.host,true);assert.equal(me.user.id,'test-user');
  const admin=await fetch(base+'/api/admin/status',{headers});assert.equal(admin.status,200);assert.equal((await admin.json()).chatRefreshReady,true);
  assert.ok((await readFile(envFile,'utf8')).includes('TWITCH_CHAT_REFRESH_TOKEN=testrefresh'));
 }finally{if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});}
});
