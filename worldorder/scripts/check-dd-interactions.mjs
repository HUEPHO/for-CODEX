import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow,flowActor} from '../dist/flow.js';
import {sequenceStep,sequenceCard,sequenceParameters,sequenceName} from '../dist/card-sequence.js';
import {readyRegionalAllies} from '../dist/opponent-effects.js';
import {renderSequencePanel} from '../dist/card-sequence-ui.js';
import {renderBasicForm} from '../dist/basic-actions-ui.js';
import {intelligenceCandidates,copyAbilityPreview} from '../dist/intelligence.js';
import {investmentCost} from '../dist/research.js';
import {DD_MARKET_CARDS} from '../dist/dd-market-data.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
function ready(cardId,owner='US'){const s=createState(cards,{dd:true,wit:true},()=>0.5);for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;s.current=owner;s.flow=newFlow([owner,...Object.keys(s.players).filter(id=>id!==owner)]);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};const p=s.players[owner];p.hand=[cardId];p.money=100;p.resources=Array(7).fill(10);return s;}
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',...a});
const start=(s,id)=>applyAction(s,{type:'startSequenceCard',cardId:id});
const reload=s=>JSON.parse(JSON.stringify(s));
const forceId='cbf79cb4a95c0',baseCountry='c5b14895e1f71';
function forceBase(id=forceId){let s=ready(id);s.players.CN.allies.push('cded08a20d167','c3152a6b7e123');s=start(s,id);s=step(s,{country:baseCountry,send:1,slot:'temporary'});return s;}
for(const id of [forceId,'cf813d3206bfa']){
 let s=forceBase(id);assert.equal(s.players.US.money,90);const vp=s.players.US.vp;s=step(s,{choices:['move']});assert.equal(sequenceCard(s).onlyDestination,'N');assert.throws(()=>step(s,{moves:[]}));assert.throws(()=>step(s,{moves:[{from:'reserve',to:'P'}]}));
 s=step(s,{moves:[{from:'reserve',to:'N'}]});assert.equal(s.players.US.money,85);assert.equal(s.players.US.resources[6],8);assert.equal(s.players.US.vp,vp);
 for(const player of ['CN','EU','RU']){assert.equal(s.current,player);assert.equal(flowActor(s),player);s=reload(s);const options=readyRegionalAllies(s,player,'N'),country=options.at(-1);assert.ok(country);assert.match(renderSequencePanel(s,byId),/sequence-exhaust-ally/);assert.doesNotMatch(renderSequencePanel(s,byId),/sequence-manual/);const before=JSON.stringify(s);assert.throws(()=>step(s,{skip:true}));assert.throws(()=>step(s,{country:baseCountry}));assert.throws(()=>applyAction(s,{type:'switch',player:'US'}));assert.throws(()=>applyAction(s,{type:'endAction'}));assert.throws(()=>step({...s,current:'US'},{country}),/切换/);assert.equal(JSON.stringify(s),before);s=step(s,{country});assert.ok(s.players[player].exhaustedAllies.includes(country));assert.equal(s.actionTurns.completed[player],0);}
 assert.equal(s.flow.cardResolution,null);assert.equal(s.actionTurns.completed.US,1);assert.equal(s.actionTurns.index,1);assert.equal(s.players.US.money,85);
}
let s=forceBase();s=step(s,{choices:['skip']});assert.equal(s.players.US.money,90);assert.equal(s.regions.N.armies.US,1);assert.equal(s.actionTurns.index,1);
s=forceBase();s.players.US.money=4;assert.throws(()=>step(s,{choices:['move']}),/无法继续/);assert.equal(s.players.US.money,4);assert.equal(s.current,'US');s=step(s,{choices:['skip']});assert.equal(s.current,'CN');
s=forceBase();s.players.CN.exhaustedAllies=readyRegionalAllies(s,'CN','N');s.players.EU.exhaustedAllies=readyRegionalAllies(s,'EU','N');s.players.RU.exhaustedAllies=readyRegionalAllies(s,'RU','N');s=step(s,{choices:['move']});s=step(s,{moves:[{from:'reserve',to:'N'}]});assert.equal(s.actionTurns.index,1);assert.equal(s.flow.cardResolution,null);
s=forceBase();s.round=s.flow.round=s.flow.cardResolution.round=4;s.players.US.growth=['c2ac1e1f24d0a'];s=step(s,{choices:['move']});s=step(s,{moves:[{from:'reserve',to:'N'}]});while(s.flow.cardResolution?.responder)s=step(s,{country:readyRegionalAllies(s,s.current,'N')[0]});assert.equal(s.current,'US');assert.equal(s.flow.extraCard.owner,'US');assert.equal(s.actionTurns.index,0);
console.log('Passed Show of Force: normal base and extra move costs, fixed destination, voluntary move skip, each opponent chooses their own ready ally in order, empty responses skip, state restore and original-turn/extra-play continuity.');

