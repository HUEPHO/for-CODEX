import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {MARKET_CARDS} from '../dist/market-data.js';
import {sequencePreview,sequenceStep,sequenceCard,resetChoices} from '../dist/card-sequence.js';
import {relationCountries,relationPreview,countryInfo} from '../dist/country-actions.js';
import {regionCountries,revealCountry,acquireSearchedCountry} from '../dist/country-piles.js';
import {syncInfluence} from '../dist/world.js';
import {openRelationPreview} from '../dist/growth-triggers.js';
import {renderBasicForm} from '../dist/basic-actions-ui.js';
import {renderSequencePanel} from '../dist/card-sequence-ui.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const cardId=name=>Object.keys(MARKET_CARDS).find(id=>MARKET_CARDS[id].name===name);
function ready(){
 const s=createState(cards,{dd:true,wit:true},()=>0.5);
 for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 s.flow=newFlow(['US','CN','EU','RU']);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 s.players.US.hand=Object.keys(MARKET_CARDS);s.players.US.resources[5]=10;s.players.US.money=100;
 return s;
}
const start=(s,name)=>applyAction(s,{type:'startSequenceCard',cardId:cardId(name)});
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',...a});
const ownedTemporary=(s,region)=>{s.regions[region].temporary=['US','CN'];syncInfluence(s.regions[region]);};

// Embassy's discount combines with normal payments, never produces a rebate,
// and its optional reset stays in the first country's region across reloads.
let s=ready(),target=relationCountries(s)[0],region=countryInfo(target).region;
ownedTemporary(s,region);const elsewhere=Object.keys(s.regions).find(r=>r!==region);ownedTemporary(s,elsewhere);
s=start(s,'建立新大使馆');
assert.match(renderBasicForm(s,cardId('建立新大使馆'),byId,undefined,true),/basic-relation-discount/);
assert.equal(sequencePreview(s,{country:target,slot:'temporary'}).cost,Math.max(0,countryInfo(target).countryValue-1));
assert.equal(sequencePreview(s,{country:target,slot:'temporary',useRelationDiscount:false}).cost,countryInfo(target).countryValue);
s=step(s,{country:target,slot:'temporary'});s=JSON.parse(JSON.stringify(s));
assert.equal(sequenceStep(s).type,'reset');assert.ok(resetChoices(s).every(x=>x.region===region));
const snapshot=JSON.stringify(s),vp=s.players.US.vp;
assert.throws(()=>step(s,{region:elsewhere,index:0}));assert.equal(JSON.stringify(s),snapshot);
assert.match(renderSequencePanel(s,byId),/sequence-skip-reset/);
s=step(s,{region,index:0});assert.equal(s.players.US.vp,vp);assert.equal(s.regions[region].temporary.at(-1),'US');assert.equal(s.current,'CN');

s=ready();target=relationCountries(s).find(id=>countryInfo(id).countryValue===1);region=countryInfo(target).region;
ownedTemporary(s,region);s.players.US.resources[5]=0;s=start(s,'建立新大使馆');s=step(s,{country:target,slot:'temporary'});
assert.equal(s.players.US.resources[5],0);const temporary=[...s.regions[region].temporary];s=step(s,{skip:true});assert.deepEqual(s.regions[region].temporary,temporary);

s=ready();s.round=s.flow.round=4;s.players.US.growth=['cee1874f2f132'];target=relationCountries(s)[0];region=countryInfo(target).region;ownedTemporary(s,region);
s=start(s,'建立新大使馆');s=step(s,{country:target,slot:'temporary',openDiplomacy:true});
const second=relationCountries(s).find(id=>countryInfo(id).region!==region),secondCost=countryInfo(second).countryValue;
assert.equal(openRelationPreview(s,{country:second,slot:'temporary'}).cost,secondCost);
const diplomacy=s.players.US.resources[5];s=applyAction(s,{type:'resolveOpenDiplomacy',country:second,slot:'temporary'});
assert.equal(s.players.US.resources[5],diplomacy-secondCost-1);assert.ok(resetChoices(s).every(x=>x.region===region));s=step(s,{skip:true});assert.equal(s.current,'CN');

