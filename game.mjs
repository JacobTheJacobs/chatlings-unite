import { createHash } from 'node:crypto';
export const roles = ['pilot', 'shield', 'cannon'];
export function appearance(id) {
  const h = createHash('sha256').update(id).digest();
  return { color: ['#ba9cff','#6fe7c5','#ffbc79','#f78eae','#8cbfff'][h[0]%5], ears: h[1]%3, accessory: h[2]%3, seed: h.readUInt32BE(0) };
}
export class Game {
  constructor(saved = []) { this.players = new Map(saved.map(p => [p.id, {...p, input:{}, joined:false}])); this.events=[]; this.boss=null; this.fusion=null; this.tick=0; this.mission=null; this.pet=null; this.pads=[]; }
  log(text) { this.events.unshift({text, at:Date.now()}); this.events=this.events.slice(0,12); }
  spawn(id,name,simulated=false) {
    if(this.players.has(id)) return this.players.get(id);
    const p={id,name:name.slice(0,25),simulated,x:140+this.players.size*49%420,y:330,appearance:appearance(id),input:{},joined:false};
    this.players.set(id,p); this.log(`${p.name} ${simulated?'· SIM':id.startsWith('demo-')?'· DEMO':'· TWITCH'} hatched into the grove`); return p;
  }
  chat(id,name,text) {
    const p=this.spawn(id,name);const now=Date.now();p.chatPet=true;
    if(now-(p.chatAt||0)<900)return;p.chatAt=now;
    const command=String(text).trim().toLowerCase();
    if(command==='!stay'){p.emote=null;p.stay=true;p.chatMove=null;p.input={};return;}
    if(command==='!roam'){p.emote=null;p.stay=false;return;}
    const moves={'!left':[-1,0],'!right':[1,0],'!up':[0,-1],'!down':[0,1]};
    if(moves[command]){p.emote=null;p.chatMove={x:moves[command][0],y:moves[command][1],until:now+1800};return;}
    if(command==='!jump'){this.jump(id);return;}
    if(['!dance','!spin','!love','!rage','!sleep','!party'].includes(command)){p.emote={kind:command.slice(1),until:now+6000};return;}
    if(command==='!spawn')return;
    if(command.startsWith('!'))return;
    p.bubble={text:String(text).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,160),until:now+8000};
  }
  input(id,input) { const p=this.players.get(id); if(!p) throw Error('Spawn your character first'); if(Number(input.x))p.facing=Number(input.x)<0?'left':'right'; p.manualAt=Date.now(); p.input={x:Math.sign(Number(input.x)||0),y:Math.sign(Number(input.y)||0),at:Date.now()}; }
  join(id) {
    const p=this.players.get(id); if(!p) throw Error('Spawn first');
    if(this.fusion) throw Error('A fusion is already active');
    if(this.mission?.batteries.some(b=>b.carrier===id)) throw Error('Drop or deliver your battery before fusing');
    p.joined=!p.joined; this.log(`${p.name} ${p.joined?'entered':'left'} the fusion circle`);
    const team=[...this.players.values()].filter(p=>p.joined).slice(0,3);
    if(team.length===3) { this.fusion={x:450,y:315,hp:100,team:team.map((p,i)=>({id:p.id,name:p.name,role:roles[i]})),shieldUntil:0,shotAt:0,shieldAt:0}; this.log('UNITE! Three tiny souls. One giant guardian.'); }
  }
  action(id,action) {
    const f=this.fusion; if(!f) throw Error('Join three characters to fuse');
    const role=f.team.find(p=>p.id===id)?.role;
    if(role==='shield' && action==='shield' && Date.now()-f.shieldAt>1600) { f.shieldUntil=Date.now()+1100; f.shieldAt=Date.now(); }
    if(role==='cannon' && action==='fire' && Date.now()-f.shotAt>600) { f.shotAt=Date.now(); if(this.boss && Math.abs(f.y-this.boss.y)<100 && f.x<this.boss.x) { this.boss.hp=Math.max(0,this.boss.hp-8); if(!this.boss.hp) {this.log('The grove is safe. Community wins!'); this.boss=null;} } }
  }
  challenge() { if(!this.fusion) throw Error('Fuse a team first'); this.boss={hp:100,x:850,y:300,nextAttack:Date.now()+4000,attacks:0}; this.log('The Glitch has arrived. Line up your cannon. Shield its pulse!'); }
  startBuild() { this.mission={robot:{x:760,y:345},batteries:[{id:'battery-1',x:170,y:310},{id:'battery-2',x:410,y:405},{id:'battery-3',x:620,y:270}].map(b=>({...b,carrier:null,delivered:false})),delivered:0,completedAt:0,hazard:null,nextHazard:Date.now()+8000}; this.log('Build the Guardian: carry three batteries to the robot!'); }
  dropBattery(id) { const b=this.mission?.batteries.find(b=>b.carrier===id);if(!b)return;const p=id==='codex-pet'?this.pet:this.players.get(id);b.carrier=null;if(p){b.x=p.x;b.y=p.y;} }
  interact(id) { const p=this.players.get(id);if(!p)throw Error('Spawn first');if(p.joined)throw Error('Leave the fusion circle before carrying a battery');if(!this.mission||this.mission.completedAt)throw Error('Start the battery challenge first');this.carry(id,p); }
  petInteract(id){if(this.pet&&this.mission)this.carry('codex-pet',this.pet,id);}
  carry(id,p,preferred) {const m=this.mission,held=m.batteries.find(b=>b.carrier===id);if(held){if(Math.hypot(p.x-m.robot.x,p.y-m.robot.y)<55){held.carrier=null;held.delivered=true;m.delivered++;this.log(`${id==='codex-pet'?'Mossbyte':p.name} delivered a battery · ${m.delivered}/3`);if(m.delivered===3){m.completedAt=Date.now();this.log('The Guardian is awake! The grove built it together.');}}else if(id!=='codex-pet'){held.carrier=null;held.x=p.x;held.y=p.y;}return;}
   const b=m.batteries.find(b=>!b.delivered&&!b.carrier&&(!preferred||b.id===preferred)&&Math.hypot(p.x-b.x,p.y-b.y)<45);if(b){b.carrier=id;this.log(`${id==='codex-pet'?'Mossbyte':p.name} picked up a battery`);}else if(id!=='codex-pet')throw Error('Move closer to a battery'); }
  chooseAbility(id,ability){const p=this.players.get(id);if(!p)throw Error('Spawn first');if(!['spark','bounce','magnet','guardian'].includes(ability))throw Error('Unknown ability');p.ability=ability;}
  useAbility(id){const p=this.players.get(id);if(!p)throw Error('Spawn first');if(p.joined)throw Error('Leave the fusion circle first');const now=Date.now();if(now-(p.abilityAt||0)<5000)throw Error('Ability is recharging');p.abilityAt=now;const ability=p.ability||'spark';if(ability==='spark'){p.x=Math.max(35,Math.min(925,p.x+(p.facing==='left'?-90:90)));}else if(ability==='bounce'){this.pads.push({x:p.x,y:p.y,expiresAt:now+8000});}else if(ability==='magnet'){for(const b of this.mission?.batteries||[]){if(!b.delivered&&!b.carrier&&Math.hypot(b.x-p.x,b.y-p.y)<150){b.x=p.x;b.y=p.y;}}}else p.shieldUntil=now+2500;}
  jump(id){const p=this.players.get(id);if(!p)throw Error('Spawn first');if(Date.now()-(p.jumpedAt||0)>900)p.jumpedAt=Date.now();}
  update(dt) {
    this.tick++;
    for(const p of this.players.values()) {
      const now=Date.now();
      if(p.chatPet&&!p.joined&&now-(p.manualAt||0)>2500){
        if(p.emote?.until>now)p.input={};
        else if(p.chatMove?.until>now){p.input={x:p.chatMove.x,y:p.chatMove.y,at:now};p.facing=p.chatMove.x<0?'left':'right';}
        else if(!p.stay){const phase=this.tick/100+p.appearance.seed;p.input={x:Math.sin(phase)>0?1:-1,y:Math.sin(phase*.7)*.25,at:now};p.facing=p.input.x<0?'left':'right';if(this.tick%120===p.appearance.seed%120)this.jump(p.id);}
        else p.input={};
      }
      if(p.simulated) { const m=this.mission,index=Number(p.id.replace('sim-',''));const assigned=m&&!m.completedAt&&index<2?m.batteries[index]:null;const target=assigned&&!assigned.delivered?(assigned.carrier===p.id?m.robot:!assigned.carrier?assigned:null):null;if(target&&!p.joined){const dx=target.x-p.x,dy=target.y-p.y;if(Math.hypot(dx,dy)<30)this.carry(p.id,p,assigned.id);p.input={x:Math.sign(dx),y:Math.sign(dy),at:Date.now()};}else p.input={x:Math.sin(this.tick/70+p.appearance.seed)>0?1:-1,y:0,at:Date.now()}; }
      if(!p.joined && Date.now()-(p.input.at||0)<500) { const length=Math.hypot(p.input.x,p.input.y)||1; p.x=Math.max(35,Math.min(925,p.x+p.input.x/length*dt*120)); p.y=Math.max(235,Math.min(430,p.y+p.input.y/length*dt*120)); }
    }
    this.pads=this.pads.filter(p=>p.expiresAt>Date.now());for(const pad of this.pads)for(const p of this.players.values())if(!p.joined&&Math.hypot(p.x-pad.x,p.y-pad.y)<25)this.jump(p.id);
    const m=this.mission;if(m&&!m.completedAt){
      for(const b of m.batteries){if(b.carrier){const carrier=b.carrier==='codex-pet'?this.pet:this.players.get(b.carrier);if(carrier){b.x=carrier.x;b.y=carrier.y;}else b.carrier=null;}}
      if(Date.now()>m.nextHazard&&!m.hazard){const p=[...this.players.values()].find(p=>!p.joined);if(p)m.hazard={x:p.x,y:p.y,landsAt:Date.now()+1600};m.nextHazard=Date.now()+8000;}
      if(m.hazard&&Date.now()>m.hazard.landsAt){for(const p of this.players.values()){const protectedByPet=(this.pet&&this.pet.shieldUntil>Date.now()&&Math.hypot(this.pet.x-p.x,this.pet.y-p.y)<90)||[...this.players.values()].some(q=>q.shieldUntil>Date.now()&&Math.hypot(q.x-p.x,q.y-p.y)<90);if(!p.joined&&Math.hypot(p.x-m.hazard.x,p.y-m.hazard.y)<55&&Date.now()-(p.jumpedAt||0)>700&&!protectedByPet)this.dropBattery(p.id);}m.hazard=null;}
    }
    const f=this.fusion; if(!f) return;
    const pilot=this.players.get(f.team[0].id); const input=pilot?.input;
    if(input && Date.now()-(input.at||0)<500) { f.x=Math.max(80,Math.min(745,f.x+input.x*dt*140)); f.y=Math.max(245,Math.min(410,f.y+input.y*dt*100)); }
    for(const member of f.team) { if(this.players.get(member.id)?.simulated) { if(member.role==='shield' && this.boss && this.boss.nextAttack-Date.now()<900) this.action(member.id,'shield'); if(member.role==='cannon') this.action(member.id,'fire'); } }
    if(this.boss && Date.now()>this.boss.nextAttack) { const blocked=f.shieldUntil>Date.now(); f.hp-=blocked?0:22; this.boss.attacks++; this.boss.nextAttack=Date.now()+4000; this.log(blocked?'Perfect shield! The pulse was blocked.':'Glitch pulse hit! Shield before the next pulse.'); if(f.hp<=0) {this.log('Guardian scattered. Regroup and try again!'); this.reset();} }
  }
  reset() { this.fusion=null; this.boss=null; for(const p of this.players.values()) p.joined=false; }
  snapshot() { return {players:[...this.players.values()].map(({input,...p})=>({...p,moving:!!(input.x||input.y)&&Date.now()-(input.at||0)<500})),fusion:this.fusion,boss:this.boss,mission:this.mission,pads:this.pads,events:this.events}; }
}
