import {POWERS,RESOURCE_NAMES} from './game-constants.js';
import {ECONOMY} from './economy.js';
import {recordObjectiveProgress} from './objective-progress.js';
import {DEBUG_CARD_TYPES} from './debug-card-catalog.js';

export {DEBUG_CARD_TYPES} from './debug-card-catalog.js';
export const DEBUG_ROLLBACK_REASON='Debug Mode 已修改局面，之前的撤回快照已清除';

// Debug commands are separate from ordinary play: no costs, rewards or turn
// advancement. Rooms invoke this only after checking the host and revision.
export function applyDebugAction(state,action,cards){
 if(!action||!Object.hasOwn(POWERS,action.player))throw Error('请选择有效势力');
 const next=structuredClone(state),p=next.players[action.player];let message;
 if(action.type==='addCard'){
  const card=cards.find(c=>c.id===action.cardId&&DEBUG_CARD_TYPES.has(c.type));
  if(!card)throw Error('请选择能力牌或战略资产');
  if(card.type==='asset'){
   if(p.assets.includes(card.id))throw Error('该势力已有这张可用战略资产');
   p.usedAssets=p.usedAssets.filter(id=>id!==card.id);
   p.assets.push(card.id);
  }else p.hand.push(card.id);
  message=`加入${card.type==='asset'?'可用战略资产':'手牌'}：${card.name||card.notes||card.id}`;
 }else if(action.type==='setValues'){
  const entries=Object.entries(action.values||{});
  if(!entries.length)throw Error('没有需要保存的数值变化');
  const changed=[];
  for(const [key,value] of entries){
   if(!Number.isSafeInteger(value)||(key!=='vp'&&value<0))throw Error('请输入非负整数（胜利分可为负数）');
   const match=/^(resources|production)\.([0-6])$/.exec(key);
   if(match){const [,group,index]=match;p[group][Number(index)]=value;changed.push(`${RESOURCE_NAMES[index]}${group==='production'?'产能':'库存'}=${value}`);}
   else if(['money','smart','vp'].includes(key)){p[key]=value;changed.push(`${{money:'资金',smart:'SP',vp:'胜利分'}[key]}=${value}`);}
   else throw Error('无效的资源或产能项目');
  }
  // Deliberate out-of-track production is usable in debug saves. Normal
  // production validation and paid upgrades retain their printed limits.
  p.debugProduction=p.production.some((value,key)=>value<1||value>ECONOMY[action.player].max[key]);
  message=changed.join('，');
 }else throw Error('未知调试操作');
 next.debugMode=true;
 next.log=[`Debug · ${POWERS[action.player].name} · ${message}`,...next.log].slice(0,30);
 recordObjectiveProgress(state,next);
 return next;
}
