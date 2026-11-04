import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {DD_ASSET_CARDS} from '../dist/dd-asset-data.js';
import {sequenceCard,sequenceStep,sequencePreview} from '../dist/card-sequence.js';
import {renderSequencePanel} from '../dist/card-sequence-ui.js';
import {beijingPreview} from '../dist/dd-asset-effects.js';
import {renderBasicForm} from '../dist/basic-actions-ui.js';
import {baseCountries} from '../dist/country-actions.js';
import {INITIAL_ALLIES,regimeTargets,regimePreview,protectedInitialAlly} from '../dist/regime-change.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {acquireSearchedCountry} from '../dist/country-piles.js';
import {investmentPreview} from '../dist/world.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const cover='cf9aa23c4a315';
function ready(id){const s=createState(cards,{dd:true,wit:true},()=>0.5),owner=DD_ASSET_CARDS[id].owner;
 for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 s.current=owner;s.flow=newFlow([owner,...['US','CN','EU','RU'].filter(x=>x!==owner)]);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 const p=s.players[owner];p.hand=[cover];p.deck=[];p.discard=[];p.played=[];p.assets=[id];p.usedAssets=[];p.money=100;p.resources=Array(7).fill(8);p.fdi=[];p.exhaustedAllies=[];return s;
}
const start=(s,id)=>applyAction(s,{type:'startSequenceCard',cardId:id,cover});
const step=(s,a={})=>applyAction(s,{type:'resolveSequenceStep',...a});
function reject(s,a={}){const before=JSON.stringify(s);assert.throws(()=>step(s,a));assert.equal(JSON.stringify(s),before);}

let id='c06283f0fe2f0',s=ready(id);s.players.CN.prosperity=2;s.players.CN.resources[3]=4;s.players.CN.resources[5]=6;s=start(s,id);const oldVP=s.players.CN.vp;
assert.match(renderSequencePanel(s,byId),/通常消费品费用/);let snapshot=JSON.stringify(s);assert.deepEqual(beijingPreview(s),{cost:4,vp:5,money:15,level:3,diplomacy:3,receivedDiplomacy:3});assert.equal(JSON.stringify(s),snapshot);
const poor=structuredClone(s);poor.players.CN.resources[3]=3;reject(poor);s=step(s,{cost:0,improve:false});assert.equal(s.players.CN.resources[3],0);assert.equal(s.players.CN.money,115);assert.equal(s.players.CN.vp,oldVP+5);assert.equal(s.players.CN.resources[5],9);assert.equal(s.players.CN.prosperity,3);assert.equal(s.actionTurns.index,0);
s=JSON.parse(JSON.stringify(s));assert.equal(sequenceCard(s).allowNoAlly,true);assert.equal(sequencePreview(s,{region:'M',slot:'temporary'}).cost,4);s=step(s,{region:'M',slot:'temporary'});assert.equal(s.players.CN.resources[5],5);assert.equal(s.players.CN.money,115);assert.equal(s.players.CN.prosperity,3);assert.equal(s.regions.M.engage.CN,1);assert.equal(s.actionTurns.index,1);
s=ready(id);s.players.CN.prosperity=4;s.players.CN.resources[3]=6;s.players.CN.resources[5]=9;s=start(s,id);s=step(s);assert.equal(s.players.CN.prosperity,5);assert.equal(s.players.CN.resources[3],0);assert.equal(s.players.CN.resources[5],10);assert.equal(s.players.CN.money,100);
console.log('Passed Beijing Consensus: normal level-specific goods cost and rewards, diplomacy at the new level with cap, no-ally engagement at ordinary cost, immutable preview, insufficient-goods rollback and saved continuation without repeat rewards.');

