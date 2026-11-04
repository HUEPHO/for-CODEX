import assert from 'node:assert/strict';import fs from 'node:fs';import{createState,applyAction,POWERS,determineInitialOrder}from'../dist/engine.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));const byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const opening=createState(cards,{dd:true,wit:true},()=>.3);
for(const [id,p] of Object.entries(opening.players)){assert.equal(p.hand.length,0);assert.equal(p.deck.length,0);assert.deepEqual(p.openingChoices.map(g=>g.length),[6,6]);assert.equal(new Set(p.openingChoices.flat()).size,12);assert.ok(p.openingChoices.flat().every(c=>byId[c].owner===id))}
assert.throws(()=>applyAction(opening,{type:'draw'}));assert.throws(()=>applyAction(opening,{type:'chooseOpening',group:2}));
assert.deepEqual(JSON.parse(JSON.stringify(opening)).players.US.openingChoices,opening.players.US.openingChoices);
let full=opening;
for(const [i,id] of Object.keys(POWERS).entries()){full=applyAction(full,{type:'switch',player:id});const groups=structuredClone(full.players[id].openingChoices);full=applyAction(full,{type:'chooseOpening',group:i%2});assert.deepEqual(full.players[id].hand,groups[i%2]);assert.deepEqual([...full.players[id].deck].sort(),[...groups[1-i%2]].sort());assert.throws(()=>applyAction(full,{type:'chooseOpening',group:0}));if(i<3)assert.throws(()=>applyAction(full,{type:'draw'}))}
for(const id of Object.keys(POWERS)){
 full=applyAction(full,{type:'switch',player:id});const p=full.players[id];assert.equal(p.assets.length,0);assert.equal(p.assetChoices.length,3);assert.equal(new Set(p.assetChoices.map(c=>c.id)).size,3);assert.ok(p.assetChoices.every(c=>byId[c.id].owner===id));assert.equal(p.vp,0);
 assert.throws(()=>applyAction(full,{type:'chooseAssets'}));assert.throws(()=>applyAction(full,{type:'toggleAssetSelection',id:'invalid'}));
 const [a,b,c]=p.assetChoices;full=applyAction(full,{type:'toggleAssetSelection',id:a.id});assert.throws(()=>applyAction(full,{type:'chooseAssets'}));full=applyAction(full,{type:'toggleAssetSelection',id:b.id});assert.throws(()=>applyAction(full,{type:'toggleAssetSelection',id:c.id}));
 const pending=JSON.parse(JSON.stringify(full));assert.deepEqual(pending.players[id].assetSelection,[a.id,b.id]);assert.throws(()=>applyAction(full,{type:'draw'}));
 full=applyAction(full,{type:'toggleAssetSelection',id:a.id});full=applyAction(full,{type:'toggleAssetSelection',id:c.id});
 const goals=full.players[id].objectiveChoices;assert.equal(goals.length,3);assert.equal(new Set(goals).size,3);assert.ok(goals.every(g=>byId[g].owner===id));assert.equal(full.players[id].objectives.length,0);
 assert.throws(()=>applyAction(full,{type:'chooseAssets'}));assert.throws(()=>applyAction(full,{type:'toggleObjectiveSelection',id:'invalid'}));
 full=applyAction(full,{type:'toggleObjectiveSelection',id:goals[0]});assert.throws(()=>applyAction(full,{type:'chooseAssets'}));
 full=applyAction(full,{type:'toggleObjectiveSelection',id:goals[1]});assert.throws(()=>applyAction(full,{type:'toggleObjectiveSelection',id:goals[2]}));
 assert.deepEqual(JSON.parse(JSON.stringify(full)).players[id].objectiveSelection,goals.slice(0,2));
 full=applyAction(full,{type:'toggleObjectiveSelection',id:goals[0]});full=applyAction(full,{type:'toggleObjectiveSelection',id:goals[2]});
 full=applyAction(full,{type:'chooseAssets'});assert.deepEqual(full.players[id].objectives,goals.slice(1));assert.equal(full.players[id].objectiveChoices,null);assert.throws(()=>applyAction(full,{type:'toggleObjectiveSelection',id:goals[0]}));
 assert.deepEqual(full.players[id].assets,[b.id,c.id]);assert.equal(full.players[id].vp,b.vp+c.vp);assert.equal(full.players[id].assetChoices,null);assert.ok(!full.players[id].assets.includes(a.id));assert.throws(()=>applyAction(full,{type:'chooseAssets'}));assert.equal(pending.players[id].assetChoices.length,3);
}
full=applyAction(full,{type:'switch',player:'US'});
assert.ok(opening.players.US.openingChoices); // original snapshot remains available for undo
const legacy=structuredClone(full);for(const p of Object.values(legacy.players))delete p.openingChoices;assert.equal(applyAction(legacy,{type:'draw'}).players.US.hand.length,7);