const spy='c8bdff4e4f259',spy2='c4c7a1bd4db53',invest='c6ebb892bb47a',optimizer='c46731b5878a9',freeCard='cfefb40dc1370';
function spyReady(id=spy){const s=ready(id);s.players.CN.hand=[invest];s.players.CN.played=[];s.players.RU.hand=['c2a848893da52'];return s;}
const inspect=(s,player)=>step(s,{targetPlayer:player});
const copy=(s,targetCard,zone='hand')=>step(s,{targetCard,zone});
for(const id of [spy,spy2]){
 s=start(spyReady(id),id);assert.equal(sequenceStep(s).type,'inspectOpponent');assert.doesNotMatch(renderSequencePanel(s,byId),new RegExp(invest));assert.throws(()=>inspect(s,'US'));
 s=inspect(s,'CN');assert.match(renderSequencePanel(s,byId),new RegExp(invest));assert.doesNotMatch(renderSequencePanel(s,byId),/c2a848893da52/);s=reload(s);const before=JSON.stringify(s);assert.equal(copyAbilityPreview(s,{targetCard:invest,zone:'hand'},sequenceParameters(s)).name,'量化宽松');assert.equal(JSON.stringify(s),before);
 assert.throws(()=>copy(s,'c2a848893da52'));assert.throws(()=>copy(s,invest,'discard'));assert.throws(()=>applyAction(s,{type:'endAction'}));s=copy(s,invest);assert.equal(s.flow.cardResolution.cardId,id);assert.equal(s.flow.turnCards.length,1);assert.match(sequenceName(s),/复制量化宽松/);assert.match(renderBasicForm(s,invest,byId,undefined,true),/data-sequence="true"/);s=reload(s);
 const opponent=structuredClone(s.players.CN);s=step(s,{country:baseCountry,slot:'temporary'});assert.equal(s.players.US.money,110-investmentCost(baseCountry));assert.deepEqual(s.players.CN,opponent);assert.deepEqual(s.players.US.played,[id]);assert.ok(s.players.US.fdi.includes(baseCountry));assert.equal(s.actionTurns.index,1);
}

// Covered cards, assets, and another player's cards are not copy candidates.
s=spyReady();s.players.CN.played=[invest,'cf9aa23c4a315'];s.players.CN.hand=['ca58c2d75ac35'];s.players.CN.faceDownPlayed=['cf9aa23c4a315'];s=start(s,spy);s=inspect(s,'CN');assert.deepEqual(intelligenceCandidates(s,'CN'),[{zone:'played',cardId:invest}]);assert.doesNotMatch(renderSequencePanel(s,byId),/cf9aa23c4a315/);assert.throws(()=>copy(s,'cf9aa23c4a315','played'));assert.throws(()=>copy(s,'ca58c2d75ac35'));s=copy(s,invest,'played');s=step(s,{country:baseCountry,slot:'temporary'});assert.ok(s.players.CN.played.includes(invest));
s=start(spyReady(),spy);s=inspect(s,'RU');s=step(s,{skip:true});assert.equal(s.actionTurns.index,1);assert.deepEqual(s.players.US.played,[spy]);
s=spyReady();s.players.CN.hand=[];s=start(s,spy);s=inspect(s,'CN');assert.match(renderSequencePanel(s,byId),/没有可复制/);s=step(s,{skip:true});assert.equal(s.flow.cardResolution,null);

