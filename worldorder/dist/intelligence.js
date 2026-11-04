import {ACTION_CARDS} from './basic-actions.js';

export function intelligenceTargets(s){return Object.keys(s.players).filter(id=>id!==s.current);}
export function intelligenceCandidates(s,player){
 if(!intelligenceTargets(s).includes(player))throw Error('请选择另一位玩家查看手牌');
 const p=s.players[player];
 return ['hand','played'].flatMap(zone=>p[zone].filter(id=>ACTION_CARDS[id]&&!ACTION_CARDS[id].source&&(zone!=='played'||!(p.faceDownPlayed||[]).includes(id))).map(cardId=>({zone,cardId})));
}
export function copyAbilityPreview(s,a,step){
 if(!intelligenceCandidates(s,step.player).some(x=>x.zone===a.zone&&x.cardId===a.targetCard))throw Error('请选择已查看玩家手中或已打出的可复制能力牌');
 const card=ACTION_CARDS[a.targetCard];
 return {player:step.player,zone:a.zone,cardId:a.targetCard,name:card.name,trashSelf:!!card.trashOnPlay,steps:card.effect==='sequence'?structuredClone(card.steps):[{type:'effect',card:structuredClone(card)}]};
}
export function trashCopiedSelf(s,q){
 const p=s.players[q.owner],index=p.played.indexOf(q.cardId);
 if(index<0){if((p.trashed||[]).includes(q.cardId))return;throw Error('本次打出的情报窃取已不在行动区');}
 p.played.splice(index,1);p.trashed??=[];p.trashed.push(q.cardId);
}