id='cb0fb3de3c6c2';const member='ca03520c27e87',produce={domestic:'produce',production:[{key:5,quantity:3},{key:6,quantity:2}]};
for(const branch of ['engage','base']){
 s=start(ready(id),id);assert.match(renderBasicForm(s,id,byId,undefined,true),/先横置欧盟成员国/);assert.deepEqual(sequenceCard(s).allowedProductionKeys,[5,6]);reject(s,{domestic:'produce',production:[{key:3,quantity:1}]});reject(s,{domestic:'produce',production:[{key:6,quantity:3}]});
 const exhausted=structuredClone(s);exhausted.players.EU.exhaustedAllies=[member];reject(exhausted,produce);const missing=structuredClone(s);missing.players.EU.allies=missing.players.EU.allies.filter(x=>x!==member);reject(missing,produce);const broke=structuredClone(s);broke.players.EU.money=8;reject(broke,produce);const hungry=structuredClone(s);hungry.players.EU.resources[2]=1;reject(hungry,produce);
 snapshot=JSON.stringify(s);const preview=sequencePreview(s,produce);assert.equal(JSON.stringify(s),snapshot);assert.equal(preview.money,91);s=step(s,produce);assert.equal(s.players.EU.money,91);assert.equal(s.players.EU.resources[1],6);assert.equal(s.players.EU.resources[2],6);assert.equal(s.players.EU.resources[5],10);assert.equal(s.players.EU.resources[6],10);assert.deepEqual(s.players.EU.exhaustedAllies,[member]);s=JSON.parse(JSON.stringify(s));s=step(s,{choices:[branch]});
 if(branch==='engage'){reject(s,{region:'E',slot:'temporary',exhaust:[member]});s=step(s,{region:'E',slot:'temporary'});assert.equal(s.players.EU.resources[5],5);assert.equal(s.players.EU.money,91);}
 else{reject(s,{country:member,send:1,slot:'temporary'});const country=baseCountries(s)[0];assert.ok(country);s=step(s,{country,send:1,slot:'temporary'});assert.ok(s.players.EU.bases.includes(country));assert.equal(s.players.EU.money,81);assert.equal(s.players.EU.resources[6],9);}
 assert.equal(s.actionTurns.index,1);assert.equal(s.players.EU.exhaustedAllies.filter(x=>x===member).length,1);
}
console.log('Passed Common Foreign and Security Policy: own ready EU Members prerequisite, atomic normal production costs/caps/printed resources, exhausted-country reuse rejection, both ordinary follow-up actions and saved continuation.');

function giveCountry(s,host,country){acquireSearchedCountry(s.regions[RESEARCH_DATA[country].region],country,()=>0.5);s.players[host].allies.push(country);}
for(const [power,ids] of Object.entries(INITIAL_ALLIES))assert.deepEqual(ids,cards.filter(c=>c.type==='startingCountry'&&c.owner===power).map(c=>c.id));
for(const asset of ['c4ec4c6092f1b','c64bb44df5c8b']){
 s=ready(asset);const owner=s.current,host=owner==='US'?'CN':'US',excluded=owner==='US'?'EU':'CN',country='ce3c745de13c1',other='cf58f6e021ef9',excludedCountry='c7d6fffb49986';
 giveCountry(s,host,country);giveCountry(s,host,other);giveCountry(s,excluded,excludedCountry);
 const higher=cards.find(c=>c.type==='country'&&RESEARCH_DATA[c.id].countryValue===2).id;giveCountry(s,host,higher);
 s.players[host].fdi=[country,country,other];s.players[host].bases=[country,country,other];s.players[host].exhaustedAllies=[country,other];
 for(const investor of Object.keys(s.players).filter(x=>x!==host))s.players[investor].foreignInvestments=[{host,country},{host,country:other}];
 s.players[owner].money=10;s.players[owner].resources[4]=1;s.players[owner].resources[6]=1;s.regions.C.armies[host]=4;
 const armies=structuredClone(s.regions.C.armies),actorVP=s.players[owner].vp,actorCount=s.players[owner].allies.length,hostCount=s.players[host].allies.length;
 assert.equal(investmentPreview(s,host).fdi,6);s=start(s,asset);assert.match(renderSequencePanel(s,byId),/data-regime-country/);assert.ok(regimeTargets(s,sequenceStep(s)).some(x=>x.host===host&&x.country===country));
 reject(s,{host:owner,country});reject(s,{host:excluded,country:excludedCountry});reject(s,{host,country:INITIAL_ALLIES[host][0]});reject(s,{host,country:higher});
 for(const missing of ['money',4,6]){const invalid=structuredClone(s);if(missing==='money')invalid.players[owner].money=4;else invalid.players[owner].resources[missing]=0;reject(invalid,{host,country});}
 snapshot=JSON.stringify(s);assert.equal(regimePreview(s,{host,country},sequenceStep(s)).region,'C');assert.equal(JSON.stringify(s),snapshot);
 s=step(s,{host,country});assert.equal(s.players[owner].money,5);assert.equal(s.players[owner].resources[4],0);assert.equal(s.players[owner].resources[6],0);assert.equal(s.players[owner].allies.length,actorCount+1);assert.equal(s.players[host].allies.length,hostCount-1);assert.ok(s.players[owner].allies.includes(country));assert.ok(!s.players[owner].exhaustedAllies.includes(country));assert.equal(s.players[owner].vp,actorVP);
 assert.deepEqual(s.players[host].fdi,[other]);assert.deepEqual(s.players[host].bases,[other]);assert.deepEqual(s.players[host].exhaustedAllies,[other]);assert.deepEqual(s.regions.C.armies,armies);assert.equal(investmentPreview(s,host).fdi,2);
 for(const investor of Object.keys(s.players).filter(x=>x!==host))assert.deepEqual(s.players[investor].foreignInvestments,[{host,country:other}]);
 assert.equal(investmentPreview(s,owner).fdi,2);if(owner==='RU')assert.ok(RESEARCH_DATA[country].blockedPowers.includes('RU'));
 s=JSON.parse(JSON.stringify(s));assert.equal(sequenceStep(s).type,'influence');reject(s,{region:'N',slot:'temporary'});s=step(s,{region:'C',slot:'temporary'});assert.equal(s.players[owner].money,5);assert.deepEqual(s.regions.C.armies,armies);assert.deepEqual(s.players[owner].usedAssets,[asset]);assert.equal(s.actionTurns.index,1);
}