// Copying draw/extra-play draws from the acting player's deck, and spends only
// the original spy card. The extra play still belongs to its original actor.
s=spyReady();s.players.CN.hand=['cfaad0c7090c9'];s.players.US.deck=['cf9aa23c4a315','cc9cd4168dcc6'];s=start(s,spy);s=inspect(s,'CN');s=copy(s,'cfaad0c7090c9');assert.equal(s.flow.cardResolution,null);assert.deepEqual(s.players.US.hand,['cf9aa23c4a315','cc9cd4168dcc6']);assert.equal(s.flow.extraCard.owner,'US');assert.equal(s.flow.extraCard.required,false);assert.equal(s.flow.turnCards.length,1);assert.deepEqual(s.players.CN.hand,['cfaad0c7090c9']);s=applyAction(reload(s),{type:'playBasicCard',cardId:'cf9aa23c4a315',domestic:'produce',production:[]});assert.equal(s.actionTurns.index,1);

// A copied choice uses the acting player's board and preserves capped bonuses.
s=spyReady();s.players.CN.hand=['cdae00d5d8c03'];s.players.US.resources[5]=9;s=start(s,spy);s=inspect(s,'CN');s=copy(s,'cdae00d5d8c03');assert.match(renderSequencePanel(s,byId),/选择牌面行动/);assert.throws(()=>step(s,{branch:'reinforce'}));s=step(s,{branch:'engage',region:'N',slot:'temporary'});assert.equal(s.players.US.resources[5],4);assert.deepEqual(s.players.CN.hand,['cdae00d5d8c03']);

// Spy -> spy -> trash-on-play: remove only the physically played original spy.
s=spyReady();s.players.CN.hand=[spy2];s.players.RU.played=[optimizer];s.players.US.hand.push('cf9aa23c4a315');s.market=[freeCard];s=start(s,spy);s=inspect(s,'CN');s=copy(s,spy2);assert.equal(sequenceStep(s).type,'inspectOpponent');s=reload(s);s=inspect(s,'RU');s=copy(s,optimizer,'played');assert.equal(s.flow.cardResolution.cardId,spy);assert.equal(sequenceStep(s).type,'researchPlay');assert.deepEqual(s.players.US.trashed,[spy]);assert.ok(!s.players.US.played.includes(spy));assert.deepEqual(s.players.CN.hand,[spy2]);assert.deepEqual(s.players.RU.played,[optimizer]);s=reload(s);s=step(s,{targetCard:freeCard});assert.equal(s.flow.extraCard.cardId,freeCard);assert.equal(s.flow.extraCard.owner,'US');assert.throws(()=>applyAction(s,{type:'playBasicCard',cardId:'cf9aa23c4a315',domestic:'produce',production:[]}),/指定/);s=applyAction(s,{type:'playBasicCard',cardId:freeCard,country:baseCountry,slot:'temporary'});assert.equal(s.actionTurns.index,1);assert.equal(s.players.US.trashed.filter(id=>id===spy).length,1);assert.ok(!s.players.US.played.includes(optimizer));

// Copying Show of Force returns all opponent responses to the spy's original turn.
s=spyReady();s.players.CN.hand=[forceId];s.players.CN.allies.push('cded08a20d167');s=start(s,spy);s=inspect(s,'CN');s=copy(s,forceId);s=step(s,{country:baseCountry,send:1,slot:'temporary'});s=step(s,{choices:['move']});s=step(s,{moves:[{from:'reserve',to:'N'}]});while(s.flow.cardResolution?.responder){assert.equal(s.flow.cardResolution.owner,'US');s=step(reload(s),{country:readyRegionalAllies(s,s.current,'N')[0]});}assert.equal(s.actionTurns.completed.US,1);assert.equal(s.actionTurns.completed.CN,0);assert.deepEqual(s.players.CN.hand,[forceId]);assert.deepEqual(s.players.US.played,[spy]);
assert.equal(Object.keys(DD_MARKET_CARDS).length,8);
console.log('Passed Intelligence Theft: selected-player reveal, legal hand/played targets, immutable original cards, acting-player costs/choices/draws, extra plays, optional skip, nested copying, self-trash and forced research, copied opponent responses and saved-step recovery.');
