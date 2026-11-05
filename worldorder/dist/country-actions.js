import {validateSP} from './smart-power.js';
import {RESEARCH_DATA} from './research-data.js';
import {acquireCountry,acquireSearchedCountry,regionCountries} from './country-piles.js';
import {upgradeInvestmentCountry} from './investment-tokens.js';
export function countryInfo(id){const c=RESEARCH_DATA[id];if(!c?.countryName)throw Error('国家资料尚未录入');return c;}
export function baseCountries(s,card={}){const p=s.players[s.current];return p.allies.filter(id=>countryInfo(id).basePowers.includes(s.current)&&!(p.exhaustedAllies||[]).includes(id)&&(p.bases||[]).filter(cid=>cid===id).length<(card.baseLimit??1));}
export function basePreview(s,a,card={}){const p=s.players[s.current];if(!baseCountries(s,card).includes(a.country))throw Error('需要允许本方建基地、未横置且没有基地的盟国');const c=countryInfo(a.country),max=card.maxBaseArmies??c.countryValue;
 if(a.armyMoves){
  if(!Array.isArray(a.armyMoves)||a.armyMoves.some(move=>move.to!==c.region))throw Error('临时取回的坦克必须重新派往基地所在地区');
  const extra=a.armyMoves.filter(move=>move.from!=='reserve');
  if(extra.length>1)throw Error('建基地最多用1 SP从其他地区追加1辆坦克');
  a={...a,send:a.armyMoves.filter(move=>move.from==='reserve').length-(a.baseUseSP&&!extra.length?1:0),baseExtraFrom:extra[0]?.from||(a.baseUseSP?'reserve':'')};
 }
 const send=a.send;
 if(!Number.isInteger(send)||send<1||send>max)throw Error('派兵至少1，最多'+max+'支');if(p.resources[6]<send)throw Error('待命军队不足');const cost=5+(card.freeBaseDeployment?0:5*send);if(p.money<cost)throw Error('建基地及派兵所需资金不足');const extraFrom=a.baseExtraFrom||null,smartCost=validateSP(s,extraFrom?1:0);if(extraFrom){if(extraFrom==='reserve'){if(p.resources[6]-send<1)throw Error('正常派兵后没有可追加的待命军队');}else if(extraFrom===c.region||!s.regions[extraFrom]||s.regions[extraFrom].armies[s.current]<1)throw Error('请选择其他地区现有的本方军队');}return {region:c.region,cost,exhaust:[a.country],send,influence:true,smartCost,extraFrom};
}
export function applyBase(s,a,result){const p=s.players[s.current];p.money-=result.cost;p.resources[6]-=result.send;s.regions[result.region].armies[s.current]+=result.send;p.bases??=[];p.bases.push(a.country);if(result.extraFrom){if(result.extraFrom==='reserve')p.resources[6]--;else s.regions[result.extraFrom].armies[s.current]--;s.regions[result.region].armies[s.current]++;}}
export function relationCountries(s,card={}){const ids=card.countrySearchRegion?regionCountries(s.regions[card.countrySearchRegion]):Object.values(s.regions).flatMap(r=>r.available);return ids.filter(id=>!countryInfo(id).blockedPowers.includes(s.current)&&(!card.allowedRegions||card.allowedRegions.includes(countryInfo(id).region))&&card.excludeRegion!==countryInfo(id).region);}
export function relationCost(s,a,card={}){const cardDiscount=a.useRelationDiscount===false?0:(card.relationDiscount??0),discount=(a.exhaust||[]).reduce((n,id)=>n+countryInfo(id).countryValue,0)+cardDiscount;return {cost:Math.max(0,countryInfo(a.country).countryValue-discount),discount,cardDiscount};}
export function relationPreview(s,a,card={}){const p=s.players[s.current];if(!relationCountries(s,card).includes(a.country))throw Error(card.countrySearchRegion?'请选择所选地区国家牌中允许本方结盟的国家':'请选择展示区中允许本方结盟的国家');const c=countryInfo(a.country),exhaust=a.exhaust||[];
 if(!Array.isArray(exhaust)||new Set(exhaust).size!==exhaust.length||exhaust.some(id=>!p.allies.includes(id)||(p.exhaustedAllies||[]).includes(id)||countryInfo(id).region!==c.region))throw Error('减费只能横置当地本方未横置盟国');
 const existing=p.allies.filter(id=>countryInfo(id).countryName===c.countryName);if(existing.length>1||existing.some(id=>!countryInfo(id).starting))throw Error('已有同名国家记录，请先核对旧存档的手动结盟');const previous=existing[0]||null;
 const {cost,discount,cardDiscount}=relationCost(s,a,card),moneyDiplomacy=a.moneyDiplomacy??0,smartCost=validateSP(s,a.relationSP??0);
 if(!Number.isInteger(moneyDiplomacy)||moneyDiplomacy<0||moneyDiplomacy+smartCost>cost||(!card.moneyDiplomacy&&moneyDiplomacy))throw Error('资金替代外交的数量无效');const moneyCost=3*moneyDiplomacy,diplomacyCost=cost-moneyDiplomacy-smartCost;if(p.money<moneyCost||p.resources[5]<diplomacyCost)throw Error('结盟所需资金或外交不足');
 return {region:c.region,countrySearchRegion:card.countrySearchRegion||null,cost:diplomacyCost,moneyCost,smartCost,discount,cardDiscount,exhaust,previous,influence:!!previous&&!(p.exhaustedAllies||[]).includes(previous)&&!exhaust.includes(previous)};
}
export function applyRelations(s,a,result){const p=s.players[s.current];p.resources[5]-=result.cost;p.money-=result.moneyCost;(result.countrySearchRegion?acquireSearchedCountry:acquireCountry)(s.regions[result.region],a.country);
 if(result.previous){const old=result.previous;p.allies[p.allies.indexOf(old)]=a.country;p.exhaustedAllies=p.exhaustedAllies.filter(id=>id!==old);p.countryUnderlays??={};p.countryUnderlays[a.country]=[...(p.countryUnderlays[old]||[]),old];delete p.countryUnderlays[old];for(const key of ['bases','fdi'])p[key]=(p[key]||[]).map(id=>id===old?a.country:id);upgradeInvestmentCountry(s,s.current,old,a.country);}
 else p.allies.push(a.country);
}
