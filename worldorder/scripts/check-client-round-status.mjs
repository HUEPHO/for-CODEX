import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {clientRoundStatusModel,renderClientRoundStatus} from '../dist/client-round-status.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8'));
const ids=['US','CN','EU','RU'];let state=createState(cards,{dd:false,wit:true},()=>.5);
assert.equal(clientRoundStatusModel(state).phase,'准备');
assert.equal(clientRoundStatusModel(state).action,null);
assert.match(renderClientRoundStatus(state),/开局选牌/);
for(const player of ids){state=applyAction(state,{type:'switch',player});state=applyAction(state,{type:'selectAssetDiscard',id:state.players[player].assetChoices[0].id});state=applyAction(state,{type:'chooseAssets'});}
// Keep each saved action slot explicit, including other players' completed turns.
state.flow={round:1,step:'actions',order:ids,turnCards:[],checks:[]};state.phase='行动';
for(let index=0;index<16;index++){
 state.actionTurns={index,completed:Object.fromEntries(ids.map((id,i)=>[id,Math.floor(index/4)+(i<index%4?1:0)]))};
 state.current=ids[index%4];const before=JSON.stringify(state),model=clientRoundStatusModel(state),html=renderClientRoundStatus(state);
 assert.equal(model.action,Math.floor(index/4)+1);assert.equal(model.actionOwner,state.current);
 assert.equal(model.phases.filter(p=>p.current).length,1);assert.equal(model.phases.find(p=>p.current).label,'行动');
 assert.equal((html.match(/client-action-dot is-current/g)||[]).length,1);
 assert.deepEqual(model.order,ids);
 assert.deepEqual([...html.matchAll(/data-order-player="(\w+)"/g)].map(match=>match[1]),ids);
 assert.ok(html.includes(`class="client-order-flag is-current" data-order-player="${state.current}"`));
 assert.equal((html.match(/data-round-phase=/g)||[]).length,5);assert.match(html,/data-round-phase="事件"/);assert.doesNotMatch(html,/自动影响|\/ 16/);
 assert.equal(JSON.stringify(state),before,'Status rendering must not change saved workflow');
}
state.actionTurns={index:4,completed:{US:1,CN:1,EU:1,RU:1}};state.current='CN';
state.flow.cardResolution={owner:'US',responder:'CN'};
const responding=clientRoundStatusModel(state);assert.equal(responding.action,2);assert.equal(responding.actionOwner,'US');assert.equal(responding.actor,'CN');assert.equal(responding.detail,'等待被点名玩家回应');
assert.ok(renderClientRoundStatus(state).includes('class="client-order-flag is-current" data-order-player="US"'));
delete state.flow.cardResolution;
state.flow.order=['RU','EU','CN','US'];
assert.deepEqual(clientRoundStatusModel(state).order,['RU','EU','CN','US']);
assert.ok(renderClientRoundStatus(state).includes('class="client-order-flag is-current" data-order-player="RU"'));
for(const [step,phase] of [['countries','准备'],['order','准备'],['production','准备'],['focus','准备'],['research','研究'],['events','事件'],['aftermath','结算'],['roundEnd','结算'],['ended','结算']]){
 state.flow={round:1,step,order:ids,index:0,checks:[],draft:{queue:ids}};state.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 const model=clientRoundStatusModel(state);assert.equal(model.phase,phase);assert.equal(model.action,null);assert.ok(!renderClientRoundStatus(state).includes('client-action-dot is-current'));
}
state.config.wit=false;assert.equal(clientRoundStatusModel(state).phases.find(p=>p.label==='事件').skipped,true);
assert.match(renderClientRoundStatus(state),/未启用事件扩展/);
console.log('Round status passed: setup, all 16 action slots, response ownership, five phase groups, skipped events, one current dot, saved state unchanged.');