for(const id of Object.keys(POWERS)){const p=full.players[id];assert.equal(p.hand.length,6);assert.equal(p.deck.length,6);assert.equal(p.assets.length,2);assert.equal(p.objectives.length,2);for(const k of [...p.hand,...p.deck,...p.assets,...p.objectives])assert.equal(byId[k].owner,id)}
assert.equal(full.market.length,6);assert.equal(full.marketDeck.length,68);assert.equal(full.events.length,2);assert.equal(full.chain.length,16);
const basic=createState(cards,{dd:false,wit:false},()=>.3);assert.equal(basic.marketDeck.length,60);assert.equal(basic.events.length,0);assert.equal(basic.players.US.objectives.length,0);assert.equal(basic.players.US.smart,0);assert.ok(basic.players.US.assetChoices.every(c=>byId[c.id].module==='base'));
let s={...full,flow:null};const id=s.players.US.hand[0];s=applyAction(s,{type:'play',id});assert.equal(s.players.US.hand.length,5);assert.deepEqual(s.players.US.played,[id]);assert.equal(full.players.US.hand.length,6);
const before=JSON.stringify(s);assert.throws(()=>applyAction(s,{type:'play',id}));assert.equal(JSON.stringify(s),before);
s=applyAction(s,{type:'clearPlayed'});assert.deepEqual(s.players.US.discard,[id]);s.players.US.deck=[];s=applyAction(s,{type:'draw'});assert.equal(s.players.US.hand.at(-1),id);assert.equal(s.players.US.discard.length,0);
s.flow=null; // Preserve the legacy manual-table regression path.
const market=s.market[2];s=applyAction(s,{type:'market',id:market});assert.equal(s.players.US.deck[0],market);assert.equal(s.market.length,6);assert.equal(s.marketDeck.length,67);assert.ok(!s.market.includes(market));
const country=s.regions.E.available[0];s=applyAction(s,{type:'ally',id:country,region:'E'});assert.ok(s.players.US.allies.includes(country));assert.ok(!s.regions.E.available.includes(country));
for(const c of cards){assert.ok(fs.existsSync(new URL('../dist/'+c.image,import.meta.url)),c.image);assert.ok(!c.notes.includes('MARS'))}
assert.throws(()=>applyAction(s,{type:'round',round:7}));assert.throws(()=>applyAction(s,{type:'resource',key:'evil',delta:1}));assert.throws(()=>applyAction(s,{type:'switch',player:'XX'}));assert.throws(()=>applyAction(basic,{type:'addEvent'}));
console.log('Passed: setup, owner mappings, modules, immutable transitions, card conservation, market refill, invalid actions and all '+cards.length+' assets.');

assert.equal(basic.players.US.objectiveChoices,null);assert.throws(()=>applyAction(basic,{type:'toggleObjectiveSelection',id:'any'}));
let baseReady=basic;for(const id of Object.keys(POWERS)){baseReady=applyAction(baseReady,{type:'switch',player:id});baseReady=applyAction(baseReady,{type:'chooseOpening',group:0});for(const c of baseReady.players[id].assetChoices.slice(0,2))baseReady=applyAction(baseReady,{type:'toggleAssetSelection',id:c.id});baseReady=applyAction(baseReady,{type:'chooseAssets'});assert.deepEqual(baseReady.players[id].objectives,[])}assert.ok(applyAction(baseReady,{type:'draw'}));
console.log('Passed objective draft: module gating, ownership, joint confirmation, save/restore, selection limits, no starting VP from objectives, and base-only setup.');

assert.equal(opening.initialOrder,null);assert.throws(()=>determineInitialOrder(opening));
assert.deepEqual(full.initialOrder,determineInitialOrder(full));assert.equal(new Set(full.initialOrder).size,4);
const rankCase=structuredClone(full);for(const p of Object.values(rankCase.players)){p.vp=5;p.money=999}
assert.deepEqual(determineInitialOrder(rankCase),['RU','CN','EU','US']);
rankCase.players.US.vp=9;rankCase.players.EU.vp=8;rankCase.players.CN.vp=8;rankCase.players.RU.vp=1;
assert.deepEqual(determineInitialOrder(rankCase),['US','CN','EU','RU']);
const fixed=applyAction(full,{type:'resource',key:'vp',delta:1});assert.deepEqual(fixed.initialOrder,full.initialOrder);assert.deepEqual(JSON.parse(JSON.stringify(fixed)).initialOrder,full.initialOrder);
let last=structuredClone(full);last.initialOrder=null;last.current='RU';last.players.RU.assetChoices=[{id:'a',vp:10},{id:'b',vp:10},{id:'c',vp:0}];last.players.RU.assetSelection=['a','b'];
const finished=applyAction(last,{type:'chooseAssets'});assert.equal(finished.current,'RU');assert.equal(finished.initialOrder[0],'RU');assert.equal(last.initialOrder,null);
console.log('Passed initial order: completion gate, descending VP, starting-money tie break, first-player view, fixed order and persistence.');

let rotation=applyAction(full,{type:'switch',player:full.initialOrder[0]});
assert.throws(()=>applyAction(opening,{type:'endAction'}));
assert.throws(()=>applyAction({...rotation,actionTurns:null},{type:'endAction'}));
assert.throws(()=>applyAction({...rotation,round:2},{type:'endAction'}));
assert.throws(()=>applyAction({...rotation,current:full.initialOrder[1]},{type:'endAction'}));
const actorHand=rotation.players[rotation.current].hand;
rotation=applyAction(rotation,{type:'play',id:actorHand[0]});
rotation=applyAction(rotation,{type:'play',id:actorHand[1]});
assert.equal(rotation.actionTurns.index,0);
for(let turn=0;turn<16;turn++){
 assert.equal(rotation.current,full.initialOrder[turn%4]);
 const previous=rotation;
 rotation=applyAction(rotation,{type:'endAction'});
 assert.equal(previous.actionTurns.index,turn);
 assert.equal(rotation.actionTurns.index,turn+1);
 assert.equal(rotation.phase,turn===15?'研究':'行动');
 if(turn===6)rotation=JSON.parse(JSON.stringify(rotation));
}
assert.deepEqual(rotation.actionTurns.completed,{US:4,CN:4,EU:4,RU:4});
assert.throws(()=>applyAction(rotation,{type:'endAction'}));
assert.throws(()=>applyAction({...rotation,phase:'行动'},{type:'endAction'}));
console.log('Passed first-round rotation: 16 turns, four per power, research transition, wrong-player/phase/round guards, persistence, immutable undo and extra card plays.');
