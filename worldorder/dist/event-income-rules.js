// Read-only income rules. No engine, phase, UI or mutation-module imports.
// A rule owns its persisted response states, actor, choices and availability.
// Plans contain only public data and primitive operations; the executor applies
// them after validation. Existing active-state strings are a save-file contract.
const CEE='c09c854e149a8',IRAN='ccd84d77f9734';

export function ceePurchaseIssue(s,owner='CN'){
 if(s.players.EU.money<10)return '欧盟资金不足10';
 if(!s.players[owner].commerce?.some(c=>c.ready))return '中国没有可翻用的贸易卡';
 return null;
}

const money=(player,delta)=>({type:'money',player,delta});
const resource=(player,key,delta)=>({type:'resource',player,key,delta});
const finished=(operations,detailParts)=>({operations,detailParts,nextActive:null,done:true});
const response=(nextActive,detail)=>({operations:[],detailParts:[detail],nextActive,done:false});
const overflow=(operation,prefix,suffix)=>({overflowOf:operation,prefix,suffix});

export const INCOME_RULES={
 [CEE]:{
  name:'中国—中东欧倡议',owner:'CN',description:'投资回报时，欧盟可付10资金并翻用中国一张贸易卡，获得1消费品；否则中国选择支付1消费品获得15资金，或获得5资金。',
  initial:{
   actor:'owner',prompt:'',choiceIssue:'请先邀请欧盟选择是否购买',
   choices:{offer:{label:'中东欧：请欧盟选择是否购买',plan:()=>response('ceeOffer','中国—中东欧倡议：等待欧盟自行选择是否支付10资金并翻用中国一张贸易卡。')}}
  },
  responses:{
   ceeOffer:{
    actor:'EU',prompt:'欧盟可向中国支付10资金，翻用中国一张可用贸易卡，并获得1消费品。若不购买，交由中国选择自己的收益。',choiceIssue:'请由欧盟选择购买或不购买',
    choices:{
     buy:{label:'支付10资金，获得1消费品',issue:(s,q)=>ceePurchaseIssue(s,q.owner),unavailableSuffix:'，当前不能购买。',plan:(s,q)=>{
      const index=s.players[q.owner].commerce.findIndex(c=>c.ready);
      return finished([money('EU',-10),money(q.owner,10),{type:'useCommerce',player:q.owner,index},resource('EU',3,1)],
       [`中国—中东欧倡议：欧盟向中国支付10资金，翻用中国第${index+1}张贸易卡，获得1消费品`,overflow(3,'（超限折现','资金）'),'。']);
     }},
     decline:{label:'不购买，交回中国',plan:()=>response('ceeFallback','中国—中东欧倡议：欧盟不购买，交由中国选择后续收益。')}
    }
   },
   ceeFallback:{
    actor:'owner',prompt:'欧盟未购买。请选择中国—中东欧倡议的本轮收益。',choiceIssue:'请选择支付消费品获得15资金，或直接获得5资金',
    choices:{
     goods:{label:'支付1消费品，获得15资金',issue:(s,q)=>s.players[q.owner].resources[3]<1?'中国没有可支付的消费品':null,
      plan:(s,q)=>finished([resource(q.owner,3,-1),money(q.owner,15)],['中国—中东欧倡议：中国支付1消费品，获得15资金。'])},
     money:{label:'直接获得5资金',plan:(s,q)=>finished([money(q.owner,5)],['中国—中东欧倡议：中国获得5资金。'])}
    }
   }
  }
 },
 [IRAN]:{
  name:'中伊全面战略伙伴关系',owner:'CN',description:'投资回报时，选择获得5资金或2能源。',
  initial:{
   actor:'owner',prompt:'',choiceIssue:'请选择5资金或2能源',
   choices:{
    money:{label:'中伊：获得5资金',plan:(s,q)=>finished([money(q.owner,5)],['中伊全面战略伙伴关系：获得5资金。'])},
    energy:{label:'中伊：获得2能源',plan:(s,q)=>finished([resource(q.owner,0,2)],['中伊全面战略伙伴关系：获得2能源',overflow(0,'，超过库存上限的部分折现','资金'),'。'])}
   }
  },responses:{}
 }
};

