import {randomUUID} from 'node:crypto';
export {validateAtlas} from './atlas.mjs';
export class SkinQueue {
 constructor(jobs=[]) {this.jobs=jobs;for(const job of jobs)if(job.status==='generating'){job.status='queued';delete job.lease;delete job.leaseUntil;}}
 recover(now=Date.now()){for(const j of this.jobs)if(j.status==='generating'&&(!j.leaseUntil||j.leaseUntil<=now)){j.status='queued';delete j.lease;delete j.leaseUntil;}}
 request(userId,prompt,now=Date.now()) {
  this.recover(now);prompt=String(prompt||'').trim();if(prompt.length<8||prompt.length>700)throw Error('Describe your creature in 8–700 characters');
  if(this.jobs.some(j=>j.userId===userId&&['queued','generating'].includes(j.status)))throw Error('You already have a creature waiting to hatch');
  if(this.jobs.some(j=>j.userId===userId&&now-j.createdAt<600000))throw Error('One customization request every ten minutes');
  if(this.jobs.filter(j=>['queued','generating'].includes(j.status)).length>=20)throw Error('The hatchery is full. Try again later');
  const job={id:randomUUID(),userId,prompt,status:'queued',createdAt:now};this.jobs.push(job);return job;
 }
 claim(id,now=Date.now()){this.recover(now);const j=this.jobs.find(j=>j.id===id);if(!j||j.status!=='queued')throw Error('Queued job not found');if(this.jobs.some(j=>j.status==='generating'))throw Error('Another creature is being generated');Object.assign(j,{status:'generating',lease:randomUUID(),leaseUntil:now+60000});return {...j};}
 owned(id,lease,now=Date.now()){const j=this.jobs.find(j=>j.id===id);if(!j||!['queued','generating'].includes(j.status))throw Error('Active job not found');if(j.status==='generating'&&(j.lease!==lease||j.leaseUntil<=now))throw Error('Generation lease expired or changed');return j;}
 renew(id,lease,now=Date.now()){const j=this.owned(id,lease,now);if(j.status!=='generating')throw Error('Generation lease required');j.leaseUntil=now+60000;return {...j};}
 finish(id,asset,now=Date.now(),lease){const j=this.owned(id,lease,now);Object.assign(j,{status:'ready',asset,finishedAt:now});delete j.lease;delete j.leaseUntil;return j;}
 fail(id,lease){const j=this.owned(id,lease);j.status='failed';delete j.lease;delete j.leaseUntil;return j;}
 publicState(activeIds){const latest=new Map(),ready=new Map();for(const {prompt,lease,leaseUntil,...job}of this.jobs){if(activeIds&&!activeIds.has(job.userId))continue;latest.set(job.userId,job);if(job.status==='ready')ready.set(job.userId,job);}return [...new Map([...ready.values(),...latest.values()].map(j=>[j.id,j])).values()];}
}
