import assert from 'node:assert/strict';
import {initializeWorld,changeInfluence,threatPreview,rankBonus,scoringPreview} from '../dist/world.js';
const ids=['US','CN','EU','RU'];const s={round:3,current:'US',players:Object.fromEntries(ids.map(id=>[id,{vp:0,money:0,allies:[],focus:'内政焦点'}])),regions:Object.fromEntries(['M','E','C','N','A','S','P'].map(id=>[id,{armies:Object.fromEntries(ids.map(x=>[x,0]))}]))};initializeWorld(s);
assert.deepEqual(s.regions.A.temporary,['EU']);assert.deepEqual(s.regions.A.permanent,[null,null]);
for(let i=0;i<5;i++)changeInfluence(s,{region:'M',operation:'placeTemporary'});assert.equal(s.players.US.vp,10);assert.equal(s.regions.M.temporary.length,4);
changeInfluence(s,{region:'M',operation:'convert',index:0});assert.equal(s.players.US.vp,10);assert.equal(s.regions.M.influence.US,5);
const bonus=rankBonus([{id:'a',value:8},{id:'b',value:5},{id:'c',value:5},{id:'d',value:0}],[6,3,1]);assert.equal(bonus.b.vp,1);
s.regions.E.armies={US:3,CN:0,EU:1,RU:2};s.players.RU.focus='军事焦点';assert.equal(threatPreview(s,'EU').total,2);assert.equal(threatPreview(s,'US').total,0);assert.equal(threatPreview(s,'RU').total,0);
const r=s.regions.N;r.permanent=['US','US','US','EU','RU','neutral'];r.extraPermanent=['US'];r.temporary=['EU','RU','RU','EU','CN'];const {syncInfluence}=await import('../dist/world.js');syncInfluence(r);r.armies={US:3,EU:1,RU:4,CN:0};const result=scoringPreview(s).regions.find(r=>r.region==='N');assert.deepEqual(result.points,{US:14,CN:1,EU:7,RU:10});assert.equal(scoringPreview(s).regions.find(r=>r.region==='A').eligible,false);
console.log('Passed board setup, temporary overflow/conversion, lowest tied ranks, NATO/focus threat and rulebook Middle East scoring example.');

const {createState,applyAction}=await import('../dist/engine.js');const {newFlow}=await import('../dist/flow.js');const {investmentPreview,winners,smartPreview}=await import('../dist/world.js');const fs=await import('node:fs');const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
let game=createState(cards,{dd:false,wit:true});for(const p of Object.values(game.players)){p.openingChoices=null;p.assetChoices=null;p.objectiveChoices=null;}
game.flow=newFlow(['EU','US','CN','RU']);game.flow.step='aftermath';game.phase='余波';game.current='EU';
const country=name=>cards.find(c=>['country','startingCountry'].includes(c.type)&&c.name===name).id;
game.players.EU.allies=['挪威','约旦','土耳其'].map(country);game.players.EU.fdi=[...game.players.EU.allies];assert.equal(investmentPreview(game,'EU').fdi,10);
game.regions.N.engage.EU=2;const before=JSON.stringify(game);assert.throws(()=>applyAction(game,{type:'resolveInvestments',withdraw:{N:3}}));assert.equal(JSON.stringify(game),before);
const cash=game.players.EU.money;game=applyAction(game,{type:'resolveInvestments',withdraw:{N:1}});assert.equal(game.players.EU.money,cash+20);assert.equal(game.regions.N.engage.EU,1);
assert.throws(()=>applyAction(applyAction(game,{type:'switch',player:'EU'}),{type:'resolveInvestments'}));
for(let i=0;i<3;i++)game=applyAction(game,{type:'resolveInvestments'});for(let i=0;i<4;i++)game=applyAction(game,{type:'resolveProsperity',improve:false});
game.players.EU.allies=[country('挪威')];game.regions.E.armies.RU=2;game.regions.E.engage.EU=1;assert.equal(threatPreview(game,'EU').total,2);assert.equal(threatPreview(game,'EU',['E']).total,0);
game=applyAction(game,{type:'resolveThreat',defend:['E']});assert.equal(game.regions.E.engage.EU,0);for(let i=0;i<3;i++)game=applyAction(game,{type:'resolveThreat'});assert.equal(game.flow.step,'roundEnd');assert.throws(()=>applyAction(game,{type:'resolveThreat'}));
game.round=6;game.flow.round=6;game.phase='余波';game.flow.step='aftermath';game.flow.checks=['投资回报','繁荣提升','威胁结算'];game=applyAction(game,{type:'scoreWorld'});assert.throws(()=>applyAction(game,{type:'scoreWorld'}));game=JSON.parse(JSON.stringify(game));assert.ok(game.finalRegionWins);game=applyAction(game,{type:'scoreSmart'});assert.equal(game.phase,'结束');assert.throws(()=>applyAction(game,{type:'scoreSmart'}));
for(const id of ids){game.players[id].vp=5;game.finalRegionWins[id]=0;}game.finalRegionWins.CN=1;assert.deepEqual(winners(game),['CN']);game.finalRegionWins.US=1;for(const r of Object.values(game.regions))r.influence={US:0,CN:0,EU:0,RU:0,neutral:0};assert.deepEqual(winners(game),['US','CN']);
assert.deepEqual(smartPreview({...game,players:Object.fromEntries(ids.map(id=>[id,{smart:2}]))}),{US:0,CN:0,EU:0,RU:0});
console.log('Passed FDI/Engage income, atomic invalid withdrawals, defense choice, duplicate-settlement guards, save/restore, final winner ties and SP ties.');
