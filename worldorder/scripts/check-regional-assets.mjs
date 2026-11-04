import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow,flowActor} from '../dist/flow.js';
import {SPECIAL_CARDS} from '../dist/special-data.js';
import {sequenceStep,sequenceCard,sequencePreview,sequenceInfluencePreview} from '../dist/card-sequence.js';
import {renderSequencePanel} from '../dist/card-sequence-ui.js';
import {renderBasicForm} from '../dist/basic-actions-ui.js';
import {tradeCapacity} from '../dist/trade.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const cover='cf9aa23c4a315';
function ready(id){const owner=SPECIAL_CARDS[id].owner,s=createState(cards,{dd:false,wit:true},()=>0.5);for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;s.current=owner;s.flow=newFlow([owner,...['US','CN','EU','RU'].filter(x=>x!==owner)]);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};const p=s.players[owner];p.assets=[id];p.hand=[cover];p.money=100;p.resources=Array(7).fill(8);return applyAction(s,{type:'startSequenceCard',cardId:id,cover});}
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',...a});
const moves=region=>({moves:[{from:'reserve',to:region},{from:'reserve',to:region}]});
let s=ready('ca58c2d75ac35');assert.match(renderSequencePanel(s,byId),/每支共支付10/);
for(const regions of [['C'],['E','E'],['M','E','P']])assert.throws(()=>step(s,{regions}));
s=step(s,{regions:['M','P']});assert.equal(sequenceCard(s).moveCost,10);assert.equal(sequencePreview(s,moves('M')).cost,20);
const snapshot=JSON.stringify(s);assert.throws(()=>step(s,{moves:[{from:'reserve',to:'M'}]}));assert.equal(JSON.stringify(s),snapshot);
s=step(s,moves('M'));assert.equal(s.players.US.money,80);s=JSON.parse(JSON.stringify(s));assert.equal(sequenceCard(s).onlyDestination,'P');
s=step(s,moves('P'));assert.equal(s.players.US.money,60);assert.equal(s.players.US.resources[6],4);assert.equal(sequenceStep(s).type,'influence');
assert.throws(()=>step(s,{region:'E',slot:'temporary'}));s=step(s,{region:'M',slot:'temporary'});assert.equal(s.actionTurns.index,0);s=step(s,{region:'P',slot:'temporary'});assert.equal(s.actionTurns.index,1);assert.equal(s.flow.cardResolution,null);
s=ready('ca58c2d75ac35');s=step(s,{regions:[]});assert.equal(s.players.US.money,100);assert.equal(s.actionTurns.index,1);
s=ready('ca58c2d75ac35');s.players.US.money=19;s=step(s,{regions:['P']});assert.throws(()=>step(s,moves('P')),/资金不足/);assert.equal(s.players.US.money,19);
console.log('Passed US Navy: distinct non-Central-Asia regions, exactly two moves each at 10 each, all moves before influence, no-selection completion, insufficient-funds rollback and saved-step resume.');

function brics(money){let s=ready('c505b0ec5fbae');s.players.RU.money=money;s=step(s,{regions:['M','A']});assert.equal(s.players.CN.money,70);s=step(s,{region:'M',slot:'temporary'});s=step(s,{region:'A',slot:'temporary'});return JSON.parse(JSON.stringify(s));}
for(const money of [35,7,0]){
 s=brics(money);assert.equal(s.current,'RU');assert.equal(flowActor(s),'RU');assert.equal(s.flow.cardResolution.owner,'CN');assert.equal(s.actionTurns.index,0);assert.match(renderSequencePanel(s,byId),/拒绝邀请/);
 const before=JSON.stringify(s),a={accept:true,region:'S',slot:'temporary'},preview=sequenceInfluencePreview(s,a);assert.equal(preview.cost.money,Math.min(20,money));assert.equal(JSON.stringify(s),before);
 assert.throws(()=>step({...s,current:'CN'},a),/切换/);assert.throws(()=>applyAction(s,{type:'endAction'}));assert.throws(()=>applyAction(s,{type:'manualSequence'}),/回应/);assert.throws(()=>step(s,{...a,region:'A'}),/允许/);
 const vp=s.players.RU.vp;s=step(s,a);assert.equal(s.players.RU.money,Math.max(0,money-20));assert.equal(s.players.RU.vp,vp+preview.vp);assert.equal(s.players.CN.money,70);assert.equal(s.actionTurns.completed.CN,1);assert.equal(s.actionTurns.completed.RU,0);assert.equal(s.flow.cardResolution,null);
}
s=brics(12);const dipBefore=structuredClone(s.regions.S);s=step(s,{accept:false});assert.equal(s.players.RU.money,12);assert.deepEqual(s.regions.S,dipBefore);assert.equal(s.actionTurns.completed.CN,1);
s=brics(5);s.round=s.flow.round=s.flow.cardResolution.round=4;s.players.CN.growth=['c2ac1e1f24d0a'];s=step(s,{accept:false});assert.equal(s.current,'CN');assert.equal(s.flow.extraCard.owner,'CN');assert.equal(s.actionTurns.index,0);
s=ready('c505b0ec5fbae');s.players.CN.money=29;assert.throws(()=>step(s,{regions:['M','A']}),/资金不足/);assert.equal(sequenceStep(s).type,'regions');
console.log('Passed BRICS: China pays once for distinct regions; Russian accepted, declined, partial/zero payment and saved response; foreign-action guards and original-player extra play resume.');

