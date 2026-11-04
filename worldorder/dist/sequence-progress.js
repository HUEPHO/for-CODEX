// Persist public receipts, never snapshots of hands, decks or submitted choices.
import {RESOURCE_LABELS} from './economy.js';
import {AREAS} from './world.js';
const effects={base:'建立基地',relations:'改善关系',engage:'介入地区',trade:'贸易',invest:'投资盟国',reinforce:'移动军队',domestic:'内政行动',choice:'选择行动'};
const types={draw:'抽牌',extra:'打出另一张牌',pay:'支付牌面费用',gain:'领取牌面收益',prosperity:'提升繁荣',supplyArmies:'从供应堆放置军队',reset:'重置临时影响力',researchPlay:'免费研究并出牌',readyAlly:'重整盟国',searchRegion:'检索地区国家',response:'邀请他方回应',exhaustOpponents:'其他玩家横置盟国',exhaustResponse:'回应：横置盟国',returnArmy:'送回他方军队',foreignInvestment:'投资他方盟国',chooseActions:'选择后续效果',region:'选择地区',regions:'选择多个地区',forRegions:'依次处理所选地区',influence:'添加影响力',industrialize:'支付并提升产能',fundDiplomacy:'资助外交',trashToPlay:'可选：移除一张牌以继续出牌',discardToPlay:'可选：弃牌以继续出牌',upgradeProduce:'提升产能并生产',inspectOpponent:'查看他方手牌',copyAbility:'可选：复制能力',aidAllies:'经济与军事援助',beijingConsensus:'提升繁荣并获得外交',swapInfluence:'交换影响力',regimeChange:'政权更迭'};
export function sequenceStepTitle(step){return step.type==='cardPlayed'?'打出卡牌':step.type==='effect'?(step.card.domesticMode==='growth'?'取得发展牌':step.card.domesticMode==='produce'?'生产资源':effects[step.card.effect]||'牌面行动'):types[step.type]||'牌面效果';}
export function publicBalances(s){return Object.fromEntries(Object.entries(s.players).map(([id,p])=>[id,{money:p.money,vp:p.vp,smart:p.smart,prosperity:p.prosperity,resources:[...p.resources],production:[...(p.production||[])],handCount:p.hand.length,armies:Object.fromEntries(Object.entries(s.regions).map(([r,v])=>[r,v.armies[id]]))}]));}
export function ensureSequenceHistory(q){if(q.history)return;q.history=[];if(q.index)q.history.push({status:'legacy',title:'旧存档已完成步骤',detail:`此前${q.index}步已经处理；旧版未记录逐项账目，不补扣费用或补发奖励。`,changes:[]});}
export function balanceChanges(before,after){
 const changes=[];
 if(before)for(const [player,p] of Object.entries(before)){
  const next=after[player],items=[];
  for(const [key,label] of Object.entries({money:'资金',vp:'分数',smart:'SP',prosperity:'繁荣等级',handCount:'手牌数量'})){const delta=next[key]-p[key];if(delta)items.push({label,delta});}
  for(const key of ['resources','production'])p[key].forEach((n,i)=>{const delta=next[key][i]-n;if(delta)items.push({label:RESOURCE_LABELS[i]+(key==='production'?'产能':''),delta});});
  for(const [r,n] of Object.entries(p.armies)){const delta=next.armies[r]-n;if(delta)items.push({label:AREAS[r].name+'驻军',delta});}
  if(items.length)changes.push({player,items});
 }
 return changes;
}
export function recordSequenceStep(s,q,step,before,status='done',detail=''){
 ensureSequenceHistory(q);q.history.push({status,title:sequenceStepTitle(step),detail,changes:balanceChanges(before,publicBalances(s))});
}
function costText(value={}){return [...(value.money?[value.money+'资金']:[]),...(value.vp?[value.vp+'分']:[]),...Object.entries(value.resources||{}).map(([key,n])=>n+RESOURCE_LABELS[key])].join('、');}
function remainingSteps(steps,context){return steps.flatMap(step=>{
 if(step.type==='forRegions')return (context.regions||[]).flatMap(region=>remainingSteps(step.steps,{...context,region}));
 const region=step.region==='$region'?context.region:step.region==='$remainingRegion'?context.remainingRegion:step.region;
 const detail=[AREAS[region]?.name,step.cost&&typeof step.cost==='object'?'待付：'+costText(step.cost):null,step.gain?'待领：'+costText(step.gain):null].filter(Boolean).join('；');
 return [{title:sequenceStepTitle(step),type:step.type,detail}];
});}
export function saveSequenceReport(s,q,status){ensureSequenceHistory(q);s.flow.sequenceReports??={};s.flow.sequenceReports[q.owner]={owner:q.owner,cardId:q.cardId,round:q.round,turnIndex:q.turnIndex,status,history:structuredClone(q.history),remaining:remainingSteps(q.steps.slice(q.index),q.context),reason:q.blocked?.reason||''};if(s.flow.battlefieldReturn){s.flow.battlefieldReturn.reports??=[];s.flow.battlefieldReturn.reports.push(structuredClone(s.flow.sequenceReports[q.owner]));}}
