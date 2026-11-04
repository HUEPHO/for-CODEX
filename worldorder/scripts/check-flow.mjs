import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction,POWERS} from '../dist/engine.js';
import {aftermathSteps,countryPiles,syncCountries,acquireCountry} from '../dist/flow.js';
import {scoringPreview} from '../dist/world.js';
import {renderFlow} from '../dist/flow-ui.js';
import {settlementProgress} from '../dist/phase-state.js';
import {eventTestAction} from './event-test-actions.mjs';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
function setup(wit=true,dd=true){let s=createState(cards,{wit,dd},()=>.3);for(const player of Object.keys(POWERS)){
 s=applyAction(s,{type:'switch',player});s=applyAction(s,{type:'chooseOpening',group:0});
 for(const c of s.players[player].assetChoices.slice(0,2))s=applyAction(s,{type:'toggleAssetSelection',id:c.id});
 for(const id of s.players[player].objectiveChoices?.slice(0,2)||[])s=applyAction(s,{type:'toggleObjectiveSelection',id});
 s=applyAction(s,{type:'chooseAssets'});
}return s;}
const go=(s,type,fields={})=>applyAction(s,{type,...fields});
function settle(s,step){
 if(step==='目标卡计分'){for(let i=0;i<4;i++)s=go(s,'settlePhaseTask',{taskId:settlementProgress(s).key,confirmed:true,cardId:s.players[s.current].objectives.find(id=>!(s.players[s.current].scoredObjectives||[]).some(row=>row.cardId===id)),points:0,scoreMode:'apply'});return s;}
 if(s.worldVersion&&step==='投资回报'){for(let i=0;i<4;i++)s=go(s,'resolveInvestments');return s;}
 if(s.worldVersion&&step==='威胁结算'){for(let i=0;i<4;i++)s=go(s,'resolveThreat');return s;}
 if(s.worldVersion&&step==='地区与多数计分')return go(s,'scoreWorld');
 if(s.worldVersion&&step==='Smart Power计分')return go(s,'scoreSmart');
 if(step==='繁荣提升'&&s.economyVersion){for(let i=0;i<4;i++)s=go(s,'resolveProsperity',{improve:false});return s;}
 return go(s,'confirmAftermath',{step,confirmed:true});
}
function inventory(s){return Object.values(s.players).flatMap(p=>[...p.hand,...p.deck,...p.played,...p.discard]).concat(s.market,s.marketDeck,s.marketDiscard||[]).sort();}
for(const wit of [false,true]){
 let s=setup(wit,wit);const allCards=inventory(s),allCountries=Object.fromEntries(Object.entries(s.regions).map(([id,r])=>[id,[...r.available,...r.deck].sort()]));
 assert.throws(()=>go(s,'nextRound'));assert.throws(()=>go(s,'phase',{phase:'研究'}));assert.throws(()=>go(s,'market',{id:s.market[0]}));
 for(let round=1;round<=6;round++){
  assert.equal(s.round,round);assert.equal(s.flow.step,'actions');
  for(let turn=0;turn<16;turn++){
   assert.equal(s.current,s.flow.order[turn%4]);
   const player=s.players[s.current];if(player.hand.length)s=go(s,'play',{id:player.hand[0]});
   s=go(s,'endAction');
  }
  assert.deepEqual(s.actionTurns.completed,{US:4,CN:4,EU:4,RU:4});
  if(round<6){
   assert.equal(s.flow.step,'research');
   for(let i=0;i<4;i++){
    const actor=s.current;
    s=go(s,'startResearch');assert.ok(s.flow.research.remaining>=2);
    assert.equal(s.players[actor].played.length,0);
    assert.throws(()=>go(s,'startResearch'));
    assert.throws(()=>go(s,'draw'));
    s=go(s,'finishResearch');assert.equal(s.players[actor].hand.length,0);
    s=JSON.parse(JSON.stringify(s));
   }
  }else assert.notEqual(s.flow.step,'research');
  if(wit){assert.equal(s.flow.step,'events');assert.throws(()=>go(s,'confirmEvents',{confirmed:true}));let count=0;while(s.flow.step==='events'){assert.ok(count++<70);s=applyAction(s,eventTestAction(s));}assert.throws(()=>go(s,'confirmEvents',{confirmed:true}));}
  assert.equal(s.flow.step,'aftermath');
  for(const step of aftermathSteps(s)){assert.throws(()=>go(s,'confirmAftermath',{step:'wrong',confirmed:true}));s=settle(s,step);}
  assert.deepEqual(inventory(s),allCards);
  assert.ok(renderFlow(s).includes(round===6?'六轮结束':'轮完成'));
  if(round===6){assert.equal(s.flow.step,'ended');assert.throws(()=>go(s,'nextRound'));break;}
  s=go(s,'nextRound');assert.equal(s.phase,'准备');for(const p of Object.values(s.players))assert.equal(p.hand.length,6);
  s=go(s,'confirmCountries');
  for(const [id,r] of Object.entries(s.regions))assert.deepEqual([...r.countryPiles.left,...r.countryPiles.right].sort(),allCountries[id]);
  const expected=[...Object.keys(POWERS)].sort((a,b)=>s.players[a].vp-s.players[b].vp||s.players[a].money-s.players[b].money||POWERS[a].money-POWERS[b].money);
  assert.deepEqual(s.flow.draft.queue,expected);
  for(let i=0;i<4;i++){assert.equal(s.current,expected[i]);s=go(s,'chooseOrderSlot',{slot:3-i});if(i<3)assert.throws(()=>go(s,'chooseOrderSlot',{slot:3-i}));}
  assert.deepEqual(s.flow.order,[...expected].reverse());
  s=go(s,'confirmProduction',{confirmed:true});for(let i=0;i<4;i++)s=go(s,'confirmFocus',{confirmed:true});
 }
}
// Tie ordering uses current money before starting money, and freezes during selection.
let tie=setup(false,false);tie.flow.step='countries';tie.phase='准备';
for(const p of Object.values(tie.players)){p.vp=10;p.money=20;}
tie.players.US.money=1;tie=go(tie,'confirmCountries');assert.deepEqual(tie.flow.draft.queue,['US','RU','CN','EU']);
const wrong=go(tie,'switch',{player:'CN'});assert.throws(()=>go(wrong,'chooseOrderSlot',{slot:0}));
// Small country piles recycle and retain buried right-pile cards.
const r={available:['a','b'],deck:['c']};countryPiles(r);r.countryPiles.right.unshift(r.countryPiles.left.shift());syncCountries(r);assert.deepEqual(r.available,['c','a']);acquireCountry(r,'a');assert.deepEqual(r.available,['c','b']);acquireCountry(r,'c');assert.deepEqual(r.available,['b']);
// Final unused-asset bonus is applied once, after manual scoring confirmation.
let final=setup(false,false);final.round=6;final.flow.round=6;final.flow.step='aftermath';final.phase='余波';const vp=final.players.US.vp;
const score=scoringPreview(final).totals.US;for(const step of aftermathSteps(final))final=settle(final,step);assert.equal(final.players.US.vp,vp+score+4);assert.throws(()=>go(final,'confirmAftermath',{step:'地区与多数计分',confirmed:true}));
console.log('Passed full six-round games with/without expansions; research payment/refresh/cleanup, persistence, card conservation, country piles, turn draft, confirmation guards and final scoring bonus.');
