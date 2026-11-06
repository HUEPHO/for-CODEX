import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {AUTOMA_DECISIONS,AUTOMA_PLAYERS} from '../dist/automa-data.js';
import {prepareAutoma,playAutomaTurn,researchAutoma,automaIncome,automaProsperity,scoreAutomaObjectives,addAutomaRoundCubes,performAutomaAction,automaGrowthCost} from '../dist/automa.js';
import {placeAutomaInfluence,militaryAutomaRegions} from '../dist/automa-board.js';
import {AREAS,syncInfluence} from '../dist/world.js';
import {GROWTH_DATA} from '../dist/growth-data.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),ids=['US','EU','RU','CN'];
const fixture=(id='US',difficulty='normal')=>createState(cards,{dd:true,wit:false,automatonMode:'advanced',automaDifficulty:difficulty,humans:ids.filter(x=>x!==id)},()=>0.41);
assert.equal(AUTOMA_DECISIONS.length,12);assert.deepEqual(AUTOMA_DECISIONS.map(c=>c.id),Array.from({length:12},(_,i)=>i+1));
{const s=fixture('US','hard'),p=s.players.US;for(const [round,action] of [[2,'base'],[4,'engage'],[5,'invest'],[6,'base']]){s.round=round;const n=p.automa.cubes[action];addAutomaRoundCubes(s,'US');assert.equal(p.automa.cubes[action],n+1);}}
for(const difficulty of ['normal','hard'])for(const id of ids){let s=fixture(id,difficulty),p=s.players[id];assert.equal(p.deck.length,12);assert.equal(p.money,AUTOMA_PLAYERS[id].money);assert.equal(p.vp,10);assert.ok(p.allies.length);assert.equal(p.nonPlayer,undefined);
 for(let round=1;round<=6;round++){
  s.round=round;addAutomaRoundCubes(s,id);prepareAutoma(s,id);
  for(let turn=0;turn<4;turn++){playAutomaTurn(s,id);assert.ok(p.money>=0);assert.ok(Object.values(p.automa.cubes).every(n=>n>=0));assert.ok(p.resources.every(n=>n===0));}
  if(round<6){researchAutoma(s,id);assert.equal(p.deck.length+p.discard.length+p.played.length-(p.automa.marketCard?1:0),12);}
  automaIncome(s,id);automaProsperity(s,id);
  if([3,6].includes(round)){const before=p.vp,result=scoreAutomaObjectives(s,id);assert.equal(result.cards.length,2);assert.equal(p.vp,before+result.points);assert.ok(result.cards.every(c=>c.tasks.every(t=>typeof t.met==='boolean')));}
  s=JSON.parse(JSON.stringify(s));p=s.players[id];
 }
 assert.equal(Object.values(p.automa.cubes).reduce((a,b)=>a+b,0),difficulty==='hard'?7:6);assert.equal(p.automa.objectiveDiscard.length,4);
}
// Normal must not push its own cube; hard mode puts it permanently even when full.
for(const difficulty of ['normal','hard']){const s=fixture('US',difficulty),r=s.regions.M;r.permanent.fill('CN');r.temporary=Array(AREAS.M.temp.length).fill('US');syncInfluence(r);const before=s.players.US.vp;assert.equal(placeAutomaInfluence(s,'US','M'),difficulty==='hard');assert.equal(r.temporary.length,AREAS.M.temp.length);assert.equal(r.extraPermanent.length,difficulty==='hard'?1:0);assert.equal(s.players.US.vp,before);}
// Fallback trade moves economic cubes only, preserving the failed action's row.
{const s=fixture(),p=s.players.US;p.money=0;const before=structuredClone(p.automa.cubes);const result=performAutomaAction(s,'US','base');assert.equal(result.action,'trade');assert.equal(p.automa.cubes.base,before.base);assert.equal(p.automa.cubes.move,before.move);assert.ok(p.money>0);}
// Priority two considers any other power's higher influence; priority three
// counts all threatened powers outside the zone, not just newly threatened ones.
{const s=fixture();for(const r of Object.values(s.regions)){r.influence={US:10,CN:0,EU:0,RU:0,neutral:0};}s.regions.P.influence.EU=11;assert.deepEqual(militaryAutomaRegions(s,'US'),['P']);}
{const s=fixture();for(const r of Object.values(s.regions))r.armies.US=1;s.players.US.automa.bases.C=1;s.players.US.automa.bases.S=1;assert.deepEqual(militaryAutomaRegions(s,'US'),['C']);}
// Investments are regional, allow one more token than allied countries, and earn 5 each.
{const s=fixture(),p=s.players.US,region=RESEARCH_DATA[p.allies[0]].region;p.allies=p.allies.filter(c=>RESEARCH_DATA[c].region===region);p.money=500;const max=p.allies.length+1;
 for(let i=0;i<max;i++)performAutomaAction(s,'US','invest',{move:false});assert.equal(p.automa.investments[region],max);assert.equal(p.fdi.length,0);const before=p.money;assert.equal(automaIncome(s,'US').total,max*5);assert.equal(p.money,before+max*5);}
// Printed multi-type cube chooses economic normally; hard performs both symbols.
for(const difficulty of ['normal','hard']){const s=fixture('US',difficulty),p=s.players.US,card='c1572d344b120';p.automa.marketCard=card;p.deck.unshift(card);p.money=100;const n=p.automa.history.length;playAutomaTurn(s,'US');assert.equal(p.automa.history.length-n,difficulty==='hard'?3:2);assert.ok(s.removedAbilities.includes(card));assert.equal(p.automa.marketCard,null);assert.equal(p.deck.length,11);}
// Development costs convert each printed symbol, never run human growth abilities.
assert.equal(automaGrowthCost(GROWTH_DATA.c0ec0ed27c8bf),35);
{const s=fixture(),p=s.players.US;p.money=100;const result=performAutomaAction(s,'US','growth');assert.equal(p.growth.length,1);assert.equal(result.vp,GROWTH_DATA[result.card].vp+1);assert.deepEqual(p.automatedGrowth,[]);}
// Upgrading an automa's starting ally returns its old face but preserves another
// player's investment ownership on that same country.
{const s=fixture(),p=s.players.US,old=p.allies[0],country=Object.keys(RESEARCH_DATA).find(cid=>!RESEARCH_DATA[cid].starting&&RESEARCH_DATA[cid].countryName===RESEARCH_DATA[old].countryName),region=RESEARCH_DATA[old].region;
 for(const [r,v] of Object.entries(s.regions)){v.available=r===region?[country]:[];v.countryPiles={left:[...v.available],right:[]};v.deck=[];}
 p.money=100;s.players.CN.foreignInvestments=[{host:'US',country:old}];performAutomaAction(s,'US','relations',{move:false});assert.ok(p.allies.includes(country));assert.ok(!p.allies.includes(old));assert.equal(s.players.CN.foreignInvestments[0].country,country);assert.equal(p.countryUnderlays?.[country],undefined);}
console.log('Advanced automa core: all four powers in normal/hard six-round lifecycles, printed decisions, persisted decks, objective scores, cube conservation, regional FDI caps/returns, fallback trade, influence self-push, multi-type market cards and growth conversion passed.');
