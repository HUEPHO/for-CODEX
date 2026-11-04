import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {grantEventEffect,removeEventEffect,hasEventEffect,EFFECT_IDS,replaceEventCountry,takeEventCountry} from '../dist/event-effect-state.js';
import {activateTTIP,useEventEffect} from '../dist/event-effect-actions.js';
import {incomeEffects,beginIncomeEffects,resolveIncomeEffect} from '../dist/event-income.js';
import {tradePreview,tradeCapacity} from '../dist/trade.js';
import {threatPreview} from '../dist/world.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {countryPiles,regionCountries,syncCountries} from '../dist/country-piles.js';
import {eventRevealKind} from '../dist/event-reveal.js';
import {canPostponeEvent} from '../dist/event-flow.js';
import {newRoom,changeRoom,roomView} from '../server/rooms.js';
import {renderEventEffects} from '../dist/event-effects-ui.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),ids=['CN','US','EU','RU'];
function base(owner='CN'){
 const s=createState(cards,{wit:true,dd:true},()=>.2);for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=60;p.resources=[2,2,2,2,2,2,2];p.vp=0;}
 const order=[owner,...ids.filter(id=>id!==owner)];s.current=owner;s.initialOrder=order;s.round=3;s.phase='行动';s.flow=newFlow(order,3);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};s.eventBoard.choice=null;return s;
}
const act=(s,id,key)=>applyAction(s,{type:'useEventEffect',effectId:id,resourceKey:key});
let s=base();grantEventEffect(s,'CN',EFFECT_IDS.siberia,'test');const before=JSON.stringify(s);useEventEffect(s,{effectId:EFFECT_IDS.siberia},{preview:true});assert.equal(JSON.stringify(s),before);
let t=act(s,EFFECT_IDS.siberia);assert.equal(t.players.CN.money,51);assert.equal(t.players.RU.money,69);assert.equal(t.players.CN.resources[0],5);assert.equal(t.players.CN.resources[5],3);assert.equal(t.players.RU.commerce.filter(c=>c.ready).length,2);assert.throws(()=>act(t,EFFECT_IDS.siberia),/已经使用/);t.round++;assert.equal(act(t,EFFECT_IDS.siberia).players.CN.money,42);
for(const step of ['research','events','aftermath']){
 s=base();grantEventEffect(s,'CN',EFFECT_IDS.siberia,'test');s.flow.step=step;
 if(step==='events')s.flow.eventResolution={mode:'manual',stage:'resolve',owner:'CN',participants:ids,done:[],submissions:{}};
 if(step==='aftermath')s.flow.pendingIncome={owner:'CN',round:3,remaining:['ccd84d77f9734'],active:null,receipts:[]};
 assert.equal(act(s,EFFECT_IDS.siberia).players.CN.money,51,step);
}
s=base('EU');grantEventEffect(s,'EU',EFFECT_IDS.nordstream,'test');grantEventEffect(s,'global',EFFECT_IDS.sanctions,'test');assert.throws(()=>act(s,EFFECT_IDS.nordstream),/制裁/);removeEventEffect(s,EFFECT_IDS.sanctions);assert.equal(act(s,EFFECT_IDS.nordstream).players.EU.resources[0],5);
s=base();grantEventEffect(s,'CN',EFFECT_IDS.siberia,'test');s.players.RU.commerce.forEach(c=>c.ready=false);assert.throws(()=>act(s,EFFECT_IDS.siberia),/贸易卡/);s.players.RU.commerce[0].ready=true;s.players.CN.money=8;assert.throws(()=>act(s,EFFECT_IDS.siberia),/资金不足/);
s=base();s.eventEffects=[{owner:'CN',cardId:EFFECT_IDS.nordstream}];assert.throws(()=>act(s,EFFECT_IDS.nordstream),/没有可主动使用/);
s=base();grantEventEffect(s,'CN',EFFECT_IDS.siberia,'test');s.flow.step='events';s.flow.eventResolution={cardId:'ca8e271f31adf',mode:'manual',stage:'resolve',owner:'CN',participants:ids,done:[],submissions:{}};assert.ok(canPostponeEvent(s));assert.ok(canPostponeEvent(act(s,EFFECT_IDS.siberia)),'independent effect must not begin the unrelated legacy event');
for(const [actor,seller] of [['US','RU'],['EU','RU'],['RU','US'],['RU','EU']]){
 s=base(actor);grantEventEffect(s,'global',EFFECT_IDS.sanctions,'test');const key=seller==='RU'?0:4;assert.throws(()=>tradePreview(s,{imports:[{key,players:{[seller]:1}}]},{}),/制裁/);
}
s=base('US');const row={imports:[{key:3,players:{CN:1}}]},normal=tradePreview(s,row,{});grantEventEffect(s,'global',EFFECT_IDS.tradeWar,'test');const taxed=tradePreview(s,row,{});assert.equal(taxed.cost-normal.cost,5);assert.equal(taxed.players.CN.money-normal.players.CN.money,0,'tariff goes to supply');
s=base('US');for(const r of Object.values(s.regions))for(const id of ids)r.armies[id]=0;s.regions.E.armies.RU=9;assert.equal(threatPreview(s,'US').total,2);grantEventEffect(s,'global',EFFECT_IDS.start,'test');assert.equal(threatPreview(s,'US').total,1);
s=base('CN');for(const r of Object.values(s.regions))for(const id of ids)r.armies[id]=0;s.regions.S.armies.RU=9;assert.equal(threatPreview(s,'CN').total,2);grantEventEffect(s,'global',EFFECT_IDS.unlimited,'test');assert.equal(threatPreview(s,'CN').total,0);
s=base('US');activateTTIP(s,'US',{face:'exchange',source:'test'});assert.deepEqual(incomeEffects(s,'US'),[]);t=act(s,EFFECT_IDS.ttipUS,2);assert.equal(t.players.US.money,50);assert.equal(t.players.EU.money,70);assert.equal(t.players.US.resources[2],5);assert.equal(t.players.US.resources[5],3);assert.match(renderEventEffects(t,'US'),/本轮已使用/);
s=base('EU');const old=s.players.US.production[0];activateTTIP(s,'EU',{face:'investment',productionKey:0,slot:'temporary',source:'test'});assert.equal(s.players.EU.money,35);assert.equal(s.players.US.production[0],old+1);assert.deepEqual(incomeEffects(s,'EU'),[EFFECT_IDS.ttipEU]);s.flow.step='aftermath';assert.ok(beginIncomeEffects(s,'EU',{}));assert.ok(resolveIncomeEffect(s,{effectId:EFFECT_IDS.ttipEU,choice:'money'}).complete);assert.equal(s.players.EU.money,41);assert.throws(()=>activateTTIP(s,'EU',{face:'exchange'}),/已经选择/);
// Replacement preserves actual tokens and foreign investor ownership. Additional
// North Korea (2024) is a separate country even when CN owns the original.
s=base();const ukraine='c54459f8226fa',replacement='cf7c0ffc48316';for(const r of Object.values(s.regions)){const p=countryPiles(r);p.left=p.left.filter(id=>id!==ukraine);p.right=p.right.filter(id=>id!==ukraine);syncCountries(r);}s.players.EU.allies=[ukraine];s.players.EU.fdi=[ukraine,ukraine];s.players.EU.bases=[ukraine];s.players.CN.foreignInvestments=[{host:'EU',country:ukraine}];replaceEventCountry(s,'Ukraine',replacement);assert.deepEqual(s.players.EU.fdi,[replacement,replacement]);assert.equal(s.players.CN.foreignInvestments[0].country,replacement);assert.equal(RESEARCH_DATA[replacement].blockedPowers[0],'RU');
s=base();const nk='c6013d4e910ac';s.players.CN.allies=[nk];s.players.CN.fdi=[nk];takeEventCountry(s,'RU','North Korea (2024)');assert.ok(s.players.CN.allies.includes(nk));assert.deepEqual(s.players.CN.fdi,[nk]);assert.ok(s.players.RU.allies.includes('c11dd78abad1e'));assert.doesNotThrow(()=>tradeCapacity(s,'RU'));
s=base();const r=s.regions.E;r.countryPiles={left:['c8ec654f26579',ukraine],right:['ce3c745de13c1']};syncCountries(r);const previous=structuredClone(s);replaceEventCountry(s,'Ukraine',replacement);assert.ok(regionCountries(r).includes(replacement));assert.ok(!regionCountries(r).includes(ukraine));assert.equal(eventRevealKind(previous,s),'random');
// Authoritative command retry and seat restrictions for once-per-round effects.
s=base();grantEventEffect(s,'CN',EFFECT_IDS.siberia,'test');const identity=Object.fromEntries(ids.map(id=>[id,{user:'effects',token:id}]));let room=newRoom('EFF222',identity.CN,cards,s.config);room.status='playing';room.state=s;room.seats=identity;
const request={id:'effects-once',op:'action',gameRevision:room.gameRevision,action:{type:'useEventEffect',effectId:EFFECT_IDS.siberia}};room=changeRoom(room,identity.CN,request,cards);const saved=JSON.stringify(room);assert.equal(JSON.stringify(changeRoom(room,identity.CN,request,cards)),saved);assert.throws(()=>changeRoom(room,identity.US,{...request,id:'wrong',gameRevision:room.gameRevision},cards),/等待/);assert.equal(roomView(room,identity.CN).state.eventEffects[0].usedRound,3);
console.log('Complete persistent effects passed: sanctions, tariffs, threat treaties, any-phase once-per-round trades, both TTIP faces and income, country replacement/addition, atomic previews, privacy and retries.');
