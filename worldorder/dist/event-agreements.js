import {EVENT_DATA} from './event-data.js';
import {isNonPlayer,isAutoma,isBasicNonPlayer} from './player-configuration.js';
import {automaEventArmyOffer,automaAgreementCost,canPayAutomaAgreement} from './event-automa.js';
import {drawNonPlayerBid,NON_PLAYER_EVENT_BIDS} from './event-non-player-data.js';
import {drainNonPlayerRewards,resolveNonPlayerRewardChoice} from './non-player-rewards.js';
import {countryInfo,applyRelations} from './country-actions.js';
import {regionCountries} from './country-piles.js';
import {AREAS} from './world.js';
import {gainResource} from './economy.js';
import {reinforcementPreview,applyReinforcement} from './military.js';
import {convertEventInfluence} from './event-influence.js';
import {queueChain,addNeutralInfluence} from './event-board.js';
import {removeEventEffect,grantEventEffect} from './event-effect-state.js';
import {activateTTIP} from './event-effect-actions.js';
import {publicBalances,balanceChanges} from './sequence-progress.js';

// Contribution ranges printed in the lower-right corner are NPP/Automa bid
// decks (WIT p.15), not limits for the four human players.
export const AGREEMENT_EVENTS=Object.freeze({
 c963b6d849299:{key:'minsk',diplomacy:5,exact:true,smartPerDiplomacy:1,vp:2,failure:'minsk'},
 c0a692aca2850:{key:'afghan',money:30,exact:true,allowZero:true,smart:1,failure:'afghan'},
 c0393427ae3df:{key:'libya',armies:'event',minimumArmies:3,region:'N',smartPerArmy:2,chain:'cb29f5917c351',failure:'libya'},
 cfeeeba9da48c:{key:'imec',money:20,diplomacy:4,exact:true,discountCountries:['India','Israel','Saudi Arabia','UAE'],reward:'imec'},
 c9d55e147b0d7:{key:'brics',diplomacy:5,exact:true,smartPerDiplomacy:1,reward:'brics'},
 ce97d5ccaf589:{key:'tradeWar',diplomacy:5,smartPerDiplomacy:1,vpPerDiplomacy:1,failure:'tradeWar'},
 c300aaac6d226:{key:'unlimited',diplomacy:4,smartPerDiplomacy:1,vpPerDiplomacy:1,reward:'move',effect:{owner:'global',cardId:'c12b545fd816e'}},
 cb49c1aaba260:{key:'siberia',fixed:{money:15,diplomacy:1},smart:3,effect:{owner:'CN',cardId:'c0a8f33fb6048'}},
 c8c95b49f81e7:{key:'nordstream',fixed:{money:10,diplomacy:2},reward:'nordstream',effect:{owner:'EU',cardId:'cffbb59b3d793'}},
 ce9e1586521dc:{key:'start',fixed:{money:0,diplomacy:1},armies:'supply',eachMinimumArmies:1,smart:2,vpPerArmy:2,effect:{owner:'global',cardId:'c00b5d0118cf2'}},
 ccb7c1841e070:{key:'iran',diplomacy:5,smartPerDiplomacy:1,vp:2,failure:'iran'},
 cf0d87e580c4a:{key:'ttip',diplomacy:8,smartPerDiplomacy:.5,reward:'ttip'}
});
const names={US:'美国',EU:'欧盟',RU:'俄罗斯',CN:'中国'};
const bricsNames=new Set(['Egypt','Ethiopia','Iran','Saudi Arabia','UAE']);
const int=(n,max=999)=>{if(!Number.isInteger(n)||n<0||n>max)throw Error('承诺数量必须为限额内的非负整数');return n;};
function ruleFor(q){const rule=AGREEMENT_EVENTS[q?.cardId];if(!rule)throw Error('此共同协议尚未登记');return rule;}
function credit(s,owner,rule){return rule.discountCountries?s.players[owner].allies.reduce((n,id)=>n+Number(rule.discountCountries.includes(countryInfo(id).countryName)),0):0;}
function loseSP(p,n){const paid=Math.min(p.smart,n);p.smart-=paid;p.vp-=n-paid;return n-paid;}
function receipt(s,q,before,detail,player=null){q.receipts.push({player,detail,changes:balanceChanges(before,publicBalances(s))});}
export function initializeAgreement(s,q){ruleFor(q);q.agreementVersion=2;q.stage='agreement';q.submissions={};q.done=[];q.rewardQueue=[];q.eventArmies={};for(const owner of q.participants){const r=ruleFor(q);q.submissions[owner]={accept:true,money:r.fixed?.money||0,diplomacy:r.fixed?.diplomacy||0,credit:credit(s,owner,r),armies:{},count:0,moveCost:0,confirmed:false};}
 for(const owner of q.participants.filter(id=>isNonPlayer(s,id))){
  const r=ruleFor(q),printed=NON_PLAYER_EVENT_BIDS[q.cardId][owner],draw=r.key==='afghan'?s.eventBoard.nonPlayerAfghan[owner]:drawNonPlayerBid(q.cardId,owner),accept=draw!==false&&draw!==0;
  const offer={accept,money:0,diplomacy:0,credit:0,armies:{},count:0,moveCost:0,confirmed:true,nonPlayer:true,draw};
  if(accept){
   offer.money=printed.money??r.fixed?.money??(r.key==='afghan'?15:0);
   offer.diplomacy=printed.diplomacy??r.fixed?.diplomacy??(r.diplomacy?draw:0);
   if(r.armies==='event')offer.count=draw;
   if(r.armies==='supply'){
    if(Object.values(s.regions).some(region=>region.armies[owner]>0)){offer.pendingArmies=true;offer.confirmed=false;}
    else offer.accept=false;
   }
   if(isAutoma(s,owner)){
    offer.automa=true;offer.credit=credit(s,owner,r);offer.diplomacy=Math.max(0,offer.diplomacy-offer.credit);
    if(r.armies==='event')Object.assign(offer,automaEventArmyOffer(s,owner,r.region,offer.count));
    if(!canPayAutomaAgreement(s,owner,offer)){offer.accept=false;offer.confirmed=true;delete offer.pendingArmies;}
   }
  }
  q.submissions[owner]=offer;if(r.key!=='afghan')s.nonPlayerRandom=(s.nonPlayerRandom||0)+1;
 }
 prepareNonPlayerAgreementChoice(s,q);checkAgreementCompletion(s,q);
}
function prepareNonPlayerAgreementChoice(s,q){
 const owner=q.participants.find(id=>q.submissions[id].pendingArmies);
 if(owner)q.nonPlayerChoice={owner,type:'disarm',source:'agreementOffer',regions:Object.keys(AREAS).filter(r=>s.regions[r].armies[owner]>0)};
}
export function agreementModel(s,q,owner=s.current){
 const rule=ruleFor(q);if(!q.participants.includes(owner))throw Error('该玩家不参与本协议');
 return {...rule,owner,name:EVENT_DATA[q.cardId].name,credit:credit(s,owner,rule),participants:[...q.participants]};
}
export function agreementOffer(s,q,owner,a){
 if(isNonPlayer(s,owner)){const offer=q.submissions[owner];if(offer.accept&&!canPayAutomaAgreement(s,owner,offer))throw Error('高级自动机协议出资所需资金不足');return offer;}
 const rule=agreementModel(s,q,owner),p=s.players[owner];
 if(a.accept!==true&&a.accept!==false)throw Error('请选择同意出资或不参与');
 if(!a.accept)return {accept:false,money:0,diplomacy:0,credit:0,armies:{},count:0,moveCost:0};
 const money=rule.fixed?.money??(rule.money?int(a.money??0,rule.money):0),diplomacy=rule.fixed?.diplomacy??(rule.diplomacy?int(a.diplomacy??0,p.resources[5]):0),armies={};let count=0;
 if(rule.armies){
  const input=a.armies??{};if(!input||typeof input!=='object'||Array.isArray(input))throw Error('请选择承诺军队的来源');
  for(const [from,n] of Object.entries(input)){
   if(!AREAS[from]&&!(from==='reserve'&&rule.armies==='event'))throw Error('本协议只能从允许的地区移出军队');
   const available=from==='reserve'?p.resources[6]:s.regions[from].armies[owner];int(n,available);if(n){armies[from]=n;count+=n;}
  }
  if(q.agreementVersion<2&&count<(rule.eachMinimumArmies||0))throw Error('每方至少将1支版图军队移回补给');
 }
 const moveCost=rule.armies==='event'?count*5:0;
 if(p.money<money+moveCost||p.resources[5]<diplomacy)throw Error('协议承诺所需资金或外交不足');
 if(q.agreementVersion<2&&!rule.allowZero&&money+diplomacy+rule.credit+count===0)throw Error('同意协议必须实际出资，或由牌面盟国抵扣外交');
 return {accept:true,money,diplomacy,credit:rule.credit,armies,count,moveCost};
}
function payContributions(s,q){
 for(const [owner,offer] of Object.entries(q.submissions))if(offer.accept){
  const p=s.players[owner];if(isAutoma(s,owner))p.money-=automaAgreementCost(offer);else{p.money-=offer.money+offer.moveCost;p.resources[5]-=offer.diplomacy;}
  if(isBasicNonPlayer(s,owner)){p.money=0;p.resources[5]=0;}
  for(const [from,n] of Object.entries(offer.armies)){if(from==='reserve')p.resources[6]-=n;else s.regions[from].armies[owner]-=n;}
  if(ruleFor(q).armies==='event')q.eventArmies[owner]=offer.count;
 }
}
function finish(s,q){
 const region=ruleFor(q).region,placed=[];
 for(const [owner,n] of Object.entries(q.eventArmies||{}))if(n){s.regions[region].armies[owner]+=n;placed.push(`${names[owner]}${n}支`);}
 if(placed.length)q.receipts.push({player:null,detail:`事件牌军队进入${AREAS[region].name}：${placed.join('、')}`,changes:[]});
 if(q.pendingAgreementEffect){const effect=q.pendingAgreementEffect;grantEventEffect(s,effect.owner,effect.cardId,q.cardId);delete q.pendingAgreementEffect;q.result+='对应持续效果已生效。';}
 if(ruleFor(q).key==='afghan'&&q.agreement?.success===false)addNeutralInfluence(s,'C');
 q.eventArmies={};q.stage='result';
}
export function agreementTotals(q){
 const contributors=q.participants.filter(owner=>q.submissions[owner]?.accept);
 const totals=contributors.reduce((n,id)=>{const o=q.submissions[id];n.money+=o.money;n.diplomacy+=o.diplomacy+o.credit;n.armies+=o.count;return n;},{money:0,diplomacy:0,armies:0});
 return {contributors,totals};
}
export function agreementEnough(q){
 const rule=ruleFor(q),{contributors,totals}=agreementTotals(q);
 const enough=(actual,required)=>required===undefined||(rule.exact?actual===required:actual>=required);
 return contributors.length>=2&&enough(totals.money,rule.money)&&enough(totals.diplomacy,rule.diplomacy)&&totals.armies>=(rule.minimumArmies||0)&&contributors.every(id=>{const o=q.submissions[id];return o.count>=(rule.eachMinimumArmies||0)&&(rule.allowZero||o.money+o.diplomacy+o.credit+o.count>0);});
}
function settle(s,q,forcedFailure=false){
 const rule=ruleFor(q),before=publicBalances(s),contributors=q.participants.filter(owner=>q.submissions[owner].accept);
 // Revalidate all promises before charging anyone. No resource transfer occurs
 // while another participant is still deciding.
 if(!forcedFailure)for(const owner of q.participants)agreementOffer(s,q,owner,q.submissions[owner]);
 const {totals}=agreementTotals(q),success=!forcedFailure&&agreementEnough(q);
 q.agreement={success,contributors,totals};
 if(!success){
  if(rule.failure==='minsk'){for(const owner of q.participants)s.players[owner].vp-=2;queueChain(s,'cd780718be7a6');}
  else if(rule.failure==='afghan'){for(const owner of q.participants){loseSP(s.players[owner],1);if(s.regions.C.armies[owner])q.rewardQueue.push({owner,type:'withdraw',max:s.regions.C.armies[owner]});}}
  else if(rule.failure==='libya'){for(const owner of q.participants)loseSP(s.players[owner],2);addNeutralInfluence(s,'N');}
  else if(rule.failure==='tradeWar'){for(const owner of q.participants){s.players[owner].prosperity=Math.max(0,s.players[owner].prosperity-1);loseSP(s.players[owner],1);}grantEventEffect(s,'global','cdf7b014a4323',q.cardId);}
  else if(rule.failure==='iran'){addNeutralInfluence(s,'N');for(const owner of q.participants)loseSP(s.players[owner],s.regions.N.influence[owner]);}
  q.result='协议未达成；全部承诺未扣费。'+({minsk:'双方各失去2分，入侵乌克兰加入连锁。',afghan:'双方各失去1 SP（不足扣分），免费撤回中亚全部军队。',libya:'双方各失去2 SP（不足扣分），中东增加1中立影响力。',tradeWar:'双方繁荣降低1（最低0）、失去1 SP（不足扣分），中美贸易战生效。',iran:'中东增加1中立影响力，各方按本方在中东的影响力失去SP（不足扣分）。'}[rule.failure]||'没有后续效果。');
  receipt(s,q,before,q.result);drainNonPlayerRewards(s,q,finish);return;
 }
 payContributions(s,q);
 if(rule.key==='minsk')removeEventEffect(s,'cc83057306d10');
 for(const owner of contributors){const p=s.players[owner],o=q.submissions[owner];p.smart+=(rule.smart||0)+Math.floor(o.diplomacy*(rule.smartPerDiplomacy||0))+o.count*(rule.smartPerArmy||0);p.vp+=(rule.vp||0)+o.diplomacy*(rule.vpPerDiplomacy||0)+o.count*(rule.vpPerArmy||0);}
 if(rule.effect){if(rule.reward)q.pendingAgreementEffect={...rule.effect};else grantEventEffect(s,rule.effect.owner,rule.effect.cardId,q.cardId);}
 if(rule.chain)queueChain(s,rule.chain);
 if(rule.reward==='imec'){
  for(const owner of contributors){const o=q.submissions[owner],n=o.diplomacy+o.credit+Math.floor(o.money/10);s.players[owner].smart+=n;if(owner==='US')s.players[owner].vp+=n;}
  if(['E','N','S'].some(region=>s.regions[region].temporary.includes('EU')))q.rewardQueue.push({owner:'EU',type:'convert',regions:['E','N','S'],optional:true});
 }else if(rule.reward==='brics'){
  for(const owner of [...contributors].sort((a,b)=>q.submissions[b].diplomacy-q.submissions[a].diplomacy))q.rewardQueue.push({owner,type:'bricsCountry',optional:true});
 }else if(rule.reward==='move')for(const owner of contributors)q.rewardQueue.push({owner,type:'move',max:2,moveCost:5,optional:true});
 else if(rule.reward==='nordstream'){gainResource(s.players.EU,5,2);q.rewardQueue.push({owner:'RU',type:'nordstream',regions:['E']});}
 else if(rule.reward==='ttip')for(const owner of contributors)q.rewardQueue.push({owner,type:'ttip'});
 q.result='共同协议已达成；参与方承诺已统一支付，SP及分数奖励已结算。'+(rule.effect&&!rule.reward?'对应持续效果已生效。':'')+(rule.chain?'后续连锁已登记。':'');
 receipt(s,q,before,q.result);drainNonPlayerRewards(s,q,finish);
}
function checkAgreementCompletion(s,q){
 q.done=q.participants.filter(id=>q.submissions[id].confirmed);
 const rejected=q.participants.filter(id=>q.submissions[id].accept===false).length;
 const humans=q.participants.filter(id=>!isNonPlayer(s,id)),humansRefuse=humans.length>0&&humans.length<q.participants.length&&humans.every(id=>q.submissions[id].accept===false);
 if(rejected>=(ruleFor(q).key==='iran'?3:1)||humansRefuse){delete q.nonPlayerChoice;settle(s,q,true);}
 else if(q.nonPlayerChoice)return;
 else if(q.done.length===q.participants.length){if(agreementEnough(q))settle(s,q);else if(!humans.length)settle(s,q,true);}
}
export function resolveNonPlayerAgreementChoice(s,q,a){
 const step=q.nonPlayerChoice;if(!step)throw Error('当前没有非玩家选择');
 if(step.source==='reward'){resolveNonPlayerRewardChoice(s,q,a);drainNonPlayerRewards(s,q,finish);return;}
 const armies=a.placements;if(!armies||typeof armies!=='object'||Array.isArray(armies))throw Error('请选择移回补给的军队');
 let count=0;for(const [region,n] of Object.entries(armies)){if(!step.regions.includes(region))throw Error('无效的军队地区');int(n,s.regions[region].armies[step.owner]);count+=n;}
 if(count<1)throw Error('至少移回1支版图军队');
 Object.assign(q.submissions[step.owner],{armies,count,confirmed:true});delete q.submissions[step.owner].pendingArmies;delete q.nonPlayerChoice;
 prepareNonPlayerAgreementChoice(s,q);checkAgreementCompletion(s,q);
}
export function updateAgreement(s,q,a){
 if(q.agreementVersion!==2||q.stage!=='agreement'||!q.participants.includes(s.current))throw Error('当前不能修改本方协议提案');
 if(a.type==='submitEvent'&&typeof a.accept!=='boolean')throw Error('请选择确认或拒绝');
 const previous=q.submissions[s.current];
 if(previous.accept===false)throw Error('本方已拒绝本协议');
 if(a.operation==='unconfirm')q.submissions[s.current]={...previous,confirmed:false};
 else if(a.type==='submitEvent'&&a.accept===false)q.submissions[s.current]={accept:false,money:0,diplomacy:0,credit:0,armies:{},count:0,moveCost:0,confirmed:true};
 else q.submissions[s.current]={...agreementOffer(s,q,s.current,{...a,accept:true}),confirmed:a.type==='submitEvent'||previous.confirmed};
 checkAgreementCompletion(s,q);
}
export function submitAgreement(s,q,a){
 if(q.agreementVersion===2){updateAgreement(s,q,{...a,type:'submitEvent'});return;}
 if(!q.agreementVersion||q.stage!=='agreement'||q.participants[q.done.length]!==s.current)throw Error('当前不能提交本方协议提案');
 const offer=agreementOffer(s,q,s.current,a);q.submissions[s.current]=offer;q.done.push(s.current);
 if(q.done.length===q.participants.length)settle(s,q);
}
export function agreementCountryTargets(s,owner){
 const p=s.players[owner],owned=new Map(p.allies.map(id=>[countryInfo(id).countryName,id]));
 return Object.values(s.regions).flatMap(regionCountries).filter(id=>{
  if(!id)return false;const c=countryInfo(id),old=owned.get(c.countryName);
  return bricsNames.has(c.countryName)&&!c.blockedPowers.includes(owner)&&(!old||countryInfo(old).starting);
 });
}
export function agreementRewardPreview(s,q,a){
 const step=q.rewardQueue?.[0];if(q.stage!=='reward'||!step||step.owner!==s.current)throw Error('请由当前获奖玩家完成协议效果');
 if(a.skip){if(!step.optional)throw Error('此协议效果必须选择');return '放弃本次可选效果；保留已结算的协议费用和奖励。';}
 if(step.type==='bricsCountry'){if(!agreementCountryTargets(s,s.current).includes(a.country))throw Error('请选择仍在地区牌堆内的指定国家');return '免费获得所选盟国，并重洗该地区国家牌；不重复支付普通结盟费用。';}
 if(step.type==='withdraw'){const destinations=Object.entries(AREAS).filter(([,area])=>area.interest.includes(s.current)).map(([id])=>id);if(a.moves?.length!==step.max||a.moves.some(m=>m.from!=='C'||!destinations.includes(m.to)))throw Error('请将中亚全部军队派往本方关注地区');reinforcementPreview(s,{moves:a.moves},{armyGain:0,maxMoves:step.max,moveCost:0});return `免费撤回${step.max}支中亚军队。`;}
 if(step.type==='move'){const r=reinforcementPreview(s,a,{name:'中俄无上限协议移动',armyGain:0,maxMoves:2});return `正常付费移动${r.moves.length}支军队，支付${r.cost}资金${r.smartCost?'和'+r.smartCost+' SP':''}。`;}
 if(step.type==='nordstream'&&a.choice==='diplomacy')return '俄罗斯获得3外交，超过上限按通常规则处理。';
 if(step.type==='convert'||step.type==='nordstream'){
  if(step.type==='nordstream'&&a.choice!=='convert')throw Error('请选择3外交或转换欧洲影响力');
  if(!step.regions.includes(a.region))throw Error('请选择协议允许的转换地区');
  convertEventInfluence(structuredClone(s),s.current,a.region,a.index);return `将${AREAS[a.region].name}1点本方临时影响力转为永久；满槽额外放置，不获得槽位分。`;
 }
 if(step.type==='ttip'){activateTTIP(s,s.current,{face:a.face,productionKey:a.productionKey,slot:a.slot,source:q.cardId,preview:true});return a.face==='exchange'?'取得TTIP资源交换面。':'支付25资金，取得TTIP投资面并执行影响力、对方产能提升；以后投资回报增加6资金。';}
 throw Error('未知共同协议奖励');
}
export function resolveAgreementReward(s,q,a){
 const detail=agreementRewardPreview(s,q,a),step=q.rewardQueue[0],before=publicBalances(s),p=s.players[s.current];
 if(!a.skip){
  if(step.type==='bricsCountry'){
   const info=countryInfo(a.country),previous=p.allies.find(id=>countryInfo(id).countryName===info.countryName)||null;
   applyRelations(s,{country:a.country},{countrySearchRegion:info.region,region:info.region,cost:0,moneyCost:0,previous});q.agreementRandom=Number(q.agreementRandom||0)+1;
  }else if(step.type==='move'){const r=reinforcementPreview(s,a,{name:'中俄无上限协议移动',armyGain:0,maxMoves:2});applyReinforcement(s,r);p.smart-=r.smartCost;}
  else if(step.type==='nordstream'&&a.choice==='diplomacy')gainResource(p,5,3);
  else if(step.type==='withdraw'){const r=reinforcementPreview(s,{moves:a.moves},{armyGain:0,maxMoves:step.max,moveCost:0});applyReinforcement(s,r);}
  else if(step.type==='convert'||step.type==='nordstream')convertEventInfluence(s,s.current,a.region,a.index);
  else if(step.type==='ttip')activateTTIP(s,s.current,{face:a.face,productionKey:a.productionKey,slot:a.slot,source:q.cardId});
 }
 receipt(s,q,before,detail,s.current);q.rewardQueue.shift();drainNonPlayerRewards(s,q,finish);
}
