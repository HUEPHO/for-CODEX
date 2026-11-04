import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {DD_ASSET_CARDS,DD_ASSET_NAMES} from '../dist/dd-asset-data.js';
import {sequenceCard,sequenceStep,sequencePreview} from '../dist/card-sequence.js';
import {renderSequencePanel} from '../dist/card-sequence-ui.js';
import {renderBasicForm} from '../dist/basic-actions-ui.js';
import {flowActor} from '../dist/flow.js';
import {countryRegion,investmentCost} from '../dist/research.js';
import {aidPreview,swapPreview} from '../dist/dd-asset-effects.js';
import {syncInfluence} from '../dist/world.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const cover='cf9aa23c4a315';
function ready(id){
 const s=createState(cards,{dd:true,wit:true},()=>0.5),owner=DD_ASSET_CARDS[id].owner;
 for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 s.current=owner;s.flow=newFlow([owner,...['US','CN','EU','RU'].filter(x=>x!==owner)]);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 const p=s.players[owner];p.hand=[cover];p.deck=[];p.discard=[];p.played=[];p.assets=[id];p.usedAssets=[];p.money=100;p.resources=Array(7).fill(8);p.fdi=[];p.exhaustedAllies=[];
 return s;
}
const start=(s,id)=>applyAction(s,{type:'startSequenceCard',cardId:id,cover});
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',...a});
function reject(s,a){const before=JSON.stringify(s);assert.throws(()=>step(s,a));assert.equal(JSON.stringify(s),before);}

let id='c5a55e16cba89',s=ready(id);s=start(s,id);assert.match(renderSequencePanel(s,byId),/选择2项不同效果/);reject(s,{choices:['trade','trade']});
s=step(s,{choices:['produce','invest']});reject(s,{domestic:'produce',production:[{key:0},{key:1},{key:2}]});
s=step(s,{domestic:'produce',production:[{key:0},{key:1}]});s=JSON.parse(JSON.stringify(s));assert.equal(sequenceCard(s).effect,'invest');const ally=s.players.EU.allies[0];s=step(s,{country:ally,slot:'temporary'});assert.ok(s.players.EU.fdi.includes(ally));assert.deepEqual(s.players.EU.usedAssets,[id]);assert.deepEqual(s.players.EU.faceDownPlayed,[cover]);assert.equal(s.actionTurns.index,1);
id='cba3601ccacd0';s=ready(id);const a=s.players.EU.allies[0],b=s.players.EU.allies.find(x=>countryRegion(x)!==countryRegion(a));assert.ok(b);s=start(s,id);s=step(s,{country:a,slot:'temporary'});s=step(s,{choices:['invest']});reject(s,{country:a,slot:'temporary'});s=step(s,{country:b,slot:'temporary'});assert.equal(s.players.EU.money,100-investmentCost(a)-investmentCost(b)-10);assert.deepEqual(s.players.EU.fdi,[a,b]);assert.equal(s.actionTurns.index,1);
s=start(ready(id),id);s=step(s,{country:a,slot:'temporary'});s=step(s,{choices:['skip']});assert.equal(s.players.EU.money,100-investmentCost(a));
for(const c of cards.filter(c=>c.type==='asset'&&c.module==='dd'))assert.equal(c.name,DD_ASSET_NAMES[c.id]);
console.log('Passed Economic Giant and Global Gateway: ordered distinct choices, production limit, ordinary investment fees plus optional surcharge, other-region target, cover/once-only turn and saved continuation; all 12 D&D asset names present.');

