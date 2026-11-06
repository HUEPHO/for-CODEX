import {configuredPlayers,humanPlayers} from './player-configuration.js';
import {initializeAutoInfluence,clearNonPlayerEconomy} from './non-player.js';
import {useEventEffect} from './event-effect-actions.js';
import {consumeExtraCard} from './growth-active.js';
import {initializeEvents} from './event-board.js';
import {handleEventAction} from './event-flow.js';
import {inEventInteraction,manualEventOpen} from './interaction-state.js';
import {gameActionIssue} from './action-policy.js';
import {POWERS,REGIONS,RESOURCE_NAMES} from './game-constants.js';
export {POWERS,REGIONS,RESOURCE_NAMES} from './game-constants.js';
import {EXECUTIVE_BY_POWER} from './special-data.js';
import {initializeCommerce} from './commerce.js';
import {initializeWorld,changeInfluence} from './world.js';
import {ECONOMY} from './economy.js';
import {newFlow,handleFlow,acquireCountry} from './flow.js';
import {sequenceStartIssue} from './card-sequence.js';
import {recordSettlementAction} from './settlement-journal.js';
import {recordObjectiveProgress} from './objective-progress.js';
import {advanceAutomaticFlow} from './automatic-flow.js';
import {buildGrowthSupply,growthMode} from './growth-setup.js';
import {beginnerOpening} from './opening-hand.js';
export function shuffle(a,rng=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export function createState(cards,config={dd:true,wit:true},rng=Math.random){
 const humans=configuredPlayers(config);
 const enabled=c=>c.module==='base'||c.module==='dd'&&config.dd||c.module==='wit'&&config.wit;
 const pool=(type,owner)=>cards.filter(c=>c.type===type&&enabled(c)&&(!owner||c.owner===owner));
 const state={version:2,economyVersion:1,initialOrder:null,actionTurns:null,config:{dd:!!config.dd,wit:!!config.wit,executive:!!config.executive,humans},current:humans[0],round:1,phase:'行动',players:{},regions:{},log:[`${humans.length}位玩家对局已布置${humans.length<4?'，其余势力使用基础自动机':''}。`]};
 for(const [id,power] of Object.entries(POWERS)){
  const start=beginnerOpening(pool('starter',id),id),assets=shuffle(pool('asset',id),rng).slice(0,3);
  state.players[id]={hand:start.hand,deck:shuffle(start.deck,rng),openingChoices:null,discard:[],played:[],assets:[],assetChoices:assets.map(c=>({id:c.id,vp:c.vp||0})),assetSelection:[],usedAssets:[],objectives:[],objectiveChoices:config.dd?shuffle(pool('objective',id).map(c=>c.id),rng).slice(0,3):null,objectiveSelection:[],allies:pool('startingCountry',id).map(c=>c.id),growth:[],money:power.money,vp:0,resources:[...power.resources],production:[...power.resources],prosperity:0,smart:config.wit?2:0,focus:'内政焦点'};
 }
 for(const id of Object.keys(POWERS))if(!humans.includes(id)){const p=state.players[id];p.nonPlayer=true;for(const key of ['hand','deck','allies'])p[key]=[];p.assetChoices=null;p.objectiveChoices=null;p.money=0;p.resources=Array(7).fill(0);p.production=Array(7).fill(0);p.smart=0;}
 state.openingHandVersion=1;
 for(const p of Object.values(state.players))p.objectiveHistory={bestFdiReturn:0,fdiHistoryComplete:true,productionGains:Array(7).fill(0),prosperityGains:0,progressHistoryComplete:true};
 if(state.config.executive)for(const id of humans){state.players[id].executive=EXECUTIVE_BY_POWER[id];state.players[id].executiveUsed=false;}
 const market=shuffle(pool('ability').map(c=>c.id),rng);state.market=market.splice(0,6);state.marketDeck=market;
 state.config.growthMode=growthMode(config);state.growthSetupVersion=1;state.growth=buildGrowthSupply(state.config,rng);
 state.eraDeck=shuffle(pool('event').filter(c=>c.era==='I').map(c=>c.id),rng);state.era2Deck=shuffle(pool('event').filter(c=>c.era==='II').map(c=>c.id),rng);state.events=[];state.chain=pool('event').filter(c=>c.era==='chain').map(c=>c.id);state.resolvedEvents=[];state.effects=pool('effect').map(c=>c.id);
 const initial={M:{US:1},E:{US:1,EU:1,RU:1},C:{RU:1},N:{US:1,EU:1,neutral:1},A:{EU:1},S:{CN:1,neutral:1},P:{US:1,CN:1}};
 for(const region of Object.keys(REGIONS)){
  const unique=new Map();for(const c of pool('country').filter(c=>c.region===region))if(!unique.has(c.notes.split('-')[0]))unique.set(c.notes.split('-')[0],c.id);
  const deck=shuffle([...unique.values()],rng);state.regions[region]={available:deck.splice(0,2),deck,influence:{US:0,CN:0,EU:0,RU:0,neutral:0,...initial[region]},armies:{US:0,CN:0,EU:0,RU:0}};
 }
 initializeWorld(state);initializeCommerce(state);initializeAutoInfluence(state,rng);initializeEvents(state,rng);
 return state;
}
export function determineInitialOrder(state){
 if(Object.values(state.players).some(p=>p.openingChoices||p.assetChoices||p.objectiveChoices))throw Error('开局选牌尚未完成');
 return [...humanPlayers(state)].sort((a,b)=>state.players[b].vp-state.players[a].vp||POWERS[a].money-POWERS[b].money);
}
export function applyAction(state,action){
 const next=applyGameAction(state,action);clearNonPlayerEconomy(next);recordObjectiveProgress(state,next);return action.type==='switch'?next:advanceAutomaticFlow(next);
}
function applyGameAction(state,action){
 const issue=gameActionIssue(state,action);if(issue)throw Error(issue);
 const next=structuredClone(state),p=next.players[next.current];let msg='';
 if(next.eventVersion){
  if(handleEventAction(next,action))return next;
  if(inEventInteraction(next)&&manualEventOpen(next)&&!['switch','useEventEffect'].includes(action.type))next.flow.eventResolution.manualStarted=true;
 }
 if(action.type==='useEventEffect'){useEventEffect(next,action);return next;}
 if(['play','asset'].includes(action.type)){const issue=sequenceStartIssue(next,action.id);if(issue)throw Error('不能打出此牌：'+issue+'。卡牌与费用均未消耗');}
 if(handleFlow(next,action)){recordSettlementAction(state,next,action);return next;}
 const move=(from,to,id)=>{const i=from.indexOf(id);if(i<0)throw Error('这张牌已不在原来的位置');from.splice(i,1);to.push(id)};
 const integer=(x)=>{if(!Number.isInteger(x))throw Error('请输入整数');return x};
 switch(action.type){
 case 'selectAssetDiscard':
 case 'selectObjectiveDiscard':{
  const asset=action.type==='selectAssetDiscard',choices=asset?p.assetChoices?.map(c=>c.id):p.objectiveChoices,key=asset?'assetSelection':'objectiveSelection';
  if(!choices||(!asset&&!next.config.dd))throw Error('当前没有待选的开局卡牌');
  if(!choices.includes(action.id))throw Error('不在本次抽到的三张卡牌中');
  // Keep the established two-kept-card state and joint confirmation contract.
  // Clicking the discarded card again clears the choice; another card replaces it.
  p[key]=p[key].length===2&&!p[key].includes(action.id)?[]:choices.filter(id=>id!==action.id);
  return next;
 }
 case 'toggleAssetSelection':{
  if(!p.assetChoices)throw Error('该势力已经选好战略资产');
  if(!p.assetChoices.some(c=>c.id===action.id))throw Error('不在本次抽到的三张资产中');
  const index=p.assetSelection.indexOf(action.id);
  if(index>=0)p.assetSelection.splice(index,1);
  else{if(p.assetSelection.length>=2)throw Error('最多保留两张，请先取消一张');p.assetSelection.push(action.id)}
  return next;
 }
 case 'toggleObjectiveSelection':{
  if(!next.config.dd||!p.objectiveChoices)throw Error('当前没有待选目标卡');
  if(!p.objectiveChoices.includes(action.id))throw Error('不在本次抽到的三张目标卡中');
  const index=p.objectiveSelection.indexOf(action.id);
  if(index>=0)p.objectiveSelection.splice(index,1);
  else{if(p.objectiveSelection.length>=2)throw Error('最多保留两张目标卡，请先取消一张');p.objectiveSelection.push(action.id)}
  return next;
 }
 case 'chooseAssets':{
  if(!p.assetChoices)throw Error('该势力已经选好战略资产');
  if(p.assetSelection.length!==2||new Set(p.assetSelection).size!==2||!p.assetSelection.every(id=>p.assetChoices.some(c=>c.id===id)))throw Error('请选择不同的两张战略资产');
  if(p.objectiveChoices){
   if(p.objectiveSelection.length!==2||new Set(p.objectiveSelection).size!==2||!p.objectiveSelection.every(id=>p.objectiveChoices.includes(id)))throw Error('请同时选好两张目标卡');
   p.objectives=[...p.objectiveSelection];p.objectiveChoices=null;p.objectiveSelection=[];
  }
  p.assets=[...p.assetSelection];p.vp=p.assetChoices.filter(c=>p.assets.includes(c.id)).reduce((sum,c)=>sum+c.vp,0);
  p.assetChoices=null;p.assetSelection=[];msg=`保留两张战略资产，起始分数为${p.vp}`;break;
 }
 case 'chooseOpening':{
  if(!p.openingChoices)throw Error('该势力已经选好起手牌');
  if(action.group!==0&&action.group!==1)throw Error('请选择A组或B组');
  p.hand=[...p.openingChoices[action.group]];p.deck=shuffle(p.openingChoices[1-action.group]);p.openingChoices=null;
  msg=`选择${action.group===0?'A':'B'}组作为6张起手牌`;break;
 }
 case 'switch':if(!humanPlayers(next).includes(action.player))throw Error('无效势力');next.current=action.player;return next;
 case 'endAction':{
  const turns=next.actionTurns;
  if(!turns||next.round!==1||next.phase!=='行动'||turns.index>=16)throw Error('目前仅支持新桌面的首轮行动轮转');
  const actor=next.initialOrder[turns.index%4];
  if(next.current!==actor)throw Error(`请切换到${POWERS[actor].name}结束本次行动`);
  turns.completed[actor]++;turns.index++;
  next.current=next.initialOrder[turns.index%4];
  if(turns.index===16)next.phase='研究';
  next.log=[`${POWERS[actor].name} · 完成第${turns.completed[actor]}次行动；${turns.index===16?'进入研究阶段（结算待手动处理）':'接下来：'+POWERS[next.current].name}`,...next.log].slice(0,30);
  return next;
 }
 case 'draw':if(!p.deck.length&&p.discard.length){p.deck=shuffle(p.discard);p.discard=[]}if(!p.deck.length)throw Error('牌库与弃牌堆都没有牌了');p.hand.push(p.deck.shift());msg='抽取1张手牌';break;
 case 'play':if(next.flow?.extraCard?.cardId&&next.flow.extraCard.cardId!==action.id)throw Error('必须打出刚研究的指定卡牌');if(next.flow&&Array.isArray(next.flow.turnCards)){if(next.current!==next.flow.order[next.actionTurns.index%next.flow.order.length])throw Error('请切换到当前行动玩家');consumeExtraCard(next);next.flow.turnCards.push(action.id);}move(p.hand,p.played,action.id);msg='将一张手牌放入行动区（效果待手动处理）';break;
 case 'discard':move(p.hand,p.discard,action.id);msg='弃置一张手牌';break;
 case 'return':if(next.flow&&Array.isArray(next.flow.turnCards)&&!next.flow.turnCards.includes(action.id))throw Error('只能收回本次行动刚打出的牌');move(p.played,p.hand,action.id);if(next.flow?.turnCards)next.flow.turnCards=next.flow.turnCards.filter(id=>id!==action.id);p.faceDownPlayed=(p.faceDownPlayed||[]).filter(id=>id!==action.id);msg='将行动区卡牌拿回手牌';break;
 case 'clearPlayed':if(!p.played.length)throw Error('行动区没有牌');p.discard.push(...p.played);p.played=[];p.faceDownPlayed=[];msg='将行动区卡牌移入弃牌堆';break;
 case 'market':{const i=next.market.indexOf(action.id);if(i<0)throw Error('市场卡牌已变化');next.market.splice(i,1);p.deck.unshift(action.id);if(next.marketDeck.length)next.market.unshift(next.marketDeck.shift());msg='拿取市场牌到牌库顶（未扣研究力）';break;}
 case 'refreshMarket':if(!next.marketDeck.length)throw Error('市场牌库已空');next.marketDeck.push(...next.market);next.market=next.marketDeck.splice(0,6);msg='手动更换市场展示';break;
 case 'growth':move(next.growth,p.growth,action.id);msg='拿取发展牌（费用与得分待手动处理）';break;
 case 'ally':{const r=next.regions[action.region];if(!r)throw Error('无效地区');if(next.flow){acquireCountry(r,action.id);p.allies.push(action.id);}else{move(r.available,p.allies,action.id);if(r.deck.length)r.available.push(r.deck.shift());}msg='拿取盟国牌（效果与费用待手动处理）';break;}
 case 'asset':move(p.assets,p.usedAssets,action.id);msg='标记战略资产已使用（效果待手动处理）';break;
 case 'exhaustAlly':if(!p.allies.includes(action.id)||(p.exhaustedAllies||[]).includes(action.id))throw Error('盟国已横置或不属于你');p.exhaustedAllies??=[];p.exhaustedAllies.push(action.id);msg='手动横置盟国';break;
 case 'readyAlly':if(!(p.exhaustedAllies||[]).includes(action.id))throw Error('该盟国没有横置');p.exhaustedAllies=p.exhaustedAllies.filter(id=>id!==action.id);msg='按牌面效果手动重置盟国';break;
 case 'restoreAsset':move(p.usedAssets,p.assets,action.id);msg='恢复战略资产';break;
 case 'event':move(next.events,next.resolvedEvents,action.id);msg='将事件移入已处理区（效果需自行确认）';break;
 case 'addEvent':{if(!next.config.wit)throw Error('未启用事件扩展');if(next.events.length>=3)throw Error('公共事件区最多3张');const deck=next.round<=3?next.eraDeck:next.era2Deck;if(!deck.length)throw Error('该时代事件牌库已空');next.events.push(deck.shift());msg='手动揭示1张事件';break;}
 case 'resource':{const delta=integer(action.delta);if(![-1,1].includes(delta))throw Error('无效调整');if(Number.isInteger(action.key)){if(action.key<0||action.key>6)throw Error('无效资源');p.resources[action.key]=Math.max(0,Math.min(action.key===6?Infinity:10,p.resources[action.key]+delta));msg=`调整${RESOURCE_NAMES[action.key]}`}else{if(!['money','vp','smart'].includes(action.key))throw Error('无效资源');if(action.key==='smart'&&!next.config.wit)throw Error('未启用Smart Power');p[action.key]=Math.max(action.key==='vp'?-999:0,Math.min(999,p[action.key]+delta));msg=`调整${{money:'资金',vp:'胜利分',smart:'Smart Power'}[action.key]}`}break;}
 case 'worldInfluence':{if(!next.worldVersion)throw Error('该旧桌面尚未启用槽位记录');const result=changeInfluence(next,action);msg=`影响力操作：获得${result.vp}分${result.removed?'，挤出'+result.removed+'的临时影响力':''}`;break;}
 case 'engageToken':{const r=next.regions[action.region];if(!next.worldVersion||!r||![-1,1].includes(action.delta))throw Error('无效介入标记');if(r.engage[next.current]+action.delta<0)throw Error('没有可移除的介入标记');r.engage[next.current]+=action.delta;msg='按已处理的牌面效果手动调整介入标记';break;}
 case 'toggleCommerce':{if(!next.tradeVersion||!Number.isInteger(action.index)||!p.commerce[action.index])throw Error('无效贸易卡');p.commerce[action.index].ready=!p.commerce[action.index].ready;msg='按已处理的卡牌效果手动翻面贸易卡';break;}
 case 'initializeCommerce':initializeCommerce(next,action.ready);msg='已按各方确认的贸易卡正反面启用贸易记录';break;
 case 'toggleBase':{if(!next.worldVersion||!p.allies.includes(action.id))throw Error('请选择自己的盟国');p.bases??=[];const i=p.bases.indexOf(action.id);if(i<0)p.bases.push(action.id);else p.bases.splice(i,1);msg='按已处理的建基地效果手动调整基地标记（不支付费用、不派兵、不加影响力）';break;}
 case 'toggleFDI':{if(!next.worldVersion||!p.allies.includes(action.id))throw Error('请选择自己的盟国');p.fdi??=[];const i=p.fdi.indexOf(action.id);if(i<0)p.fdi.push(action.id);else p.fdi.splice(i,1);msg='按已处理的投资效果手动调整FDI标记（此按钮不支付费用）';break;}
 case 'region':{if(next.worldVersion&&action.kind==='influence')throw Error('请通过永久／临时槽位操作影响力');const r=next.regions[action.region];if(!r||!['influence','armies'].includes(action.kind)||!(action.player in r[action.kind]))throw Error('无效地区操作');if(![-1,1].includes(action.delta))throw Error('无效调整');r[action.kind][action.player]=Math.max(0,Math.min(99,r[action.kind][action.player]+action.delta));msg=`手动调整${REGIONS[action.region]}${action.kind==='influence'?'影响力':'军队'}`;break;}
 case 'round':if(!Number.isInteger(action.round)||action.round<1||action.round>6)throw Error('轮次应为1–6');next.round=action.round;msg=`将轮次标记改为第${action.round}轮（无自动结算）`;break;
 case 'phase':if(!['准备','行动','研究','事件','余波'].includes(action.phase)||action.phase==='事件'&&!next.config.wit)throw Error('无效阶段');next.phase=action.phase;msg=`手动切换到${action.phase}阶段`;break;
 case 'adjustEventProsperity':{const q=next.flow?.eventResolution;if(!next.eventVersion||next.flow?.step!=='events'||q?.mode!=='manual'||q.stage==='result'||q.done.includes(next.current)||![-1,1].includes(action.delta))throw Error('仅可在未确认的人工事件中登记本方繁荣');p.prosperity=Math.max(0,Math.min(5,p.prosperity+action.delta));msg='按事件牌面手动调整繁荣；未自动支付费用或发放奖励';break;}
 case 'adjustProduction':{if(!next.economyVersion||!p.production||!Number.isInteger(action.key)||action.key<0||action.key>6||![-1,1].includes(action.delta))throw Error('无效产能调整');const value=p.production[action.key]+action.delta;if(value<1||value>ECONOMY[next.current].max[action.key])throw Error('超出本国产能轨范围');p.production[action.key]=value;msg='按卡牌效果手动调整产能（不自动支付费用或获得资源）';break;}
 case 'focus':if(next.flow?.focusProduction)throw Error('焦点已进入生产，不能重新选择');if(next.economyVersion&&(!next.flow||next.flow.step!=='focus'||next.current!==next.flow.order[next.flow.checks.length]))throw Error('只能由当前玩家在准备阶段选择焦点');if(!['内政焦点','外交焦点','军事焦点'].includes(action.focus))throw Error('无效焦点');p.focus=action.focus;msg=`选择${action.focus}（请在流程面板完成选择后结算）`;break;
 default:throw Error('未知操作');
 }
 if(msg)next.log=[`${POWERS[next.current].name} · ${msg}`,...next.log].slice(0,30);
 if(['chooseOpening','chooseAssets'].includes(action.type)&&!next.initialOrder&&!Object.values(next.players).some(p=>p.openingChoices||p.assetChoices||p.objectiveChoices)){
  next.initialOrder=determineInitialOrder(next);next.current=next.initialOrder[0];
  next.flow=newFlow(next.initialOrder);
  next.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
  next.log=[`首轮顺序：${next.initialOrder.map((id,i)=>`${i+1}. ${POWERS[id].name}`).join(' → ')}`,...next.log].slice(0,30);
 }
 recordSettlementAction(state,next,action);return next;
}
