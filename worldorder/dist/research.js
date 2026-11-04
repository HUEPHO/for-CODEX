import {RESEARCH_DATA} from './research-data.js';
import {hasGrowth} from './growth-effects.js';
export function researchCost(id){const cost=RESEARCH_DATA[id]?.cost;if(!Number.isInteger(cost))throw Error('该牌的研究费用尚未录入');return cost;}
export function countryValue(id){const value=RESEARCH_DATA[id]?.countryValue;if(!Number.isInteger(value))throw Error('该国家的价值尚未录入');return value;}
export function researchPreview(s,player=s.current,incomeCards){
 const p=s.players[player],result={base:0,extra:p.focus==='内政焦点'?2:0,money:0,diplomacy:0,armies:0};
 for(const id of p.hand){const c=RESEARCH_DATA[id];if(!c?.bonus||!Number.isInteger(c.research))throw Error('手牌含有尚未录入研究奖励的卡牌');result.base+=c.research;result[c.bonus.type]+=c.bonus.amount;}
 result.incomeCount=hasGrowth(p,s.round,'income')?Math.min(2,p.hand.length):0;
 result.incomePending=result.incomeCount>0&&incomeCards===undefined;
 if(incomeCards!==undefined){
  if(!Array.isArray(incomeCards)||incomeCards.length!==result.incomeCount||new Set(incomeCards).size!==incomeCards.length||incomeCards.some(id=>!p.hand.includes(id)))throw Error('收入优化需选择'+result.incomeCount+'张不同的研究手牌');
  for(const id of incomeCards){const bonus=RESEARCH_DATA[id].bonus;result[bonus.type]+=bonus.amount;}
 }
 result.total=result.base+result.extra;result.lostDiplomacy=Math.max(0,p.resources[5]+result.diplomacy-10);return result;
}
export function grantResearchBonuses(p,preview){p.money+=preview.money;p.resources[5]=Math.min(10,p.resources[5]+preview.diplomacy);p.resources[6]+=preview.armies;}

export function countryRegion(id){const region=RESEARCH_DATA[id]?.region;if(!region)throw Error('国家所属地区尚未录入');return region;}

export function investmentCost(id){const cost=RESEARCH_DATA[id]?.investmentCost;if(!Number.isInteger(cost)||cost<0)throw Error('投资费用尚未录入');return cost;}
