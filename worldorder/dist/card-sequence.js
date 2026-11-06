import {chooseAutoma} from './automa-random.js';
import {planAutomaInfluence,applyAutomaInfluence} from './automa-board.js';
import {ACTION_CARDS,requireTurn,effectPreview,resolveBasicEffect} from './basic-actions.js';
import {consumeExtraCard,grantExtraPlay} from './growth-active.js';
import {startOpenDiplomacy} from './growth-triggers.js';
import {drawCards} from './draw.js';
import {AREAS,changeInfluence} from './world.js';
import {isBasicNonPlayer,isAutoma} from './player-configuration.js';
import {placeNonPlayerInfluence} from './non-player.js';
import {ECONOMY,validateProduction,resolveProsperity} from './economy.js';
import {productionPreview,applyProduction} from './domestic-actions.js';
import {researchCost,countryRegion} from './research.js';
import {regionCountries} from './country-piles.js';
import {consumeSpecialCard} from './special-cards.js';
import {suspendForBattlefield} from './growth-battlefield.js';
import {battlefieldAssetIssue} from './growth-battlefield-availability.js';
import {otherArmyTargets,resolveReturnArmy,readyRegionalAllies,opponentOrder,exhaustResponse} from './opponent-effects.js';
import {foreignInvestmentTargets,resolveForeignInvestment} from './foreign-investments.js';
import {intelligenceTargets,copyAbilityPreview,trashCopiedSelf} from './intelligence.js';
import {resolveAid,resolveSwap,resolveBeijing} from './dd-asset-effects.js';
import {resolveRegime} from './regime-change.js';
import {payCardCost,gainCardResources,allowedSpecialRegion,influenceEffectPreview,resolveInfluenceEffect,resolveIndustrialize} from './special-effects.js';
import {stepAvailability,sequenceEntryIssue} from './sequence-availability.js';
import {ensureSequenceHistory,publicBalances,recordSequenceStep,saveSequenceReport} from './sequence-progress.js';

