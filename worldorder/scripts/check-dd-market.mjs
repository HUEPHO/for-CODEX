import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {sequenceStep,sequenceParameters} from '../dist/card-sequence.js';
import {returnArmyPreview} from '../dist/opponent-effects.js';
import {renderSequencePanel} from '../dist/card-sequence-ui.js';
import {foreignInvestmentTargets,foreignInvestmentPreview} from '../dist/foreign-investments.js';
import {foreignInvestments,investedCountries} from '../dist/investment-tokens.js';
import {renderForeignInvestments,foreignInvestmentCaption} from '../dist/foreign-investments-ui.js';
import {investmentPreview,scoringPreview} from '../dist/world.js';
import {investmentCost,countryValue} from '../dist/research.js';
import {applyCardPreparation} from '../dist/market-actions.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
function ready(cardId,owner='EU'){const s=createState(cards,{dd:true,wit:true},()=>0.5);for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;s.current=owner;s.flow=newFlow([owner,...Object.keys(s.players).filter(id=>id!==owner)]);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};const p=s.players[owner];p.hand=[cardId];p.money=100;p.resources=Array(7).fill(10);return s;}
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',...a});
function detente(cardId='ceae8326b655e'){let s=ready(cardId);s.regions.E.armies.RU=2;s=applyAction(s,{type:'startSequenceCard',cardId});return step(s,{region:'E',slot:'temporary'});}
for(const cardId of ['ceae8326b655e','c97673dfea828']){let s=detente(cardId);assert.equal(sequenceStep(s).type,'returnArmy');assert.match(renderSequencePanel(s,byId),/sequence-other-player/);s=JSON.parse(JSON.stringify(s));const before=JSON.stringify(s),a={targetPlayer:'RU'},r=returnArmyPreview(s,a,sequenceParameters(s));assert.equal(JSON.stringify(s),before);assert.equal(r.region,'E');assert.throws(()=>step(s,{targetPlayer:'EU'}));assert.throws(()=>step(s,{targetPlayer:'US'}));const vp=s.players.EU.vp,dip=s.players.EU.resources[5],reserve=s.players.RU.resources[6];s=step(s,a);assert.equal(s.regions.E.armies.RU,1);assert.equal(s.players.RU.resources[6],reserve+1);assert.equal(s.players.EU.resources[5],dip-1);assert.equal(s.players.EU.vp,vp);assert.equal(s.actionTurns.index,1);}
let s=detente();s.players.EU.resources[5]=0;assert.throws(()=>step(s,{targetPlayer:'RU'}),/资源不足/);s=step(s,{skip:true});assert.equal(s.regions.E.armies.RU,2);assert.equal(s.actionTurns.index,1);
s=ready('ceae8326b655e');s=applyAction(s,{type:'startSequenceCard',cardId:'ceae8326b655e'});s=step(s,{region:'E',slot:'temporary'});assert.equal(s.flow.cardResolution,null);assert.equal(s.actionTurns.index,1);
console.log('Passed both Diplomatic Detente cards: engagement first, same-region opposing army returned to reserve, optional payment/skip, no-target completion, no bonus VP, saved response and invalid-action rollback.');

const norway='c35627e0bba08',upgradedNorway='c0bcc4a617152';
function subversion(cardId='c033be37f442d'){const s=ready(cardId,'CN');s.players.EU.fdi=[norway];s.players.EU.exhaustedAllies=[norway];return applyAction(s,{type:'startSequenceCard',cardId});}
for(const cardId of ['c033be37f442d','c2381e267cd41']){
 s=subversion(cardId);assert.match(renderSequencePanel(s,byId),/sequence-foreign-country/);const a={host:'EU',country:norway,slot:'temporary'},before=JSON.stringify(s),r=foreignInvestmentPreview(s,a);assert.equal(r.cost,investmentCost(norway)+5);assert.equal(JSON.stringify(s),before);assert.throws(()=>step(s,{...a,host:'CN'}));assert.throws(()=>step(s,{...a,country:s.players.EU.allies[1]}));
 const euIncome=investmentPreview(s,'EU').fdi,cnIncome=investmentPreview(s,'CN').fdi,allies=s.players.CN.allies.length;s=step(s,a);s=JSON.parse(JSON.stringify(s));assert.deepEqual(foreignInvestments(s,'CN'),[{host:'EU',country:norway}]);assert.ok(s.players.EU.allies.includes(norway));assert.equal(s.players.CN.allies.length,allies);assert.equal(s.players.CN.money,100-r.cost);assert.equal(s.players.EU.exhaustedAllies.filter(x=>x===norway).length,1);assert.equal(investmentPreview(s,'EU').fdi,euIncome);assert.equal(investmentPreview(s,'CN').fdi,cnIncome+2*countryValue(norway));assert.match(renderForeignInvestments({...s,current:'CN'},byId),/盟国属于欧盟/);assert.match(foreignInvestmentCaption(s,'EU',norway),/中国投资/);
 s.current='CN';assert.ok(!foreignInvestmentTargets(s).some(x=>x.country===norway));const cash=s.players.CN.money;applyCardPreparation(s,{}, {moneyPerFDI:4});assert.equal(s.players.CN.money,cash+4);
}
s=subversion();s.players.CN.money=investmentCost(norway)+4;const short=JSON.stringify(s);assert.throws(()=>step(s,{host:'EU',country:norway,slot:'temporary'}),/资金不足/);assert.equal(JSON.stringify(s),short);s=step(s,{skip:true});assert.equal(foreignInvestments(s,'CN').length,0);
s=ready('c033be37f442d','CN');s=applyAction(s,{type:'startSequenceCard',cardId:'c033be37f442d'});assert.equal(s.flow.cardResolution,null);assert.equal(s.actionTurns.index,1);

// Income belongs to the investor and follows a host's starting-country upgrade.
s=subversion();s=step(s,{host:'EU',country:norway,slot:'temporary'});s.current='EU';s.flow=newFlow(['EU','CN','US','RU']);s.actionTurns.index=0;s.players.EU.hand=['c27ef4c355438'];s.regions.E.countryPiles={left:[upgradedNorway],right:[]};s.regions.E.available=[upgradedNorway];
s=applyAction(s,{type:'playBasicCard',cardId:'c27ef4c355438',country:upgradedNorway,slot:'temporary'});assert.ok(s.players.EU.allies.includes(upgradedNorway));assert.deepEqual(s.players.CN.foreignInvestments,[{host:'EU',country:upgradedNorway}]);assert.equal(investmentPreview(s,'CN').fdi,2*countryValue(upgradedNorway));assert.equal(investmentPreview(s,'EU').fdi,2*countryValue(upgradedNorway));assert.ok(!investedCountries(s,'CN').includes(norway));
s.current='CN';s.flow=newFlow(['CN','US','EU','RU']);s.flow.step='aftermath';s.phase='余波';const cashBefore=s.players.CN.money;s=applyAction(s,{type:'resolveInvestments'});assert.equal(s.players.CN.money,cashBefore+2*countryValue(upgradedNorway));
s.round=6;s.players.CN.fdi=s.players.CN.allies.filter(id=>['P','S'].includes(byId[id].region));assert.equal(new Set(s.players.CN.fdi.map(id=>byId[id].region)).size,2);assert.equal(scoringPreview(s).national.CN,2);
console.log('Passed Financial Subversion: normal fee plus 5, exhausted foreign targets, once per investor, preserved country/marker ownership, influence, saved state, investor income/card bonuses, host upgrade retention and Chinese investment-network scoring.');
