// Candidate witnesses use the actual effect preview. Production has only seven
// resource types and a printed limit of at most three; equivalent states merge.
import {effectPreview,resolveBasicEffect,ENGAGE_LIMIT} from './basic-actions.js';
import {baseCountries,relationCountries} from './country-actions.js';
import {countryRegion} from './research.js';
import {AREAS} from './world.js';
import {ECONOMY,prosperityOffer,resolveProsperity} from './economy.js';
import {GROWTH_DATA} from './growth-data.js';
import {beijingPreview,resolveBeijing,swapRegions} from './dd-asset-effects.js';
import {regimeTargets} from './regime-change.js';
import {foreignInvestmentTargets,foreignInvestmentPreview} from './foreign-investments.js';
import {otherArmyTargets} from './opponent-effects.js';
import {allowedSpecialRegion,payCardCost,gainCardResources,resolveInfluenceEffect} from './special-effects.js';
import {regionCountries} from './country-piles.js';
import {researchCost} from './research.js';
import {aidAllies} from './dd-asset-effects.js';
import {productionPreview,growthPreview} from './domestic-actions.js';
import {preparedActionState} from './market-actions.js';
import {tradeCapacity,EXPORT_PRICE} from './trade.js';
import {TRADE_LIMITS} from './commerce.js';

