import {SPECIAL_CARDS,EXECUTIVE_BY_POWER} from './special-data.js';
import {consumeExtraCard} from './growth-active.js';

export function availableExecutive(s,power=s.current){const p=s.players[power],id=EXECUTIVE_BY_POWER[power];return s.config.executive&&p.executive===id&&!p.executiveUsed?id:null;}
export function specialPlayPreview(s,a){
 const card=SPECIAL_CARDS[a.cardId],p=s.players[s.current];
 if(!card||card.owner!==s.current)throw Error('只能使用本方已支持自动结算的资产或行政命令');
 if(s.flow?.extraCard?.cardId)throw Error('必须打出刚研究的指定能力牌，不能替换为资产或行政命令');
 if(card.source==='asset'&&!p.assets.includes(a.cardId))throw Error('此资产不属于本方或已使用');
 if(card.source==='executive'&&availableExecutive(s)!==a.cardId)throw Error('行政命令未启用或已经使用');
 if(p.hand.length&&!p.hand.includes(a.cover))throw Error('使用资产或行政命令需要盖放一张手牌');
 if(!p.hand.length&&a.cover)throw Error('手牌为空，无需盖放');
 return card;
}
export function consumeSpecialCard(s,a){
 const card=specialPlayPreview(s,a),p=s.players[s.current];consumeExtraCard(s);
 if(a.cover){p.hand.splice(p.hand.indexOf(a.cover),1);p.played.push(a.cover);p.faceDownPlayed??=[];p.faceDownPlayed.push(a.cover);}
 // A no-hand special still counts as the turn's played card for extra-card flow.
 s.flow.turnCards.push(a.cover||a.cardId);
 if(card.source==='asset'){p.assets.splice(p.assets.indexOf(a.cardId),1);p.usedAssets.push(a.cardId);}else p.executiveUsed=true;
}
