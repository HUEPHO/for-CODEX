import assert from 'node:assert/strict';
import {producePrimary,resolveFocus,resolveProsperity,gainResource,focusCost} from '../dist/economy.js';
const player=()=>({production:[1,3,3,4,1,3,2],resources:[9,9,9,9,9,9,99],money:30,vp:0,prosperity:0,focus:'内政焦点',allies:['a','b'],exhaustedAllies:['a','b']});
let p=player();assert.equal(gainResource(p,0,3),6);assert.equal(p.resources[0],10);assert.equal(gainResource(p,3,3),20);assert.equal(gainResource(p,5,3),0);assert.equal(p.resources[5],10);gainResource(p,6,3);assert.equal(p.resources[6],102);
p=player();let s={current:'CN',players:{CN:p}};producePrimary(s);assert.deepEqual(p.resources.slice(0,3),[10,10,10]);assert.equal(p.money,42);
p=player();s={current:'CN',players:{CN:p}};p.resources=[1,1,1,0,0,0,0];resolveFocus(s,{ready:['a'],upgrades:[0,4],quantities:[0,0,0,1,1,0,0]});assert.equal(p.money,15);assert.deepEqual(p.production,[2,3,3,4,2,3,2]);assert.deepEqual(p.resources,[0,0,0,1,1,0,0]);assert.deepEqual(p.exhaustedAllies,['b']);assert.equal(focusCost('EU','内政焦点',[0]),7);assert.throws(()=>focusCost('CN','内政焦点',[0,0]));
p=player();s={current:'CN',players:{CN:p}};p.focus='外交焦点';p.resources[5]=9;resolveFocus(s,{upgrades:[5],quantities:[0,0,0,0,0,4,0]});assert.equal(p.money,12);assert.equal(p.resources[5],10);assert.equal(p.production[5],4);
p=player();s={current:'CN',players:{CN:p}};const o=resolveProsperity(s,true);assert.deepEqual(o,{cost:2,vp:3,money:5});assert.equal(p.prosperity,1);assert.equal(p.vp,3);p.prosperity=4;p.resources[3]=6;assert.deepEqual(resolveProsperity(s,true),{cost:6,vp:11,money:0});assert.throws(()=>resolveProsperity(s,true));
console.log('Passed printed economy examples: overflow, asymmetric costs/caps, CN dual upgrade, ordered production payment, diplomacy cap and prosperity rewards.');

const {createState,applyAction}=await import('../dist/engine.js');
const {newFlow}=await import('../dist/flow.js');
const fs=await import('node:fs');const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
let game=createState(cards);for(const p of Object.values(game.players)){p.openingChoices=null;p.assetChoices=null;p.objectiveChoices=null;}
game.flow=newFlow(['CN','US','EU','RU'],2);game.round=2;game.phase='准备';game.flow.step='production';game.current='CN';
const original=JSON.stringify(game);game=applyAction(game,{type:'confirmProduction'});assert.equal(game.flow.step,'focus');assert.notEqual(JSON.stringify(game),original);assert.throws(()=>applyAction(game,{type:'confirmProduction'}));
game.players.CN.money=15;game.players.CN.resources[0]=0;game.players.CN.resources[1]=0;
const before=JSON.stringify(game);assert.throws(()=>applyAction(game,{type:'confirmFocus',upgrades:[0,1],quantities:[0,0,0,4,0,0,0]}));assert.equal(JSON.stringify(game),before);
game=applyAction(game,{type:'confirmFocus',upgrades:[0,1]});assert.equal(game.current,'US');assert.equal(game.players.CN.money,0);assert.equal(game.players.CN.production[0],2);assert.equal(game.players.CN.resources[0],1);
const wrong=applyAction(game,{type:'switch',player:'CN'});assert.throws(()=>applyAction(wrong,{type:'confirmFocus'}));
for(let i=0;i<3;i++)game=applyAction(game,{type:'confirmFocus'});assert.equal(game.phase,'行动');assert.throws(()=>applyAction(game,{type:'focus',focus:'外交焦点'}));
game.phase='余波';game.flow.step='aftermath';game.flow.checks=['投资回报'];game.current='CN';game.players.CN.resources[3]=10;
const startVP=game.players.CN.vp;game=applyAction(game,{type:'resolveProsperity',improve:true});assert.equal(game.players.CN.vp,startVP+3);assert.equal(game.players.CN.resources[3],8);
assert.throws(()=>applyAction(applyAction(game,{type:'switch',player:'CN'}),{type:'resolveProsperity',improve:true}));
for(let i=0;i<3;i++)game=applyAction(game,{type:'resolveProsperity',improve:false});assert.throws(()=>applyAction(game,{type:'resolveProsperity',improve:true}));
assert.equal(JSON.parse(JSON.stringify(game)).players.CN.prosperity,1);
const legacy=structuredClone(game);delete legacy.economyVersion;legacy.flow.step='production';legacy.phase='准备';assert.throws(()=>applyAction(legacy,{type:'confirmProduction'}));assert.ok(applyAction(legacy,{type:'confirmProduction',confirmed:true}));
console.log('Passed flow integration: atomic failed payment, one-time primary production, player order, focus lock, once-per-round prosperity, save/restore and legacy fallback.');
