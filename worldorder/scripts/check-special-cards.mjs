import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {EXECUTIVE_BY_POWER,SPECIAL_CARDS} from '../dist/special-data.js';
import {sequenceCard,sequenceStep,sequencePreview,sequenceInfluencePreview} from '../dist/card-sequence.js';
import {renderBasicForm} from '../dist/basic-actions-ui.js';
import {renderSequencePanel} from '../dist/card-sequence-ui.js';
import {scoringPreview,syncInfluence,AREAS} from '../dist/world.js';
import {relationCountries,countryInfo} from '../dist/country-actions.js';
import {investmentCost} from '../dist/research.js';
import {GROWTH_DATA} from '../dist/growth-data.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const cover='cf9aa23c4a315',rd='cd9aca36eefd7';
function ready(owner='US'){
 const s=createState(cards,{dd:false,wit:true,executive:true},()=>0.5);
 for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 const order=[owner,...['US','CN','EU','RU'].filter(id=>id!==owner)];s.current=owner;s.flow=newFlow(order);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 const p=s.players[owner];p.hand=[cover];p.deck=[];p.money=100;p.resources=Array(7).fill(8);p.assets=owner==='US'?[rd]:[];
 return s;
}
const start=(s,cardId,coverId=cover)=>applyAction(s,{type:'startSequenceCard',cardId,cover:coverId});
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',...a});
for(const owner of Object.keys(EXECUTIVE_BY_POWER)){
 let s=ready(owner),id=EXECUTIVE_BY_POWER[owner];assert.match(renderBasicForm(s,id,byId),/sequence-cover/);
 const before=JSON.stringify(s);assert.throws(()=>start(s,id,'not-in-hand'));assert.equal(JSON.stringify(s),before);
 s=start(s,id);assert.equal(s.players[owner].executiveUsed,true);assert.deepEqual(s.players[owner].faceDownPlayed,[cover]);assert.ok(!s.players[owner].played.includes(id));
 assert.match(renderSequencePanel(s,byId),/取得发展牌/);s=step(s,{choices:['move']});
 const limit=owner==='RU'?3:2;assert.equal(sequenceCard(s).maxMoves,limit);
 const region=owner==='RU'?'C':owner==='CN'?'P':owner==='EU'?'E':'M';
 assert.throws(()=>step(s,{moves:Array.from({length:limit+1},()=>({from:'reserve',to:region}))}));
 s=step(s,{moves:Array.from({length:limit},()=>({from:'reserve',to:region}))});assert.equal(s.players[owner].resources[6],9-limit);assert.equal(s.players[owner].money,100-limit*5);assert.equal(s.actionTurns.index,1);
 s.current=owner;s.actionTurns.index=0;s.flow.turnCards=[];assert.throws(()=>start(s,id,undefined),/已经使用/);
}
let s=ready();assert.throws(()=>start(s,EXECUTIVE_BY_POWER.RU));s.config.executive=false;assert.throws(()=>start(s,EXECUTIVE_BY_POWER.US));
s=ready();s.flow.extraCard={owner:'US',round:1,turnIndex:0,baseline:0,cardId:cover,required:true};assert.throws(()=>start(s,EXECUTIVE_BY_POWER.US),/指定/);

s=ready();const vp=s.players.US.vp;s=start(s,rd);assert.ok(s.players.US.usedAssets.includes(rd));assert.equal(s.players.US.vp,vp);assert.equal(s.players.US.hand.length,0);
s=step(s,{domestic:'produce',production:[{key:0},{key:4,quantity:1}]});s=JSON.parse(JSON.stringify(s));assert.equal(sequenceCard(s).domesticMode,'growth');
s=step(s,{domestic:'growth',growthId:'c7efaad90fb20'});assert.ok(s.players.US.growth.includes('c7efaad90fb20'));assert.equal(s.current,'CN');assert.deepEqual(s.players.US.played,[cover]);

