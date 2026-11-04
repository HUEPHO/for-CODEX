import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {growthAbilityPreview} from '../dist/growth-active.js';
import {renderGrowthAbility} from '../dist/growth-active-ui.js';
import {newRoom,changeRoom} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
function ready(){const s=createState(cards);s.growth=cards.filter(c=>c.type==='growth').map(c=>c.id);for(const p of Object.values(s.players)){p.openingChoices=null;p.assetChoices=null;p.objectiveChoices=null;}s.round=4;s.flow=newFlow(['US','CN','EU','RU'],4);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};s.players.US.hand=['cf9aa23c4a315','c21af5cf83dc5'];s.players.US.deck=['c89c153d80dbd','cfe67dfb64a6a'];return s;}
let s=ready();s.players.US.growth=['cd3313f35a370'];const max=growthAbilityPreview(s,'cd3313f35a370').maximum;assert.ok(max>0);s.players.US.exhaustedAllies=[...s.players.US.allies];assert.equal(growthAbilityPreview(s,'cd3313f35a370').maximum,0);s.players.US.exhaustedAllies=[];
let n=applyAction(s,{type:'useGrowthAbility',cardId:'cd3313f35a370',count:1});assert.equal(n.flow.pendingGrowth.choose,1);assert.equal(n.actionTurns.index,0);assert.throws(()=>applyAction(n,{type:'endAction'}));assert.throws(()=>applyAction(n,{type:'draw'}));assert.throws(()=>applyAction(n,{type:'useGrowthAbility',cardId:'cd3313f35a370',count:1}));assert.throws(()=>applyAction(n,{type:'finishGrowthAbility',cards:[]}));n=JSON.parse(JSON.stringify(n));n=applyAction(n,{type:'finishGrowthAbility',cards:['c89c153d80dbd']});assert.equal(n.players.US.discard.at(-1),'c89c153d80dbd');assert.throws(()=>applyAction(n,{type:'useGrowthAbility',cardId:'cd3313f35a370',count:1}));
s=ready();s.players.US.growth=['c7909871b7d55'];n=applyAction(s,{type:'useGrowthAbility',cardId:'c7909871b7d55'});n=applyAction(n,{type:'finishGrowthAbility',cards:['cf9aa23c4a315']});assert.deepEqual(n.players.US.trashed,['cf9aa23c4a315']);assert.ok(!n.players.US.discard.includes('cf9aa23c4a315'));assert.equal(n.flow.step,'actions');
s=ready();s.players.US.growth=['c7909871b7d55'];s.players.US.deck=[];n=applyAction(s,{type:'useGrowthAbility',cardId:'c7909871b7d55'});assert.equal(n.flow.pendingGrowth.choose,1);assert.equal(n.flow.pendingGrowth.drawn.length,0);
s=ready();s.players.US.growth=['c2ac1e1f24d0a'];const play={type:'playBasicCard',cardId:'cf9aa23c4a315',domestic:'produce',production:[]};n=applyAction(s,play);assert.equal(n.current,'US');assert.ok(n.flow.extraCard);assert.throws(()=>applyAction(n,{type:'passTurn',cardId:'c21af5cf83dc5'}));const skip=applyAction(n,{type:'endAction'});assert.equal(skip.actionTurns.index,1);n=applyAction(n,{...play,cardId:'c21af5cf83dc5'});assert.equal(n.current,'CN');assert.equal(n.actionTurns.index,1);assert.equal(n.players.US.played.length,2);
s=ready();s.players.US.growth=['c7efaad90fb20','c7909871b7d55','c386219d064c0'];s.players.US.money=100;s.players.US.resources[4]=10;n=applyAction(s,{...play,domestic:'growth',growthId:'c2ac1e1f24d0a'});assert.ok(n.flow.extraCard,'Acquiring during first turn activates immediately');
s=ready();s.players.US.growth=['c2ac1e1f24d0a'];s.players.US.assets=['test-asset'];n=applyAction(s,play);assert.throws(()=>applyAction(n,{type:'playExtraAsset',cardId:'test-asset'}));n=applyAction(n,{type:'playExtraAsset',cardId:'test-asset',cover:'c21af5cf83dc5'});assert.ok(n.players.US.usedAssets.includes('test-asset'));assert.ok(n.players.US.faceDownPlayed.includes('c21af5cf83dc5'));assert.equal(n.current,'US');n=applyAction(n,{type:'endAction'});assert.equal(n.current,'CN');
s=ready();s.players.US.growth=['c2ac1e1f24d0a'];s.actionTurns.completed.US=1;n=applyAction(s,play);assert.equal(n.current,'CN');s.round=s.flow.round=3;s.actionTurns.completed.US=0;n=applyAction(s,play);assert.equal(n.current,'CN');
// Latest user ruling limits both active draw abilities to the action phase.
for(const cardId of ['cd3313f35a370','c0b656530511c','c7909871b7d55','c92d9ad4ae11a']){
 for(const step of ['countries','order','production','focus','research','events','aftermath','roundEnd']){
  s=ready();s.players.US.growth=[cardId];s.flow.step=step;
  if(step==='order')s.flow.draft={queue:[...s.flow.order],slots:[null,null,null,null]};
  const before=JSON.stringify(s);
  assert.throws(()=>growthAbilityPreview(s,cardId),/仅能在行动阶段/);
  assert.match(renderGrowthAbility(s,cardId),/仅能在行动阶段/);
  assert.ok(!renderGrowthAbility(s,cardId).includes('data-card-action'));
  assert.throws(()=>applyAction(s,{type:'useGrowthAbility',cardId,count:1}),/仅能在行动阶段/);
  assert.equal(JSON.stringify(s),before,'Rejected ability must not draw, consume usage, or alter rewards');
  if(step==='research'){
   s=applyAction(s,{type:'startResearch'});const started=JSON.stringify(s);
   assert.throws(()=>applyAction(s,{type:'useGrowthAbility',cardId,count:1}),/仅能在行动阶段/);
   assert.equal(JSON.stringify(s),started);
  }
 }
}
// Room commands enforce the same rule; rejected attempts do not change versions or receipts.
const identity={user:'growth-timing-test',token:'owner'},room=newRoom('GROW26',identity,cards,{});
room.status='playing';room.state=ready();room.state.players.US.growth=['cd3313f35a370'];room.state.flow.step='research';
let commandId=0;
for(const started of [false,true]){
 if(started)room.state=applyAction(room.state,{type:'startResearch'});
 const before=JSON.stringify(room);
 assert.throws(()=>changeRoom(room,identity,{id:String(++commandId),op:'action',gameRevision:room.gameRevision,action:{type:'useGrowthAbility',cardId:'cd3313f35a370',count:1}},cards),/仅能在行动阶段/);
 assert.equal(JSON.stringify(room),before);
}
console.log('Passed active-growth action-only timing, research before/after rewards, atomic choice/restore, once-per-round, permanent trash, exhausted decks, extra-card/skip/pass limits, immediate acquisition, asset covering, and activation timing.');
