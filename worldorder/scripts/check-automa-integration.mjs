import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction,determineInitialOrder} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {advanceAutomaticFlow} from '../dist/automatic-flow.js';
import {currentActor,aftermathSteps,settlementProgress} from '../dist/phase-state.js';
import {humanPlayers,activePlayers,isAutoma,POWER_IDS} from '../dist/player-configuration.js';
import {tradePreview,applyTrade} from '../dist/trade.js';
import {majorityStandings,winners} from '../dist/world.js';
import {newRoom,changeRoom,playerView} from '../server/rooms.js';
import {eventTestAction,incomeTestAction} from './event-test-actions.mjs';
import {rollbackRevealReason} from '../dist/rollback-state.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const config=(humans=['US'],automaDifficulty='normal',wit=false)=>({automatonMode:'advanced',humans,automaDifficulty,dd:true,wit});
function fixture(options){
 const s=createState(cards,options,()=>.41);
 for(const id of humanPlayers(s)){const p=s.players[id];p.assets=p.assetChoices.slice(0,2).map(c=>c.id);p.vp=p.assetChoices.slice(0,2).reduce((n,c)=>n+c.vp,0);p.objectives=p.objectiveChoices?.slice(0,2)||[];p.assetChoices=p.objectiveChoices=null;}
 s.initialOrder=determineInitialOrder(s);s.flow=newFlow(s.initialOrder);s.current=s.initialOrder[0];s.actionTurns={index:0,completed:Object.fromEntries(POWER_IDS.map(id=>[id,0]))};
 if(s.config.wit){s.eventBoard.choice=null;s.eventBoard.distribution=null;s.eventBoard.revealQueue=[];}
 return s;
}
assert.throws(()=>createState(cards,{automatonMode:'none',humans:['US','CN']}),/4位/);
assert.throws(()=>createState(cards,{automatonMode:'basic',humans:['US']}),/2至4/);
assert.throws(()=>createState(cards,{automatonMode:'basic',humans:['US','EU']}),/双人/);
assert.throws(()=>createState(cards,{automatonMode:'advanced',humans:POWER_IDS}),/至少/);
let s=fixture(config());assert.equal(s.growth.length,20);assert.equal(s.autoInfluence,undefined);assert.deepEqual(activePlayers(s),POWER_IDS);
assert.equal(s.players.EU.money,45);assert.equal(s.players.CN.vp,10);assert.equal(s.players.CN.deck.length,12);
assert.ok([...s.market,...s.marketDeck].every(id=>cards.find(c=>c.id===id).module!=='dd'),'Interactive D&D abilities excluded per D&D p18');
// Human imports pay the automa and still yield the usual player-trade diplomacy.
s.current='US';s.players.US.money=100;const old=s.players.EU.money;
const trade=tradePreview(s,{imports:[{key:3,players:{EU:1}}]},{name:'trade'});assert.equal(trade.diplomacy,1);applyTrade(s,trade);assert.equal(s.players.EU.money,old+10);
assert.equal(majorityStandings(s).money.length,4);
// No future card order leaves the authoritative state.
let view=playerView(s,'US');assert.ok(view.automaDecks.decision.deck.every(c=>c===null));assert.ok(view.automaDecks.influence.deck.every(c=>c===null));assert.ok(view.players.EU.automa.objectiveDeck.every(c=>c===null));assert.ok(view.players.EU.deck.every(c=>c===null));
// Real room commands: one human can start, automa seats reject joins, retries
// do not repeat the automatic turns and stale revisions still fail.
const identity={user:'automa-check',token:'host'},other={user:'automa-check',token:'other'};
let room=newRoom('AUTOMACHECK',identity,cards,config());
assert.throws(()=>changeRoom(room,other,{id:'join-ai',op:'join',seat:'EU'},cards),/自动机/);
room=changeRoom(room,identity,{id:'start',op:'start'},cards);assert.equal(room.status,'playing');
let serial=0;
function command(action){const cmd={id:'cmd-'+(++serial),op:'action',action,gameRevision:room.gameRevision,seatRevision:room.seatRevisions.US};room=changeRoom(room,identity,cmd,cards);return cmd;}
command({type:'selectAssetDiscard',id:room.state.players.US.assetChoices[2].id});command({type:'selectObjectiveDiscard',id:room.state.players.US.objectiveChoices[2]});command({type:'chooseAssets'});
assert.equal(currentActor(room.state),'US');
assert.throws(()=>changeRoom(room,identity,{id:'forged-ai-turn',op:'action',gameRevision:room.gameRevision,action:{type:'automaAction'}},cards),/当前不是高级自动机/);
const before=room.state;
const cmd=command({type:'passTurn',cardId:room.state.players.US.hand[0]});assert.equal(currentActor(room.state),'US');assert.equal(room.state.actionTurns.index,before.actionTurns.index+4);
assert.strictEqual(changeRoom(room,identity,cmd,cards),room);assert.throws(()=>changeRoom(room,identity,{...cmd,id:'stale'},cards),/已更新/);
assert.ok(rollbackRevealReason(before,room.state),'Automa random reveals warn on undo');
// Six complete rounds. The driver makes only human choices; all AI actions,
// research, focus, prosperity and objective decisions must complete themselves.
const withWit=process.argv.includes('--wit');let games=0,rounds=0;
for(const humans of [...POWER_IDS.map(id=>[id]),['US','EU'],['US','CN','RU']])for(const difficulty of ['normal','hard']){
 s=fixture(config(humans,difficulty,withWit));advanceAutomaticFlow(s);let steps=0;
 while(s.flow.step!=='ended'){
  assert.ok(steps++<700,JSON.stringify({humans,difficulty,flow:s.flow}));const actor=currentActor(s);assert.ok(humans.includes(actor),'Never wait for an AI seat: '+JSON.stringify({actor,flow:s.flow}));s.current=actor;let a;
  if(s.eventBoard?.choice)a=eventTestAction(s);
  else if(s.flow.pendingIncome)a=incomeTestAction(s);
  else if(s.flow.step==='events'){
   const q=s.flow.eventResolution,c=q?.nonPlayerChoice;
   if(c){
    a={type:'resolveNonPlayerChoice',cardId:q.cardId};
    if(c.optional||c.type==='nordstream')a.skip=true;
    else if(c.type==='convert')Object.assign(a,c.targets[0]);
    else if(c.type==='ttip')Object.assign(a,{face:'exchange'});
    else if(c.type==='automaReward')throw Error('Unhandled required automa event choice '+JSON.stringify(c));
    else a.placements={[c.regions[0]]:c.type==='disarm'?1:c.type==='withdraw'?c.max:0};
   }else a=eventTestAction(s);
  }
  else if(s.flow.step==='actions')a={type:'passTurn',cardId:s.players[actor].hand[0]};
  else if(s.flow.step==='research')a={type:'finishResearch'};
  else if(s.flow.step==='order')a={type:'chooseOrderSlot',slot:s.flow.draft.slots.indexOf(null)};
  else if(s.flow.step==='focus')a={type:'confirmFocus',ready:[],upgrades:[],quantities:Array(7).fill(0)};
  else if(settlementProgress(s)?.kind==='objectives')a={type:'settlePhaseTask',taskId:settlementProgress(s).key,confirmed:true,cardId:s.players[actor].objectives.find(id=>!s.players[actor].scoredObjectives?.some(c=>c.cardId===id)),scoreMode:'apply'};
  else if(s.flow.step==='aftermath'){
   const step=aftermathSteps(s)[s.flow.checks.length];a=step==='繁荣提升'?{type:'resolveProsperity',improve:false}:step==='威胁结算'?{type:'resolveThreat',defend:[]}:step==='投资回报'?{type:'resolveInvestments',withdraw:{}}:null;
  }
  assert.ok(a,JSON.stringify(s.flow));
  try{s=applyAction(s,a);}catch(e){e.message+='\n'+JSON.stringify({humans,difficulty,round:s.round,step:s.flow.step,a,q:s.flow.eventResolution});throw e;}
  for(const id of POWER_IDS.filter(id=>isAutoma(s,id))){const p=s.players[id];assert.ok(Number.isFinite(p.money)&&p.money>=0);assert.ok(Number.isFinite(p.vp));assert.ok(p.resources.every(n=>n===0));assert.equal(p.hand.length,0);}
  s=JSON.parse(JSON.stringify(s));
 }
 assert.ok(winners(s).length);for(const id of POWER_IDS.filter(id=>isAutoma(s,id))){assert.equal(s.players[id].automa.preparedRound,6);assert.ok(s.players[id].automa.history.some(e=>e.type==='research'));}
 games++;rounds+=6;
}
console.log(`Automa integration passed: ${games} games / ${rounds} rounds, ${withWit?'D&D + WIT':'D&D'}, normal/hard, 1/2/3 human seats, room authority/privacy/retry and rollback.`);