id='c22451cc98803';
for(const cash of [35,7,0]){
 s=ready(id);s.players.CN.money=cash;s=start(s,id);reject(s,{regions:['M','M']});s=step(s,{regions:['M','A']});assert.equal(s.players.RU.money,70);s=step(s,{region:'M',slot:'temporary'});s=step(s,{region:'A',slot:'temporary'});s=JSON.parse(JSON.stringify(s));
 assert.equal(s.current,'CN');assert.equal(flowActor(s),'CN');assert.match(renderSequencePanel(s,byId),/等待中国回应/);assert.match(renderSequencePanel(s,byId),/继续俄罗斯的行动/);assert.throws(()=>applyAction(s,{type:'endAction'}));reject(s,{accept:true,region:'A',slot:'temporary'});
 s=step(s,{accept:true,region:'S',slot:'temporary'});assert.equal(s.players.CN.money,Math.max(0,cash-20));assert.equal(s.players.RU.money,70);assert.equal(s.actionTurns.completed.RU,1);assert.equal(s.actionTurns.completed.CN,0);
}
s=ready(id);s.round=s.flow.round=4;s.players.RU.growth=['c2ac1e1f24d0a'];s=start(s,id);s=step(s,{regions:['M','A']});s=step(s,{region:'M',slot:'temporary'});s=step(s,{region:'A',slot:'temporary'});const cnCash=s.players.CN.money;s=step(s,{accept:false});assert.equal(s.players.CN.money,cnCash);assert.equal(s.current,'RU');assert.equal(s.flow.extraCard.owner,'RU');

id='ce1c7bf1695c3';s=ready(id);s.players.RU.money=24;let snapshot=JSON.stringify(s);assert.throws(()=>start(s,id),/资金不足/);assert.equal(JSON.stringify(s),snapshot);s.players.RU.money=25;s.players.RU.resources[4]=1;s.players.RU.resources[6]=0;const armies=Object.fromEntries(Object.entries(s.regions).map(([key,r])=>[key,r.armies.RU]));s=start(s,id);assert.equal(s.players.RU.money,0);assert.equal(s.players.RU.resources[4],0);assert.equal(s.players.RU.resources[6],0);for(const r of ['E','C','P'])assert.equal(s.regions[r].armies.RU,armies[r]+1);assert.equal(s.regions.N.armies.RU,armies.N);s=JSON.parse(JSON.stringify(s));reject(s,{region:'N',slot:'temporary'});s=step(s,{region:'C',slot:'temporary'});assert.equal(s.regions.C.armies.RU,armies.C+1);assert.equal(s.actionTurns.index,1);
console.log('Passed Russian BRICS and Nuclear Test: correct responder/owner, accepted/declined/partial/zero payment, extra play, supply troops in all three regions, single selected influence, resource rollback and saved response.');

id='c673c7b050e62';
for(const order of [['produce','trade'],['trade','produce']]){
 s=ready(id);s.players.CN.resources=Array(7).fill(0);s=start(s,id);s=step(s,{choices:order});
 if(order[0]==='trade')s=step(s,{exports:[],imports:[]});
 const production=[...s.players.CN.production];assert.deepEqual(sequenceCard(s).allowedProductionKeys,[0,1,3]);const html=renderBasicForm(s,id,byId,undefined,true),productionHTML=html.slice(html.indexOf('id="domestic-production"'),html.indexOf('id="domestic-growth"'));assert.doesNotMatch(productionHTML,/<option value="[2456]">/);reject(s,{domestic:'produce',production:[{key:2}]});
 s=step(s,{domestic:'produce',production:[{key:0},{key:1},{key:3,quantity:1}]});assert.equal(s.players.CN.resources[0],production[0]-1);assert.equal(s.players.CN.resources[1],production[1]-1);assert.equal(s.players.CN.resources[3],1);s=JSON.parse(JSON.stringify(s));if(order[1]==='trade')s=step(s,{exports:[],imports:[]});assert.equal(s.actionTurns.index,1);
}
const to=(key,regions)=>({key,quantity:Object.values(regions).reduce((a,b)=>a+b,0),regions});
function surplus(){const s=ready('c3dc6bb01a4f1');s.players.CN.allies=cards.filter(c=>c.type==='country'&&['M','P'].includes(c.region)).map(c=>c.id);return start(s,'c3dc6bb01a4f1');}
s=surplus();assert.match(renderBasicForm(s,'c3dc6bb01a4f1',byId,undefined,true),/出口收入至少35/);const sale={exports:[to(3,{M:2,P:2}),to(0,{M:1,P:1})],imports:[{key:4,players:{US:1}}]};snapshot=JSON.stringify(s);const quote=sequencePreview(s,sale);assert.equal(JSON.stringify(s),snapshot);assert.equal(quote.exportRevenueByRegion.M,35);assert.equal(quote.exportRevenueByRegion.P,35);assert.deepEqual(quote.bonusRegions,['M','P']);assert.deepEqual(sequencePreview(s,{exports:[to(3,{M:2,P:2})]}).bonusRegions,[]);reject(s,{exports:[{key:3,quantity:2}]});
s=step(s,sale);assert.equal(s.players.CN.money,160);s=step(s,{region:'M',slot:'temporary'});s=JSON.parse(JSON.stringify(s));reject(s,{region:'M',slot:'temporary'});s=step(s,{region:'P',slot:'temporary'});assert.equal(s.players.CN.money,160);assert.equal(s.actionTurns.index,1);
console.log('Passed Manufacturing Hub and Trade Surplus: either action order, printed resource-only production, production costs, independent regional gross export revenue at/below threshold, imports excluded, pure preview and no repeated trade on saved influence steps.');

