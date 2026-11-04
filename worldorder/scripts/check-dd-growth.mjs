import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {growthPreview,applyGrowth} from '../dist/domestic-actions.js';
import {prosperityOffer,resolveProsperity} from '../dist/economy.js';
import {beijingPreview} from '../dist/dd-asset-effects.js';
import {growthAbilityPreview} from '../dist/growth-active.js';
import {researchPreview} from '../dist/research.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {changeInfluence,scoringPreview,threatPreview,syncInfluence} from '../dist/world.js';
import {stepAvailability} from '../dist/sequence-availability.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const domestic='cf9aa23c4a315',other='c89c153d80dbd',armyCard=cards.find(c=>RESEARCH_DATA[c.id]?.bonus?.type==='armies').id;
const growths=['c74931cfb3833','c0ec0ed27c8bf','ca11b52d5e0ad','c70881ee5c146','ce1643bee59d6'];
function fixture(round=4){
 const s=createState(cards,{dd:true,wit:true});s.growth=cards.filter(c=>c.type==='growth').map(c=>c.id);for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 s.current='US';s.round=round;s.flow=newFlow(['US','CN','EU','RU'],round);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 const p=s.players.US;p.money=100;p.resources=Array(7).fill(10);p.hand=[domestic,other];return s;
}
function own(s,ids){s.players.US.growth=[...ids];s.players.US.automatedGrowth=[...ids];}
// Each supported D&D purchase applies all printed costs and points exactly once.
for(const [index,growthId] of growths.entries()){
 const s=fixture(4);own(s,growths.slice(0,index));const before=structuredClone(s.players.US),a={type:'playBasicCard',cardId:domestic,domestic:'growth',growthId,growthDiscard:other};
 const preview=growthPreview(s,a),next=applyAction(s,a),p=next.players.US;
 assert.equal(p.vp-before.vp,preview.growthVP);assert.equal(p.resources[4],before.resources[4]-preview.services);assert.equal(p.resources[5],before.resources[5]-preview.diplomacy);
 assert.equal(p.resources[3],before.resources[3]-preview.goods);assert.equal(p.money,before.money-preview.cost);assert.equal(p.played.at(-1),domestic);assert.equal(next.current,'CN');
 if(growthId===growths[1]){assert.ok(p.discard.includes(other));assert.ok(!p.trashed?.includes(other));assert.throws(()=>applyAction(s,{...a,growthDiscard:domestic}),/另一张/);}
}
let s=fixture(5);own(s,growths.slice(0,4));s.players.US.resources[6]=1;const purchase={type:'playBasicCard',cardId:domestic,domestic:'growth',growthId:'ca9c4244506cd'};
let before=JSON.stringify(s);assert.throws(()=>applyAction(s,purchase),/待命军队/);assert.equal(JSON.stringify(s),before);s.players.US.resources[6]=2;assert.equal(applyAction(s,purchase).players.US.resources[6],0);
// Leadership discards the whole hand, can reshuffle it, leaves played cards alone,
// does not spend an action, and rejects usage in every other phase.
s=fixture(2);own(s,[growths[1]]);s.players.US.deck=[];s.players.US.played=['c21af5cf83dc5'];let n=applyAction(s,{type:'useGrowthAbility',cardId:growths[1]});
assert.deepEqual([...n.players.US.hand].sort(),[domestic,other].sort());assert.deepEqual(n.players.US.played,['c21af5cf83dc5']);assert.equal(n.actionTurns.index,0);assert.equal(n.flow.pendingGrowth,undefined);assert.throws(()=>applyAction(n,{type:'useGrowthAbility',cardId:growths[1]}),/已经使用/);
for(const step of ['countries','focus','research','events','aftermath','roundEnd']){s.flow.step=step;assert.throws(()=>growthAbilityPreview(s,growths[1]),/仅能在行动阶段/);}
s.flow.step='actions';s.flow.extraCard={cardId:domestic};assert.throws(()=>growthAbilityPreview(s,growths[1]),/指定必须打出/);
// Income bonuses are chosen from revealed hand, add no research, obey resource caps,
// and cannot be claimed by reloading/repeating startResearch.
s=fixture();own(s,[growths[0]]);s.flow.step='research';s.phase='研究';s.players.US.hand=[domestic,other,armyCard];
const base=researchPreview(s),chosen=[other,armyCard],preview=researchPreview(s,'US',chosen);
assert.equal(base.total,preview.total);assert.equal(preview.money,base.money+RESEARCH_DATA[other].bonus.amount);assert.equal(preview.armies,base.armies+RESEARCH_DATA[chosen[1]].bonus.amount);
assert.throws(()=>applyAction(s,{type:'startResearch'}),/两张/);assert.throws(()=>applyAction(s,{type:'startResearch',incomeCards:[other,other]}),/不同/);
n=applyAction(s,{type:'startResearch',incomeCards:chosen});assert.equal(n.flow.research.remaining,base.total);assert.equal(n.players.US.money,s.players.US.money+preview.money);n=JSON.parse(JSON.stringify(n));assert.throws(()=>applyAction(n,{type:'startResearch',incomeCards:chosen}));
// Living standard modifies ordinary, Beijing and fixed-cost prosperity; dormant
// or manually acquired growth cards do not silently apply a second bonus.
s=fixture(3);own(s,[growths[2]]);s.players.US.prosperity=1;assert.deepEqual(prosperityOffer(s.players.US,'US',3),{cost:2,vp:4,money:15});assert.equal(beijingPreview(s).cost,2);assert.equal(beijingPreview(s).vp,4);
s.players.US.resources[3]=1;assert.equal(stepAvailability(s,{type:'prosperity',cost:2}).status,'pending');assert.equal(resolveProsperity(s,true,2).cost,1);assert.equal(s.players.US.resources[3],0);
s.round=2;assert.equal(prosperityOffer(s.players.US,'US',s.round).cost,4);s.round=3;s.players.US.automatedGrowth=[];assert.equal(prosperityOffer(s.players.US,'US',s.round).cost,4);
// Dominance pays at end of the entire turn once, not once per cube or card.
s=fixture(4);own(s,[growths[3]]);changeInfluence(s,{region:'M',operation:'placeTemporary'});changeInfluence(s,{region:'E',operation:'placeTemporary'});const vp=s.players.US.vp;s.flow.turnCards=[domestic];
n=applyAction(s,{type:'endAction'});assert.equal(n.players.US.vp,vp+1);assert.deepEqual(n.flow.influencePlaced,{});
s=fixture(4);own(s,[growths[3]]);s.regions.M.temporary=['US'];changeInfluence(s,{region:'M',operation:'reset',index:0});s.flow.turnCards=[domestic];n=applyAction(s,{type:'endAction'});assert.equal(n.players.US.vp,0);
// Authority wins an equal-influence tie before comparing armies; money majorities
// and objectives keep their normal tie rules.
s=fixture(6);own(s,[growths[4]]);const region=s.regions.M;region.permanent=['US','CN','EU'];region.temporary=[];syncInfluence(region);region.armies.CN=4;
let score=scoringPreview(s);assert.equal(score.regions.find(r=>r.region==='M').points.US,8);assert.equal(score.wins.US,1);assert.equal(score.majority.money.US.rank,1);
s.round=3;score=scoringPreview(s);assert.equal(score.regions.find(r=>r.region==='M').points.CN,8);
// Nuclear threat applies without armies, but US/EU exemptions and interests remain.
s=fixture(5);s.players.RU.growth=['ca9c4244506cd'];s.players.RU.automatedGrowth=['ca9c4244506cd'];s.players.US.focus='内政焦点';assert.ok(threatPreview(s,'US').rows.every(r=>r.opponents.includes('RU')));
own(s,['ca9c4244506cd']);assert.ok(threatPreview(s,'US').rows.every(r=>r.defense===1&&!r.opponents.includes('RU')));s.round=4;assert.equal(threatPreview(s,'US').total,0);
// Quick response applies once with the chosen focus before normal upgrades and
// production; invalid moves roll back the entire confirmation.
s=fixture(2);own(s,['cd18c8e5a0461']);s.flow.step='focus';s.phase='准备';s.players.US.money=5;
n=applyAction(s,{type:'confirmFocus',quickResponse:{mode:'army'}});assert.equal(n.players.US.money,0);assert.equal(n.players.US.resources[6],11);assert.equal(n.current,'CN');
s.players.US.focus='军事焦点';s.players.US.money=0;s.players.US.resources[6]=1;
n=applyAction(s,{type:'confirmFocus',quickResponse:{mode:'move',from:'reserve',to:'M'}});assert.equal(n.players.US.resources[6],0);assert.equal(n.regions.M.armies.US,1);assert.equal(n.players.US.money,0);
before=JSON.stringify(s);assert.throws(()=>applyAction(s,{type:'confirmFocus',quickResponse:{mode:'move',from:'reserve',to:'S'}}),/目的地/);assert.equal(JSON.stringify(s),before);
n=applyAction(s,{type:'confirmFocus',quickResponse:{mode:'move',from:'reserve',to:'S',spendSP:true}});assert.equal(n.players.US.smart,1);assert.equal(n.regions.S.armies.US,1);
console.log('D&D growth passed: seven faces, printed costs/discard, rollback, leadership timing/reshuffle, research bonus selection, prosperity combinations, turn receipts, authority, nuclear threat/defense and focus response.');