const unavailable=(reason,skip=true)=>({status:'unavailable',reason,skip});
const pending={status:'pending',reason:'',skip:false};
export function costShortfall(s,cost={}){const p=s.players[s.current],names=['能源','原料','粮食','消费品','服务','外交','待命军队'],parts=[];if(p.money<(cost.money||0))parts.push(`资金需要${cost.money}，现有${p.money}`);for(const [k,n] of Object.entries(cost.resources||{}))if(p.resources[k]<n)parts.push(`${names[k]}需要${n}，现有${p.resources[k]}`);return parts.join('；');}
export function movementCapacity(s,card){const p=s.players[s.current],region=card.onlyDestination;return Math.min(card.maxMoves??2,p.resources[6]+Object.entries(s.regions).reduce((n,[id,r])=>n+(id===region?0:r.armies[s.current]),0),card.moveCost===0?Infinity:Math.floor(p.money/(card.moveCost??5)));}
function *productionActions(s,card,next){
 const prepared=preparedActionState(s,{},card),p=prepared.players[s.current],max=card.maxProduction??3;
 const keys=[4,5,3,6,0,2,1].filter(key=>(card.fixedProductionKey===undefined||key===card.fixedProductionKey)&&(!card.allowedProductionKeys||card.allowedProductionKeys.includes(key))),seen=new Set();
 const growth=next?.type==='effect'&&next.card.effect==='domestic'&&next.card.domesticMode==='growth'?next.card:null;
 // A production cannot create development supply. Resource/money summaries
 // reject unaffordable follow-ups before cloning any complete game state.
 if(growth&&!s.growth.some(id=>GROWTH_DATA[id]?.level===p.growth.length+1))return;
 function *walk(production,mask){
  let result;try{result=productionPreview(prepared,production,max);}catch{return;}
  const signature=mask+':'+result.money+':'+result.resources.join(',');if(seen.has(signature))return;seen.add(signature);
  const summary=growth?{...prepared,players:{...prepared.players,[s.current]:{...p,money:result.money,resources:result.resources}}}:null;
  if(!growth||growthActions(summary,growth).some(action=>{try{growthPreview(summary,action,growth);return true;}catch{return false;}}))yield {domestic:'produce',production};
  if(production.length===max)return;
  for(const key of keys)if(!(mask&(1<<key))){
   for(let quantity=key<3?p.production[key]:1;quantity<=p.production[key];quantity++)yield*walk([...production,{key,quantity}],mask|(1<<key));
  }
 }
 yield*walk([],0);
}
function growthActions(s,card){
 const p=s.players[s.current],next=p.growth.length+1,upgrades=p.production.map((n,key)=>n<ECONOMY[s.current].max[key]?key:null).filter(key=>key!==null).slice(0,2),actions=[];
 for(const growthId of s.growth){const g=GROWTH_DATA[growthId];if(g?.level!==next)continue;
  const primary=[0,0,0];let remaining=g.primary||0;for(let key=0;key<3;key++){primary[key]=Math.min(remaining,p.resources[key]);remaining-=primary[key];}if(remaining)continue;
  const discards=g.discard?p.hand:[undefined];
  for(let serviceMoney=0;serviceMoney<=(card.serviceMoneyCost?g.services:0);serviceMoney++)for(const growthDiscard of discards)actions.push({domestic:'growth',growthId,serviceMoney,upgrades:g.effect==='industry'?upgrades:[],...(g.primary?{primary}:{}),...(g.discard?{growthDiscard}:{})});
 }
 return actions;
}
function *tradeActions(s,card){
 // All printed trade continuations either invest (cash only) or permit zero
 // production. Imports cannot improve cash here. For each SP spend, retain the
 // actual export plan with greatest revenue; six goods/seven regions are fixed.
 yield {exports:[],imports:[]};
 const prepared=preparedActionState(s,{},card),p=prepared.players[s.current],regions=Object.keys(s.regions).filter(id=>!card.tradeOnlyRegions||card.tradeOnlyRegions.includes(id)),limit=Math.min(TRADE_LIMITS[s.current].exports,card.maxTradeTypes??Infinity),best=new Map();
 for(let count=0;count<=Math.min(s.config.wit?p.smart:0,regions.length);count++)for(const tradeRegions of combinations(regions,count)){
  const capacity=tradeCapacity(prepared,s.current,card,tradeRegions),exports=[0,1,2,3,4,6].map(key=>({key,quantity:Math.min(p.resources[key],capacity.exports[key])})).filter(row=>row.quantity>0).sort((a,b)=>b.quantity*EXPORT_PRICE[b.key]-a.quantity*EXPORT_PRICE[a.key]).slice(0,limit),revenue=exports.reduce((sum,row)=>sum+row.quantity*EXPORT_PRICE[row.key],0);
  if(!revenue||revenue<=(best.get(count)?.revenue??-1))continue;
  if(card.regionalInfluence)for(const row of exports){let left=row.quantity;row.regions={};for(const region of Object.keys(s.regions)){const quantity=Math.min(left,capacity.byRegion[region].exports[row.key]);if(quantity)row.regions[region]=quantity;left-=quantity;}}
  best.set(count,{revenue,action:{tradeRegions,exports,imports:[]}});
 }
 for(const {action} of best.values())yield action;
}
function basicAvailability(s,card,next){
 const p=s.players[s.current];
 // Validate mandatory preparation through its own implementation before any
 // optimistic continuation. This covers named ally exhaustion and surcharges.
 if(card.exhaustAlly)try{preparedActionState(s,{},card);}catch(error){return unavailable(error.message,false);}
 if(card.effect==='domestic'&&card.domesticMode==='produce'){
  try{effectPreview(s,{domestic:'produce',production:[]},card);}catch(error){return unavailable(error.message,false);}
  return {...pending,actions:()=>productionActions(s,card,next)};
 }
 if(card.effect==='trade'){
  try{effectPreview(s,{exports:[],imports:[]},card);}catch(error){return unavailable(error.message,false);}
  return {...pending,actions:()=>tradeActions(s,card)};
 }
 if(card.effect==='reinforce'){
  if(card.minMoves&&card.onlyDestination&&movementCapacity(s,card)<card.minMoves)return unavailable(`必须向${AREAS[card.onlyDestination].name}移动${card.minMoves}支军队，目前最多能移动${movementCapacity(s,card)}支（已计入资金限制）；禁止不足额执行`);
  if(card.onlyDestination){
   const sources=[['reserve',p.resources[6]+(card.armyGain??1)],...Object.entries(s.regions).filter(([id])=>id!==card.onlyDestination).map(([id,r])=>[id,r.armies[s.current]])],actions=[];
   function moves(index,left,list){if(!left){actions.push({moves:list});return;}if(index===sources.length)return;const [from,count]=sources[index];for(let n=Math.min(count,left);n>=0;n--)moves(index+1,left-n,[...list,...Array.from({length:n},()=>({from,to:card.onlyDestination}))]);}
   for(let n=card.minMoves||0;n<=Math.min(card.maxMoves??2,movementCapacity(s,card));n++)moves(0,n,[]);
   return {...pending,actions};
  }
  return pending;
 }
 let candidates=[],empty='没有合法目标';
 const allowed=id=>(!card.targetCountry||card.targetCountry===id)&&(!card.allowedRegions||card.allowedRegions.includes(countryRegion(id)))&&card.excludeRegion!==countryRegion(id);
 if(card.effect==='base'){
  const targets=baseCountries(s,card).filter(allowed);if(!targets.length)return unavailable('没有允许本方建基地、未横置且未建基地的指定盟国');
  if(p.resources[6]<1)return unavailable('待命区没有可派出的军队；建基地至少需要1支待命军队');
  candidates=targets.map(country=>({country,send:1}));empty=`建基地至少需要${10+(card.moneySurcharge||0)}资金，现有${p.money}`;
 }else if(card.effect==='invest'){
  const targets=p.allies.filter(allowed).filter(id=>(p.fdi||[]).filter(cid=>cid===id).length<(card.investmentLimit??1));if(!targets.length)return unavailable('没有符合地区限制且尚未投资的本方盟国');
  candidates=targets.flatMap(country=>['','before'].map(investSP=>({country,investSP})));empty='符合限制的盟国均已横置且无法用SP重整，或支付投资及附加费用的资金不足';
 }else if(card.effect==='relations'){
  const targets=relationCountries(s,card).filter(allowed);if(!targets.length)return unavailable('展示区没有本方可结盟且符合本段限制的国家');
  candidates=targets.flatMap(country=>Array.from({length:s.config.wit?Math.min(10,p.smart)+1:1},(_,relationSP)=>({country,relationSP,exhaust:p.allies.filter(id=>countryRegion(id)===countryRegion(country)&&!(p.exhaustedAllies||[]).includes(id))})));
  empty='没有能支付外交及附加费用的合法结盟（已考虑当地盟国减费和可用SP）';
 }else if(card.effect==='engage'){
  const regions=Object.keys(AREAS).filter(region=>(!card.targetRegion||card.targetRegion===region)&&(!card.allowedRegions||card.allowedRegions.includes(region))&&card.excludeRegion!==region);
  const used=Object.values(s.regions).reduce((n,r)=>n+r.engage[s.current],0),from=used>=ENGAGE_LIMIT[s.current]?Object.keys(s.regions).filter(id=>s.regions[id].engage[s.current]):[undefined];
  candidates=regions.flatMap(region=>from.flatMap(moveFrom=>[0,1].map(engageSP=>({region,moveFrom,engageSP,exhaust:p.allies.filter(id=>countryRegion(id)===region&&!(p.exhaustedAllies||[]).includes(id))}))));
  empty='没有符合限制且付得起费用的介入地区（已考虑盟国、焦点减费和可用SP）';
 }else if(card.effect==='domestic'&&card.domesticMode==='growth'){
  candidates=growthActions(s,card);empty='没有可取得且付得起费用的下一等级发展牌（已检查资金、资源、弃牌及资产库存）';
 }else return pending;
 const actions=candidates.flatMap(a=>['temporary','permanent'].map(slot=>({...a,slot})));
 for(const a of actions)try{effectPreview(s,a,card);return {...pending,actions};}catch{}
 return unavailable(empty);
}
export function stepAvailability(s,step,next){
 const p=s.players[s.current];
 if(step.type==='effect')return basicAvailability(s,step.card,next);
 if(step.type==='pay'){const reason=costShortfall(s,step.cost);if(reason)return unavailable(reason+'；费用与后续收益均未结算',false);}
 if(step.type==='prosperity'){const offer=prosperityOffer(p,s.current,s.round,step.cost);if(!offer)return unavailable('繁荣已达最高等级，本段未支付消费品或发放繁荣奖励');if(p.resources[3]<offer.cost)return unavailable(`消费品需要${offer.cost}，现有${p.resources[3]}；本段费用与奖励均未结算`);}
 if(step.type==='beijingConsensus'){try{beijingPreview(s);}catch(error){return unavailable(error.message+'；北京共识不能打出，不支付费用或领取奖励');}}
 if(step.type==='reset'&&!Object.entries(s.regions).some(([id,r])=>(!step.region||step.region===id)&&r.temporary.includes(s.current)))return unavailable('没有符合地区限制的本方临时影响力可重置');
 if(step.type==='readyAlly'&&!p.allies.length)return unavailable('没有本方盟国可重整');
 if(step.type==='researchPlay'&&!s.market.some(id=>researchCost(id)<=step.maxCost))return unavailable('市场没有费用符合限制的卡牌可免费研究');
 if(step.type==='searchRegion'&&!Object.values(s.regions).some(r=>regionCountries(r).length))return unavailable('所有地区的国家牌都已取完');
 if(step.type==='aidAllies'){const reason=costShortfall(s,{money:15,resources:{6:2}});if(reason)return unavailable(reason);if(new Set(aidAllies(s).map(countryRegion)).size<2)return unavailable('需要两个位于不同地区的未横置盟国');}
 if(step.type==='industrialize'){
  if(p.money<10)return unavailable(`提升产能至少需要10资金，现有${p.money}`);
  if(p.production.filter((n,key)=>n<ECONOMY[s.current].max[key]).length<2)return unavailable('快速工业化需要至少两种未达上限的产能');
 }
 if(step.type==='swapInfluence'&&!swapRegions(s,step).length)return unavailable('没有同时包含本方临时影响力和对方永久影响力的允许地区',false);
 if(step.type==='regimeChange'&&!regimeTargets(s,step).length)return unavailable('没有允许夺取的非初始1价值盟国；初始盟国及其升级版均受保护',false);
 if(step.type==='swapInfluence'||step.type==='regimeChange'){const reason=costShortfall(s,step.type==='regimeChange'?{money:5,resources:{4:1,6:1}}:step.cost);if(reason)return unavailable(reason);}
 if(step.type==='influence'){
  if(!Object.keys(AREAS).some(region=>allowedSpecialRegion(step,region)&&(!step.resetBefore||s.regions[region].temporary.includes(s.current))))return unavailable('没有可重置的本方临时影响力或符合限制的地区',false);
  const reason=costShortfall(s,step.cost);if(reason)return unavailable(reason+'；本段费用和收益均未结算',false);
 }
 if(step.type==='returnArmy'){if(!otherArmyTargets(s,step.region).length)return unavailable('该地区没有其他玩家的军队');const reason=costShortfall(s,step.cost);if(reason)return unavailable(reason,!!step.optional);}
 if(step.type==='foreignInvestment'){
  const targets=foreignInvestmentTargets(s);if(!targets.length)return unavailable('没有已被投资、且本方尚未投资的其他玩家盟国');
  if(!targets.some(a=>{try{foreignInvestmentPreview(s,{...a,slot:'temporary'});return true;}catch{return false;}}))return unavailable('支付他方投资费用所需资金不足',!!step.optional);
 }
 return pending;
}

