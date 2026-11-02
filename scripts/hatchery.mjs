// Host-side bridge. Generate assets with Clawmate; this script never generates images.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {copyFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateAtlas} from '../skins.mjs';
const [action,id,file]=process.argv.slice(2),base=process.env.PUBLIC_URL||'http://localhost:3010';
const headers={'Content-Type':'application/json','X-Host-Key':process.env.HOST_KEY||''};
async function request(data){const r=await fetch(base+'/api/skins/host',{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined});const value=await r.json();if(!r.ok)throw Error(value.error);return value;}
try{
 if(action==='list'){console.log(JSON.stringify(await request(),null,2));}
 else if(['claim','fail'].includes(action)&&id){console.log(JSON.stringify(await request({action,id,lease:process.env.HATCH_LEASE||(await request()).find(j=>j.id===id)?.lease}),null,2));}
 else if(action==='complete'&&id&&file){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid job ID');await validateAtlas(file);const dir=fileURLToPath(new URL('../public/pets/',import.meta.url));await mkdir(dir,{recursive:true});await copyFile(path.resolve(file),path.join(dir,id+'.png'));const preview=spawn(fileURLToPath(new URL('../.venv/bin/python',import.meta.url)),[fileURLToPath(new URL('./build-pet-previews.py',import.meta.url)),id],{stdio:'ignore'});const [code]=await once(preview,'exit');if(code!==0)throw Error('Could not package pet preview');console.log(JSON.stringify(await request({action,id,asset:'/pets/'+id+'.png',lease:process.env.HATCH_LEASE||(await request()).find(j=>j.id===id)?.lease}),null,2));}
 else throw Error('Usage: node --env-file-if-exists=.env scripts/hatchery.mjs list | claim JOB_ID | fail JOB_ID | complete JOB_ID /path/to/final/spritesheet.png');
}catch(error){console.error(error.message);process.exitCode=1;}