// Empty-hand specials still count as a first card and trigger Strategic Advantage.
s=ready();s.players.US.hand=[];s.round=s.flow.round=4;s.players.US.growth=['c2ac1e1f24d0a'];
s=start(s,EXECUTIVE_BY_POWER.US,null);s=step(s,{choices:['produce']});s=step(s,{domestic:'produce',production:[]});assert.equal(s.flow.extraCard.source,'growth');assert.equal(s.actionTurns.index,0);
s=applyAction(s,{type:'endAction'});assert.equal(s.current,'CN');

// Final unused executive rewards join unused assets and cannot be paid twice.
s=ready();s.config.wit=false;s.round=s.flow.round=6;s.flow.step='aftermath';s.phase='余波';s.flow.checks=['投资回报','繁荣提升','威胁结算'];
const expected=s.players.US.vp+scoringPreview(s).totals.US+2+3;s=applyAction(s,{type:'scoreWorld'});assert.equal(s.players.US.vp,expected);assert.equal(s.flow.step,'ended');assert.throws(()=>applyAction(s,{type:'scoreWorld'}));
console.log('Passed executive ownership/cover/once-only/eight-action flow, Russian move limit, R&D sequence, forced-card protection, empty-hand extra play and final unused bonuses.');

function assetState(id){const s=ready(SPECIAL_CARDS[id].owner);s.players[s.current].assets=[id];return s;}
for(const id of ['c9cdadd802619','cf64a7ea0ed57']){s=assetState(id);const owner=s.current;s.players[owner].money=0;s.players[owner].resources[6]=2;s=start(s,id);s=step(s,{region:'A',slot:'temporary'});assert.equal(s.players[owner].money,20);assert.equal(s.players[owner].resources[6],0);}
s=assetState('c9cdadd802619');s.players.US.resources[6]=1;let snapshot=JSON.stringify(s);assert.throws(()=>start(s,'c9cdadd802619'),/不能打出/);assert.equal(JSON.stringify(s),snapshot);

s=assetState('c75585a29d3f6');s.regions.C.permanent.fill('CN');syncInfluence(s.regions.C);s=start(s,'c75585a29d3f6');assert.throws(()=>step(s,{region:'P'}));s=step(s,{region:'C'});
assert.throws(()=>step(s,{moves:[{from:'reserve',to:'C'}]}));s=step(s,{moves:[{from:'reserve',to:'C'},{from:'reserve',to:'C'}]});
assert.equal(s.players.US.money,90);assert.equal(s.regions.C.armies.US,2);assert.throws(()=>step(s,{region:'C',slot:'temporary'}));const natoVP=s.players.US.vp;s=step(s,{region:'C',slot:'permanent'});assert.equal(s.players.US.vp,natoVP);assert.equal(s.players.US.resources[5],10);assert.ok(s.regions.C.extraPermanent.includes('US'));

s=assetState('ce4421896167f');s.players.EU.money=10;s.players.EU.resources[5]=2;s.players.EU.resources[6]=0;s=start(s,'ce4421896167f');s=step(s,{region:'C',slot:'permanent'});assert.equal(s.players.EU.money,0);assert.equal(s.players.EU.resources[5],0);assert.equal(s.players.EU.resources[6],0);assert.equal(s.regions.C.armies.EU,2);
s=assetState('cdf8936ad3068');s=start(s,'cdf8936ad3068');assert.throws(()=>step(s,{moves:[]}));s=step(s,{moves:[{from:'reserve',to:'P'}]});s=step(s,{region:'P',slot:'permanent'});assert.equal(s.players.CN.money,95);assert.equal(s.regions.P.armies.CN,1);
s=assetState('c0c78fc3e0cad');s.players.RU.money=0;s=start(s,'c0c78fc3e0cad');assert.equal(s.players.RU.resources[5],7);s=step(s,{moves:[{from:'reserve',to:'C'},{from:'reserve',to:'C'}]});s=step(s,{region:'C',slot:'permanent'});assert.equal(s.players.RU.money,0);assert.equal(s.regions.C.armies.RU,2);