const powerNames={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
function log(s,text){s.log=[text,...s.log].slice(0,30);}
export function sequenceName(s){const q=s.flow.cardResolution,root=ACTION_CARDS[q.cardId].name;return q.copiedCardId?`${root} · 复制${ACTION_CARDS[q.copiedCardId].name}`:root;}
export function sequenceState(s){const q=s.flow?.cardResolution;if(!q||(q.responder||q.owner)!==s.current||q.round!==s.round||q.turnIndex!==s.actionTurns.index)throw Error('当前没有本方待结算的卡牌');return q;}
export function sequenceStep(s){const q=sequenceState(s);return q.steps[q.index];}
function substitute(value,context){if(value==='$country')return context.country;if(value==='$region')return context.region;if(value==='$regions')return context.regions;if(value==='$remainingRegion')return context.remainingRegion;if(value==='$inspectedPlayer')return context.inspectedPlayer;if(Array.isArray(value))return value.map(v=>substitute(v,context));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,substitute(v,context)]));return value;}
export function sequenceCard(s){const q=sequenceState(s),step=sequenceStep(s);if(step?.type!=='effect')throw Error('当前步骤不是普通行动');return {name:ACTION_CARDS[q.copiedCardId||q.cardId].name,...substitute(step.card,q.context)};}
export function sequenceStatus(s){return stepAvailability(s,sequenceParameters(s));}
export function sequenceStartIssue(s,id,{cover,exact=false}={}){
 const card=ACTION_CARDS[id];if(!s.flow||!s.worldVersion||!s.economyVersion||!card?.steps)return '';
 const covers=card.source?(exact?[cover]:s.players[s.current].hand.length?s.players[s.current].hand:[undefined]):[undefined];let issue='没有可供本牌使用的盖牌';
 for(const chosen of covers){const copy=structuredClone(s),p=copy.players[copy.current];
  if(card.source){try{consumeSpecialCard(copy,{cardId:id,cover:chosen});}catch(error){issue=error.message;continue;}}
  else{const index=p.hand.indexOf(id);if(index>=0){p.hand.splice(index,1);if(card.trashOnPlay){p.trashed??=[];p.trashed.push(id);}else p.played.push(id);}}
  issue=sequenceEntryIssue(copy,card.steps);if(!issue)return '';
 }
 return issue;
}
export function sequencePreview(s,a){return effectPreview(s,a,sequenceCard(s));}
export function sequenceParameters(s){const step=substitute(sequenceStep(s),sequenceState(s).context);return step?.type==='response'?{...step,cost:{money:Math.min(step.upToMoney,s.players[s.current].money)}}:step;}
export function sequenceRegions(s){const step=sequenceParameters(s);return Object.keys(AREAS).filter(region=>allowedSpecialRegion(step,region)&&(!step.resetBefore||s.regions[region].temporary.includes(s.current)));}
export function sequenceInfluencePreview(s,a){return influenceEffectPreview(s,a,sequenceParameters(s));}
export function resetChoices(s){const q=sequenceState(s),step=sequenceStep(s),region=substitute(step.region,q.context);return Object.entries(s.regions).filter(([id])=>!region||id===region).flatMap(([id,r])=>r.temporary.flatMap((owner,index)=>owner===s.current?[{region:id,index}]:[]));}
export function sequenceMarket(s){const step=sequenceStep(s);return s.market.filter(id=>researchCost(id)<=step.maxCost);}
export function startSequence(s,a){requireTurn(s);const p=s.players[s.current],card=ACTION_CARDS[a.cardId];if(!card?.steps||(!card.source&&!p.hand.includes(a.cardId)))throw Error('请选择可用且已支持分段结算的牌');if(s.flow.extraCard?.cardId&&s.flow.extraCard.cardId!==a.cardId)throw Error('必须打出刚研究的指定卡牌');
 const issue=sequenceStartIssue(s,a.cardId,{cover:a.cover,exact:true});if(issue)throw Error('不能打出'+card.name+'：'+issue+'。卡牌与费用均未消耗');
 const before=publicBalances(s);
 if(card.source)consumeSpecialCard(s,a);
 else{consumeExtraCard(s);p.hand.splice(p.hand.indexOf(a.cardId),1);if(card.trashOnPlay){p.trashed??=[];p.trashed.push(a.cardId);}else p.played.push(a.cardId);s.flow.turnCards.push(a.cardId);}
 s.flow.cardResolution={owner:s.current,round:s.round,turnIndex:s.actionTurns.index,cardId:a.cardId,steps:structuredClone(card.steps),index:0,context:{},history:[]};log(s,`${s.current} · 打出${card.name}${card.trashOnPlay?'并移出游戏':''}，开始依次结算`);
 recordSequenceStep(s,s.flow.cardResolution,{type:'cardPlayed'},before,'done',card.source?'战略资产／行政命令已使用；需要的盖牌已处理，请勿重复盖牌或消耗使用次数':'能力牌已经打出；请勿再次从手牌移除');
}
// Only the server-owned battlefield choice can grant this no-cover use.
export function startBattlefieldAsset(s,id){
 const f=s.flow,p=s.players[s.current],pending=f.pendingGrowth;
 if(pending?.effect!=='battlefield'||pending.stage!=='use'||pending.owner!==s.current||f.battlefieldReturn)throw Error('当前没有战役优势的免费资产使用机会');
 const issue=battlefieldAssetIssue(s,id);if(issue)throw Error('不能使用此资产：'+issue+'；未消耗资产');
 const before=publicBalances(s),card=ACTION_CARDS[id];suspendForBattlefield(s);
 p.assets.splice(p.assets.indexOf(id),1);p.usedAssets.push(id);
 f.cardResolution={owner:s.current,round:s.round,turnIndex:s.actionTurns.index,cardId:id,steps:structuredClone(card.steps),index:0,context:{},history:[]};
 recordSequenceStep(s,f.cardResolution,{type:'cardPlayed'},before,'done','战役优势即时使用资产；已翻面，本次无需盖手牌。');
 log(s,`${s.current} · 战役优势：无需盖手牌使用${card.name}，完成后继续原行动`);
}
function missingBinding(value,context){if(typeof value==='string'&&value.startsWith('$'))return context[value.slice(1)]==null;if(value&&typeof value==='object')return Object.values(value).some(v=>missingBinding(v,context));return false;}
// Advance only automatic steps. Interactive decisions remain saved in state.
export function advanceSequence(s){const q=sequenceState(s),p=s.players[s.current];if(s.flow.pendingRelation)return true;
 ensureSequenceHistory(q);delete q.blocked;
 while(q.index<q.steps.length){const step=q.steps[q.index];
  if(['effect','influence','reset','exhaustOpponents'].includes(step.type)&&missingBinding(step,q.context)){
   q.blocked={index:q.index,reason:'前序步骤没有记录本段所需的国家或地区；不能改选任意目标或领取后续奖励'};return true;
  }
  const availability=sequenceStatus(s);
  if(availability.status==='unavailable'){
   q.blocked={index:q.index,reason:availability.reason};return true;
  }
  const before=publicBalances(s),previousLog=s.log[0];let status='done';
  if(step.type==='forRegions'){q.steps.splice(q.index,1,...(q.context.regions||[]).flatMap(region=>substitute(step.steps,{...q.context,region})));continue;}
  else if(step.type==='exhaustOpponents'){const region=sequenceParameters(s).region;q.steps.splice(q.index,1,...opponentOrder(s,q.owner).map(player=>({type:'exhaustResponse',player,region})));continue;}
  else if(step.type==='exhaustResponse'){if(readyRegionalAllies(s,step.player,step.region).length){q.responder=step.player;s.current=step.player;log(s,`力量展示 · 等待${step.player}选择当地盟国横置`);return true;}status='unavailable';log(s,`力量展示 · ${step.player}在${AREAS[step.region].name}没有未横置盟国，略过回应`);}
  else if(step.type==='draw'){const drawn=drawCards(p,step.count);log(s,`${sequenceName(s)} · 已抽${drawn.length}张，继续下一步`);}
  else if(step.type==='extra'){grantExtraPlay(s,sequenceName(s));}
  else if(step.type==='pay'){payCardCost(s,step.cost);log(s,'已支付本段牌面费用，继续结算');}
  else if(step.type==='gain'){gainCardResources(s,step.gain);log(s,'已领取本段牌面收益，继续结算');}
  else if(step.type==='supplyArmies'){for(const region of step.regions)s.regions[region].armies[q.owner]+=step.count;log(s,`${sequenceName(s)} · 从供应堆向${step.regions.map(id=>AREAS[id].name).join('、')}各放置${step.count}军队`);}
  else if(step.type==='prosperity'){const offer=resolveProsperity(s,true,step.cost);log(s,`支付${offer.cost}消费品提升繁荣，获得${offer.vp}分与${offer.money}资金`);}
  else if(step.type==='reset'&&!resetChoices(s).length){status='unavailable';log(s,'该地区没有本方临时影响力，继续结算其余效果');}
  else if(step.type==='researchPlay'&&!sequenceMarket(s).length){status='unavailable';log(s,'市场没有费用符合限制的卡牌，免费研究无法执行');}
  else if(step.type==='readyAlly'&&!p.allies.length){status='unavailable';log(s,'没有盟国可重整，继续结算其余效果');}
  else if(step.type==='searchRegion'&&!Object.values(s.regions).some(r=>regionCountries(r).length)){status='unavailable';log(s,'所有地区的国家牌已取完，完成本牌');}
  else if(step.type==='response'){
   if(isBasicNonPlayer(s,step.player)){const {region}=sequenceParameters(s);placeNonPlayerInfluence(s,step.player,region);log(s,`基础自动机 · ${step.player}按金砖国家牌面在${AREAS[region].name}添加影响力`);}
   else if(isAutoma(s,step.player)){
    const {region}=sequenceParameters(s),accept=chooseAutoma(s,step.player,[false,true]),plan=accept?planAutomaInfluence(s,step.player,region):null;
    if(plan){const cost=Math.min(step.upToMoney,s.players[step.player].money);s.players[step.player].money-=cost;applyAutomaInfluence(s,step.player,plan);log(s,`${step.player} · 接受金砖国家：支付${cost}资金，在${AREAS[region].name}添加影响力`);}
    else log(s,`${step.player} · 不参与金砖国家邀请`);
   }
   else{q.responder=step.player;s.current=step.player;log(s,`${sequenceName(s)} · 等待${powerNames[step.player]}回应，原行动暂停`);return true;}
  }
  else if(step.type==='returnArmy'&&!otherArmyTargets(s,sequenceParameters(s).region).length){log(s,'该地区没有其他玩家的军队，完成本牌');}
  else if(step.type==='foreignInvestment'&&!foreignInvestmentTargets(s).length){log(s,'没有符合条件的其他玩家盟国可投资，完成本牌');}
  else return true;
  recordSequenceStep(s,q,step,before,status,s.log[0]!==previousLog?s.log[0]:'');q.index++;
 }
 saveSequenceReport(s,q,'completed');s.flow.cardResolution=null;return false;
}
export function manualSequence(s){const q=sequenceState(s);if(q.responder)throw Error('请先由当前回应玩家完成回应');saveSequenceReport(s,q,'manual');s.flow.cardResolution=null;}
export function resolveSequence(s,a){
 const q=sequenceState(s),step=sequenceStep(s),before=publicBalances(s),previousLog=s.log[0];ensureSequenceHistory(q);
 if(a.skip===true&&!step.optional&&!['searchRegion','copyAbility'].includes(step.type))throw Error('本段不是可自愿放弃的效果');
 const availability=sequenceStatus(s);if(availability.status==='unavailable'&&a.skip!==true&&a.accept!==false)throw Error(availability.reason);
 if(q.cardId==='ca58c2d75ac35'&&step.type==='regions'&&Array.isArray(a.regions)&&s.players[s.current].money<a.regions.length*20)throw Error('美国海军每个所选地区必须支付20资金并移动2支军队；当前资金不足以完成全部所选地区');
 resolveSequenceChoice(s,a);
 const issue=s.flow.pendingGrowth?.effect==='industry'?'':sequenceEntryIssue(s,q.steps.slice(q.index),q.context);if(issue)throw Error('此选择无法继续完成本牌：'+issue+'；本次选择未扣费或发奖');
 const skipped=a.skip===true||a.accept===false||step.type==='chooseActions'&&a.choices?.length===1&&a.choices[0]==='skip';
 recordSequenceStep(s,q,step,before,skipped?'declined':'done',skipped?'玩家放弃可选效果；本段未支付费用或领取奖励':s.log[0]!==previousLog?s.log[0]:'选择已保存');
}
function resolveSequenceChoice(s,a){const q=sequenceState(s),step=sequenceStep(s),p=s.players[s.current];
 if(step.type==='effect'){
  const card=sequenceCard(s),result=resolveBasicEffect(s,a,card);if(a.country){q.context.country=a.country;q.context.region=countryRegion(a.country);}else if(a.region)q.context.region=a.region;
  q.index++;if(result.effect==='trade'){q.context.lastTrade={transactions:result.transactions,bonusRegions:result.bonusRegions};q.steps.splice(q.index,0,...result.bonusRegions.map(region=>({type:'influence',region})));}if(a.openDiplomacy)startOpenDiplomacy(s,a,card);log(s,`${sequenceName(s)} · 本段${({base:'建基地',relations:'结盟',engage:'介入',trade:'贸易',invest:'投资',reinforce:'移动',production:'生产',growth:'取得发展牌'})[result.effect]}已结算${result.countrySearchRegion?'，所选地区余牌已重洗并揭示顶牌':''}${result.smartCost?'，消耗'+result.smartCost+' SP':''}${result.effect==='trade'?'，出口收入'+result.revenue+'资金、进口支出'+result.expense+'资金；'+(result.bonusRegions.length?'接下来在'+result.bonusRegions.map(id=>AREAS[id].name).join('、')+'添加影响力':card.regionalInfluence?'没有地区影响力奖励':'交易完成'):''}`);return;
 }
 if(step.type==='chooseActions'){
  const choices=a.choices;if(!Array.isArray(choices)||choices.length!==step.count||new Set(choices).size!==choices.length||choices.some(key=>!Object.hasOwn(step.options,key)))throw Error('请选择规定数量的不同效果并确定顺序');
  q.steps.splice(q.index,1,...choices.flatMap(key=>structuredClone(step.options[key])));return;
 }
 if(step.type==='searchRegion'){
  if(a.skip===true){q.index++;return;}
  if(!AREAS[a.region]||!regionCountries(s.regions[a.region]).length)throw Error('请选择仍有国家牌的地区');
  q.steps.splice(q.index,1,{type:'effect',card:{effect:'relations',countrySearchRegion:a.region}});return;
 }
 if(step.type==='copyAbility'){
  if(a.skip===true){q.index++;return;}
  const result=copyAbilityPreview(s,a,sequenceParameters(s));if(result.trashSelf)trashCopiedSelf(s,q);
  q.copiedCardId=result.cardId;q.copiedFrom={player:result.player,zone:result.zone};
  // Replace the final copy instruction with the copied effects. Keep the physical
  // played card and turn credit; use a fresh context for all copied target binds.
  q.context={};q.steps.splice(q.index,1,...result.steps);
  log(s,`情报窃取 · 复制${result.name}${result.trashSelf?'；本方打出的情报窃取已移出游戏':''}，对方原牌保留`);return;
 }
 if(step.type==='aidAllies'){const result=resolveAid(s,a);q.context.regions=result.regions;log(s,`${sequenceName(s)} · 已支付15资金与2军队、横置两个盟国并获得2外交`);}
 else if(step.type==='beijingConsensus'){const result=resolveBeijing(s);log(s,`${sequenceName(s)} · 支付${result.cost}消费品提升至${result.level}级繁荣，获得${result.vp}分与${result.money}资金，再获得${result.diplomacy}外交（实际增加${result.receivedDiplomacy}）`);}
 else if(step.type==='regimeChange'){const result=resolveRegime(s,a,sequenceParameters(s));q.context.country=result.country;q.context.region=result.region;log(s,`${sequenceName(s)} · 支付1服务、1军队与5资金，夺取并重整${powerNames[result.host]}的盟国，清除该牌原有投资与基地；接下来添加当地影响力`);}
 else if(step.type==='swapInfluence'){const result=resolveSwap(s,a,sequenceParameters(s));q.context.region=result.region;log(s,`${sequenceName(s)} · 已与${powerNames[result.target.player]}交换${AREAS[result.region].name}的影响力，不获得放置分数`);}
 else if(step.type==='readyAlly'){
  if(!p.allies.includes(a.country))throw Error('请选择本方盟国重整');p.exhaustedAllies=(p.exhaustedAllies||[]).filter(id=>id!==a.country);log(s,'已重整所选盟国，继续结算');
 }
 else if(step.type==='region'){if(!sequenceRegions(s).includes(a.region))throw Error('请选择本段允许的地区');q.context.region=a.region;}
 else if(step.type==='inspectOpponent'){if(!intelligenceTargets(s).includes(a.targetPlayer))throw Error('请选择另一位玩家查看手牌');q.context.inspectedPlayer=a.targetPlayer;log(s,`情报窃取 · 已查看${a.targetPlayer}的手牌，请选择是否复制能力牌`);}
 else if(step.type==='regions'){const allowed=sequenceRegions(s),selected=a.regions;if(!Array.isArray(selected)||selected.length<step.min||selected.length>step.max||new Set(selected).size!==selected.length||selected.some(id=>!allowed.includes(id)))throw Error(`请选择${step.min}～${step.max}个不同的允许地区`);q.context.regions=[...selected];const remaining=allowed.filter(id=>!selected.includes(id));q.context.remainingRegion=remaining.length===1?remaining[0]:null;}
 else if(step.type==='response'){if(q.responder!==step.player||s.current!==step.player)throw Error('请由指定势力回应');if(typeof a.accept!=='boolean')throw Error('请选择接受或拒绝');if(a.accept){const result=resolveInfluenceEffect(s,a,sequenceParameters(s));log(s,`${powerNames[step.player]}接受金砖国家：支付${result.cost.money}资金，在${AREAS[result.region].name}添加影响力，获得${result.vp}分`);}else log(s,`${powerNames[step.player]}拒绝金砖国家邀请；不支付费用、不添加影响力`);delete q.responder;s.current=q.owner;}
 else if(step.type==='exhaustResponse'){if(q.responder!==step.player)throw Error('当前不是该玩家的回应');exhaustResponse(s,a,sequenceParameters(s));log(s,`力量展示 · ${step.player}已横置所选盟国，继续原行动`);delete q.responder;s.current=q.owner;}
 else if(step.type==='influence'){const result=resolveInfluenceEffect(s,a,sequenceParameters(s));q.context.region=a.region;log(s,`${sequenceName(s)} · 地图效果已结算，添加影响力获得${result.vp}分`);}
 else if(step.type==='industrialize'){const result=resolveIndustrialize(s,a);log(s,`支付${result.cost}资金提升所选产能，获得${result.vp}分`);}
 else if(step.type==='fundDiplomacy'){if(!Number.isInteger(a.bundles)||a.bundles<0||a.bundles>2)throw Error('请选择支付0、10或20资金');payCardCost(s,{money:a.bundles*10});gainCardResources(s,{resources:{5:a.bundles*3}});log(s,`支付${a.bundles*10}资金，获得${a.bundles*3}外交（超出上限舍弃）`);}
 else if(step.type==='returnArmy'){if(a.skip&&step.optional){q.index++;return;}const result=resolveReturnArmy(s,a,sequenceParameters(s));log(s,`外交缓和 · 支付1外交，将${result.player}在${AREAS[result.region].name}的1军队送回其待命区`);}
 else if(step.type==='foreignInvestment'){if(a.skip&&step.optional){q.index++;return;}const result=resolveForeignInvestment(s,a);q.context.country=a.country;q.context.region=result.region;log(s,`金融颠覆 · 支付${result.cost}资金投资${a.host}的盟国，本方获得${result.vp}影响力槽位分；该国归属与原有投资保留`);}
 else if(step.type==='reset'){
  if(a.skip&&step.optional){q.index++;return;}if(!resetChoices(s).some(x=>x.region===a.region&&x.index===a.index))throw Error('请选择本段允许重置的本方临时影响力');changeInfluence(s,{operation:'reset',region:a.region,index:a.index});
 }
 else if(['trashToPlay','discardToPlay'].includes(step.type)){
  if(a.accept!==true&&a.accept!==false)throw Error('请选择是否支付卡牌费用');
  if(a.accept){if(step.type==='trashToPlay'){if(!['hand','discard'].includes(a.zone)||!p[a.zone].includes(a.targetCard))throw Error('请选择手牌或弃牌堆中的一张牌');p[a.zone].splice(p[a.zone].indexOf(a.targetCard),1);p.trashed??=[];p.trashed.push(a.targetCard);}
   else{if(!Array.isArray(a.cards)||a.cards.length!==step.count||new Set(a.cards).size!==step.count||a.cards.some(id=>!p.hand.includes(id)))throw Error('请选择'+step.count+'张不同手牌支付费用');for(const id of a.cards){p.hand.splice(p.hand.indexOf(id),1);p.discard.push(id);}}
   grantExtraPlay(s,sequenceName(s));
  }
 }
 else if(step.type==='researchPlay'){
  if(!sequenceMarket(s).includes(a.targetCard))throw Error('请选择市场中费用不超过'+step.maxCost+'的卡牌');s.market.splice(s.market.indexOf(a.targetCard),1);p.hand.push(a.targetCard);if(s.marketDeck.length)s.market.unshift(s.marketDeck.shift());grantExtraPlay(s,sequenceName(s),a.targetCard);
 }
 else if(step.type==='upgradeProduce'){
  const k=a.key,n=a.quantity;validateProduction(p,s.current);if(!Number.isInteger(k)||k<0||k>6)throw Error('请选择资源种类');if(p.production[k]<ECONOMY[s.current].max[k])p.production[k]++;
  if(k>=3&&(!Number.isInteger(n)||n<0))throw Error('生产数量无效');const result=productionPreview(s,k>=3&&n===0?[]:[{key:k,quantity:n}]);applyProduction(s,result);
 }
 else throw Error('本段效果尚未支持');
 q.index++;
}
