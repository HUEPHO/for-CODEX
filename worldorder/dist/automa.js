import {AUTOMA_PLAYERS,AUTOMA_DECISIONS,AUTOMA_RESOURCE_MONEY,AUTOMA_CUBE_TYPES,AUTOMA_ACTION_NAMES,AUTOMA_MARKET_CUBE} from './automa-data.js';
import {automaShuffle,drawAutomaCard,chooseAutoma,chooseAutomaRegion} from './automa-random.js';
import {automaAllies,planAutomaInfluence,applyAutomaInfluence,militaryAutomaRegions} from './automa-board.js';
import {AUTO_INFLUENCE_CARDS} from './auto-influence-data.js';
import {ABILITY_TYPES} from './ability-types.js';
import {RESEARCH_DATA} from './research-data.js';
import {GROWTH_DATA} from './growth-data.js';
import {COUNTRY_TRADE} from './trade-data.js';
import {AREAS} from './world.js';
import {acquireCountry} from './country-piles.js';
import {eventTradeIssue} from './event-effect-state.js';
import {OBJECTIVE_DATA} from './objective-data.js';
import {objectivePreview} from './objectives.js';
import {investedCountries,upgradeInvestmentCountry} from './investment-tokens.js';
const regions=Object.keys(AREAS),zeros=()=>Object.fromEntries(regions.map(id=>[id,0]));
const ENGAGE_COST={M:4,E:5,C:4,N:6,A:3,S:4,P:5};
function record(s,id,type,result){const a=s.players[id].automa;a.history.push({round:s.round,type,...result});a.history=a.history.slice(-40);return result;}
function log(s,id,text){s.log=[`${id} · 高级自动机：${text}`,...s.log].slice(0,30);}
export function initializeAutomas(s,cards,rng=Math.random){
 const entries=Object.entries(s.config.automas||{});if(!entries.length)return;
 s.automaDecks={decision:{deck:automaShuffle(AUTOMA_DECISIONS.map(c=>c.id),rng),discard:[]},influence:{deck:automaShuffle(AUTO_INFLUENCE_CARDS.map(c=>c.id),rng),discard:[]},drawCount:0,history:[]};
 for(const [id,difficulty] of entries){const p=s.players[id];
  p.automa={difficulty,cubes:{engage:0,relations:1,invest:1,trade:0,base:1,move:0},investments:zeros(),bases:zeros(),objectiveDeck:automaShuffle(Object.keys(OBJECTIVE_DATA).filter(cid=>OBJECTIVE_DATA[cid].owner===id),rng),objectiveDiscard:[],history:[],lastDecision:null,lastInfluence:null,lastAction:null,preparedRound:1,cubesRound:1};
  delete p.nonPlayer;p.hand=[];p.deck=automaShuffle(cards.filter(c=>c.type==='starter'&&c.owner===id).map(c=>c.id),rng);p.played=[];p.discard=[];
  p.allies=cards.filter(c=>c.type==='startingCountry'&&c.owner===id).map(c=>c.id);p.assets=[];p.usedAssets=[];p.assetChoices=null;p.assetSelection=[];p.objectives=[];p.objectiveChoices=null;p.objectiveSelection=[];p.openingChoices=null;
  p.money=AUTOMA_PLAYERS[id].money;p.vp=10+(s.config.executive?3:0);p.resources=Array(7).fill(0);p.production=Array(7).fill(0);p.prosperity=0;p.focus='内政焦点';p.smart=s.config.wit?2:0;p.growth=[];p.automatedGrowth=[];p.exhaustedAllies=[];p.fdi=[];p.bases=[];
 }
}
export function addAutomaRoundCubes(s,id){const a=s.players[id].automa;if(a.cubesRound>=s.round)return;
 const rounds=a.difficulty==='hard'?[2,4,5,6]:[2,4,6];
 for(const round of rounds.filter(round=>round>a.cubesRound&&round<=s.round)){const n=rounds.indexOf(round);a.cubes[AUTOMA_PLAYERS[id].cubes[n%3]]++;}a.cubesRound=s.round;
}
function moveCubes(p,action){const pair=Object.values(AUTOMA_CUBE_TYPES).find(pair=>pair.includes(action));if(!pair)return;const [left,right]=pair,c=p.automa.cubes;if(action===left){c[left]--;c[right]++;}else{c[left]+=c[right];c[right]=0;}}
function exportCount(p){return p.allies.reduce((n,cid)=>n+(COUNTRY_TRADE[cid]?.exports.length||0),0);}
function trade(s,id){const p=s.players[id],card=drawAutomaCard(s,'decision',id),partner=card.rows.find(row=>row.owner===id).trade;let money=5*exportCount(p),traded=false;
 if(partner&&!eventTradeIssue(s,id,partner)){const other=s.players[partner],commerce=other.commerce.find(c=>c.ready);if(other.automa||commerce){if(!other.automa)commerce.ready=false;other.money+=10;money+=5;traded=true;}}
 p.money+=money;return {action:'trade',money,partner:traded?partner:null};
}
function relationCandidates(s,id,region,{outside=false,baseOnly=false}={}){const p=s.players[id];if(outside&&AREAS[region].interest.includes(id))return [];
 return s.regions[region].available.filter(cid=>{const c=RESEARCH_DATA[cid];return !c.blockedPowers.includes(id)&&5*c.countryValue<=p.money&&(!baseOnly||c.basePowers.includes(id))&&!p.allies.some(ally=>RESEARCH_DATA[ally].countryName===c.countryName&&!RESEARCH_DATA[ally].starting);});
}
function preferredCountry(s,id,candidates){const p=s.players[id],starting=new Set(p.allies.filter(cid=>RESEARCH_DATA[cid].starting).map(cid=>RESEARCH_DATA[cid].countryName));
 return [...candidates].sort((a,b)=>Number(starting.has(RESEARCH_DATA[b].countryName))-Number(starting.has(RESEARCH_DATA[a].countryName))||Number(RESEARCH_DATA[b].basePowers.includes(id))-Number(RESEARCH_DATA[a].basePowers.includes(id))||RESEARCH_DATA[b].countryValue-RESEARCH_DATA[a].countryValue)[0];
}
function relations(s,id,options={}){const p=s.players[id];let candidates=regions.filter(region=>relationCandidates(s,id,region,options).length);
 while(candidates.length){const randomCountry=options.baseOnly?chooseAutoma(s,id,candidates.flatMap(r=>relationCandidates(s,id,r,options))):null,region=randomCountry?RESEARCH_DATA[randomCountry].region:chooseAutomaRegion(s,id,candidates);
  const country=randomCountry||preferredCountry(s,id,relationCandidates(s,id,region,options)),c=RESEARCH_DATA[country],previous=p.allies.find(cid=>RESEARCH_DATA[cid].countryName===c.countryName),plan=previous?planAutomaInfluence(s,id,region):null;
  if(previous&&!plan){candidates=candidates.filter(r=>r!==region);continue;}
  const cost=c.countryValue*5;p.money-=cost;acquireCountry(s.regions[region],country);
  if(previous){p.allies[p.allies.indexOf(previous)]=country;p.exhaustedAllies=p.exhaustedAllies.filter(cid=>cid!==previous);delete p.countryUnderlays?.[previous];upgradeInvestmentCountry(s,id,previous,country);applyAutomaInfluence(s,id,plan);}else p.allies.push(country);
  return {action:'relations',country,previous:previous||null,region,cost};
 }
 return trade(s,id);
}
function influenceAction(s,id,action){const p=s.players[id],a=p.automa,costAt=region=>action==='invest'?15:Math.max(0,5*ENGAGE_COST[region]-5*automaAllies(s,id,region).length-(p.focus==='外交焦点'?5:0));
 let eligible=regions.filter(region=>automaAllies(s,id,region).length>0&&(action!=='invest'||(a.investments[region]||0)<=automaAllies(s,id,region).length));
 if(!eligible.length)return action==='invest'?relations(s,id):trade(s,id);
 eligible=eligible.filter(region=>costAt(region)<=p.money);
 while(eligible.length){const region=chooseAutomaRegion(s,id,eligible),plan=planAutomaInfluence(s,id,region);if(!plan){eligible=eligible.filter(r=>r!==region);continue;}
  const cost=costAt(region);p.money-=cost;if(action==='invest')a.investments[region]++;const {vp}=applyAutomaInfluence(s,id,plan);return {action,region,cost,vp};
 }
 return trade(s,id);
}
function military(s,id,action){const p=s.players[id],a=p.automa,base=action==='base',cost=base?10:5;if(p.money<cost)return trade(s,id);
 const excluded=[];let eligible=militaryAutomaRegions(s,id,base,excluded);
 if(!eligible.length&&base)return relations(s,id,{baseOnly:true});
 while(eligible.length){const region=chooseAutoma(s,id,eligible),plan=base?planAutomaInfluence(s,id,region):null;
  if(base&&!plan){excluded.push(region);eligible=militaryAutomaRegions(s,id,base,excluded);continue;}
  p.money-=cost;s.regions[region].armies[id]++;let armies=1,vp=0;
  if(base){a.bases[region]++;vp=applyAutomaInfluence(s,id,plan).vp;if(a.difficulty==='hard'){const card=drawAutomaCard(s,'influence',id);if(card.rows.find(row=>row.owner===id).army&&p.money>=5){p.money-=5;s.regions[region].armies[id]++;armies++;}}}
  return {action,region,cost:cost+(armies-1)*5,armies,vp};
 }
 return trade(s,id);
}
export function automaGrowthCost(g){return g.money+g.services*10+g.diplomacy*5+(g.goods||0)*10+(g.armies||0)*10+(g.primary||0)*3+(g.discard||0)*15;}
function growth(s,id){const p=s.players[id],level=p.growth.length+1,candidates=s.growth.filter(cid=>GROWTH_DATA[cid].level===level&&automaGrowthCost(GROWTH_DATA[cid])<=p.money);
 if(!candidates.length){p.money+=30;return {action:'growth',money:30};}
 const card=chooseAutoma(s,id,candidates),g=GROWTH_DATA[card],cost=automaGrowthCost(g),vp=(g.effect==='dominance'?2*(s.round-1):g.vp)+g.level;
 p.money-=cost;p.vp+=vp;p.growth.push(card);s.growth.splice(s.growth.indexOf(card),1);return {action:'growth',card,cost,vp};
}
export function performAutomaAction(s,id,action,{move=true,...options}={}){
 const p=s.players[id],result=action==='growth'?growth(s,id):action==='trade'?trade(s,id):action==='relations'?relations(s,id,options):['engage','invest'].includes(action)?influenceAction(s,id,action):military(s,id,action);
 if(move&&!result.skipped)moveCubes(p,result.action);
 p.automa.lastAction=result;record(s,id,'action',result);log(s,id,AUTOMA_ACTION_NAMES[result.action]+(result.region?' · '+AREAS[result.region].name:'')+(result.cost?'，支付'+result.cost+'资金':'')+(result.money?'，获得'+result.money+'资金':'')+(result.vp?'，获得'+result.vp+'分':''));return result;
}
export function prepareAutoma(s,id){const p=s.players[id],a=p.automa;if(a.preparedRound===s.round)return null;
 addAutomaRoundCubes(s,id);const card=drawAutomaCard(s,'decision',id);p.focus=card.rows.find(row=>row.owner===id).focus;const money=s.round*({'内政焦点':10,'外交焦点':5,'军事焦点':3}[p.focus]);p.money+=money;a.preparedRound=s.round;
 if(p.focus==='外交焦点')performAutomaAction(s,id,'relations',{outside:true,focus:true,move:false});const result=record(s,id,'focus',{focus:p.focus,money});log(s,id,p.focus+'，获得'+money+'资金');return result;
}
function performType(s,id,type){const p=s.players[id],pair=AUTOMA_CUBE_TYPES[type];return performAutomaAction(s,id,type==='domestic'?'growth':p.automa.cubes[pair[0]]>0?pair[0]:pair[1]);}
export function playAutomaTurn(s,id){const p=s.players[id],results=[];
 if(p.automa.marketCard){const card=p.automa.marketCard;if(p.deck[0]!==card)throw Error('自动机市场牌未在牌库顶');p.deck.shift();const types=ABILITY_TYPES[card];
  for(const type of p.automa.difficulty==='hard'?types:[AUTOMA_MARKET_CUBE[card]||chooseAutoma(s,id,[...new Set(types)])])results.push(performType(s,id,type));
  s.removedAbilities??=[];s.removedAbilities.push(card);p.automa.marketCard=null;
 }
 const card=p.deck.shift();if(!card)throw Error('自动机起始能力牌堆为空');p.played.push(card);p.automa.lastAbility=card;results.push(performType(s,id,ABILITY_TYPES[card][0]));return {card,results};
}
export function researchAutoma(s,id){const p=s.players[id],drawn=p.deck.splice(0,2);if(drawn.length!==2)throw Error('自动机研究需要两张能力牌');let power=(p.focus==='内政焦点'?2:0)+Math.floor(p.allies.length/3),money=0;
 for(const card of drawn){const r=RESEARCH_DATA[card];power+=r.research;money+=r.bonus.amount*({money:1,diplomacy:5,armies:10}[r.bonus.type]);}
 p.money+=money;p.discard.push(...p.played,...drawn);p.played=[];if(!p.deck.length){p.deck=automaShuffle(p.discard);p.discard=[];}
 const priority=AUTOMA_PLAYERS[id].market,rank=card=>Math.min(...ABILITY_TYPES[card].map(type=>priority.indexOf(type)));
 const candidates=s.market.filter(card=>RESEARCH_DATA[card].cost<=power).sort((a,b)=>RESEARCH_DATA[b].cost-RESEARCH_DATA[a].cost||rank(a)-rank(b)||s.market.indexOf(a)-s.market.indexOf(b));
 let card=null;if(candidates.length){card=candidates[0];power-=RESEARCH_DATA[card].cost;s.market.splice(s.market.indexOf(card),1);p.deck.unshift(card);p.automa.marketCard=card;refillMarket(s);}
 s.marketDiscard??=[];const removed=[];for(let n=0;n<power&&s.market.length;n++){removed.push(s.market.pop());refillMarket(s);}s.marketDiscard.push(...removed);
 const result=record(s,id,'research',{drawn,money,card,discarded:removed,researchLeft:power});log(s,id,'完成研究，获得'+money+'资金'+(card?'，取得1张市场牌':'')+'，弃置市场末端'+removed.length+'张');return result;
}
function refillMarket(s){if(s.marketDeck.length)s.market.unshift(s.marketDeck.shift());}
export function automaIncome(s,id){const p=s.players[id],total=5*Object.values(p.automa.investments).reduce((a,b)=>a+b,0);p.money+=total;p.objectiveHistory.bestFdiReturn=Math.max(p.objectiveHistory.bestFdiReturn,total);record(s,id,'income',{total});return {fdi:total,engage:0,total};}
export function automaProsperity(s,id){const p=s.players[id],cfg=AUTOMA_PLAYERS[id],cost=cfg.prosperityCosts[p.prosperity];if(cost===undefined||p.money<cost)return null;const vp=cfg.prosperityVP[p.prosperity];p.money-=cost;p.vp+=vp;p.prosperity++;return record(s,id,'prosperity',{cost,vp});}
function automaObjective(s,id,card){const result=objectivePreview(s,card,id),data=OBJECTIVE_DATA[card],p=s.players[id];
 for(const [i,task] of data.tasks.entries()){
  const t=result.tasks[i];
  if(['resource','productionEach','productionByRound','productionTotal','productionTypes','deckSize','engage'].includes(task.metric)||task.metric==='fdiCountries'&&(task.ownAllies||task.direction)){t.met=true;t.automaRule=true;continue;}
  if(task.metric==='fdiCountries'){t.value=Object.entries(p.automa.investments).filter(([region])=>!task.regions||task.regions.includes(region)).reduce((n,[,count])=>n+count,0);t.met=t.value>=t.threshold;}
  if(task.metric==='fdiLeads'){const count=(player,region)=>s.players[player].automa?s.players[player].automa.investments[region]:investedCountries(s,player).filter(cid=>RESEARCH_DATA[cid].region===region).length;t.value=regions.filter(region=>Object.keys(s.players).filter(player=>player!==id).every(player=>count(id,region)>count(player,region))).length;t.met=t.value>=t.threshold;}
 }
 result.achieved=result.tasks.filter(t=>t.met).length;result.points=data.rewards[result.achieved];return result;
}
export function scoreAutomaObjectives(s,id){const p=s.players[id],cards=p.automa.objectiveDeck.splice(0,2).map(card=>automaObjective(s,id,card)),points=cards.reduce((n,c)=>n+c.points,0);p.vp+=points;p.automa.objectiveDiscard.push(...cards.map(c=>c.cardId));record(s,id,'objectives',{points,cards});return {points,cards};}