s=assetState('c47cee26aebf3');s=start(s,'c47cee26aebf3');s=step(s,{region:'E',slot:'temporary'});s=step(s,{choices:['repeat']});snapshot=JSON.stringify(s);assert.throws(()=>step(s,{region:'E',slot:'temporary'}));assert.equal(JSON.stringify(s),snapshot);s=step(s,{region:'N',slot:'temporary'});assert.equal(s.players.RU.money,60);assert.equal(s.players.RU.resources[6],8);assert.equal(s.regions.N.armies.RU,1);assert.equal(s.regions.E.armies.RU,1);

s=assetState('c78120c3201e6');s.regions.E.temporary=['RU','CN'];syncInfluence(s.regions.E);s=start(s,'c78120c3201e6');const cyber={region:'E',resetIndex:0,slot:'temporary'};
assert.match(renderSequencePanel(s,byId),/sequence-reset-index/);snapshot=JSON.stringify(s);const cyberPreview=sequenceInfluencePreview(s,cyber);assert.equal(JSON.stringify(s),snapshot);const cyberVP=s.players.RU.vp;s=step(s,cyber);assert.deepEqual(s.regions.E.temporary,['CN','RU','RU']);assert.equal(s.players.RU.vp,cyberVP+AREAS.E.temp[2]);assert.equal(s.players.RU.vp,cyberVP+cyberPreview.vp);assert.equal(s.players.RU.resources[4],7);
console.log('Passed both arms sales, distinct US/EU NATO costs and troop sources, forced permanent/overflow score, South China Sea, free CSTO moves, distinct-region contractors and ordered cyber reset/placement.');

s=assetState('c65d379ffec4d');s.players.US.resources[5]=0;s.players.US.money=20;assert.ok(!s.players.US.allies.some(id=>countryInfo(id).region==='A'));s=start(s,'c65d379ffec4d');s=step(s,{bundles:2});assert.equal(s.players.US.resources[5],6);s=step(s,{region:'A',slot:'temporary'});assert.equal(s.players.US.money,0);assert.equal(s.players.US.resources[5],3);assert.equal(s.regions.A.engage.US,1);

s=assetState('c51627f6d0b9e');const firstAlly=s.players.CN.allies[0],secondAlly=s.players.CN.allies.find(id=>countryInfo(id).region!==countryInfo(firstAlly).region);assert.ok(secondAlly);s=start(s,'c51627f6d0b9e');s=step(s,{country:firstAlly,slot:'temporary'});s=step(s,{choices:['invest']});snapshot=JSON.stringify(s);assert.throws(()=>step(s,{country:firstAlly,slot:'temporary'}),/允许/);assert.equal(JSON.stringify(s),snapshot);s=step(s,{country:secondAlly,slot:'temporary'});assert.equal(s.players.CN.money,100-investmentCost(firstAlly)-investmentCost(secondAlly)-10);assert.deepEqual(s.players.CN.fdi,[firstAlly,secondAlly]);

s=assetState('c5897c7e5dfcb');s.players.CN.money=20;s.players.CN.hand.push('c4813f7351d34');const oldProduction=[...s.players.CN.production],oldResources=[...s.players.CN.resources],oldVP=s.players.CN.vp;s=start(s,'c5897c7e5dfcb');assert.match(renderSequencePanel(s,byId),/data-sequence-upgrade/);snapshot=JSON.stringify(s);assert.throws(()=>step(s,{upgrades:[0,0]}));assert.equal(JSON.stringify(s),snapshot);s=step(s,{upgrades:[0,1,2]});assert.deepEqual(s.players.CN.production.slice(0,3),oldProduction.slice(0,3).map(n=>n+1));assert.deepEqual(s.players.CN.resources,oldResources);assert.equal(s.players.CN.money,0);assert.equal(s.players.CN.vp,oldVP+3);assert.equal(s.flow.extraCard.required,false);

