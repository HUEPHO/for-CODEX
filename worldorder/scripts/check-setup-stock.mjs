import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {GROWTH_FAMILIES,buildGrowthSupply} from '../dist/growth-setup.js';
import {newFlow} from '../dist/flow.js';
import {INITIAL_ALLIES} from '../dist/regime-change.js';
import {playerView,newRoom,changeRoom} from '../server/rooms.js';
import {renderRoomEntry,renderRoomLobby} from '../dist/room-ui.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const source=JSON.parse(fs.readFileSync(new URL('../references/TS_Save_12.json',import.meta.url)));
const physical=[];function walk(o){if(!o||typeof o!=='object')return;if(['Card','CardCustom'].includes(o.Name)&&o.Tags?.includes('GrowthCard'))physical.push(o.CardID);for(const v of Object.values(o))if(v&&typeof v==='object')if(Array.isArray(v))v.forEach(walk);else walk(v);}walk(source);
assert.equal(physical.length,40);
assert.deepEqual(GROWTH_FAMILIES.flatMap(g=>g.ids.map(id=>byId[id].sourceCardId)).sort(),physical.sort(),'Physical copies match the TTS source; no face-dedup losses');
const stock=GROWTH_FAMILIES.flatMap(g=>g.ids),copies=(ids,id)=>ids.filter(x=>x===id).length;
function rng(seed){return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
for(const mode of ['base','expansion','families','mixed'])for(let seed=1;seed<=12;seed++){
 const s=createState(cards,{dd:true,wit:false,growthMode:mode},rng(seed));assert.equal(s.growth.length,20);
 assert.deepEqual([1,2,3,4,5].map(level=>s.growth.filter(id=>byId[id].level===level).length),[6,4,4,4,2]);
 assert.equal(s.config.growthMode,mode);assert.equal(s.growthSetupVersion,1);
 for(const id of new Set(s.growth))assert.ok(copies(s.growth,id)<=copies(stock,id));
 if(['base','expansion'].includes(mode))assert.ok(s.growth.every(id=>byId[id].module===(mode==='base'?'base':'dd')));
 if(mode==='families')for(let level=1;level<=5;level++){
  const selected=GROWTH_FAMILIES.filter(g=>g.level===level&&g.ids.some(id=>s.growth.includes(id)));assert.equal(selected.length,2);
  for(const g of selected)for(const id of new Set(g.ids))assert.equal(copies(s.growth,id),copies(g.ids,id));
 }
}
const base=createState(cards,{dd:false,wit:false,growthMode:'mixed'});assert.equal(base.config.growthMode,'base');assert.equal(copies(base.growth,'c7efaad90fb20'),3);
assert.throws(()=>buildGrowthSupply({dd:true,growthMode:'all'}),/无效/);
for(const [power,ids] of Object.entries(INITIAL_ALLIES))assert.deepEqual(base.players[power].allies,ids);
assert.equal(cards.filter(c=>c.type==='startingCountry').length,17);assert.equal(cards.filter(c=>c.type==='country'&&c.module==='base').length,76);
assert.equal(base.players.EU.allies.length,5);assert.equal(base.market.length,6);assert.equal(base.marketDeck.length,60);
// Copies with the same face are consumed one at a time, and every recipient has
// independent growth ownership and costs. Depleted supply fails atomically.
let s=base;for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
s.flow=newFlow(['US','CN','EU','RU']);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
const hands={US:'cf9aa23c4a315',CN:'cb1a3c1de6f4e',EU:'cf503b7e361cc',RU:'c1dbd137bb9c8'};
for(const [power,cardId] of Object.entries(hands))s.players[power].hand=[cardId];
for(const power of ['US','CN','EU']){
 const before=structuredClone(s.players[power]);s=applyAction(s,{type:'playBasicCard',cardId:hands[power],domestic:'growth',growthId:'c7efaad90fb20'});
 assert.equal(s.players[power].resources[4],before.resources[4]-1);assert.equal(s.players[power].resources[5],before.resources[5]-1);assert.deepEqual(s.players[power].growth,['c7efaad90fb20']);assert.equal(s.players[power].vp,2);
}
assert.equal(copies(s.growth,'c7efaad90fb20'),0);const before=JSON.stringify(s);assert.throws(()=>applyAction(s,{type:'playBasicCard',cardId:hands.RU,domestic:'growth',growthId:'c7efaad90fb20'}),/供应区/);assert.equal(JSON.stringify(s),before);
// Persist the selected stock; views and resumed old games must not reshuffle it.
const identity={user:'setup-check',token:'owner'},room=newRoom('STCK44',identity,cards,{dd:true,wit:true,growthMode:'mixed'});
const saved=JSON.parse(JSON.stringify(room));assert.deepEqual(playerView(saved.state,'US').growth,room.state.growth);assert.equal(saved.state.config.growthMode,'mixed');
const legacy=structuredClone(room);delete legacy.state.growthSetupVersion;delete legacy.state.config.growthMode;legacy.state.growth=cards.filter(c=>c.type==='growth').map(c=>c.id);legacy.status='playing';
// Explicit legacy A/B save; new rooms now deal printed beginner hands directly.
legacy.state.players.US.openingChoices=[[...legacy.state.players.US.hand],[...legacy.state.players.US.deck]];legacy.state.players.US.hand=[];legacy.state.players.US.deck=[];delete legacy.state.openingHandVersion;
const resumed=changeRoom(legacy,identity,{op:'action',id:'opening',seatRevision:0,action:{type:'chooseOpening',group:0}},cards);assert.deepEqual(resumed.state.growth,legacy.state.growth);assert.equal(resumed.state.config.growthMode,undefined);
assert.match(renderRoomEntry({growthMode:'mixed'}),/value="mixed" selected/);
console.log('Formal stock passed: 40 source instances, 20-card supplies in all four modes, 6/4/4/4/2, 17 starting allies, independent duplicate-face purchases, depletion rollback, persisted selection and unchanged legacy rooms.');
