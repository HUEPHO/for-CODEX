import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {ACTION_CARDS} from '../dist/basic-actions.js';
import {sequenceStartIssue} from '../dist/card-sequence.js';
import {renderSequenceStart} from '../dist/card-sequence-ui.js';
import {ECONOMY} from '../dist/economy.js';
import {GROWTH_DATA} from '../dist/growth-data.js';
import {newRoom,changeRoom} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c])),ids=['US','CN','EU','RU'];
const cover='cf9aa23c4a315',extra='c4813f7351d34',ecb='c8a402f5325e9',policy='cb0fb3de3c6c2',research='cd9aca36eefd7',optimize='c4ae0932e9a29',industrialize='c5897c7e5dfcb';
const leadership='c0ec0ed27c8bf',diplomatic='c7efaad90fb20',battlefield='c2b12b9e97150';
const expansion='c11cd1894962e',iceland='c5bc763998f23',mexico='cb427f6dd4283';
function fixture(cardId,{dd=true}={}){
 const owner=ACTION_CARDS[cardId].owner||'US',s=createState(cards,{dd,wit:true},()=>.3);
 for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.resources=Array(7).fill(8);p.smart=0;}
 s.current=owner;s.flow=newFlow([owner,...ids.filter(id=>id!==owner)]);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 s.players[owner].hand=ACTION_CARDS[cardId].source?[cover]:[cardId];if(ACTION_CARDS[cardId].source)s.players[owner].assets=[cardId];return s;
}
const start=(s,id,chosen=cover)=>applyAction(s,{type:'startSequenceCard',cardId:id,...(ACTION_CARDS[id].source?{cover:chosen}:{})});
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',...a});
function banned(s,id,pattern){const before=JSON.stringify(s);assert.match(sequenceStartIssue(s,id),pattern);assert.throws(()=>start(s,id),pattern);assert.equal(JSON.stringify(s),before);assert.match(renderSequenceStart(s,id,byId),/禁止打出/);}