s=assetState('c1f29fbd68d66');s=start(s,'c1f29fbd68d66');const shanghai=relationCountries(s,sequenceCard(s))[0],forbidden=relationCountries(s).find(id=>countryInfo(id).region==='E');assert.ok(shanghai&&forbidden);assert.throws(()=>step(s,{country:forbidden,slot:'temporary'}),/允许/);s=step(s,{country:shanghai,slot:'temporary'});s=step(s,{choices:['invest']});assert.equal(sequenceCard(s).targetCountry,shanghai);s=step(s,{country:shanghai,slot:'temporary'});assert.ok(s.players.CN.fdi.includes(shanghai));

s=assetState('c08f0d8a00ec7');s.players.EU.resources[5]=10;s=start(s,'c08f0d8a00ec7');s=step(s,{region:'C',slot:'temporary'});s=step(s,{choices:['repeat']});assert.throws(()=>step(s,{region:'C',slot:'temporary'}),/允许/);s=step(s,{region:'E',slot:'temporary'});assert.equal(s.regions.C.engage.EU,1);assert.equal(s.regions.E.engage.EU,1);assert.equal(s.players.EU.money,90);assert.equal(s.players.EU.resources[5],1);

s=assetState('c8a402f5325e9');s.players.EU.money=0;s.players.EU.resources[4]=0;s=start(s,'c8a402f5325e9');assert.equal(s.players.EU.money,20);assert.match(renderBasicForm(s,'c8a402f5325e9',byId,undefined,true),/growth-service-money/);
const growthId='c7efaad90fb20',services=GROWTH_DATA[growthId].services;s=step(s,{domestic:'growth',growthId,serviceMoney:services});assert.equal(s.players.EU.resources[4],0);assert.equal(s.players.EU.money,20-services*10-GROWTH_DATA[growthId].money);assert.ok(s.players.EU.growth.includes(growthId));

s=assetState('cd373c6b79e0f');s.regions.E.permanent.fill('CN');syncInfluence(s.regions.E);s=start(s,'cd373c6b79e0f');const european=relationCountries(s,sequenceCard(s))[0];assert.equal(countryInfo(european).region,'E');s=step(s,{country:european,slot:'temporary'});const expansionVP=s.players.EU.vp,expansionDip=s.players.EU.resources[5];s=step(s,{choices:['extend']});s=step(s,{region:'E',slot:'permanent'});assert.equal(s.players.EU.resources[5],expansionDip-2);assert.equal(s.players.EU.vp,expansionVP);assert.ok(s.regions.E.extraPermanent.includes('EU'));

for(const [id,info] of Object.entries(SPECIAL_CARDS).filter(([,c])=>c.source==='asset')){s=assetState(id);assert.match(renderBasicForm(s,id,byId),/startSequenceCard/);}
assert.equal(Object.values(SPECIAL_CARDS).filter(c=>c.source==='asset'&&c.module!=='dd').length,20);
// Cyber's reset changes the indices offered to Regional Resilience.
s=assetState('c78120c3201e6');s.round=s.flow.round=4;const resilience=Object.keys(GROWTH_DATA).find(id=>GROWTH_DATA[id].effect==='resilience');s.players.RU.growth=[resilience];s.regions.E.temporary=['RU','CN'];s.regions.E.permanent.fill('CN');syncInfluence(s.regions.E);s=start(s,'c78120c3201e6');const resilienceVP=s.players.RU.vp;s=step(s,{region:'E',slot:'temporary',resetIndex:0,resilience:{timing:'before',index:1}});assert.deepEqual(s.regions.E.temporary,['CN','RU']);assert.ok(s.regions.E.extraPermanent.includes('RU'));assert.equal(s.players.RU.vp,resilienceVP+AREAS.E.temp[1]);assert.equal(s.players.RU.growthUsed[resilience],4);
console.log('Passed seven economic/diplomatic assets: no-ally engagement, extra fees and region restrictions, distinct capped upgrades without resource grants, chained play, money-for-services and optional permanent influence.');