console.log('Passed embassy discount, zero-cost floor, optional regional reset, reload/rollback and Open Diplomacy continuation.');

// Searching includes the buried right pile, which the legacy r.deck omits.
// Its preview must neither reveal nor reshuffle cards, and a failed payment
// must preserve the previously saved readiness and region decisions.
s=ready();s.round=s.flow.round=4;s.players.US.growth=['cee1874f2f132'];
const ally='c5bc763998f23';s.players.US.exhaustedAllies=[ally];
revealCountry(s.regions.E);revealCountry(s.regions.E);
target=s.regions.E.countryPiles.right.slice(1).find(id=>!countryInfo(id).blockedPowers.includes('US'));
assert.ok(target);assert.ok(!s.regions.E.available.includes(target));
assert.throws(()=>relationPreview(s,{country:target,slot:'temporary'}));
const allCountries=state=>Object.values(state.regions).flatMap(regionCountries).concat(Object.values(state.players).flatMap(p=>[...p.allies,...Object.values(p.countryUnderlays||{}).flat()])).sort();
const beforeCountries=allCountries(s),regionPool=regionCountries(s.regions.E);
s=start(s,'建设性谈判');assert.match(renderSequencePanel(s,byId),/sequence-ally/);
s=step(s,{country:ally});assert.ok(!s.players.US.exhaustedAllies.includes(ally));
assert.match(renderSequencePanel(s,byId),/sequence-skip/);s=step(s,{region:'E'});s=JSON.parse(JSON.stringify(s));
assert.equal(sequenceCard(s).countrySearchRegion,'E');
const form=renderBasicForm(s,cardId('建设性谈判'),byId,undefined,true);assert.ok(form.includes(target));assert.match(form,/basic-country-face/);
const choice={country:target,exhaust:[ally],slot:'temporary',openDiplomacy:true};
const beforePreview=JSON.stringify(s),preview=sequencePreview(s,choice);assert.equal(JSON.stringify(s),beforePreview);
assert.equal(preview.cost,Math.max(0,countryInfo(target).countryValue-countryInfo(ally).countryValue));
const wrongRegion=relationCountries(s).find(id=>countryInfo(id).region!=='E');assert.throws(()=>step(s,{country:wrongRegion,slot:'temporary'}));
const poor=structuredClone(s);poor.players.US.resources[5]=0;const poorSnapshot=JSON.stringify(poor);
assert.throws(()=>step(poor,{country:target,slot:'temporary'}));assert.equal(JSON.stringify(poor),poorSnapshot);
s=step(s,choice);assert.deepEqual(allCountries(s),beforeCountries);
assert.deepEqual(regionCountries(s.regions.E).sort(),regionPool.filter(id=>id!==target).sort());
assert.equal(s.regions.E.available.length,2);assert.ok(s.players.US.allies.includes(target));
assert.ok(s.flow.pendingRelation);assert.equal(s.flow.pendingRelation.card.countrySearchRegion,undefined);
const exposed=s.regions.E.available.find(id=>!countryInfo(id).blockedPowers.includes('US'));
assert.ok(exposed);s=applyAction(s,{type:'resolveOpenDiplomacy',country:exposed,slot:'temporary'});assert.equal(s.current,'CN');
assert.deepEqual(allCountries(s),beforeCountries);

// The optional search can be declined while retaining the completed readying.
s=ready();s.players.US.exhaustedAllies=[ally];s=start(s,'建设性谈判');s=step(s,{country:ally});
const untouched=JSON.stringify(s.regions);s=step(s,{skip:true});assert.equal(JSON.stringify(s.regions),untouched);assert.ok(!s.players.US.exhaustedAllies.includes(ally));assert.equal(s.current,'CN');

// One or zero countries remaining must not duplicate a card to fill two slots.
for(const pool of [['a','b'],['a']]){const r={available:pool,deck:[]};acquireSearchedCountry(r,'a',()=>0.5);assert.deepEqual(regionCountries(r),pool.filter(id=>id!=='a'));assert.equal(r.available.length,pool.length-1);}
console.log('Passed negotiation ready/search/decline, buried right-pile acquisition, pure preview, failed-payment rollback, country conservation, short piles and post-shuffle Open Diplomacy.');
