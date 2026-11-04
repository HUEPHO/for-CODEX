import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {BEGINNER_SOURCE_IDS} from '../dist/opening-hand.js';
import {growthSupplyGroups,GROWTH_FAMILIES} from '../dist/growth-setup.js';
import {newRoom,changeRoom,roomView} from '../server/rooms.js';
const cards=JSON.parse(readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const seats=['US','CN','EU','RU'];
for(const dd of [false,true])for(const seed of [.1,.45,.9]){
 let s=createState(cards,{dd,wit:dd},()=>seed);
 for(const seat of seats){
  const p=s.players[seat];
  assert.deepEqual(p.hand.map(id=>byId[id].sourceCardId),BEGINNER_SOURCE_IDS[seat]);
  assert.equal(p.deck.length,6);assert.equal(new Set([...p.hand,...p.deck]).size,12);assert.equal(p.openingChoices,null);
  s=applyAction(s,{type:'switch',player:seat});
  const before=JSON.stringify(s);assert.throws(()=>applyAction(s,{type:'selectAssetDiscard',id:'foreign'}));assert.equal(JSON.stringify(s),before);
  const [first,second,third]=p.assetChoices;
  s=applyAction(s,{type:'selectAssetDiscard',id:first.id});assert.deepEqual(s.players[seat].assetSelection,[second.id,third.id]);
  s=applyAction(s,{type:'selectAssetDiscard',id:first.id});assert.deepEqual(s.players[seat].assetSelection,[]);
  s=applyAction(s,{type:'selectAssetDiscard',id:first.id});
  s=applyAction(s,{type:'selectAssetDiscard',id:second.id});assert.deepEqual(s.players[seat].assetSelection,[first.id,third.id]);
  if(dd){assert.throws(()=>applyAction(s,{type:'chooseAssets'}));s=applyAction(s,{type:'selectObjectiveDiscard',id:p.objectiveChoices[0]});}
  else assert.throws(()=>applyAction(s,{type:'selectObjectiveDiscard',id:'x'}));
  s=applyAction(JSON.parse(JSON.stringify(s)),{type:'chooseAssets'});
  assert.deepEqual(s.players[seat].assets,[first.id,third.id]);assert.equal(s.players[seat].vp,first.vp+third.vp);
  assert.equal(s.players[seat].objectives.length,dd?2:0);assert.equal(s.players[seat].assetChoices,null);
 }
 assert.equal(s.flow.step,'actions');assert.equal(s.initialOrder.length,4);
}
// New draft commands retain simultaneous per-seat updates, private choices,
// receipt idempotency, rollback and the existing room start gate.
const who=Object.fromEntries(seats.map(seat=>[seat,{user:'opening-test',token:seat}]));
let r=newRoom('DRAFT2',who.US,cards,{dd:true,wit:false});r.status='playing';r.seats={...who};let serial=0;
const action=(seat,a)=>{const command={op:'action',id:String(++serial),action:a,seatRevision:r.seatRevisions[seat],gameRevision:0};r=changeRoom(r,who[seat],command,cards);return command;};
for(const seat of seats){const view=roomView(r,who[seat]);assert.equal(view.state.players[seat].hand.length,6);assert.equal(view.state.players[seat].assetChoices.length,3);for(const other of seats.filter(x=>x!==seat)){assert.deepEqual(view.state.players[other].hand,Array(6).fill(null));assert.equal(view.state.players[other].assetChoices,null);assert.equal(view.state.players[other].objectiveChoices,null);}}
const original=structuredClone(r.state.players.US);
const retry=action('US',{type:'selectAssetDiscard',id:original.assetChoices[0].id});assert.equal(changeRoom(r,who.US,retry,cards),r);
assert.throws(()=>changeRoom(r,who.US,{...retry,id:'stale'},cards),/本方选牌已更新/);
r=changeRoom(r,who.US,{op:'undo',scope:'step',id:'undo',gameRevision:r.gameRevision},cards);assert.deepEqual(r.state.players.US.assetSelection,[]);
for(const seat of seats){action(seat,{type:'selectAssetDiscard',id:r.state.players[seat].assetChoices[0].id});action(seat,{type:'selectObjectiveDiscard',id:r.state.players[seat].objectiveChoices[0]});}
for(const seat of seats)action(seat,{type:'chooseAssets'});
assert.equal(r.state.flow.step,'actions');for(const seat of seats)assert.equal(roomView(r,who[seat]).seats[seat].setupDone,true);
// Legacy A/B saves remain usable and are not redealt by the new default.
let legacy=createState(cards,{dd:false,wit:false});const lp=legacy.players.US;lp.openingChoices=[[...lp.hand],[...lp.deck]];lp.hand=[];lp.deck=[];delete legacy.openingHandVersion;
const expected=lp.openingChoices[1];legacy=applyAction(legacy,{type:'chooseOpening',group:1});assert.deepEqual(legacy.players.US.hand,expected);
// Different IDs and repeated IDs are one display stack; depletion chooses a real remaining copy.
const family=GROWTH_FAMILIES[0],groups=growthSupplyGroups(family.ids);assert.equal(groups.length,1);assert.equal(groups[0].count,3);assert.deepEqual(groups[0].ids,family.ids);
assert.equal(growthSupplyGroups(family.ids.slice(1))[0].id,family.ids[1]);
assert.deepEqual(growthSupplyGroups(['c7efaad90fb20','c7efaad90fb20'])[0],{id:'c7efaad90fb20',ids:['c7efaad90fb20'],count:2});
for(const mode of ['base','expansion','families','mixed']){const s=createState(cards,{dd:true,wit:false,growthMode:mode});assert.equal(growthSupplyGroups(s.growth).reduce((n,g)=>n+g.count,0),20);}
console.log('Opening/table checks passed: four printed beginner hands, draft discard/replace/clear/confirmation/VP, base and D&D, save restore, simultaneous private room choices, retries/stale rejection/undo, legacy A/B and physical growth stacks.');
