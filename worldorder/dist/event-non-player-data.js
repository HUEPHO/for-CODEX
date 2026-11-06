// Printed lower-right bid decks, checked against all supplied WIT card faces.
// A missing entry is intentional: those powers cannot encounter the chained
// event as NPPs because their personal precursor becomes influence instead.
export const NON_PLAYER_EVENT_BIDS={
 c963b6d849299:{EU:[0,3]},
 cd780718be7a6:{US:[2,4],EU:[2,4],CN:[0,2]},
 c0393427ae3df:{US:[0,2],EU:[0,2]},
 c4b796f4206ea:{US:[0,2],EU:[1,2]},
 cbb2924757345:{US:[2,4],EU:[2,4],RU:[2,5,2]},
 c784b257890d8:{US:[1,3],EU:[0,2],RU:[1,3],CN:[0,1]},
 c2a6d1615b971:{US:[1,3],EU:[0,1],RU:[1,1],CN:[0,2]},
 c16291ef10b12:{US:[1,4,'round'],EU:[1,4,'round'],CN:[1,4,'round']},
 cd771b6a9d234:{US:[0,3,2],RU:[1,3],CN:[1,3]},
 cfeeeba9da48c:{US:{yes:2,no:1,money:10,diplomacy:2},EU:{yes:2,no:1,money:10,diplomacy:2}},
 c0a692aca2850:{US:[0,2],EU:[0,2]},
 c8b5edd6c7beb:{US:[1,3],EU:[1,3],RU:[1,4],CN:[1,4]},
 cb2c1803ce749:{US:[2,4],EU:[1,4]},
 c9d55e147b0d7:{RU:[0,4],CN:[0,4]},
 c25240469d096:{US:[1,4],EU:[1,4],RU:[2,5,2]},
 ce97d5ccaf589:{US:[0,4],CN:[0,4]},
 c300aaac6d226:{RU:[0,3],CN:[0,3]},
 cbdab09ed1a45:{EU:[1,4],RU:[1,4,1]},
 cad4342891b33:{US:[0,2],EU:[0,2],RU:[2,4]},
 cb49c1aaba260:{RU:{yes:3,no:1},CN:{yes:3,no:1}},
 c8c95b49f81e7:{EU:{yes:3,no:1},RU:{yes:3,no:1}},
 c7787ad7ef400:{RU:[0,3,2],CN:[0,3,1]},
 caa9567066a40:{US:[0,3,2],RU:[0,2,1],CN:[0,2,1]},
 c9db977892b0d:{US:[0,3,1],EU:[0,3,1],RU:[0,3,1],CN:[0,3,2]},
 ce9e1586521dc:{US:{yes:2,no:1},RU:{yes:2,no:1}},
 ccb7c1841e070:{US:[1,3],EU:[1,3],RU:[0,2],CN:[0,1]},
 c99fa916aec22:{US:[1,2],EU:[1,2],RU:[1,2]},
 cf0d87e580c4a:{US:[0,5,0,1],EU:[0,5,0,1]},
 c6e3c117f6ac4:{US:[0,2,2],CN:[0,2,'armiesP']},
 cf00e1c9bdd9c:{US:[0,2],EU:[1,2],RU:[0,1],CN:[0,2]}
};
export function nonPlayerBidModifier(s,cardId,owner){
 const rule=NON_PLAYER_EVENT_BIDS[cardId]?.[owner];
 if(!rule)throw Error('该事件没有此非玩家势力的牌面投标规则');
 const modifier=rule[2]||0;
 return modifier==='round'?s.round:modifier==='armiesP'?s.regions.P.armies[owner]:modifier;
}
export function drawNonPlayerBid(cardId,owner,rng=Math.random){
 const rule=NON_PLAYER_EVENT_BIDS[cardId]?.[owner];
 if(!rule)throw Error('该事件没有此非玩家势力的牌面投标规则');
 return Array.isArray(rule)?rule[0]+Math.floor(rng()*(rule[1]-rule[0]+1))+(rule[3]||0):Math.floor(rng()*(rule.yes+rule.no))<rule.yes;
}
