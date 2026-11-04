import {countryValue} from './research.js';
import {takeDeckCards} from './draw.js';

export function cooperationAllies(s){const p=s.players[s.current];return p.allies.filter(id=>!(p.exhaustedAllies||[]).includes(id)&&countryValue(id)>0);}
export function startCooperation(s,a){
 const p=s.players[s.current];if(!cooperationAllies(s).includes(a.ally))throw Error('盟国合作需选择本方未横置的盟国');
 if(!p.deck.length&&!p.discard.length)throw Error('牌库与弃牌均为空，无法查看并抽牌');
 // User ruling: preserve remaining deck order, then shuffle the discard pile
 // as needed. Inspected cards occupy a private zone, not the hand.
 const inspected=takeDeckCards(p,countryValue(a.ally));
 p.exhaustedAllies??=[];p.exhaustedAllies.push(a.ally);p.growthUsed??={};p.growthUsed[a.cardId]=s.round;
 s.flow.pendingGrowth={owner:s.current,cardId:a.cardId,effect:'cooperation',choose:1,drawn:[],inspected};
 return {name:'盟国合作',drawn:0,inspected:inspected.length,choose:1};
}
export function finishCooperation(s,a){
 const pending=s.flow.pendingGrowth,p=s.players[s.current],ids=a.cards,order=a.topOrder;
 if(!Array.isArray(ids)||ids.length!==1||!pending.inspected.includes(ids[0]))throw Error('请从查看到的牌中选择1张加入手牌');
 const remaining=pending.inspected.filter(id=>id!==ids[0]);
 if(!Array.isArray(order)||order.length!==remaining.length||new Set(order).size!==order.length||order.some(id=>!remaining.includes(id)))throw Error('请按从上到下的顺序排列全部剩余候选牌，不能重复或遗漏');
 p.hand.push(ids[0]);p.deck.unshift(...order);s.flow.pendingGrowth=null;
 return {name:'盟国合作',count:1,kept:1,returned:order.length};
}
