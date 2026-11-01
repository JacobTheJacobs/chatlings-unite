import http from 'node:http';
import {readFile,writeFile,mkdir,rename,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {Game} from './game.mjs';
import {connectChat} from './twitch.mjs';
import {SkinQueue,validateAtlas} from './skins.mjs';
import {PetBrain} from './pet-brain.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.DATA_DIR||path.join(root,'data');
const port=Number(process.env.PORT||3000), base=process.env.PUBLIC_URL||`http://localhost:${port}`;
const demo=process.env.DEMO_MODE!=='false', hostKey=process.env.HOST_KEY||'';
if(!demo&&!hostKey) throw Error('HOST_KEY is required when DEMO_MODE=false');
let saved=[]; try {saved=JSON.parse(await readFile(path.join(dataDir,'players.json'),'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;}
let savedSkins=[];try{savedSkins=JSON.parse(await readFile(path.join(dataDir,'skins.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const skins=new SkinQueue(savedSkins);
let sampleSkin=false;try{await access(path.join(root,'public/pets/mossbyte.png'));sampleSkin=true;}catch{}
const game=new Game(saved);
const brain=new PetBrain(game,{apiKey:process.env.CODEX_PET_API_KEY||'',workspace:path.join(dataDir,'pet-planner')});
const sessions=new Map(), oauth=new Map(), clients=new Set(), limits=new Map(); let twitchStatus='not configured';
const cookie=(req,key)=>req.headers.cookie?.split('; ').find(s=>s.startsWith(key+'='))?.slice(key.length+1);
const session=req=>{const s=sessions.get(cookie(req,'session')); return s&&s.expires>Date.now()?s:null;};
const safeEqual=(a,b)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const host=req=>{if(hostKey) return safeEqual(req.headers['x-host-key']||'',hostKey); return demo&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);};
function issue(res,identity) {const id=randomBytes(32).toString('hex');sessions.set(id,{...identity,expires:Date.now()+86400000});res.setHeader('Set-Cookie',`session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${base.startsWith('https:')?'; Secure':''}`);}
function json(res,value,status=200) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req) {let text='';for await(const chunk of req) {text+=chunk;if(text.length>4096) throw Error('Request too large');} return JSON.parse(text||'{}');}
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,base), route=url.pathname;
    if(req.method==='POST') { if(req.headers.origin && req.headers.origin!==new URL(base).origin) return json(res,{error:'Origin denied'},403); }
    if(route==='/api/events') {if(clients.size>=250) return json(res,{error:'Room full'},503); res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
    if(route==='/api/skins/host'&&req.method==='GET'){if(!host(req))return json(res,{error:'Host key required'},403);return json(res,skins.jobs);}
    if(route==='/api/me') return json(res,{user:session(req)?.user||null,demo,sampleSkin,twitchStatus,host:host(req),oauth:!!process.env.TWITCH_CLIENT_ID});
    if(route==='/auth/twitch') {
      if(!process.env.TWITCH_CLIENT_ID||!process.env.TWITCH_CLIENT_SECRET) return json(res,{error:'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env'},503);
      const state=randomBytes(24).toString('hex');oauth.set(state,Date.now()+600000);
      res.setHeader('Set-Cookie',`oauth=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${base.startsWith('https:')?'; Secure':''}`);
      const target=new URL('https://id.twitch.tv/oauth2/authorize');target.search=new URLSearchParams({client_id:process.env.TWITCH_CLIENT_ID,redirect_uri:base+'/auth/callback',response_type:'code',scope:'',state});res.writeHead(302,{Location:target.href});res.end();return;
    }
    if(route==='/auth/callback') {
      const state=url.searchParams.get('state'); if(!state||cookie(req,'oauth')!==state||!(oauth.get(state)>Date.now())) return json(res,{error:'Invalid or expired OAuth state'},403);oauth.delete(state);
      const tokenResponse=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:process.env.TWITCH_CLIENT_ID,client_secret:process.env.TWITCH_CLIENT_SECRET,code:url.searchParams.get('code')||'',grant_type:'authorization_code',redirect_uri:base+'/auth/callback'})});
      if(!tokenResponse.ok) throw Error('Twitch sign-in failed'); const token=await tokenResponse.json();
      const response=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${token.access_token}`}});if(!response.ok) throw Error('Twitch token validation failed');const identity=await response.json();
      if(identity.client_id!==process.env.TWITCH_CLIENT_ID) throw Error('Token client mismatch');
      const user={id:identity.user_id,name:identity.login};issue(res,{user});game.spawn(user.id,user.name);res.writeHead(302,{Location:'/controller'});res.end();return;
    }
    if(route.startsWith('/api/')&&req.method==='POST') {
      const identityKey=session(req)?.user.id||req.socket.remoteAddress; const now=Date.now(); let limit=limits.get(identityKey); if(!limit||now-limit.at>1000){limit={at:now,count:0};limits.set(identityKey,limit);} if(++limit.count>30)return json(res,{error:'Slow down'},429);
      const b=await body(req);
      if(route==='/api/pet'){if(!host(req))return json(res,{error:'Host key required'},403);const user=session(req)?.user;if(!user)throw Error('Sign in before controlling the pet');brain.configure({enabled:b.enabled,personality:b.personality,instruction:b.instruction,ownerId:user.id});return json(res,{ok:true});}
      if(route==='/api/skins/host'){if(!host(req))return json(res,{error:'Host key required'},403);let job;if(b.action==='claim')job=skins.claim(b.id);else if(b.action==='fail')job=skins.fail(b.id);else if(b.action==='complete'){if(!/^\/pets\/[a-zA-Z0-9_-]+\.png$/.test(b.asset||''))throw Error('Invalid asset path');await validateAtlas(path.join(root,'public',b.asset));job=skins.finish(b.id,b.asset);game.log('A custom creature is hatching in the grove!');}else throw Error('Unknown hatchery action');await persist();return json(res,job);}
      if(route==='/api/demo') {if(!demo) return json(res,{error:'Demo disabled'},403);let user=session(req)?.user;if(!user) user={id:'demo-'+randomBytes(8).toString('hex'),name:String(b.name||'you').slice(0,25)};issue(res,{user});game.spawn(user.id,user.name);return json(res,{user});}
      if(route==='/api/host') {
        if(!host(req)) return json(res,{error:'Host key required'},403);
        if(b.action==='bots') {for(let i=0;i<5;i++)game.spawn('sim-'+i,['moss.exe','peachy','lunarbyte','tinywizard','fern'][i],true);}
        else if(b.action==='fuse-demo') {const user=session(req)?.user;if(!user) throw Error('Enter demo first');game.reset();game.join(user.id);for(let i=0;i<2;i++){game.spawn('sim-'+i,['moss.exe','peachy'][i],true);game.join('sim-'+i);}}
        else if(b.action==='skin-demo'){if(!demo)throw Error('Sample hatching is a demo-only action');const user=session(req)?.user;if(!user)throw Error('Enter demo first');await validateAtlas(path.join(root,'public/pets/mossbyte.png'));const job=skins.request(user.id,'Mossbyte · pre-generated Clawmate sample');skins.finish(job.id,'/pets/mossbyte.png');game.log('Mossbyte sample skin hatched · pre-generated with Clawmate');await persist();}
        else if(b.action==='build'){game.startBuild();brain.requestDecision('build_started');}
        else if(b.action==='challenge'){game.challenge();brain.requestDecision('boss_started');}else if(b.action==='reset')game.reset();else throw Error('Unknown host action');return json(res,{ok:true});
      }
      const s=session(req);if(!s) return json(res,{error:'Sign in to control a character'},401);
      if(route==='/api/skins'){const job=skins.request(s.user.id,b.prompt);await persist();return json(res,job);}
      if(route==='/api/ability-choice')game.chooseAbility(s.user.id,b.ability);else if(route==='/api/power')game.useAbility(s.user.id);else if(route==='/api/interact')game.interact(s.user.id);else if(route==='/api/jump')game.jump(s.user.id);else if(route==='/api/input') game.input(s.user.id,b);else if(route==='/api/join')game.join(s.user.id);else if(route==='/api/action') game.action(s.user.id,b.action);else return json(res,{error:'Not found'},404);
      return json(res,{ok:true});
    }
    if(req.method!=='GET') return json(res,{error:'Method not allowed'},405);
    const file=['/','/controller','/overlay'].includes(route)?'index.html':decodeURIComponent(route).replace(/^\//,'');
    const target=path.resolve(root,'public',file);if(!target.startsWith(path.join(root,'public')+path.sep))return json(res,{error:'Not found'},404);
    let data;try{data=await readFile(target);}catch{return json(res,{error:'Not found'},404);}
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json'};
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'"});res.end(data);
  } catch(error) {json(res,{error:error.message},400);}
});
setInterval(()=>{game.update(.05);brain.update(.05);const packet=`data: ${JSON.stringify({...game.snapshot(),aiPet:brain.snapshot(),skins:skins.publicState(),twitchStatus})}\n\n`;for(const client of clients) {if(client.writableLength>262144){client.destroy();clients.delete(client);}else client.write(packet);}},50).unref();
let saveChain=Promise.resolve();function persist(){saveChain=saveChain.catch(()=>{}).then(async()=>{await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'players.json.tmp'),JSON.stringify(game.snapshot().players.filter(p=>!p.simulated)));await rename(path.join(dataDir,'players.json.tmp'),path.join(dataDir,'players.json'));await writeFile(path.join(dataDir,'skins.json.tmp'),JSON.stringify(skins.jobs));await rename(path.join(dataDir,'skins.json.tmp'),path.join(dataDir,'skins.json'));});return saveChain;}
setInterval(()=>{persist().catch(console.error);for(const [id,s]of sessions)if(s.expires<Date.now())sessions.delete(id);for(const[id,expiry]of oauth)if(expiry<Date.now())oauth.delete(id);for(const[id,limit]of limits)if(Date.now()-limit.at>10000)limits.delete(id);},10000).unref();
if(process.env.TWITCH_CHAT_TOKEN&&process.env.TWITCH_CLIENT_ID&&process.env.TWITCH_BROADCASTER_ID){
 const validation=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${process.env.TWITCH_CHAT_TOKEN}`}});const v=await validation.json();
 if(!validation.ok||v.user_id!==process.env.TWITCH_BROADCASTER_ID||v.client_id!==process.env.TWITCH_CLIENT_ID||!v.scopes?.includes('user:read:chat'))throw Error('TWITCH_CHAT_TOKEN must belong to broadcaster and client, with user:read:chat scope');
 connectChat({token:process.env.TWITCH_CHAT_TOKEN,clientId:process.env.TWITCH_CLIENT_ID,broadcasterId:process.env.TWITCH_BROADCASTER_ID,onSpawn:(id,name)=>{game.spawn(id,name);brain.requestDecision('viewer_joined');},onStatus:s=>{twitchStatus=s;}});
 setInterval(async()=>{try{const r=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${process.env.TWITCH_CHAT_TOKEN}`}});if(!r.ok){twitchStatus='token expired; restart with renewed token';}}catch{twitchStatus='token validation unavailable';}},3600000).unref();
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await persist().catch(console.error);for(const client of clients)client.end();server.close(()=>process.exit(0));});
server.listen(port,'0.0.0.0',()=>console.log(`Chatlings → ${base}\nController → ${base}/controller\nOBS → ${base}/overlay`));
