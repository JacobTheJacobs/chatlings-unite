import {randomUUID} from 'node:crypto';
export {validateAtlas} from './atlas.mjs';
export class SkinQueue {
 constructor(jobs=[]) {this.jobs=jobs;for(const job of jobs)if(job.status==='generating')job.status='queued';}
 request(userId,prompt,now=Date.now()) {
  prompt=String(prompt||'').trim();if(prompt.length<8||prompt.length>700)throw Error('Describe your creature in 8–700 characters');
  if(this.jobs.some(j=>j.userId===userId&&['queued','generating'].includes(j.status)))throw Error('You already have a creature waiting to hatch');
  if(this.jobs.some(j=>j.userId===userId&&now-j.createdAt<600000))throw Error('One customization request every ten minutes');
  if(this.jobs.filter(j=>['queued','generating'].includes(j.status)).length>=20)throw Error('The hatchery is full. Try again later');
  const job={id:randomUUID(),userId,prompt,status:'queued',createdAt:now};this.jobs.push(job);return job;
 }
 claim(id) {const j=this.jobs.find(j=>j.id===id);if(!j||j.status!=='queued')throw Error('Queued job not found');if(this.jobs.some(j=>j.status==='generating'))throw Error('Another creature is being generated');j.status='generating';return j;}
 finish(id,asset,now=Date.now()) {const j=this.jobs.find(j=>j.id===id);if(!j||!['generating','queued'].includes(j.status))throw Error('Active job not found');Object.assign(j,{status:'ready',asset,finishedAt:now});return j;}
 fail(id) {const j=this.jobs.find(j=>j.id===id);if(!j||!['queued','generating'].includes(j.status))throw Error('Active job not found');j.status='failed';return j;}
 publicState() {return this.jobs.map(({prompt,...job})=>job);}
}