for(const [id,owner] of [['cf48fe9407208','US'],['c78b295d520ca','EU']])INCOME_RULES[id]={
 name:'TTIP投资协议',owner,description:'投资回报时获得6资金。',
 enabled:(s,player)=>(s.eventEffects||[]).some(e=>e.cardId===id&&e.owner===player&&e.face==='investment'),
 initial:{actor:'owner',prompt:'',choiceIssue:'请选择领取TTIP投资收益',choices:{money:{label:'TTIP：领取6资金',plan:(s,q)=>finished([money(q.owner,6)],['TTIP投资协议：获得6资金。'])}}},responses:{}
};
function freezeTree(value){for(const child of Object.values(value))if(child&&typeof child==='object')freezeTree(child);return Object.freeze(value);}
freezeTree(INCOME_RULES);

const responseRules=new Map();
for(const [effectId,rule] of Object.entries(INCOME_RULES))for(const [active,stage] of Object.entries(rule.responses)){
 if(responseRules.has(active))throw Error('持续收益步骤重复注册：'+active);
 responseRules.set(active,{effectId,stage});
}

export function incomeEffects(s,owner){
 return [...new Set((s.eventEffects||[]).filter(e=>e.owner===owner&&INCOME_RULES[e.cardId]?.owner===owner&&(!INCOME_RULES[e.cardId].enabled||INCOME_RULES[e.cardId].enabled(s,owner))).map(e=>e.cardId))];
}

export function incomeRuleActor(s){
 const q=s.flow?.pendingIncome;if(!q)return null;
 if(!q.active)return q.owner;
 const response=responseRules.get(q.active);
 if(!response||!Array.isArray(q.remaining)||!q.remaining.includes(response.effectId))return null;
 return response.stage.actor==='owner'?q.owner:response.stage.actor;
}

function pendingIssue(s,q){
 if(s.flow.step!=='aftermath'||q.round!==s.round)return '本次持续收益不属于当前投资回报阶段';
 if(!Array.isArray(q.remaining)||!q.remaining.length)return '本次持续收益缺少待结算效果';
 if(q.active&&!responseRules.has(q.active))return '当前持续收益步骤尚未接入，请核对存档';
 if(q.active&&!q.remaining.includes(responseRules.get(q.active).effectId))return '当前持续收益回应与待结算效果不符，请核对存档';
 return null;
}

// JSON-serializable view model. Availability deliberately excludes seat identity:
// viewers see the same costs/reasons; actor determines who may press a button.
export function incomeChoiceModel(s){
 const q=s.flow?.pendingIncome;if(!q)return null;
 const model={owner:q.owner,actor:incomeRuleActor(s),active:q.active??null,issue:pendingIssue(s,q),groups:[]};
 if(model.issue)return model;
 const ids=q.active?[responseRules.get(q.active).effectId]:q.remaining;
 for(const effectId of ids){
  const rule=INCOME_RULES[effectId],issue=!rule?'此持续收益尚未接入':rule.owner!==q.owner?'持续效果的所属玩家不符':null;
  const group={effectId,name:rule?.name||'尚未接入的持续效果',prompt:'',issue,options:[]};
  if(!issue){
   const stage=q.active?responseRules.get(q.active).stage:rule.initial;group.prompt=stage.prompt;
   group.options=Object.entries(stage.choices).map(([choice,definition])=>{
    const issue=definition.issue?.(s,q)||null;
    return {effectId,choice,label:definition.label,issue,unavailableText:issue?issue+(definition.unavailableSuffix||'。'):null};
   });
  }
  model.groups.push(group);
 }
 return model;
}

export function incomeChoicePlan(s,a){
 const q=s.flow?.pendingIncome,model=incomeChoiceModel(s);
 if(!q)throw Error('请由当前持续收益责任玩家操作');
 if(model.issue)throw Error(model.issue);
 if(model.actor!==s.current)throw Error('请由当前持续收益责任玩家操作');
 if(!q.remaining.includes(a.effectId))throw Error('本效果已经结算，或不属于本次投资回报');
 if(q.active&&responseRules.get(q.active).effectId!==a.effectId)throw Error('请先完成'+INCOME_RULES[responseRules.get(q.active).effectId].name+'的回应');
 const group=model.groups.find(group=>group.effectId===a.effectId);if(group.issue)throw Error(group.issue);
 const rule=INCOME_RULES[a.effectId],stage=q.active?responseRules.get(q.active).stage:rule.initial,option=group.options.find(option=>option.choice===a.choice);
 if(!option)throw Error(stage.choiceIssue);
 if(option.issue)throw Error(option.issue);
 return {effectId:a.effectId,...stage.choices[a.choice].plan(s,q)};
}

export function incomePlanReceipt(plan,operationResults){
 return plan.detailParts.map(part=>typeof part==='string'?part:operationResults[part.overflowOf]?part.prefix+operationResults[part.overflowOf]+part.suffix:'').join('');
}
