import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game.mjs';
test('first chat hatches one pet, messages become bounded bubbles and controls stay per viewer',()=>{
 const g=new Game();g.chat('one','alice','hello stream');g.chat('two','bob','hi');
 assert.equal(g.players.size,2);assert.equal(g.players.get('one').bubble.text,'hello stream');
 const a=g.players.get('one'),b=g.players.get('two');a.chatAt=0;g.chat('one','alice','!left');g.update(.1);
 assert.ok(a.x<140);assert.equal(b.chatMove,undefined);
 a.chatAt=0;g.chat('one','alice','!dance');assert.equal(a.emote.kind,'dance');
 a.chatAt=0;g.chat('one','alice','!stay');const x=a.x;g.update(.1);assert.equal(a.x,x);
 a.chatAt=0;g.chat('one','alice','x'.repeat(300));assert.equal(a.bubble.text.length,160);
 a.chatAt=0;g.chat('one','alice','!roam');g.update(.1);assert.notEqual(a.x,x);
});

import {DEFAULT_PETS,nicknamePrompt,handlePetChat} from '../pet-catalog.mjs';
import {SkinQueue} from '../skins.mjs';
test('five stable defaults and admin nickname commissions keep defaults until ready',()=>{
 assert.equal(DEFAULT_PETS.length,5);assert.equal(new Set(DEFAULT_PETS.map(p=>p.id)).size,5);
 const g=new Game();const p=g.spawn('viewer','toastWizard42');const index=p.appearance.seed%5;
 assert.equal(g.spawn('viewer','changed').appearance.seed%5,index);
 const prompt=nicknamePrompt(p.name);assert.ok(prompt.includes('toastWizard42'));assert.ok(prompt.includes('untrusted'));
 const q=new SkinQueue();const j=q.request(p.id,prompt);q.claim(j.id);assert.equal(q.publicState()[0].asset,undefined);
 q.finish(j.id,'/pets/custom.png');assert.equal(q.publicState()[0].asset,'/pets/custom.png');
});

test('only broadcaster chat can commission a nickname pet',async()=>{
 const game=new Game();game.spawn('target','SpaceToast');const assigned=[];
 const assign=async id=>assigned.push(id);
 await handlePetChat(game,{id:'viewer',name:'viewer',text:'!custom SpaceToast'},'admin',assign);assert.deepEqual(assigned,[]);
 await handlePetChat(game,{id:'admin',name:'host',text:'!custom @spacetoast'},'admin',assign);assert.deepEqual(assigned,['target']);
 await handlePetChat(game,{id:'admin',name:'host',text:'!custom missing'},'admin',assign);assert.equal(assigned.length,1);
});
