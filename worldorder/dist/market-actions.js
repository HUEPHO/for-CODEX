import {gainResource} from './economy.js';
import {productionPreview,applyProduction} from './domestic-actions.js';
import {changeInfluence} from './world.js';
import {investedCountries} from './investment-tokens.js';

export function effectiveCard(card,a={}){if(card.effect!=='choice')return card;const effect=a.branch||card.choices[0];if(!card.choices.includes(effect))throw Error('请选择牌面允许的行动');return {...card,effect};}
export function applyCardPreparation(s,a,card){const p=s.players[s.current],notes=[];
 if(card.exhaustAlly){if(!p.allies.includes(card.exhaustAlly)||(p.exhaustedAllies||[]).includes(card.exhaustAlly))throw Error('需要本方未横置的'+(card.exhaustAllyLabel||'指定盟国'));p.exhaustedAllies??=[];p.exhaustedAllies.push(card.exhaustAlly);notes.push('先横置'+(card.exhaustAllyLabel||'指定盟国'));}
 if(card.moneySurcharge){if(p.money<card.moneySurcharge)throw Error('本段额外费用所需资金不足');p.money-=card.moneySurcharge;notes.push('先支付额外'+card.moneySurcharge+'资金');}
 const money=(card.moneyBefore||0)+(card.moneyPerFDI||0)*investedCountries(s,s.current).length;
 if(money){p.money+=money;notes.push('先获得'+money+'资金');}
 if(card.diplomacyBefore){const before=p.resources[5];gainResource(p,5,card.diplomacyBefore);notes.push('先获得'+(p.resources[5]-before)+'外交'+(before+card.diplomacyBefore>10?'（超出上限舍弃）':''));}
 const ready=card.readyTarget?[a.country]:(a.readyAllies||[]);
 if(card.readyBefore||card.readyTarget){if(!Array.isArray(ready)||ready.length>(card.readyBefore||1)||new Set(ready).size!==ready.length||ready.some(id=>!p.allies.includes(id)))throw Error('请选择数量限制内的本方盟国');p.exhaustedAllies=(p.exhaustedAllies||[]).filter(id=>!ready.includes(id));if(ready.length)notes.push('先重整'+ready.length+'个盟国');}
 else if(ready.length)throw Error('此牌没有重整盟国的前置效果');
 if(card.produceArmies){const n=a.armyProduction??0;if(!Number.isInteger(n)||n<0)throw Error('生产军队数量无效');const result=productionPreview(s,n?[{key:6,quantity:n}]:[]);applyProduction(s,result);notes.push('先生产'+n+'军队');}
 return notes;
}
export function preparedActionState(s,a,card){const copy=structuredClone(s);applyCardPreparation(copy,a,card);return copy;}
export function applyCardAftermath(s,a,card,result){if(!a.resetInfluence)return;
 if(!card.resetAfterMoves)throw Error('此牌不能重置临时影响力');
 const {region,index}=a.resetInfluence;if(!result.moves.some(move=>move.to===region))throw Error('只能重置本次军队移入地区的临时影响力');
 changeInfluence(s,{operation:'reset',region,index});
}
