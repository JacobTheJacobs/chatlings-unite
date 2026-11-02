// Temporary demo hosting: the Node server remains on this machine.
import {readFile,writeFile,mkdir,access,chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import net from 'node:net';
const root=fileURLToPath(new URL('..',import.meta.url));process.chdir(root);
try{process.loadEnvFile('.env');}catch{console.error('Copy .env.example to .env and configure Twitch first.');process.exit(1);}
const port=Number(process.env.PORT||3010);
const occupied=await new Promise(resolve=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));});
if(occupied){console.error(`Port ${port} is in use. Stop the existing Chatlings server before running npm run share.`);process.exit(1);}
if(process.platform!=='linux'||process.arch!=='x64'){console.error('This helper supports Linux x64. Install cloudflared for your platform manually.');process.exit(1);}
const binary=path.join(root,'.tools/cloudflared');
try{await access(binary);}catch{await mkdir(path.dirname(binary),{recursive:true});console.log('Downloading the official Cloudflare tunnel client…');const response=await fetch('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64');if(!response.ok)throw Error('Could not download cloudflared');await writeFile(binary,Buffer.from(await response.arrayBuffer()));await chmod(binary,0o755);}
const tunnel=spawn(binary,['tunnel','--url',`http://localhost:${port}`,'--no-autoupdate','--protocol','http2'],{stdio:['ignore','ignore','pipe']});
const hostname=await new Promise((resolve,reject)=>{let buffer='';const timeout=setTimeout(()=>reject(Error('Tunnel startup timed out')),45000);tunnel.once('error',reject);tunnel.once('exit',()=>reject(Error('Tunnel exited before publishing a URL')));tunnel.stderr.on('data',chunk=>{buffer+=chunk;const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match){clearTimeout(timeout);resolve(match[0]);}if(buffer.length>32768)buffer=buffer.slice(-8192);});}).catch(error=>{tunnel.kill();console.error(error.message);process.exit(1);});
process.on('exit',()=>tunnel.kill());
const values={PUBLIC_URL:hostname,DEMO_MODE:'false',HOST_KEY:process.env.HOST_KEY||randomBytes(32).toString('hex')};let env=await readFile('.env','utf8');for(const[key,value]of Object.entries(values)){const re=new RegExp('^'+key+'=.*$','m');env=re.test(env)?env.replace(re,key+'='+value):env+'\n'+key+'='+value+'\n';process.env[key]=value;}await writeFile('.env',env,{mode:0o600});await chmod('.env',0o600);
console.log(`Viewer page: ${hostname}/\nStreamer admin: http://localhost:${port}/admin\nOptional remote-admin Twitch redirect: ${hostname}/auth/callback\nThe address changes after restarting this helper. Keep this terminal and computer running.`);
await import('../server.mjs');
