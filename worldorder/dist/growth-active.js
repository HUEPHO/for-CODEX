import {finishIndustry} from './growth-industry.js';
import {finishBattlefield} from './growth-battlefield.js';
import {GROWTH_DATA} from './growth-data.js';
import {drawCards} from './draw.js';
import {countryValue} from './research.js';
import {resourceEfficiencyPreview,applyResourceEfficiency} from './growth-resource.js';
import {cooperationAllies,startCooperation,finishCooperation} from './growth-cooperation.js';

export function requiredGrowthCards(s){const f=s.flow;return [f?.extraCard?.cardId,...(f?.extraQueue||[]).map(item=>item.cardId),f?.battlefieldReturn?.extraCard?.cardId,...(f?.battlefieldReturn?.extraQueue||[]).map(item=>item.cardId)].filter(Boolean);}

export function growthAbilityPreview(s,id){
 const p=s.players[s.current],g=GROWTH_DATA[id];
 if(!s.flow||s.flow.step==='ended')throw Error('需要尚未结束的六轮桌面');
 if(!g||!p.growth.includes(id)||!['exchange','trim','leadership','efficiency','cooperation'].includes(g.effect))throw Error('请选择本方已支持的主动发展牌');
 if(s.flow.step!=='actions')throw Error('主动抽换牌发展能力仅能在行动阶段使用');
 if(s.round<g.level)throw Error('此能力第'+g.level+'轮生效');
 if(s.flow.pendingGrowth)throw Error('请先完成正在进行的选牌');
 if(p.growthUsed?.[id]===s.round)throw Error('本轮已经使用过此能力');
 if(g.effect==='cooperation'&&(!cooperationAllies(s).length||!p.deck.length&&!p.discard.length))throw Error('盟国合作需要就绪盟国，且牌库或弃牌中至少有1张牌');
 if(g.effect==='efficiency'&&!p.deck.length&&!p.discard.length)throw Error('牌库与弃牌均为空，无法抽牌使用资源集约');
 if(g.effect==='leadership'&&!p.hand.length)throw Error('没有可更替的手牌');
 if(g.effect==='leadership'&&requiredGrowthCards(s).some(cid=>cid&&p.hand.includes(cid)))throw Error('请先打出本次免费研究后指定必须打出的牌，再使用高层更替');
 const maximum=g.effect==='leadership'?p.hand.length:['trim','efficiency'].includes(g.effect)?1:Math.max(0,...p.allies.filter(cid=>!(p.exhaustedAllies||[]).includes(cid)).map(countryValue));
 return {...g,maximum};
}
export function startGrowthAbility(s,a){
 const g=growthAbilityPreview(s,a.cardId),p=s.players[s.current];if(g.effect==='cooperation')return startCooperation(s,a);
 const count=g.effect==='leadership'?p.hand.length:['trim','efficiency'].includes(g.effect)?1:a.count;
 if(!Number.isInteger(count)||count<0||count>g.maximum)throw Error('抽牌数量须在0至'+g.maximum+'之间');
 if(g.effect==='leadership'){p.discard.push(...p.hand);p.hand=[];}
 const drawn=drawCards(p,count);p.growthUsed??={};p.growthUsed[a.cardId]=s.round;
 // Exchange discards the number actually drawn; trimming still removes a hand
 // card when no draw pile remains, following "as much as possible".
 const choose=g.effect==='leadership'?0:['trim','efficiency'].includes(g.effect)?Math.min(1,p.hand.length):drawn.length;
 if(choose>p.hand.filter(id=>!requiredGrowthCards(s).includes(id)).length)throw Error('没有足够的可选手牌；必须保留免费研究后指定打出的牌');
 if(choose)s.flow.pendingGrowth={owner:s.current,cardId:a.cardId,effect:g.effect,choose,drawn};
 return {name:g.name,drawn:drawn.length,choose};
}
export function finishGrowthAbility(s,a){
 const pending=s.flow?.pendingGrowth;if(!pending||pending.owner!==s.current)throw Error('当前没有本方待完成的选牌');
 if(pending.effect==='industry')return finishIndustry(s,a);
 if(pending.effect==='cooperation')return finishCooperation(s,a);
 if(pending.effect==='battlefield')return finishBattlefield(s,a);
 const p=s.players[s.current],ids=a.cards;
 if(!Array.isArray(ids)||ids.length!==pending.choose||new Set(ids).size!==ids.length||ids.some(id=>!p.hand.includes(id)))throw Error('请选择'+pending.choose+'张不同的现有手牌');
 if(ids.some(id=>requiredGrowthCards(s).includes(id)))throw Error('必须保留免费研究后指定打出的牌');
 const rewards=pending.effect==='efficiency'?resourceEfficiencyPreview(ids[0],a.rewardTypes):null;
 for(const id of ids){p.hand.splice(p.hand.indexOf(id),1);if(pending.effect==='trim'){p.trashed??=[];p.trashed.push(id);}else p.discard.push(id);}
 const gained=rewards?applyResourceEfficiency(p,rewards):{};
 s.flow.pendingGrowth=null;return {name:GROWTH_DATA[pending.cardId].name,count:ids.length,trashed:pending.effect==='trim',...gained};
}
export function extraCardAvailable(s){const f=s.flow;return !!(f?.extraCard&&f.extraCard.owner===s.current&&f.extraCard.round===s.round&&f.extraCard.turnIndex===s.actionTurns.index&&f.turnCards.length===f.extraCard.baseline);}
export function grantExtraPlay(s,name,cardId=null){s.flow.extraQueue??=[];s.flow.extraQueue.push({source:'ability',name,cardId,required:!!cardId});}
export function offerExtraCard(s){
 const f=s.flow,p=s.players[s.current];if(extraCardAvailable(s))return true;
 if(!f.extraQueue?.length&&s.actionTurns.completed[s.current]===0&&f.turnCards.length>=1&&!f.extraCardSpent&&!f.growthExtraGranted&&p.growth.some(id=>GROWTH_DATA[id]?.effect==='extra'&&GROWTH_DATA[id].level<=s.round)){
  f.growthExtraGranted=true;f.extraQueue??=[];f.extraQueue.push({source:'growth',name:'战略优势',required:false});
 }
 if(!f.extraQueue?.length)return false;
 f.extraCard={...f.extraQueue.shift(),owner:s.current,round:s.round,turnIndex:s.actionTurns.index,baseline:f.turnCards.length};return true;
}
export function consumeExtraCard(s){if(extraCardAvailable(s)){if(!s.flow.extraCard.source||s.flow.extraCard.source==='growth')s.flow.extraCardSpent=true;s.flow.extraCard=null;}}