// Development supply/costs are validated in D&D too, before the ECB grants any money.
let s=fixture(ecb);s.growth=[];banned(s,ecb,/发展牌/);
for(const [growthId,edit] of [
 ['cd18c8e5a0461',p=>{p.resources[6]=0;}],
 ['ca11b52d5e0ad',p=>{p.growth=['cd18c8e5a0461',leadership];p.resources[3]=0;}],
 ['c142f2edba533',p=>{p.growth=['cd18c8e5a0461',leadership];p.resources[0]=p.resources[1]=p.resources[2]=0;}]
]){s=fixture(ecb);s.growth=[growthId];edit(s.players.EU);banned(s,ecb,/发展牌/);}
// The actual covered card cannot also pay the development's discard cost.
s=fixture(ecb);s.growth=[leadership];s.players.EU.growth=['cd18c8e5a0461'];banned(s,ecb,/发展牌/);
s.players.EU.hand.push(extra);assert.equal(sequenceStartIssue(s,ecb),'');s=start(s,ecb);assert.equal(s.players.EU.money,120);s=step(s,{domestic:'growth',growthId:leadership,growthDiscard:extra});assert.ok(s.players.EU.growth.includes(leadership));assert.deepEqual(s.players.EU.discard,[extra]);
s=fixture(optimize);s.growth=[leadership];s.players.US.growth=['cd18c8e5a0461'];banned(s,optimize,/后续|发展牌/);
// Explicitly missing or already exhausted mandatory allies block before flipping an asset.
for(const missing of [false,true]){s=fixture(policy);if(missing)s.players.EU.allies=s.players.EU.allies.filter(id=>id!=='ca03520c27e87');else s.players.EU.exhaustedAllies=['ca03520c27e87'];banned(s,policy,/未横置/);}
s=fixture(policy);assert.equal(sequenceStartIssue(s,policy),'');s=start(s,policy);s=step(s,{domestic:'produce',production:[]});assert.ok(s.players.EU.exhaustedAllies.includes('ca03520c27e87'));
// Two production types cannot create energy, food AND service from zero. No fictitious stock is granted.
s=fixture(research,{dd:false});s.players.US.resources=Array(7).fill(0);s.players.US.money=0;banned(s,research,/后续|发展牌/);
s=fixture(optimize,{dd:false});s.players.US.resources=Array(7).fill(0);s.players.US.money=0;banned(s,optimize,/后续|发展牌/);
// Real ordered production can fund later growth: food then service consumes the existing energy.
s=fixture(research,{dd:false});s.players.US.resources=Array(7).fill(0);s.players.US.resources[0]=1;s.players.US.resources[5]=1;s.players.US.money=0;s.growth=[diplomatic];
assert.equal(sequenceStartIssue(s,research),'');s=start(s,research);s=step(s,{domestic:'produce',production:[{key:2,quantity:1},{key:4,quantity:1}]});s=step(s,{domestic:'growth',growthId:diplomatic});assert.ok(s.players.US.growth.includes(diplomatic));assert.equal(s.players.US.resources[4],0);assert.equal(s.players.US.money,0);
// One-type production also works when its actual inputs already exist; preserve legitimate paths.
s=fixture(optimize,{dd:false});s.players.US.resources=Array(7).fill(0);s.players.US.resources[0]=s.players.US.resources[2]=s.players.US.resources[5]=1;s.players.US.money=0;s.growth=[diplomatic];assert.equal(sequenceStartIssue(s,optimize),'');
s=start(s,optimize);s=step(s,{domestic:'produce',production:[{key:4,quantity:1}]});s=step(s,{domestic:'growth',growthId:diplomatic});assert.ok(s.players.US.growth.includes(diplomatic));
// Mandatory production key/allowed-key limits are part of the same candidate generator.
s=fixture(research,{dd:false});s.players.US.resources=Array(7).fill(0);s.players.US.resources[0]=s.players.US.resources[2]=s.players.US.resources[5]=1;s.players.US.money=0;s.growth=[diplomatic];
const {sequenceEntryIssue}=await import('../dist/sequence-availability.js');
assert.notEqual(sequenceEntryIssue(s,[{type:'effect',card:{effect:'domestic',domesticMode:'produce',maxProduction:2,allowedProductionKeys:[3]}},{type:'effect',card:{effect:'domestic',domesticMode:'growth'}}]),'');
// Trade cannot invent investment funds. A real export witness respects capacity,
// inventory, the printed type limit, and SP still needed to ready the investment.
s=fixture(expansion);s.players.US.resources=Array(7).fill(0);s.players.US.money=0;banned(s,expansion,/后续|资金/);
s.players.US.resources[2]=1;banned(s,expansion,/后续|资金/);
s.players.US.resources[3]=1;assert.equal(sequenceStartIssue(s,expansion),'');s=start(s,expansion);s=step(s,{exports:[{key:3,quantity:1}]});s=step(s,{country:iceland,slot:'temporary'});assert.equal(s.players.US.money,5);assert.ok(s.players.US.fdi.includes(iceland));
s=fixture(expansion);s.players.US.allies=[iceland];s.players.US.exhaustedAllies=[iceland];s.players.US.resources=Array(7).fill(0);s.players.US.resources[3]=1;s.players.US.money=0;s.players.US.smart=1;for(const region of Object.values(s.regions))region.available=[];s.regions.M.available=[mexico];banned(s,expansion,/后续|资金/);
s.players.US.smart=2;assert.equal(sequenceStartIssue(s,expansion),'');s=start(s,expansion);s=step(s,{tradeRegions:['M'],exports:[{key:3,quantity:1}]});s=step(s,{country:iceland,slot:'temporary',investSP:'before'});assert.equal(s.players.US.smart,0);assert.equal(s.players.US.money,5);
// Rapid industrialization must truly increase the printed 2/3 distinct tracks.
for(const eligible of [0,1]){s=fixture(industrialize);s.players.CN.production=[...ECONOMY.CN.max];if(eligible)s.players.CN.production[0]--;banned(s,industrialize,/至少两种/);}
s=fixture(industrialize);s.players.CN.production=[...ECONOMY.CN.max];s.players.CN.production[0]--;s.players.CN.production[1]--;s=start(s,industrialize);const before=JSON.stringify(s);
assert.throws(()=>step(s,{upgrades:[0,2]}),/未达上限/);assert.equal(JSON.stringify(s),before);s=step(s,{upgrades:[0,1]});assert.deepEqual(s.players.CN.production,ECONOMY.CN.max);assert.equal(s.players.CN.money,90);assert.equal(s.players.CN.vp,3);
// Validating a random growth purchase must not shuffle assets/decks or consume the RNG.
s=fixture(ecb);s.growth=[battlefield];s.players.EU.growth=[1,2,3].map(level=>Object.keys(GROWTH_DATA).find(id=>GROWTH_DATA[id].level===level));
const saved=JSON.stringify(s),random=Math.random;Math.random=()=>{throw Error('Admission must not draw randomness');};try{assert.equal(sequenceStartIssue(s,ecb),'');}finally{Math.random=random;}assert.equal(JSON.stringify(s),saved);
// Room rejection is atomic, including card coverage, usage, currency and the original version.
const who=Object.fromEntries(ids.map(id=>[id,{user:'sequence-complete',token:id}]));let room=newRoom('SEQ555',who.US,cards,{dd:true,wit:true});room.state=fixture(ecb);room.state.growth=[];room.status='playing';room.seats=structuredClone(who);const unchanged=JSON.stringify(room);
assert.throws(()=>changeRoom(room,who.EU,{id:'invalid',op:'action',gameRevision:room.gameRevision,action:{type:'startSequenceCard',cardId:ecb,cover}},cards),/发展牌/);assert.equal(JSON.stringify(room),unchanged);
const timings={};for(const profile of ['stocked','empty','emptySupply']){const sample=fixture(research,{dd:false});sample.players.US.production=[...ECONOMY.US.max];if(profile==='empty'){sample.players.US.resources=Array(7).fill(0);sample.players.US.money=0;}if(profile==='emptySupply')sample.growth=[];const start=performance.now();for(let i=0;i<5;i++)sequenceStartIssue(sample,research);timings[profile]=Number(((performance.now()-start)/5).toFixed(2));}
console.log('Production/growth admission mean milliseconds (5 calls, maximum production tracks):',JSON.stringify(timings));
console.log('Sequence admission passed: D&D costs/supply/discard after cover, mandatory ally preparation, bounded real production/trade witnesses, full industrialization tracks, no preview randomness and atomic room refusal.');
