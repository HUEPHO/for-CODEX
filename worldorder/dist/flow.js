import {humanPlayers} from './player-configuration.js';
import {resolveAutoInfluence} from './non-player.js';
import {availableExecutive} from './special-cards.js';
import {resumeAfterBattlefield} from './growth-battlefield.js';
import {startSequence,resolveSequence,advanceSequence,manualSequence,startBattlefieldAsset} from './card-sequence.js';
import {startOpenDiplomacy,resolveOpenDiplomacy} from './growth-triggers.js';
import {ACTION_CARDS as BASIC_CARDS} from './basic-actions.js';
import {startGrowthAbility,finishGrowthAbility,offerExtraCard,extraCardAvailable,consumeExtraCard} from './growth-active.js';
import {drawCards} from './draw.js';
import {rewardSummary} from './growth-resource.js';
import {hasGrowth} from './growth-effects.js';
import {countryPiles,syncCountries,revealCountry} from './country-piles.js';
export {countryPiles,syncCountries,acquireCountry} from './country-piles.js';
import {resolveBasicCard,resolvePass} from './basic-actions.js';
import {investmentPreview,threatPreview,scoringPreview,smartPreview} from './world.js';
import {producePrimary,prepareFocus,resolveFocus,resolveProsperity} from './economy.js';
import {researchCost,countryValue,researchPreview,grantResearchBonuses} from './research.js';
import {currentActor,aftermathSteps} from './phase-state.js';
import {startEventPhase} from './event-flow.js';
import {beginIncomeEffects,resolveIncomeEffect,incomeEffectActor} from './event-income.js';
import {settlePhaseTask} from './phase-settlement.js';
export {currentActor as flowActor,aftermathSteps} from './phase-state.js';
// Human turn flow; non-participating powers resolve after research. Research values are imported; action/event effects remain manual.
export function newFlow(order,round=1){return {round,order:[...order],step:'actions',turnCards:[],index:0,research:null,checks:[],draft:null};}
function record(s,text){s.log=[text,...s.log].slice(0,30);}
function startResearch(s,incomeCards){
 const owner=currentActor(s),p=s.players[owner],preview=researchPreview(s,owner,incomeCards),{base,extra}=preview;
 if(preview.incomePending)throw Error('请先为收入优化选择两张研究手牌');
 grantResearchBonuses(p,preview);p.discard.push(...p.played);p.played=[];p.faceDownPlayed=[];
 s.flow.research={remaining:base+extra,initial:base+extra,spent:0,bonuses:preview,consumedAllies:[]};
 record(s,`${owner} · 开始研究：手牌合计${base} + 内政焦点${extra}；自动领取${preview.money}资金、${preview.diplomacy-preview.lostDiplomacy}外交、${preview.armies}军队${preview.lostDiplomacy?'（外交超限损失'+preview.lostDiplomacy+'）':''}`);
}
function finishAftermath(s,step){const f=s.flow,steps=aftermathSteps(s);f.checks.push(step);s.current=f.order[0];if(f.checks.length===steps.length){if(s.round===6){s.finalAwards={};for(const id of humanPlayers(s)){const assets=2*s.players[id].assets.length,executive=availableExecutive(s,id)?3:0;s.players[id].vp+=assets+executive;s.finalAwards[id]={assets,executive};}f.step='ended';s.phase='结束';record(s,'六轮结束；未使用战略资产每张已自动加2分。'+(s.config.executive?'未使用行政命令已自动加3分。':''));}else f.step='roundEnd';}}
function requireAftermath(s,step){requireStep(s,'aftermath');if(!s.worldVersion||aftermathSteps(s)[s.flow.checks.length]!==step)throw Error('当前不在该结算步骤');}
function finishInvestment(s,actor){const f=s.flow;f.investmentDone.push(actor);if(f.investmentDone.length===f.order.length)finishAftermath(s,'投资回报');else s.current=f.order[f.investmentDone.length];}
function requireStep(s,step){if(s.flow.step!==step)throw Error('当前不在该流程步骤');}
function requireActor(s){if(currentActor(s)!==s.current)throw Error('请切换到当前轮到的势力');}
function amount(n,min=0){if(!Number.isInteger(n)||n<min||n>999)throw Error('请输入有效的非负整数（最多999）');return n;}
function afterResearch(s){if(s.round<6&&humanPlayers(s).length<4){s.marketDiscard??=[];s.marketDiscard.push(...s.market.splice(-(4-humanPlayers(s).length)));for(let i=humanPlayers(s).length;i<4;i++)refill(s);}resolveAutoInfluence(s);s.flow.research=null;s.flow.index=0;s.flow.step=s.config.wit?'events':'aftermath';s.phase=s.config.wit?'事件':'余波';s.current=s.flow.order[0];s.flow.checks=[];if(s.config.wit)startEventPhase(s);}
function refill(s){if(s.marketDeck.length)s.market.unshift(s.marketDeck.shift());}
function afterCard(s){
 const f=s.flow;if(f.pendingGrowth)return 'growth';if(f.pendingRelation)return 'relation';
 if(f.cardResolution&&advanceSequence(s))return 'sequence';
 if(offerExtraCard(s))return 'extra';
 if(resumeAfterBattlefield(s))return afterCard(s);
 handleFlow(s,{type:'endAction'});return 'end';
}
const TYPES=['startSequenceCard','resolveSequenceStep','manualSequence','resolveOpenDiplomacy','skipOpenDiplomacy','continueWithExtraCard','useGrowthAbility','finishGrowthAbility','playExtraAsset','endAction','startResearch','researchBuy','researchRefresh','researchAlly','undoResearchAlly','finishResearch','confirmEvents','confirmAftermath','nextRound','confirmCountries','chooseOrderSlot','confirmProduction','prepareFocus','confirmFocus','resolveProsperity','resolveInvestments','resolveIncomeEffect','resolveThreat','scoreWorld','scoreSmart','playBasicCard','passTurn'];
export function handleFlow(s,a){
 if(!s.flow||!TYPES.includes(a.type)&&a.type!=='settlePhaseTask')return false;
 const f=s.flow,p=s.players[s.current];
 if(s.round!==f.round)throw Error('轮次与流程不一致');
 requireActor(s);
 switch(a.type){
 case 'startSequenceCard':{requireStep(s,'actions');requireActor(s);startSequence(s,a);afterCard(s);break;}
 case 'resolveSequenceStep':{requireStep(s,'actions');requireActor(s);resolveSequence(s,a);afterCard(s);break;}
 case 'manualSequence':{requireStep(s,'actions');requireActor(s);manualSequence(s);record(s,'已保存已结算账目与手动剩余步骤；不要重复支付或领奖，手动完成后结束行动');break;}
 case 'resolveOpenDiplomacy':case 'skipOpenDiplomacy':{
  requireStep(s,'actions');requireActor(s);if(!f.pendingRelation)throw Error('当前没有待追加的结盟');
  const actor=s.current,result=a.type==='resolveOpenDiplomacy'?resolveOpenDiplomacy(s,a):null;f.pendingRelation=null;
  const next=afterCard(s),extra=next==='extra';
  record(s,`${actor} · ${result?'开放外交：额外支付1外交，结盟支付'+result.cost+'外交、'+result.moneyCost+'资金、'+result.smartCost+' SP，获得'+result.vp+'影响力槽位分':'跳过开放外交，保留本轮使用次数'}${next==='sequence'?'；继续原卡牌后续效果':extra?'；可继续额外出牌':'；行动结束'}`);break;
 }
 case 'continueWithExtraCard':{requireStep(s,'actions');requireActor(s);if(f.extraCard||!offerExtraCard(s))throw Error('当前不能启用额外出牌');record(s,`${s.current} · 战略优势：请选择额外的一张牌，或结束行动`);break;}
 case 'useGrowthAbility':{const result=startGrowthAbility(s,a);record(s,`${s.current} · ${result.name}：${result.inspected?'查看'+result.inspected:'抽取'+result.drawn}张${result.choose?'；请完成手牌选择':'；本轮能力已使用'}`);break;}
 case 'finishGrowthAbility':{const actor=s.current,result=finishGrowthAbility(s,a);
  if(result.industry){record(s,actor+' · 产业发展：'+result.upgrades.map(k=>['能源','原料','粮食','消费品','服务','外交','军队'][k]+'产能 +1').join('、'));afterCard(s);break;}
  if(result.battlefield){
   if(result.kept)record(s,actor+' · 战役优势：保留1张战略资产，获得牌面'+result.points+'分；请选择是否立即使用资产');
   else {if(result.useAsset)startBattlefieldAsset(s,result.useAsset);else record(s,actor+' · 战役优势：放弃即时使用资产');afterCard(s);}
   break;
  }
  record(s,`${s.current} · ${result.name}：${result.kept?'保留'+result.kept+'张，按所选顺序放回'+result.returned+'张':(result.trashed?'移出游戏':'弃置')+result.count+'张手牌'}${result.rewards?'；获得'+rewardSummary(result.rewards)+(result.overflow?'，超限折现'+result.overflow+'资金':''):''}；能力结算完成`);break;}
 case 'playExtraAsset':{
  if(f.extraCard?.cardId)throw Error('必须打出刚研究的指定能力牌');
  if(!extraCardAvailable(s)||!p.assets.includes(a.cardId))throw Error('当前不能追加此战略资产');
  if(p.hand.length&&!p.hand.includes(a.cover))throw Error('使用战略资产需要盖放一张手牌');
  if(!p.hand.length&&a.cover)throw Error('手牌已空，无需盖放');
  consumeExtraCard(s);
  if(a.cover){p.hand.splice(p.hand.indexOf(a.cover),1);p.played.push(a.cover);p.faceDownPlayed??=[];p.faceDownPlayed.push(a.cover);f.turnCards.push(a.cover);}
  p.assets.splice(p.assets.indexOf(a.cardId),1);p.usedAssets.push(a.cardId);
  record(s,`${s.current} · 已追加战略资产并处理盖牌；请手动结算资产效果后结束行动`);break;
 }
 case 'playBasicCard':{
  const actor=s.current,result=resolveBasicCard(s,a);if(a.openDiplomacy)startOpenDiplomacy(s,a,BASIC_CARDS[a.cardId]);const next=afterCard(s),extra=next==='extra';
  const details=result.effect==='trade'?`出口收入${result.revenue}资金，进口支出${result.expense}资金，获得${result.diplomacy}外交${result.currencyBonus?'、'+result.currencyBonus+'额外资金':''}${result.factoryGoods?'；生产'+result.factoryGoods+'消费品':''}`:result.effect==='production'?`生产${result.produced.map(x=>x.quantity+'份'+['能源','原料','粮食','消费品','服务','外交','军队'][x.key]).join('、')||'0种资源'}；超限折现${result.overflow}资金`:result.effect==='growth'?`支付${result.services}服务、${result.diplomacy}外交、${result.cost}资金${result.goods?"、"+result.goods+"消费品":""}${result.armies?"、"+result.armies+"待命军队":""}${result.primary?.length?"、"+result.primary.map((n,k)=>n+["能源","原料","粮食"][k]).join("、"):""}${result.growthDiscard?"，弃置1张手牌":""}，获得${result.growthVP}分${result.active?'':'；能力到第'+result.growth.level+'轮生效'}`:`支付${result.cost}${['invest','base','reinforce'].includes(result.effect)?'资金':'外交'}${result.moneyCost?'、'+result.moneyCost+'资金':''}，获得${result.vp}影响力槽位分${result.gainDiplomacy?'、'+result.gainDiplomacy+'外交':''}${result.gainArmies?'、'+result.gainArmies+'军队':''}${result.effect==='reinforce'?'；获得'+result.armyGain+'军队，移动'+result.moves.length+'次':''}`;
  record(s,`${actor} · ${result.name}：${result.preparation?.length?result.preparation.join('，')+'；':''}${details}${result.smartCost?'；消耗'+result.smartCost+' SP':''}${f.pendingGrowth?'；请先完成'+(f.pendingGrowth.effect==='industry'?'产业发展的产能选择':'战役优势的资产选择'):f.pendingRelation?'；请选择开放外交的第二个国家':next==='sequence'?'；继续原卡牌后续效果':extra?'；'+(f.extraCard.name||'继续出牌')+'：'+(f.extraCard.required?'请继续打出一张牌':'可追加一张牌或结束行动'):'；行动结束'}`);break;
 }
 case 'passTurn':{const actor=s.current;resolvePass(s,a);handleFlow(s,{type:'endAction'});record(s,`${actor} · 放弃行动，盖放手牌（若有），获得10资金；行动结束`);break;}
 case 'endAction':{
  requireStep(s,'actions');requireActor(s);if(s.phase!=='行动'||s.actionTurns.index>=4*f.order.length)throw Error('本轮行动已经结束');
  if(f.extraCard?.cardId&&p.hand.length)throw Error('此牌要求打出刚研究的指定牌，请先完成额外出牌');
  if(f.battlefieldReturn){resumeAfterBattlefield(s);afterCard(s);break;}
  const actor=s.current,dominance=hasGrowth(p,s.round,'dominance')&&f.influencePlaced?.[actor]?1:0;p.vp+=dominance;f.influencePlaced={};s.actionTurns.completed[actor]++;s.actionTurns.index++;f.turnCards=[];f.extraCard=null;f.extraCardSpent=false;f.growthExtraGranted=false;f.extraQueue=[];
  s.current=f.order[s.actionTurns.index%f.order.length];
  if(s.actionTurns.index===4*f.order.length){if(s.round===6)afterResearch(s);else{f.step='research';s.phase='研究';f.index=0;f.research=null;}}
  record(s,`${actor} · 完成第${s.actionTurns.completed[actor]}次行动${dominance?'；宣示主导获得1分':''}${s.actionTurns.index===4*f.order.length?'；进入'+s.phase+'阶段':''}`);break;
 }
 case 'startResearch':{
  requireStep(s,'research');requireActor(s);if(f.research)throw Error('本人的研究已经开始');
  startResearch(s,a.incomeCards);break;
 }
 case 'researchBuy':{
  requireStep(s,'research');requireActor(s);if(!f.research)throw Error('请先开始本人的研究');
  const cost=researchCost(a.id),i=s.market.indexOf(a.id);if(i<0)throw Error('市场卡牌已变化');
  if(cost>f.research.remaining)throw Error('研究力不足');
  f.research.remaining-=cost;f.research.spent+=cost;s.market.splice(i,1);p.deck.unshift(a.id);refill(s);
  record(s,`${s.current} · 支付牌面费用${cost}购买，放到牌库顶`);break;
 }
 case 'researchRefresh':{
  requireStep(s,'research');requireActor(s);if(!f.research||f.research.remaining<2)throw Error('刷新市场需要2研究力');
  if(s.market.length<3)throw Error('市场不足3张，无法刷新');
  f.research.remaining-=2;f.research.spent+=2;s.marketDiscard??=[];s.marketDiscard.push(...s.market.splice(-3));for(let i=0;i<3;i++)refill(s);
  record(s,`${s.current} · 花费2研究力，弃置市场最右3张并补充`);break;
 }
 case 'researchAlly':{
  requireStep(s,'research');requireActor(s);if(!f.research)throw Error('请先开始本人的研究');
  if(!p.allies.includes(a.id)||(p.exhaustedAllies||[]).includes(a.id))throw Error('盟国不属于你或已横置');
  const value=countryValue(a.id);p.exhaustedAllies??=[];p.exhaustedAllies.push(a.id);f.research.remaining+=value;
  f.research.consumedAllies??=[];f.research.consumedAllies.push(a.id);
  record(s,`${s.current} · 横置盟国，按牌面价值获得${value}研究力`);break;
 }
 case 'undoResearchAlly':{
  requireStep(s,'research');requireActor(s);
  if(!f.research?.consumedAllies?.includes(a.id)||!p.allies.includes(a.id)||!p.exhaustedAllies?.includes(a.id))throw Error('只能取消本次研究中消耗的盟国');
  const value=countryValue(a.id);if(f.research.remaining<value)throw Error(`剩余研究力不足${value}，无法取消该盟国的消耗；已购买的牌不会退回。`);
  f.research.remaining-=value;f.research.consumedAllies=f.research.consumedAllies.filter(id=>id!==a.id);p.exhaustedAllies=p.exhaustedAllies.filter(id=>id!==a.id);
  record(s,`${s.current} · 取消本次研究的盟国消耗，退回${value}研究力`);break;
 }
 case 'finishResearch':{
  requireStep(s,'research');requireActor(s);if(!f.research)throw Error('请先结算手牌奖励并开始研究');
  const actor=s.current,lost=f.research.remaining;p.discard.push(...p.hand);p.hand=[];f.index++;f.research=null;
  if(f.index===f.order.length)afterResearch(s);else s.current=f.order[f.index];
  record(s,`${actor} · 结束研究，剩余手牌弃置，未用${lost}研究力清零`);break;
 }
 case 'settlePhaseTask':{
  const actor=s.current,result=settlePhaseTask(s,a);
  record(s,`${actor} · ${result.kind==='events'?'事件结果已核对':'目标计分'+result.entry.points+'分（'+(result.entry.scoreMode==='apply'?'已加分':'仅登记，不再加分')+'）'}`);
  if(result.complete){
   s.settlementHistory??=[];s.settlementHistory.push({round:s.round,...f.settlement});f.settlement=null;
   if(result.kind==='events'){f.step='aftermath';s.phase='余波';f.checks=[];s.current=f.order[0];}
   else finishAftermath(s,'目标卡计分');
  }
  break;
 }
 case 'confirmEvents':requireStep(s,'events');throw Error('请让各玩家依次核对并确认事件结果');
 case 'confirmAftermath':{
  requireStep(s,'aftermath');const steps=aftermathSteps(s);const step=steps[f.checks.length];
  if(step==='目标卡计分')throw Error('请让各玩家依次选择目标卡并登记计分');
  if(s.worldVersion&&['投资回报','威胁结算','地区与多数计分','Smart Power计分'].includes(step))throw Error('请使用本步骤的自动结算按钮');
  if(s.economyVersion&&step==='繁荣提升')throw Error('请让各玩家依次选择提升繁荣或跳过');
  if(!step||a.step!==step||a.confirmed!==true)throw Error('请依次确认当前余波步骤');finishAftermath(s,step);
  record(s,`${step} · 各玩家手动结算已确认`);
  break;
 }
 case 'resolveInvestments':{
  requireAftermath(s,'投资回报');f.investmentDone??=[];if(s.current!==f.order[f.investmentDone.length])throw Error('请按行动顺序结算投资');
  const actor=s.current,withdraw=a.withdraw||{},result=investmentPreview(s,actor,withdraw);p.money+=result.total;for(const [id,n] of Object.entries(withdraw))s.regions[id].engage[actor]-=n;
  p.objectiveHistory??={fdiHistoryComplete:s.round===1};p.objectiveHistory.bestFdiReturn=Math.max(p.objectiveHistory.bestFdiReturn||0,result.fdi);
  if(beginIncomeEffects(s,actor,result))s.current=incomeEffectActor(s);else finishInvestment(s,actor);
  record(s,`${actor} · 投资回报${result.fdi}，撤回介入收益${result.engage}`);break;
 }
 case 'resolveIncomeEffect':{
  requireAftermath(s,'投资回报');const result=resolveIncomeEffect(s,a);
  if(result.complete)finishInvestment(s,result.owner);else s.current=incomeEffectActor(s);
  record(s,result.detail);break;
 }
 case 'resolveThreat':{
  requireAftermath(s,'威胁结算');f.threatDone??=[];if(s.current!==f.order[f.threatDone.length])throw Error('请按行动顺序结算威胁');
  const actor=s.current,defend=a.defend||[],result=threatPreview(s,actor,defend);p.vp-=result.total;for(const id of defend)s.regions[id].engage[actor]--;
  f.threatDone.push(actor);f.threatResults??={};f.threatResults[actor]=result;if(f.threatDone.length===f.order.length)finishAftermath(s,'威胁结算');else s.current=f.order[f.threatDone.length];
  record(s,`${actor} · 威胁结算失去${result.total}分，消耗${defend.length}个介入标记`);break;
 }
 case 'scoreWorld':{
  requireAftermath(s,'地区与多数计分');const result=scoringPreview(s);for(const id of humanPlayers(s))s.players[id].vp+=result.totals[id];s.scoringHistory??=[];s.scoringHistory.push(result);if(s.round===6)s.finalRegionWins=result.wins;
  finishAftermath(s,'地区与多数计分');record(s,`第${s.round}轮地区、多数及国家能力已结算：${humanPlayers(s).map(id=>id+' '+result.totals[id]).join('，')}`);break;
 }
 case 'scoreSmart':{requireAftermath(s,'Smart Power计分');if(!s.config.wit)throw Error('未启用扩展');const points=smartPreview(s);for(const id of humanPlayers(s))s.players[id].vp+=points[id];finishAftermath(s,'Smart Power计分');record(s,'Smart Power多数已按并列最低名次自动计分');break;}
 case 'resolveProsperity':{
  requireStep(s,'aftermath');if(!s.economyVersion||aftermathSteps(s)[f.checks.length]!=='繁荣提升')throw Error('当前不能提升繁荣');
  f.prosperityDone??=[];if(s.current!==f.order[f.prosperityDone.length])throw Error('请按行动顺序选择繁荣提升');
  const actor=s.current,result=resolveProsperity(s,a.improve);f.prosperityDone.push(actor);
  if(f.prosperityDone.length===f.order.length){f.checks.push('繁荣提升');s.current=f.order[0];}else s.current=f.order[f.prosperityDone.length];
  record(s,`${actor} · ${result?'提升繁荣，支付'+result.cost+'消费品，获得'+result.vp+'分与'+result.money+'资金':'本轮跳过繁荣提升'}`);break;
 }
 case 'nextRound':{
  requireStep(s,'roundEnd');if(s.round>=6)throw Error('游戏已经结束');s.round++;f.round=s.round;s.phase='准备';f.step='countries';f.index=0;f.checks=[];f.prosperityDone=[];f.investmentDone=[];f.threatDone=[];f.threatResults={};
  for(const id of humanPlayers(s))drawCards(s.players[id],6+(hasGrowth(s.players[id],s.round,'draw')?1:0));
  record(s,`第${s.round}轮准备：各玩家抽取基础6张，已生效灵活战术另加1张，牌库用尽时洗弃牌；接下来更新国家牌`);break;
 }
 case 'confirmCountries':{
  requireStep(s,'countries');for(const r of Object.values(s.regions))revealCountry(r);
  const queue=[...humanPlayers(s)].sort((a,b)=>s.players[a].vp-s.players[b].vp||s.players[a].money-s.players[b].money||({US:30,CN:20,EU:25,RU:15}[a]-{US:30,CN:20,EU:25,RU:15}[b]));
  f.draft={queue,slots:Array(queue.length).fill(null)};f.index=0;f.step='order';s.current=queue[0];record(s,'七个地区国家牌已更新；按低分、少资金顺序选择行动位置');break;
 }
 case 'chooseOrderSlot':{
  requireStep(s,'order');requireActor(s);if(!Number.isInteger(a.slot)||a.slot<0||a.slot>=f.draft.slots.length||f.draft.slots[a.slot])throw Error('请选择空闲的行动位置');
  f.draft.slots[a.slot]=s.current;f.index++;
  if(f.index===f.order.length){f.order=[...f.draft.slots];f.step='production';f.index=0;s.current=f.order[0];}else s.current=f.draft.queue[f.index];
  record(s,'已选择行动位置'+(a.slot+1));break;
 }
 case 'confirmProduction':{
  requireStep(s,'production');let overflow=0;
  if(s.economyVersion)overflow=producePrimary(s);else if(a.confirmed!==true)throw Error('请先为各玩家手动生产能源、原料和粮食');
  f.step='focus';f.checks=[];s.current=f.order[0];record(s,s.economyVersion?`各玩家初级资源已自动生产，超限折现共${overflow}资金；开始选择焦点`:'初级资源生产已手动确认；开始选择焦点');break;
 }
 case 'prepareFocus':{
  requireStep(s,'focus');if(f.focusProduction)throw Error('焦点已进入生产，请完成生产');
  f.focusProduction=prepareFocus(s,a);record(s,'焦点重整与产能升级已完成，请选择生产数量');break;
 }
 case 'confirmFocus':{
  requireStep(s,'focus');if(s.current!==f.order[f.checks.length])throw Error('请按本轮顺序确认焦点');let result;if(s.economyVersion)result=resolveFocus(s,a);else if(a.confirmed!==true)throw Error('请先手动结算焦点的即时效果');
  f.checks.push(s.current);
  if(f.checks.length===f.order.length){f.step='actions';s.phase='行动';s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};s.current=f.order[0];}else s.current=f.order[f.checks.length];
  record(s,(result?`焦点已结算：重整${result.ready}个盟国，升级花费${result.cost}资金，超限折现${result.overflow}资金${result.quickResponse?"；快速反应部队："+(result.quickResponse.mode==="army"?"花5资金获得1军队":"免费移动1军队"+(result.quickResponse.smartCost?"，消耗1 SP":"")):""}`:'焦点效果已手动确认')+(f.step==='actions'?'；开始本轮行动':''));break;
 }
 }
 return true;
}