function bind(value,context){if(typeof value==='string'&&value.startsWith('$'))return context[value.slice(1)];if(Array.isArray(value))return value.map(x=>bind(x,context));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,bind(v,context)]));return value;}
function combinations(values,count){if(!count)return [[]];return values.flatMap((value,i)=>combinations(values.slice(i+1),count-1).map(tail=>[value,...tail]));}
function orderedChoices(values,count){if(!count)return [[]];return values.flatMap((value,i)=>orderedChoices(values.filter((_,j)=>j!==i),count-1).map(tail=>[value,...tail]));}
// Check deterministic costs/gains and target choices before committing a card or
// a preceding choice. Stop at actions whose outcome depends on player input;
// those are validated by the real effect preview and again at the next boundary.
export function sequenceEntryIssue(source,steps,context={}){
 const s=structuredClone(source);
 for(let i=0;i<steps.length;i++){
  const step=bind(steps[i],context);
  if(step.optional||['searchRegion','copyAbility','trashToPlay','discardToPlay','response','exhaustOpponents','exhaustResponse'].includes(step.type))return '';
  if(step.type==='region'){
   const options=Object.keys(AREAS).filter(region=>allowedSpecialRegion(step,region));
   const issues=options.map(region=>sequenceEntryIssue(s,steps.slice(i+1),{...context,region}));
   return !options.length?'没有可选择的合法地区':issues.every(Boolean)?issues[0]:'';
  }
  if(step.type==='regions'){
   const allowed=Object.keys(AREAS).filter(region=>allowedSpecialRegion(step,region));
   // Navy's effect may be declined, but playing it still needs a usable region.
   const options=combinations(allowed,Math.max(1,step.min));
   const issues=options.map(regions=>sequenceEntryIssue(s,steps.slice(i+1),{...context,regions,remainingRegion:allowed.find(id=>!regions.includes(id))}));
   return !options.length?'没有足够的合法地区可选择':issues.every(Boolean)?issues[0]:'';
  }
  if(step.type==='chooseActions'){
   let issue='没有足够的可执行选项';for(const keys of orderedChoices(Object.keys(step.options),step.count)){issue=sequenceEntryIssue(s,[...keys.flatMap(key=>steps[i].options[key]),...steps.slice(i+1)],context);if(!issue)return '';}
   return issue;
  }
  if(step.type==='forRegions')return sequenceEntryIssue(s,[...(context.regions||[]).flatMap(region=>bind(steps[i].steps,{...context,region})),...steps.slice(i+1)],context);
  const status=stepAvailability(s,step,bind(steps[i+1],context));if(status.status==='unavailable')return status.reason;
  if(step.type==='effect'&&status.actions){
   let issue='没有能够完成后续效果的合法目标与费用组合';
   for(const action of typeof status.actions==='function'?status.actions():status.actions){const projected=structuredClone(s);let result;try{result=effectPreview(projected,action,step.card);}catch{continue;}
    // Last-step feasibility needs no mutation. Random growth follow-ups have
    // their own saved choice; never draw/shuffle hidden cards during admission.
    if(i===steps.length-1||result.effect==='growth'&&['draw','battlefield'].includes(result.growth.effect))return '';
    try{resolveBasicEffect(projected,action,step.card);}catch{continue;}
    const nextContext={...context,...(action.country?{country:action.country,region:countryRegion(action.country)}:action.region?{region:action.region}:{})};
    issue=sequenceEntryIssue(projected,steps.slice(i+1),nextContext);if(!issue)return '';
   }
   return issue;
  }
  if(step.type==='influence'){
   let issue='没有可执行的影响力放置';
   for(const region of Object.keys(AREAS).filter(id=>allowedSpecialRegion(step,id)))for(const slot of step.permanent?['permanent']:['temporary','permanent']){
    const projected=structuredClone(s);try{resolveInfluenceEffect(projected,{region,slot,resetIndex:s.regions[region].temporary.indexOf(s.current)},step);}catch{continue;}
    issue=sequenceEntryIssue(projected,steps.slice(i+1),{...context,region});if(!issue)return '';
   }
   return issue;
  }
  if(step.type==='beijingConsensus'){resolveBeijing(s);continue;}
  if(step.type==='prosperity'){resolveProsperity(s,true,step.cost);continue;}
  if(step.type==='fundDiplomacy'){
   let issue='无法资助外交并完成后续介入';for(let bundles=0;bundles<=2;bundles++){if(s.players[s.current].money<bundles*10)continue;const projected=structuredClone(s);payCardCost(projected,{money:bundles*10});gainCardResources(projected,{resources:{5:bundles*3}});issue=sequenceEntryIssue(projected,steps.slice(i+1),context);if(!issue)return '';}
   return issue;
  }
  if(step.type==='pay')payCardCost(s,step.cost);
  else if(step.type==='gain')gainCardResources(s,step.gain);
  else if(step.type==='draw'||step.type==='extra')continue;
  else return '';
 }
 return '';
}
