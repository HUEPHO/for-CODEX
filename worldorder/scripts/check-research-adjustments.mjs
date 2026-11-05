import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {researchPreview,researchCost,countryValue,researchCanAutoStart} from '../dist/research.js';
import {GROWTH_DATA} from '../dist/growth-data.js';
import {renderFlow} from '../dist/flow-ui.js';
import {newRoom,changeRoom} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c])),ids=['US','CN','EU','RU'];
const find=notes=>cards.find(c=>c.notes===notes).id,income=Object.keys(GROWTH_DATA).find(id=>GROWTH_DATA[id].effect==='income');
const hand=[find('40C7'),find('21D'),find('41T7')],ally=find('Norway-10--E-1-E'),prior=find('Brazil-20---3-M');
function fixture(){
 const s=createState(cards,{wit:true,dd:true},()=>.5);for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.hand=[...hand];p.played=[];p.growth=[];p.automatedGrowth=[];p.allies=[ally,prior];p.exhaustedAllies=[prior];}
 s.flow=newFlow(ids);s.flow.step='research';s.phase='研究';s.current='US';s.actionTurns={index:16,completed:Object.fromEntries(ids.map(id=>[id,4]))};return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,...fields});
function reject(s,type,fields,pattern){const before=JSON.stringify(s);assert.throws(()=>act(s,type,fields),pattern);assert.equal(JSON.stringify(s),before);}
function enterResearch(s){s.flow.step='actions';s.phase='行动';s.current='RU';s.actionTurns.index=15;s.actionTurns.completed.RU=3;return act(s,'endAction');}
// Entering research and moving to the next researcher grant once, without a button.
let s=fixture();s.flow.step='actions';s.phase='行动';s.current='RU';s.actionTurns.index=15;s.actionTurns.completed.RU=3;
const before=structuredClone(s),preview=researchPreview(s,'US');s=act(s,'endAction');assert.equal(s.flow.step,'research');assert.equal(s.flow.research.remaining,preview.total);assert.equal(s.players.US.money,before.players.US.money+preview.money);assert.doesNotMatch(renderFlow(s,byId),/id="start-research"/);
const saved=JSON.parse(JSON.stringify(s)),snapshot=JSON.stringify(saved);assert.equal(researchCanAutoStart(saved),false);assert.equal(JSON.stringify(saved),snapshot);reject(s,'startResearch',{},/已经开始/);
const nextMoney=s.players.CN.money,nextBonus=researchPreview(s,'CN'),remaining=s.flow.research.remaining;s=act(s,'finishResearch');assert.equal(s.current,'CN');assert.equal(s.flow.research.remaining,nextBonus.total);assert.equal(s.players.CN.money,nextMoney+nextBonus.money);
const finished=s.settlementJournal.at(-2),started=s.settlementJournal.at(-1);assert.equal(finished.title,'完成研究');assert.equal(finished.player,'US');assert.equal(finished.researchDelta,-remaining);assert.ok(finished.changes.every(row=>row.player==='US'));assert.equal(started.title,'领取研究奖励');assert.equal(started.player,'CN');assert.equal(started.researchDelta,nextBonus.total);assert.ok(started.changes.every(row=>row.player==='CN'));
// Income is automatic when every existing card must be selected, but 3+ waits.
for(const size of [0,1,2,3]){
 s=fixture();s.players.US.growth=s.players.US.automatedGrowth=[income];s.players.US.hand=hand.slice(0,size);const p=researchPreview(s),money=s.players.US.money;
 assert.equal(researchCanAutoStart(s),size<=2);s=enterResearch(s);assert.equal(!!s.flow.research,size<=2);
 if(size<=2){assert.equal(s.players.US.money,money+p.money);assert.equal(s.flow.research.remaining,p.total);assert.equal(researchCanAutoStart(s),false);assert.doesNotMatch(renderFlow(s,byId),/id="start-research"/);}
 else{assert.equal(s.flow.research,null);assert.match(renderFlow(s,byId),/id="start-research"/);reject(s,'startResearch',{},/两张/);const chosen=hand.slice(0,2),selected=researchPreview(s,'US',chosen);s=act(s,'startResearch',{incomeCards:chosen});assert.equal(s.players.US.money,money+selected.money);assert.equal(s.flow.research.remaining,selected.total);}
}
// A persisted consumption can be undone, but previous exhaustion and repeat undo cannot.
s=enterResearch(fixture());const base=s.flow.research.remaining;s=act(s,'researchAlly',{id:ally});assert.equal(s.flow.research.remaining,base+countryValue(ally));s=JSON.parse(JSON.stringify(s));s=act(s,'undoResearchAlly',{id:ally});assert.equal(s.flow.research.remaining,base);assert.deepEqual(s.players.US.exhaustedAllies,[prior]);assert.deepEqual(s.flow.research.consumedAllies,[]);reject(s,'undoResearchAlly',{id:ally},/本次研究/);reject(s,'undoResearchAlly',{id:prior},/本次研究/);reject(s,'readyAlly',{id:prior},/研究阶段/);reject(s,'exhaustAlly',{id:ally},/研究阶段/);
// Buying the card consumes research; a rejected refund preserves the actual purchase.
s=fixture();s.players.US.hand=[];s.players.US.focus='军事焦点';s=enterResearch(s);s.players.US.allies=[prior];s.players.US.exhaustedAllies=[];s=act(s,'researchAlly',{id:prior});const cheap=cards.find(c=>c.type==='ability'&&researchCost(c.id)<=countryValue(prior));s.market=[cheap.id];s.marketDeck=[];s=act(s,'researchBuy',{id:cheap.id});assert.ok(s.players.US.deck.includes(cheap.id));const points=s.flow.research.remaining;reject(s,'undoResearchAlly',{id:prior},/剩余研究力不足/);assert.equal(s.flow.research.remaining,points);assert.equal(s.players.US.deck[0],cheap.id);
// Old research saves have no guessed history; only new consumptions get a receipt.
s=enterResearch(fixture());delete s.flow.research.consumedAllies;reject(s,'undoResearchAlly',{id:prior},/本次研究/);s=act(s,'researchAlly',{id:ally});assert.deepEqual(s.flow.research.consumedAllies,[ally]);
let wrong=structuredClone(s);wrong.current='CN';reject(wrong,'undoResearchAlly',{id:ally},/切换/);wrong=structuredClone(s);wrong.flow.step='actions';wrong.phase='行动';wrong.actionTurns.index=0;reject(wrong,'undoResearchAlly',{id:ally},/流程步骤/);
// The actual room boundary enforces seats and saves refund history atomically.
const identities=Object.fromEntries(ids.map(id=>[id,{user:'research-adjustment',token:id}]));let room=newRoom('RSCH77',identities.US,cards,s.config);room.status='playing';room.seats=structuredClone(identities);room.state=s;let serial=0;
const send=(seat,action)=>changeRoom(room,identities[seat],{id:String(++serial),op:'action',gameRevision:room.gameRevision,action},cards);
const roomBefore=JSON.stringify(room);assert.throws(()=>send('CN',{type:'undoResearchAlly',id:ally}),/等待/);assert.equal(JSON.stringify(room),roomBefore);room=send('US',{type:'undoResearchAlly',id:ally});assert.ok(!room.state.players.US.exhaustedAllies.includes(ally));assert.deepEqual(room.state.flow.research.consumedAllies,[]);assert.equal(room.state.settlementJournal.at(-1).title,'取消研究盟国消耗');
console.log('Research adjustments passed: automatic entry/next actor and exactly-once bonuses, income 0/1/2 automatic vs 3-card choice, saved ally refunds, spent-point/old-exhaustion/phase/seat rejection, purchased-card preservation and room persistence.');