for(const [asset,host,old,country] of [['c4ec4c6092f1b','RU','c67140897200a','c6b8383321370'],['c64bb44df5c8b','US','c5bc763998f23','c5e5a30872c04']]){
 s=ready(asset);giveCountry(s,host,country);s.players[host].allies=s.players[host].allies.filter(x=>x!==old);s.players[host].countryUnderlays={[country]:[old]};giveCountry(s,host,'c5b01c4f40686');s=start(s,asset);
 for(const legacy of [false,true]){if(legacy)delete s.players[host].countryUnderlays;assert.ok(protectedInitialAlly(s,host,country));assert.ok(!regimeTargets(s,sequenceStep(s)).some(x=>x.country===country));assert.ok(!renderSequencePanel(s,byId).includes(`data-regime-country="${country}"`));reject(s,{host,country});}
}

// A different power's ordinary Iceland is not its initial ally. Acquiring it
// preserves the actor's own existing starting country as the normal underlay.
s=ready('c4ec4c6092f1b');const iceland='c5e5a30872c04',oldIceland='c5bc763998f23';giveCountry(s,'CN',iceland);s.players.US.fdi=[oldIceland];s.players.US.bases=[oldIceland];s.players.US.exhaustedAllies=[oldIceland];s.players.CN.fdi=[iceland];s.players.EU.foreignInvestments=[{host:'US',country:oldIceland},{host:'CN',country:iceland}];const initialCount=s.players.US.allies.length;s=start(s,'c4ec4c6092f1b');s=step(s,{host:'CN',country:iceland});assert.equal(s.players.US.allies.length,initialCount);assert.deepEqual(s.players.US.countryUnderlays[iceland],[oldIceland]);assert.deepEqual(s.players.US.fdi,[iceland]);assert.deepEqual(s.players.US.bases,[iceland]);assert.deepEqual(s.players.US.exhaustedAllies,[]);assert.deepEqual(s.players.EU.foreignInvestments,[{host:'US',country:iceland}]);assert.ok(protectedInitialAlly(s,'US',iceland));
assert.equal(Object.keys(DD_ASSET_CARDS).length,12);
console.log('Passed both Regime Change assets: opponent exceptions, value/starting/upgraded/legacy-origin protection, normal costs, forbidden-relations override, country ownership/readiness, all seized FDI/base cleanup, unrelated investment and regional-army preservation, actor starting-card underlays and saved region-bound influence. All 12 D&D assets registered.');