id='ca1a2248b231e';s=ready(id);const first=s.players.US.allies[0],second=s.players.US.allies.find(cid=>countryRegion(cid)!==countryRegion(first));s.players.US.money=15;s.players.US.resources[6]=2;s.players.US.resources[5]=9;s=start(s,id);assert.match(renderSequencePanel(s,byId),/data-aid-ally/);reject(s,{allies:[first,first]});const exhausted=structuredClone(s);exhausted.players.US.exhaustedAllies=[second];reject(exhausted,{allies:[first,second]});const poor=structuredClone(s);poor.players.US.money=14;reject(poor,{allies:[first,second]});snapshot=JSON.stringify(s);const aid=aidPreview(s,{allies:[first,second]});assert.equal(JSON.stringify(s),snapshot);s=step(s,{allies:[first,second]});assert.equal(s.players.US.money,0);assert.equal(s.players.US.resources[6],0);assert.equal(s.players.US.resources[5],10);assert.deepEqual(s.players.US.exhaustedAllies,[first,second]);s=JSON.parse(JSON.stringify(s));s=step(s,{region:aid.regions[0],slot:'temporary'});s=step(s,{region:aid.regions[1],slot:'temporary'});assert.equal(s.players.US.money,0);assert.equal(s.actionTurns.index,1);

id='c09d55b7002c1';s=ready(id);s.regions.E.temporary=['CN','US','RU'];s.regions.E.permanent=['EU','US','neutral',null,null,null,null];s.regions.N.temporary=['US','CN'];s.regions.N.extraPermanent=['RU'];syncInfluence(s.regions.E);syncInfluence(s.regions.N);const counts=structuredClone(s.regions.E.influence),points=Object.fromEntries(Object.entries(s.players).map(([p,x])=>[p,x.vp]));s=start(s,id);assert.match(renderSequencePanel(s,byId),/sequence-swap-permanent/);const swap={region:'E',tempIndex:1,permanentKind:'permanent',permanentIndex:0};snapshot=JSON.stringify(s);assert.equal(swapPreview(s,swap,sequenceStep(s)).target.player,'EU');assert.equal(JSON.stringify(s),snapshot);reject(s,{...swap,tempIndex:0});reject(s,{...swap,permanentIndex:1});reject(s,{...swap,permanentIndex:2});reject(s,{...swap,permanentIndex:3});s=step(s,swap);assert.equal(s.players.US.money,90);assert.deepEqual(s.regions.E.temporary,['CN','EU','RU']);assert.equal(s.regions.E.permanent[0],'US');assert.deepEqual(s.regions.E.influence,counts);assert.deepEqual(Object.fromEntries(Object.entries(s.players).map(([p,x])=>[p,x.vp])),points);s=step(s,{choices:['repeat']});s=JSON.parse(JSON.stringify(s));reject(s,{...swap,tempIndex:1});s=step(s,{region:'N',tempIndex:0,permanentKind:'extraPermanent',permanentIndex:0});assert.deepEqual(s.regions.N.temporary,['RU','CN']);assert.deepEqual(s.regions.N.extraPermanent,['US']);assert.equal(s.players.US.resources[4],7);assert.equal(s.players.US.money,90);assert.equal(s.actionTurns.index,1);
console.log('Passed Economic/Military Aid and CIA: own ready allies in distinct regions, once-only total cost/diplomacy cap, sequential influence; exact temporary/permanent swaps including overflow, neutral/own/empty rejection, no placement VP, separate second-region cost and saved continuation.');
