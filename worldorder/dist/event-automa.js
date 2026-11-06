import {isAutoma} from './player-configuration.js';
import {drawNonPlayerBid} from './event-non-player-data.js';

// WIT pp.17–18: resources are paid in money. Army movement uses the
// event region first, then the supply; it does not spend reserve resources.
export const AUTOMA_EVENT_RESOURCE_MONEY=[3,3,3,10,10,5,10];
export function automaEventArmyOffer(s,owner,region,count,free=false){
 const existing=Math.min(s.regions[region].armies[owner],count);
 return {armies:existing?{[region]:existing}:{},count,moveCost:5*(count-(free?existing:0))};
}
export function automaBidOffer(s,q,owner,rule,draw=drawNonPlayerBid(q.cardId,owner)){
 const p=s.players[owner],canMove=rule.armies==='all'||rule.armies?.includes(owner),multiple=rule.money||rule.diplomacy||rule.services||rule.sale;
 const count=canMove?(multiple?Math.floor(draw/2):draw):0,move=count?automaEventArmyOffer(s,owner,rule.region,count,rule.freeFrom?.[owner]===rule.region):{armies:{},count:0,moveCost:0};
 let remaining=draw-count,cost=move.moveCost,saleIncome=0,soldArmies=0;
 const options=[];
 if(rule.diplomacy)options.push({price:5,limit:rule.diplomacy===true?Infinity:rule.diplomacy});
 if(rule.money)options.push({price:10,limit:rule.money});
 if(rule.services)options.push({price:10,limit:rule.services===true?Infinity:rule.services});
 if(rule.sale?.players.includes(owner))options.push({price:10,limit:rule.sale.max??Infinity,sale:rule.sale.price});
 options.sort((a,b)=>a.price-b.price||(b.sale||0)-(a.sale||0));
 for(const option of options){const n=Math.min(remaining,option.limit);cost+=n*option.price;if(option.sale){soldArmies+=n;saleIncome+=n*option.sale;}remaining-=n;}
 const accepted=draw>0&&remaining===0&&p.money>=cost+(rule.reserveRequired?10:0);
 return {nonPlayer:true,automa:true,draw,total:accepted?draw:0,count:accepted?count:0,armies:accepted?move.armies:{},cost:accepted?cost:0,moveCost:accepted?move.moveCost:0,moneyUnits:0,diplomacy:0,services:0,soldArmies:0,convertedSoldArmies:accepted?soldArmies:0,saleIncome:accepted?saleIncome:0};
}
export function automaAgreementCost(offer){return offer.money+offer.moveCost+5*offer.diplomacy;}
export function canPayAutomaAgreement(s,owner,offer){return !isAutoma(s,owner)||s.players[owner].money>=automaAgreementCost(offer);}
export function spendAutomaEventSmart(s){
 for(const [owner,p] of Object.entries(s.players))if(isAutoma(s,owner)){
  const amount=Math.floor(p.smart/2);p.smart-=amount;p.vp+=amount;
  if(amount)s.log=[`${owner} · 高级自动机将${amount} SP换为${amount}分`,...s.log].slice(0,30);
 }
}