function brands(){let s=ready('c7a839a0105f2');s.players.EU.allies=['ca9d839514542'];s.regions.M.available=['cb4eb4d5ab2b9'];assert.throws(()=>step(s,{region:'E'}));return step(s,{region:'M'});}
s=brands();assert.match(renderBasicForm(s,'c7a839a0105f2',byId,undefined,true),/data-export-region-key/);assert.match(renderBasicForm(s,'c7a839a0105f2',byId,undefined,true),/结算交易并继续/);
const to=(key,regions)=>({key,quantity:Object.values(regions).reduce((a,b)=>a+b,0),regions});
const brandsTrade={exports:[to(3,{M:1}),to(4,{M:1})]};assert.deepEqual(sequencePreview(s,brandsTrade).bonusRegions,['M']);
assert.deepEqual(sequencePreview(s,{exports:[to(3,{M:1}),to(4,{P:1})]}).bonusRegions,[]);
assert.throws(()=>step(s,{exports:[{key:3,quantity:1}]}),/分配/);
assert.throws(()=>step(s,{exports:[{key:3,quantity:1,regions:{M:1,P:1}}]}),/之和/);
assert.throws(()=>step(s,{exports:[to(3,{M:3})]}),/地区国家需求/);
s=step(s,brandsTrade);assert.equal(s.players.EU.money,130);assert.equal(s.actionTurns.index,0);s=JSON.parse(JSON.stringify(s));assert.equal(s.flow.cardResolution.context.lastTrade.transactions[0].regions.M,1);s=step(s,{region:'M',slot:'temporary'});assert.equal(s.players.EU.money,130);assert.equal(s.actionTurns.index,1);
s=brands();s=step(s,{exports:[to(3,{M:1}),to(4,{P:1})]});assert.equal(s.flow.cardResolution,null);assert.equal(s.actionTurns.index,1);

function energy(regions=['S','P']){let s=ready('cc55c9955c210');s.players.RU.allies=['c35627e0bba08'];s.regions.S.available=['c72267e12c089'];s.regions.P.available=['cf04deb0c883b','c99daf8fee754'];s.regions.N.available=['c06079787fb3a'];return step(s,{regions});}
s=energy();const cap=tradeCapacity(s,'RU',sequenceCard(s));assert.equal(cap.byRegion.S.exports[0],4);assert.equal(cap.byRegion.S.exports[1],1);assert.equal(cap.byRegion.E.exports[4],0);assert.equal(cap.byRegion.P.imports[1],2);
assert.doesNotMatch(renderBasicForm(s,'cc55c9955c210',byId,undefined,true),/data-import-player|data-trade-region=/);
assert.throws(()=>step(s,{imports:[{key:3,players:{CN:1}}]}),/不能向玩家/);assert.throws(()=>step(s,{tradeRegions:['E']}),/所选地区/);assert.throws(()=>step(s,{exports:[to(4,{E:1})]}));
assert.deepEqual(sequencePreview(s,{exports:[to(0,{S:3,P:5})]}).bonusRegions,['P']);
assert.deepEqual(sequencePreview(s,{exports:[to(0,{S:4,P:4})]}).bonusRegions,['S','P']);
s=step(s,{exports:[to(0,{S:4,P:4})]});assert.equal(s.players.RU.money,140);assert.equal(s.players.RU.resources[0],0);s=step(s,{region:'S',slot:'temporary'});s=JSON.parse(JSON.stringify(s));s=step(s,{region:'P',slot:'temporary'});assert.equal(s.actionTurns.index,1);assert.equal(s.players.RU.money,140);
s=energy(['N','S']);assert.equal(tradeCapacity(s,'RU',sequenceCard(s)).imports[0],4);s=step(s,{imports:[{key:0,countryQuantity:4}]});assert.equal(s.players.RU.resources[0],10);assert.equal(s.players.RU.money,94); // Pay 12, overflow two energy returns 6.
console.log('Passed European Brands and New Energy Markets: actual per-region export allocation, independent thresholds, selected-country restrictions, energy-only doubling on both directions, no player imports for restricted trade, and saved post-trade influence without duplicate payment.');
