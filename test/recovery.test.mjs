import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game.mjs';
import {SkinQueue} from '../skins.mjs';
import {TwitchAuth} from '../twitch-auth.mjs';
import {connectChat} from '../twitch.mjs';
import {runProcess} from '../scripts/worker-process.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const identity={user_id:'u',client_id:'c',scopes:['user:read:chat'],expires_in:3600};
test('startup validation retries and starts chat after a transient outage',async()=>{
 let attempts=0,started=0;const auth=new TwitchAuth({clientId:'c',broadcasterId:'u',accessToken:'old',save:async()=>{},start:()=>started++,stop:()=>{},status:()=>{},retryMs:5,fetchImpl:async()=>{if(++attempts===1)throw Error('network');return {ok:true,json:async()=>identity};}});
 try{await auth.check();await wait(25);assert.equal(started,1);assert.ok(attempts>=2);}finally{auth.close();}
});
test('expired access token rotates and persists replacement refresh token before reconnecting',async()=>{
 const saved=[],started=[];let validations=0;const auth=new TwitchAuth({clientId:'c',clientSecret:'s',broadcasterId:'u',accessToken:'old',refreshToken:'refresh',save:async t=>saved.push(t),start:t=>started.push(t),stop:()=>{},status:()=>{},fetchImpl:async(url,options)=>{
  if(url.endsWith('/token')){assert.equal(options.body.get('grant_type'),'refresh_token');return {ok:true,json:async()=>({access_token:'new',refresh_token:'rotated'})};}
  if(++validations===1)return {ok:false,status:401};assert.equal(options.headers.Authorization,'OAuth new');return {ok:true,json:async()=>identity};
 }});
 try{await auth.check();assert.equal(saved[0].refresh_token,'rotated');assert.deepEqual(started,['new']);}finally{auth.close();}
});
test('failed Twitch handoff retries a fresh connection and stop closes every socket',async()=>{
 const sockets=[];class Socket{constructor(url){this.url=url;sockets.push(this);}close(){this.closed=true;this.onclose?.();}async message(type,payload){await this.onmessage?.({data:JSON.stringify({metadata:{message_type:type},payload})});}}
 const statuses=[];const stop=connectChat({token:'fake',clientId:'c',broadcasterId:'u',onStatus:s=>statuses.push(s),WebSocketImpl:Socket,fetchImpl:async()=>({ok:true}),retryMs:5});
 try{await sockets[0].message('session_welcome',{session:{id:'one'}});await sockets[0].message('session_reconnect',{session:{reconnect_url:'wss://eventsub.wss.twitch.tv/ws?reconnect=1'}});sockets[1].close();await wait(25);assert.equal(sockets.length,3);assert.ok(statuses.includes('reconnecting'));await sockets[2].message('session_welcome',{session:{id:'two'}});assert.equal(statuses.at(-1),'connected');}finally{stop();}assert.ok(sockets.every(s=>s.closed));
});
test('expired generation lease recovers without server restart and rejects stale completion',()=>{
 const q=new SkinQueue(),job=q.request('u','a custom pet',1000),old=q.claim(job.id,1000);
 q.renew(job.id,old.lease,50000);q.recover(70000);assert.equal(q.jobs[0].status,'generating');q.recover(110001);assert.equal(q.jobs[0].status,'queued');
 const fresh=q.claim(job.id,110002);assert.throws(()=>q.finish(job.id,'/pets/old.png',110003,old.lease),/lease/);q.finish(job.id,'/pets/new.png',110003,fresh.lease);assert.equal(q.jobs[0].asset,'/pets/new.png');assert.equal(q.publicState()[0].lease,undefined);
});
test('active viewers and public state are bounded while custom art survives inactivity',()=>{
 let now=1000;const g=new Game([],{clock:()=>now,idleMs:100,maxPlayers:100});const q=new SkinQueue();const job=q.request('0','a custom pet',now);q.finish(job.id,'/pets/keeper.png');
 for(let i=0;i<6000;i++)g.chat(String(i),'viewer'+i,'hello');assert.equal(g.players.size,100);assert.ok(Buffer.byteLength(JSON.stringify(g.snapshot()))<100000);
 now+=101;g.prune();assert.equal(g.players.size,0);g.chat('0','viewer0','back');assert.equal(q.publicState(new Set(g.players.keys()))[0].asset,'/pets/keeper.png');
 const restored=new Game(Array.from({length:6000},(_,i)=>({id:String(i),lastSeen:now,name:'viewer',appearance:{seed:1}})),{clock:()=>now});assert.equal(restored.players.size,100);
});
test('hung generation command times out instead of blocking the queue indefinitely',async()=>{
 await assert.rejects(runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:40}),/timed out/);
});

test('transient validation failure does not tear down an already healthy chat socket',async()=>{
 let stops=0,attempts=0;const auth=new TwitchAuth({clientId:'c',broadcasterId:'u',accessToken:'old',save:async()=>{},start:()=>{},stop:()=>stops++,status:()=>{},fetchImpl:async()=>{if(++attempts===2)throw Error('network');return {ok:true,json:async()=>identity};}});
 try{await auth.check();clearTimeout(auth.timer);await auth.check();assert.equal(stops,0);assert.equal(auth.running,true);}finally{auth.close();}
});
