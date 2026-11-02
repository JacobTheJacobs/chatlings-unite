import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile,mkdir,rename,access,stat,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {Game} from './game.mjs';
import {DEFAULT_PETS,nicknamePrompt,handlePetChat} from './pet-catalog.mjs';
import {connectChat} from './twitch.mjs';
import {SkinQueue,validateAtlas} from './skins.mjs';
import {PetBrain} from './pet-brain.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.DATA_DIR||path.join(root,'data');
const port=Number(process.env.PORT||3010), base=process.env.PUBLIC_URL||`http://localhost:${port}`;
const localBase=`http://localhost:${port}`;
const allowedOrigins=new Set([new URL(base).origin,localBase]);
const requestOrigin=req=>{const host=req.headers.host;for(const origin of allowedOrigins)if(new URL(origin).host===host)return origin;return null;};
let broadcasterLogin=process.env.TWITCH_CHANNEL||null;
const demo=process.env.DEMO_MODE!=='false', hostKey=process.env.HOST_KEY||'';
if(!demo&&!hostKey) throw Error('HOST_KEY is required when DEMO_MODE=false');
let saved=[]; try {saved=JSON.parse(await readFile(path.join(dataDir,'players.json'),'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;}
let savedSkins=[];try{savedSkins=JSON.parse(await readFile(path.join(dataDir,'skins.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const skins=new SkinQueue(savedSkins);
let sampleSkin=false;try{await access(path.join(root,'public/pets/mossbyte.png'));sampleSkin=true;}catch{}
const game=new Game(saved.filter(p=>demo||!p.id.startsWith('demo-')));
const brain=new PetBrain(game,{apiKey:process.env.CODEX_PET_API_KEY||'',workspace:path.join(dataDir,'pet-planner')});
const sessions=new Map(), oauth=new Map(), clients=new Set(), limits=new Map(); let twitchStatus='not configured';
const cookie=(req,key)=>req.headers.cookie?.split('; ').find(s=>s.startsWith(key+'='))?.slice(key.length+1);
const session=req=>{const s=sessions.get(cookie(req,'session')); return s&&s.expires>Date.now()?s:null;};
const safeEqual=(a,b)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);};
const localChatSetup=req=>requestOrigin(req)===localBase&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const host=req=>{if(process.env.TWITCH_BROADCASTER_ID&&session(req)?.user.id===process.env.TWITCH_BROADCASTER_ID)return true;if(hostKey) return safeEqual(req.headers['x-host-key']||'',hostKey); return demo&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);};
function issue(req,res,identity) {const id=randomBytes(32).toString('hex');sessions.set(id,{...identity,expires:Date.now()+86400000});res.setHeader('Set-Cookie',`session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${requestOrigin(req)?.startsWith('https:')?'; Secure':''}`);}
function json(res,value,status=200) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req) {let text='';for await(const chunk of req) {text+=chunk;if(text.length>4096) throw Error('Request too large');} return JSON.parse(text||'{}');}
async function alive(pidFile,needle){try{const pid=Number(await readFile(path.join(dataDir,pidFile),'utf8'));if(!Number.isSafeInteger(pid)||pid<2)return false;return (await readFile('/proc/'+pid+'/cmdline','utf8')).includes(needle);}catch{return false;}}
async function desktopMode(){try{const s=JSON.parse(await readFile(path.join(dataDir,'desktop-settings.json'),'utf8'));return ['walk','physics'].includes(s.mode)?s.mode:'walk';}catch{return 'walk';}}
async function adminStatus(){return {chat:twitchStatus,desktop:{running:await alive('desktop-overlay.pid','overlay.py'),mode:await desktopMode()},hatchery:{running:await alive('hatchery-worker.pid','hatchery-worker.mjs')}};}
let desktopChanging=false;
async function controlDesktop(enabled){
 if(desktopChanging)throw Error('Desktop pets are already changing');desktopChanging=true;
 try{
  if(enabled&&(await adminStatus()).desktop.running)return;
  await mkdir(dataDir,{recursive:true});const log=await open(path.join(dataDir,'desktop-launch.log'),'a',0o600);
  try{const child=spawn('/usr/bin/python3',[path.join(root,'desktop/overlay.py'),...(enabled?['--url',localBase]:['--stop'])],{cwd:root,detached:enabled,stdio:['ignore',log.fd,log.fd]});
   if(enabled){await once(child,'spawn');child.unref();await new Promise(resolve=>setTimeout(resolve,350));if(!(await adminStatus()).desktop.running)throw Error('Could not start desktop pets on the streaming computer');}
   else {const [code]=await once(child,'exit');if(code!==0)throw Error('Could not stop desktop pets');for(let i=0;i<20&&(await adminStatus()).desktop.running;i++)await new Promise(resolve=>setTimeout(resolve,50));}
  }finally{await log.close();}
 }finally{desktopChanging=false;}
}
const server=http.createServer(async(req,res)=>{
  try {
    const origin=requestOrigin(req);if(!origin)return json(res,{error:'Unknown host'},403);
    const url=new URL(req.url,origin), route=url.pathname;
    if(req.method==='POST') { if(req.headers.origin && req.headers.origin!==origin) return json(res,{error:'Origin denied'},403); }
    if(route==='/api/admin/status'&&req.method==='GET'){if(!host(req))return json(res,{error:'Streamer sign-in required'},403);return json(res,await adminStatus());}
    if(route==='/api/state'&&req.method==='GET')return json(res,worldState());
    if(route==='/api/events') {if(clients.size>=250) return json(res,{error:'Room full'},503); res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
    if(route==='/api/skins/host'&&req.method==='GET'){if(!host(req))return json(res,{error:'Host key required'},403);return json(res,skins.jobs);}
    if(route==='/api/me') return json(res,{user:session(req)?.user||null,channel:broadcasterLogin||game.players.get(process.env.TWITCH_BROADCASTER_ID)?.name||null,demo,sampleSkin,twitchStatus,host:host(req),viewerUrl:base+'/controller',oauth:!!process.env.TWITCH_CLIENT_ID});
    if(route==='/auth/twitch'||route==='/auth/chat') {
      const chat=route==='/auth/chat';if(chat&&!localChatSetup(req))return json(res,{error:'Chat setup is available only from the local demo host'},403);
      if(!process.env.TWITCH_CLIENT_ID||!process.env.TWITCH_CLIENT_SECRET) return json(res,{error:'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env'},503);
      const state=randomBytes(24).toString('hex');oauth.set(state,{expires:Date.now()+600000,kind:chat?'chat':'viewer',returnTo:url.searchParams.get('admin')==='1'?'/admin':'/',redirectUri:origin+'/auth/callback'});
      res.setHeader('Set-Cookie',`oauth=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${requestOrigin(req)?.startsWith('https:')?'; Secure':''}`);
      const target=new URL('https://id.twitch.tv/oauth2/authorize');target.search=new URLSearchParams({client_id:process.env.TWITCH_CLIENT_ID,redirect_uri:origin+'/auth/callback',response_type:'code',scope:chat?'user:read:chat':'',state});res.writeHead(302,{Location:target.href});res.end();return;
    }
    if(route==='/auth/callback') {
      const state=url.searchParams.get('state');const auth=oauth.get(state); if(!state||cookie(req,'oauth')!==state||!(auth?.expires>Date.now())||(auth.kind==='chat'&&!localChatSetup(req))) return json(res,{error:'Invalid or expired OAuth state'},403);oauth.delete(state);
      const tokenResponse=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:process.env.TWITCH_CLIENT_ID,client_secret:process.env.TWITCH_CLIENT_SECRET,code:url.searchParams.get('code')||'',grant_type:'authorization_code',redirect_uri:auth.redirectUri})});
      if(!tokenResponse.ok) throw Error('Twitch sign-in failed'); const token=await tokenResponse.json();
      const response=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${token.access_token}`}});if(!response.ok) throw Error('Twitch token validation failed');const identity=await response.json();
      if(identity.client_id!==process.env.TWITCH_CLIENT_ID) throw Error('Token client mismatch');
      if(auth.kind==='chat'){
        if(!identity.user_id||!identity.scopes?.includes('user:read:chat'))throw Error('Twitch chat permission was not granted');
        const envPath=path.join(root,'.env');let contents=await readFile(envPath,'utf8');
        for(const [key,value] of Object.entries({TWITCH_BROADCASTER_ID:identity.user_id,TWITCH_CHAT_TOKEN:token.access_token})){
          if(!/^[a-zA-Z0-9]+$/.test(value))throw Error('Unexpected Twitch token response');
          const pattern=new RegExp('^'+key+'=.*$','m');contents=pattern.test(contents)?contents.replace(pattern,key+'='+value):contents+'\n'+key+'='+value+'\n';process.env[key]=value;
        }
        await writeFile(envPath,contents,{mode:0o600});await import('node:fs/promises').then(fs=>fs.chmod(envPath,0o600));
        broadcasterLogin=identity.login||broadcasterLogin;startChat(token.access_token,identity.user_id);res.writeHead(302,{Location:'/admin?chat=connecting'});res.end();return;
      }
      const user={id:identity.user_id,name:identity.login};issue(req,res,{user});game.spawn(user.id,user.name);res.writeHead(302,{Location:auth.returnTo||'/'});res.end();return;
    }
    if(route.startsWith('/api/')&&req.method==='POST') {
      const identityKey=session(req)?.user.id||req.socket.remoteAddress; const now=Date.now(); let limit=limits.get(identityKey); if(!limit||now-limit.at>1000){limit={at:now,count:0};limits.set(identityKey,limit);} if(++limit.count>30)return json(res,{error:'Slow down'},429);
      const b=await body(req);
      if(route==='/api/admin/desktop-settings'){if(!host(req))return json(res,{error:'Streamer sign-in required'},403);if(!['walk','physics'].includes(b.mode))throw Error('Choose walk or physics');await mkdir(dataDir,{recursive:true});const file=path.join(dataDir,'desktop-settings.json');await writeFile(file+'.tmp',JSON.stringify({mode:b.mode}),{mode:0o600});await rename(file+'.tmp',file);return json(res,{mode:b.mode});}
      if(route==='/api/admin/desktop'){if(!host(req))return json(res,{error:'Streamer sign-in required'},403);if(typeof b.enabled!=='boolean')throw Error('Choose on or off');await controlDesktop(b.enabled);return json(res,{ok:true});}
      if(route==='/api/pet'){if(!host(req))return json(res,{error:'Host key required'},403);const user=session(req)?.user;if(!user)throw Error('Sign in before controlling the pet');brain.configure({enabled:b.enabled,personality:b.personality,instruction:b.instruction,ownerId:user.id});return json(res,{ok:true});}
      if(route==='/api/skins/host'){if(!host(req))return json(res,{error:'Host key required'},403);let job;if(b.action==='assign'){job=await assignCustom(String(b.userId));}else if(b.action==='claim')job=skins.claim(b.id);else if(b.action==='fail')job=skins.fail(b.id);else if(b.action==='complete'){if(!/^\/pets\/[a-zA-Z0-9_-]+\.png$/.test(b.asset||''))throw Error('Invalid asset path');await validateAtlas(path.join(root,'public',b.asset));job=skins.finish(b.id,b.asset);game.log('A custom creature is hatching in the grove!');}else throw Error('Unknown hatchery action');await persist();return json(res,job);}
      if(route==='/api/demo') {if(!demo) return json(res,{error:'Demo disabled'},403);let user=session(req)?.user;if(!user) user={id:'demo-'+randomBytes(8).toString('hex'),name:String(b.name||'you').slice(0,25)};issue(req,res,{user});game.spawn(user.id,user.name);return json(res,{user});}
      if(route==='/api/host') {
        if(!host(req)) return json(res,{error:'Host key required'},403);
        if(b.action==='bots') {for(let i=0;i<5;i++)game.spawn('sim-'+i,['moss.exe','peachy','lunarbyte','tinywizard','fern'][i],true);}
        else if(b.action==='fuse-demo') {const user=session(req)?.user;if(!user) throw Error('Enter demo first');game.reset();game.join(user.id);for(let i=0;i<2;i++){game.spawn('sim-'+i,['moss.exe','peachy'][i],true);game.join('sim-'+i);}}
        else if(b.action==='skin-demo'){if(!demo)throw Error('Sample hatching is a demo-only action');const user=session(req)?.user;if(!user)throw Error('Enter demo first');await validateAtlas(path.join(root,'public/pets/mossbyte.png'));const job=skins.request(user.id,'Mossbyte · pre-generated Clawmate sample');skins.finish(job.id,'/pets/mossbyte.png');game.log('Mossbyte sample skin hatched · pre-generated with Clawmate');await persist();}
        else if(b.action==='build'){game.startBuild();brain.requestDecision('build_started');}
        else if(b.action==='challenge'){game.challenge();brain.requestDecision('boss_started');}else if(b.action==='reset')game.reset();else throw Error('Unknown host action');return json(res,{ok:true});
      }
      const s=session(req);if(!s) return json(res,{error:'Sign in to control a character'},401);
      if(route==='/api/skins')return json(res,{error:'Custom pets are assigned by the streamer'},403);
      if(route==='/api/ability-choice')game.chooseAbility(s.user.id,b.ability);else if(route==='/api/power')game.useAbility(s.user.id);else if(route==='/api/interact')game.interact(s.user.id);else if(route==='/api/jump')game.jump(s.user.id);else if(route==='/api/input') game.input(s.user.id,b);else if(route==='/api/join')game.join(s.user.id);else if(route==='/api/action') game.action(s.user.id,b.action);else return json(res,{error:'Not found'},404);
      return json(res,{ok:true});
    }
    if(req.method!=='GET') return json(res,{error:'Method not allowed'},405);
    const file=route==='/overlay'?'game-view.html':['/','/controller','/admin'].includes(route)?'index.html':decodeURIComponent(route).replace(/^\//,'');
    const target=path.resolve(root,'public',file);if(!target.startsWith(path.join(root,'public')+path.sep))return json(res,{error:'Not found'},404);
    let data;try{data=await readFile(target);}catch{return json(res,{error:'Not found'},404);}
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json'};
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'"});res.end(data);
  } catch(error) {json(res,{error:error.message},400);}
});
const worldState=()=>({...game.snapshot(),defaultPets:DEFAULT_PETS,aiPet:brain.snapshot(),skins:skins.publicState(),twitchStatus});
setInterval(()=>{game.update(.05);brain.update(.05);const packet=`data: ${JSON.stringify(worldState())}\n\n`;for(const client of clients) {if(client.writableLength>262144){client.destroy();clients.delete(client);}else client.write(packet);}},50).unref();
let saveChain=Promise.resolve();function persist(){saveChain=saveChain.catch(()=>{}).then(async()=>{await mkdir(dataDir,{recursive:true});await writeFile(path.join(dataDir,'players.json.tmp'),JSON.stringify(game.snapshot().players.filter(p=>!p.simulated)));await rename(path.join(dataDir,'players.json.tmp'),path.join(dataDir,'players.json'));await writeFile(path.join(dataDir,'skins.json.tmp'),JSON.stringify(skins.jobs));await rename(path.join(dataDir,'skins.json.tmp'),path.join(dataDir,'skins.json'));});return saveChain;}
setInterval(()=>{persist().catch(console.error);for(const [id,s]of sessions)if(s.expires<Date.now())sessions.delete(id);for(const[id,entry]of oauth)if(entry.expires<Date.now())oauth.delete(id);for(const[id,limit]of limits)if(Date.now()-limit.at>10000)limits.delete(id);},10000).unref();
let stopChat;
async function assignCustom(userId){const player=game.players.get(userId);if(!player)throw Error('Choose a viewer who has chatted first');const job=skins.request(player.id,nicknamePrompt(player.name));job.nickname=player.name;job.requestedBy='admin';game.log('Custom pet commissioned for '+player.name);await persist();return job;}
const handleChat=(id,name,text)=>handlePetChat(game,{id,name,text},process.env.TWITCH_BROADCASTER_ID,assignCustom);
function startChat(token,broadcasterId){
 stopChat?.();twitchStatus='connecting';stopChat=connectChat({token,clientId:process.env.TWITCH_CLIENT_ID,broadcasterId,onMessage:handleChat,onSpawn:(id,name)=>{game.spawn(id,name);brain.requestDecision('viewer_joined');},onStatus:s=>{twitchStatus=s;}});
}
if(process.env.TWITCH_CHAT_TOKEN&&process.env.TWITCH_CLIENT_ID&&process.env.TWITCH_BROADCASTER_ID){
 try{const validation=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${process.env.TWITCH_CHAT_TOKEN}`}});const v=await validation.json();
 if(!validation.ok||v.user_id!==process.env.TWITCH_BROADCASTER_ID||v.client_id!==process.env.TWITCH_CLIENT_ID||!v.scopes?.includes('user:read:chat'))twitchStatus='token invalid; reconnect chat';else {broadcasterLogin=v.login||broadcasterLogin;startChat(process.env.TWITCH_CHAT_TOKEN,process.env.TWITCH_BROADCASTER_ID);};
 }catch{twitchStatus='Twitch validation unavailable';}
}
setInterval(async()=>{if(!process.env.TWITCH_CHAT_TOKEN)return;try{const r=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${process.env.TWITCH_CHAT_TOKEN}`}});if(!r.ok){twitchStatus='token expired; reconnect chat';stopChat?.();}}catch{twitchStatus='token validation unavailable';}},3600000).unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{stopChat?.();await persist().catch(console.error);for(const client of clients)client.end();server.close(()=>process.exit(0));});
server.listen(port,'0.0.0.0',()=>console.log(`Chatlings → ${base}\nController → ${base}/controller\nOBS → ${base}/overlay`));
