import {MARKET_CARDS} from './market-data.js';
import {DD_MARKET_CARDS} from './dd-market-data.js';
import {SPECIAL_CARDS} from './special-data.js';
import {effectiveCard,applyCardPreparation,applyCardAftermath} from './market-actions.js';
import {availableGrowth,placementPreview,placeWithResilience} from './growth-triggers.js';
import {extraCardAvailable,consumeExtraCard} from './growth-active.js';
import {validateSP} from './smart-power.js';
import {tradePreview,applyTrade} from './trade.js';
import {productionPreview,applyProduction,growthPreview,applyGrowth} from './domestic-actions.js';
import {basePreview,applyBase,relationPreview,applyRelations} from './country-actions.js';
import {gainResource} from './economy.js';
import {reinforcementPreview,applyReinforcement} from './military.js';
import {AREAS,changeInfluence,alliedCount} from './world.js';
import {countryValue,countryRegion,investmentCost} from './research.js';
export const BASIC_CARDS=Object.freeze({
 c89c153d80dbd:{name:'国际贸易',effect:'trade'},cfe67dfb64a6a:{name:'国际贸易',effect:'trade'},cec9ccca5e28f:{name:'国际贸易',effect:'trade'},cbe5f3b559f8b:{name:'国际贸易',effect:'trade'},c0deaa2d05c13:{name:'国际贸易',effect:'trade'},cb8f875b0312d:{name:'国际贸易',effect:'trade'},c99b7515b27c2:{name:'国际贸易',effect:'trade'},c17bf3b6aa665:{name:'全球货币',effect:'trade',currencyBonus:5},cee23aa848494:{name:'能源巨擘',effect:'trade',doublePrimary:true},c0297b4923ea2:{name:'世界工厂',effect:'trade',factory:true},
 cf9aa23c4a315:{name:'发展战略',effect:'domestic'},c21af5cf83dc5:{name:'发展战略',effect:'domestic'},cb1a3c1de6f4e:{name:'发展战略',effect:'domestic'},cff6e8c668519:{name:'发展战略',effect:'domestic'},c1dbd137bb9c8:{name:'发展战略',effect:'domestic'},c812949018f33:{name:'发展战略',effect:'domestic'},cf503b7e361cc:{name:'发展战略',effect:'domestic'},c4d52057397c8:{name:'发展战略',effect:'domestic'},
 c4813f7351d34:{name:'海外军事存在',effect:'base'},cb9e2b5cdaa2d:{name:'海外军事存在',effect:'base'},cb412cd2ea8ef:{name:'海外军事存在',effect:'base'},c6e05637359a6:{name:'海外军事存在',effect:'base'},
 c2a848893da52:{name:'军事条约',effect:'base',gainDiplomacy:1},cc890d2c14a1a:{name:'军事再武装',effect:'base',gainArmies:1},c464b8ad09f56:{name:'经济外交',effect:'invest',gainDiplomacy:1},
 c27ef4c355438:{name:'新盟友',effect:'relations'},cf7a35df8dda7:{name:'新盟友',effect:'relations'},ce0bb92b3fbe2:{name:'新盟友',effect:'relations'},ced0c1347e18d:{name:'新盟友',effect:'relations'},c534f4023459a:{name:'新盟友',effect:'relations'},cb4a41227a490:{name:'新盟友',effect:'relations'},c129caf240b9f:{name:'新盟友',effect:'relations'},c39894ce0146d:{name:'新盟友',effect:'relations'},cf4fe0ced7ddc:{name:'新盟友',effect:'relations'},c198ff02119b8:{name:'人道主义援助',effect:'relations',moneyDiplomacy:true},

 cc9cd4168dcc6:{name:'军事增援',effect:'reinforce'},c1fa9de3f9d57:{name:'军事增援',effect:'reinforce'},c56dca820d8e0:{name:'军事增援',effect:'reinforce'},c7c25a39979fc:{name:'军事增援',effect:'reinforce'},
 c734440d2fe5c:{name:'外交介入',effect:'engage'},c47b7aabb558b:{name:'对外直接投资',effect:'invest'},
 ccbf24b8946ff:{name:'对外直接投资',effect:'invest'},ca0bb85993749:{name:'外交介入',effect:'engage'},
 c53bb53bdb193:{name:'外交介入',effect:'engage'},c3d2f62a981c8:{name:'对外直接投资',effect:'invest'},
 cac4b66c80e90:{name:'对外直接投资',effect:'invest'},c2bf788de4ec4:{name:'外交介入',effect:'engage'},
 cf560f1a1dd4d:{name:'软实力',effect:'engage',discountRegions:['E','N','C']}
});
export const ACTION_CARDS=Object.freeze({...BASIC_CARDS,...MARKET_CARDS,...DD_MARKET_CARDS,...SPECIAL_CARDS});
export const ENGAGE_LIMIT={US:3,CN:2,EU:3,RU:2};
export const ENGAGE_COST={M:4,E:5,C:4,N:6,A:3,S:4,P:5};
export function requireTurn(s){const f=s.flow;if(!f||f.step!=='actions'||s.phase!=='行动'||s.actionTurns.index>=4*f.order.length||s.current!==f.order[s.actionTurns.index%f.order.length])throw Error('当前不是本方的行动');if(!Array.isArray(f.turnCards))throw Error('结束当前行动后即可启用自动出牌');if(f.cardResolution)throw Error('请先完成当前卡牌的分段效果');if(f.pendingRelation)throw Error('请先完成开放外交追加结盟');if(f.pendingGrowth)throw Error('请先完成发展牌选牌');if(f.turnCards.length&&!extraCardAvailable(s))throw Error('本次行动已经出过牌；请完成效果后结束行动');}
export function actionPreview(s,a){requireTurn(s);const entry=ACTION_CARDS[a.cardId];if(!entry||!s.players[s.current].hand.includes(a.cardId))throw Error('请选择手中已支持自动结算的能力牌');if(!s.worldVersion)throw Error('需要启用槽位记录的新桌面');
 if(entry.effect==='sequence')throw Error('请从分段结算入口打出此牌');if(s.flow.extraCard?.cardId&&s.flow.extraCard.cardId!==a.cardId)throw Error('必须打出刚研究的指定卡牌');return effectPreview(s,a,entry);
}
export function effectPreview(s,a,entry){
 const card=effectiveCard(entry,a);if(card.targetCountry&&a.country!==card.targetCountry)throw Error('必须选择本牌指定的国家');if(card.targetRegion&&a.region!==card.targetRegion)throw Error('必须选择本牌指定的地区');
 const targetRegion=a.country?countryRegion(a.country):a.region;if(card.allowedRegions&&!card.allowedRegions.includes(targetRegion)||card.excludeRegion&&card.excludeRegion===targetRegion)throw Error('请选择本段允许的国家或地区');
 const copy=structuredClone(s),preparation=applyCardPreparation(copy,a,card),result=preparedPreview(copy,a,card);result.preparation=preparation;
 if(result.influence)placeWithResilience(copy,a,result);applyCardAftermath(copy,a,card,result);return result;
}
function preparedPreview(s,a,card){const p=s.players[s.current];
 if(a.openDiplomacy&&(card.effect!=='relations'||!availableGrowth(s,'open')))throw Error('当前不能触发开放外交');
 if(card.effect==='trade')return tradePreview(s,a,card);
 if(card.effect==='domestic'){if(card.domesticMode&&a.domestic!==card.domesticMode)throw Error('必须执行本段指定的生产或发展效果');if(card.fixedProductionKey!==undefined&&(a.production||[]).some(x=>x.key!==card.fixedProductionKey))throw Error('必须生产本段指定资源');if(a.domestic==='produce'){if(card.allowedProductionKeys&&(a.production||[]).some(x=>!card.allowedProductionKeys.includes(x.key)))throw Error('只能生产本牌列出的资源');return productionPreview(s,a.production||[],card.maxProduction??3);}if(a.domestic==='growth')return growthPreview(s,a,card);throw Error('请选择生产资源或取得发展牌');}
 if(card.effect==='reinforce')return reinforcementPreview(s,a,card);
 let region,cost,discount=0,exhaust=[],extra={},influence=true;
 if(card.effect==='base'||card.effect==='relations'){extra=card.effect==='base'?basePreview(s,a,card):relationPreview(s,a,card);({region,cost,exhaust,influence}=extra);}
 else
 if(card.effect==='invest'){const id=a.country,ready=a.investSP||'';if(!['','before','after'].includes(ready))throw Error('请选择投资前或投资后重整');extra.smartCost=validateSP(s,ready?1:0);extra.readyBefore=ready==='before'?id:null;extra.readyAfter=ready==='after'?id:null;if(!p.allies.includes(id)||((p.exhaustedAllies||[]).includes(id)&&ready!=='before')||(p.fdi||[]).filter(cid=>cid===id).length>=(card.investmentLimit??1))throw Error('投资需要自己的未横置、未投资盟国');region=countryRegion(id);cost=card.fixedInvestmentCost??investmentCost(id);exhaust=card.keepReady?[]:[id];if(p.money<cost)throw Error('投资资金不足');}
 else{extra.smartCost=validateSP(s,a.engageSP??0);if(extra.smartCost>1)throw Error('介入最多使用1 SP');region=a.region;if(!AREAS[region]||(!card.allowNoAlly&&alliedCount(s,s.current,region)<1))throw Error('介入地区必须有本方盟国');exhaust=a.exhaust||[];if(!Array.isArray(exhaust)||new Set(exhaust).size!==exhaust.length||exhaust.some(id=>!p.allies.includes(id)||(p.exhaustedAllies||[]).includes(id)||countryRegion(id)!==region))throw Error('减费只能横置该地区本方未横置的盟国');discount=exhaust.reduce((n,id)=>n+countryValue(id),0)+(p.focus==='外交焦点'?2:0)+(card.discountRegions?.includes(region)?1:0)+extra.smartCost*alliedCount(s,s.current,region)+(card.engageDiscount==='allies'?alliedCount(s,s.current,region):card.engageDiscount==='armies'?s.regions[region].armies[s.current]:0);cost=Math.max(0,ENGAGE_COST[region]-discount);if(p.resources[5]<cost)throw Error('介入所需外交不足');
  const used=Object.values(s.regions).reduce((n,r)=>n+r.engage[s.current],0);if(used>=ENGAGE_LIMIT[s.current]){if(!AREAS[a.moveFrom]||s.regions[a.moveFrom].engage[s.current]<1)throw Error('介入标记已用完，请选择要移来的已有标记');}else if(a.moveFrom)throw Error('仍有可用介入标记，无需移动已有标记');
 }
 const result={region,cost,discount,exhaust,influence,permanentOverflow:!!card.permanentOverflow,...extra,effect:card.effect,name:card.name};result.vp=placementPreview(s,a,result);return result;
}
export function resolveBasicCard(s,a){actionPreview(s,a);const p=s.players[s.current],result=resolveBasicEffect(s,a,ACTION_CARDS[a.cardId]);consumeExtraCard(s);p.hand.splice(p.hand.indexOf(a.cardId),1);p.played.push(a.cardId);s.flow.turnCards.push(a.cardId);return result;}
export function resolveBasicEffect(s,a,entry){const result=effectPreview(s,a,entry),p=s.players[s.current],card=effectiveCard(entry,a);applyCardPreparation(s,a,card);p.exhaustedAllies??=[];if(result.readyBefore)p.exhaustedAllies=p.exhaustedAllies.filter(id=>id!==result.readyBefore);p.exhaustedAllies.push(...(result.exhaust||[]));
 if(result.effect==='trade'){applyTrade(s,result);}else if(result.effect==='production'){applyProduction(s,result);}else if(result.effect==='growth'){applyGrowth(s,result);}else if(result.effect==='reinforce'){applyReinforcement(s,result);}else if(result.effect==='base'){applyBase(s,a,result);}else if(result.effect==='relations'){applyRelations(s,a,result);}else if(result.effect==='invest'){p.money-=result.cost;p.fdi??=[];p.fdi.push(a.country);}else{p.resources[5]-=result.cost;if(a.moveFrom)s.regions[a.moveFrom].engage[s.current]--;s.regions[result.region].engage[s.current]++;}
 p.smart-=result.smartCost||0;if(result.readyAfter)p.exhaustedAllies=p.exhaustedAllies.filter(id=>id!==result.readyAfter);
 if(result.influence||a.resilience)placeWithResilience(s,a,result);applyCardAftermath(s,a,card,result);if(card.gainDiplomacy)gainResource(p,5,card.gainDiplomacy);if(card.gainArmies)gainResource(p,6,card.gainArmies);result.gainDiplomacy=card.gainDiplomacy||0;result.gainArmies=card.gainArmies||0;return result;
}
export function resolvePass(s,a){requireTurn(s);if(s.flow.extraCard)throw Error('额外出牌可直接跳过，不重复领取放弃行动奖励');const p=s.players[s.current];if(p.hand.length){const i=p.hand.indexOf(a.cardId);if(i<0)throw Error('请选择一张手牌盖放');p.hand.splice(i,1);p.played.push(a.cardId);p.faceDownPlayed??=[];p.faceDownPlayed.push(a.cardId);s.flow.turnCards.push(a.cardId);}else if(a.cardId)throw Error('手牌已空，无需选择卡牌');p.money+=10;}
