import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {INCOME_RULES,incomeRuleActor,incomeChoiceModel,incomeChoicePlan,incomeEffects} from '../dist/event-income-rules.js';
import {resolveIncomeEffect} from '../dist/event-income.js';
import {renderIncomeEffects} from '../dist/event-income-ui.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const CEE='c09c854e149a8',IRAN='ccd84d77f9734';
function state(active=null,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:true},()=>.3);s.round=3;s.current=active==='ceeOffer'?'EU':'CN';
 s.flow={step:'aftermath',pendingIncome:{round:3,owner:'CN',base:{fdi:0,engage:0},remaining:[CEE,IRAN],active,receipts:[]}};
 s.players.CN.resources[3]=2;s.players.EU.money=20;
 s.eventEffects=[{owner:'CN',cardId:CEE},{owner:'CN',cardId:IRAN}];edit(s);return s;
}
function freezeTree(value){for(const child of Object.values(value))if(child&&typeof child==='object')freezeTree(child);return Object.freeze(value);}
function rejectedWithoutChange(s,action,issue){
 const before=JSON.stringify(s);assert.throws(()=>resolveIncomeEffect(s,action),error=>issue instanceof RegExp?issue.test(error.message):error.message===issue);assert.equal(JSON.stringify(s),before);
}

// Validate the actual model/HTML/decision contract for every reachable choice,
// including player views: one source controls button availability and rejection.
for(const [active,edit] of [
 [null,()=>{}],['ceeOffer',()=>{}],['ceeOffer',s=>s.players.EU.money=9],
 ['ceeOffer',s=>s.players.CN.commerce.forEach(c=>c.ready=false)],
 ['ceeFallback',()=>{}],['ceeFallback',s=>s.players.CN.resources[3]=0]
]){
 const s=freezeTree(state(active,edit)),before=JSON.stringify(s),model=incomeChoiceModel(s);
 assert.deepEqual(JSON.parse(JSON.stringify(model)),model);assert.equal(model.actor,incomeRuleActor(s));
 const options=model.groups.flatMap(group=>group.options);
 const buttons=[...renderIncomeEffects(s).matchAll(/<button data-income-effect="([^"]+)" data-income-choice="([^"]+)" ([^>]*)>/g)];
 assert.equal(buttons.length,options.length);
 for(const option of options){
  const button=buttons.find(button=>button[1]===option.effectId&&button[2]===option.choice);
  assert.equal(button[3].includes('disabled'),!!option.issue);
  const a={effectId:option.effectId,choice:option.choice};
  if(option.issue){
   assert.throws(()=>incomeChoicePlan(s,a),error=>error.message===option.issue);
   rejectedWithoutChange(structuredClone(s),a,option.issue);
  }else{
   const plan=incomeChoicePlan(s,a);assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan);
   assert.ok(plan.operations.every(op=>['money','resource','useCommerce'].includes(op.type)));
   if(!plan.done)assert.ok(INCOME_RULES[option.effectId].responses[plan.nextActive]);
   const changed=structuredClone(s);resolveIncomeEffect(changed,a);assert.notEqual(JSON.stringify(changed),before);
  }
 }
 assert.equal(JSON.stringify(s),before,'read models and plans must not mutate even frozen state');
 for(const viewer of ['US','CN','EU','RU'].filter(id=>id!==model.actor)){
  const view={...s,current:viewer};const viewButtons=[...renderIncomeEffects(view).matchAll(/<button[^>]*>/g)];
  assert.ok(viewButtons.every(([button])=>button.includes(' disabled')));
  assert.deepEqual(incomeChoiceModel(view),model);
  for(const option of options)rejectedWithoutChange(structuredClone(view),option,/责任玩家/);
 }
}

// Existing persisted state tokens, no-active saves and duplicate effect grants
// retain their meaning. Unknown records must never become a CEE choice.
assert.equal(incomeRuleActor(state('ceeOffer')),'EU');
assert.equal(incomeRuleActor(state('ceeFallback')),'CN');
const legacy=state();delete legacy.flow.pendingIncome.active;
assert.deepEqual(incomeChoiceModel(legacy),incomeChoiceModel(state()));
const duplicate=state();duplicate.eventEffects.push({owner:'CN',cardId:CEE},{owner:'CN',cardId:'not-implemented'},{owner:'US',cardId:CEE});
assert.deepEqual(incomeEffects(duplicate,'CN'),[CEE,IRAN]);assert.deepEqual(incomeEffects(duplicate,'US'),[]);

for(const edit of [
 s=>s.flow.pendingIncome.active='unknown-response',
 s=>s.flow.pendingIncome.remaining=[],
 s=>s.flow.pendingIncome.remaining={},
 s=>{s.flow.pendingIncome.active='ceeOffer';s.flow.pendingIncome.remaining=[IRAN];},
 s=>s.flow.pendingIncome.round=2,
 s=>s.flow.step='research'
]){
 const s=state(null,edit),model=incomeChoiceModel(s);assert.ok(model.issue);assert.equal(model.groups.length,0);
 assert.doesNotMatch(renderIncomeEffects(s),/data-income-choice=/);
 rejectedWithoutChange(s,{effectId:CEE,choice:'offer'},model.issue);
}
const unknown=state(null,s=>s.flow.pendingIncome.remaining=['not-implemented']);
assert.match(renderIncomeEffects(unknown),/尚未接入/);assert.doesNotMatch(renderIncomeEffects(unknown),/data-income-choice=|请欧盟选择是否购买/);
rejectedWithoutChange(unknown,{effectId:'not-implemented',choice:'offer'},/尚未接入/);
const wrongOwner=state(null,s=>s.flow.pendingIncome.owner='US');wrongOwner.current='US';
assert.ok(incomeChoiceModel(wrongOwner).groups.every(group=>group.issue==='持续效果的所属玩家不符'));
rejectedWithoutChange(wrongOwner,{effectId:CEE,choice:'offer'},/所属玩家/);
assert.equal(incomeChoiceModel({}),null);assert.equal(incomeRuleActor({}),null);assert.equal(renderIncomeEffects({}),'');

console.log('Passed income rule contracts: pure serializable models/plans, UI/server availability agreement, responder views, persisted tokens, unknown-state rejection and no-mutation failures.');
