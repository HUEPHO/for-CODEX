import {POWERS} from './game-constants.js';
import {currentActor,aftermathSteps,settlementProgress} from './phase-state.js';
import {activeInteraction,EVENT_ACTIONS,inEventInteraction,manualEventOpen,pendingActionIssue} from './interaction-state.js';

// Command-type admission only. Payloads, prices, targets and hidden information
// are still validated by the authoritative domain reducer on the full state.
export const SEATS=Object.keys(POWERS);
export const SETUP_ACTIONS=new Set(['chooseOpening','toggleAssetSelection','toggleObjectiveSelection','selectAssetDiscard','selectObjectiveDiscard','chooseAssets']);
export const MANUAL_ACTIONS=new Set(['resource','adjustProduction','adjustEventProsperity','exhaustAlly','readyAlly','toggleFDI','toggleBase','toggleCommerce']);
export const setupPending=p=>!!(p?.openingChoices||p?.assetChoices||p?.objectiveChoices||p?.setupPending);
// Debug is an explicit host tool, independent of normal turn admission.
export function debugModeIssue(room=null){
 if(!room)return null;
 if(!room.isHost)return '只有房主可以使用 Debug Mode';
 if(!room.seat)return '请先入座再使用 Debug Mode';
 if(room.status!=='playing')return '请先开始对局';
 return null;
}
export function manualWindow(s,seat=s.current){
 if(inEventInteraction(s))return manualEventOpen(s,seat);
 const f=s.flow,settlement=settlementProgress(s);
 if(settlement?.done.some(entry=>entry.player===seat))return false;
 return !!f&&!activeInteraction(s)&&(f.step==='events'||f.step==='ended'||f.step==='aftermath'&&!['投资回报','威胁结算','繁荣提升'].includes(aftermathSteps(s)[f.checks.length]));
}
export function gameActionIssue(s,a,seat=s.current){
 if(!a||typeof a.type!=='string')return '无效操作';
 if(s.eventVersion&&['event','addEvent'].includes(a.type))return '请通过事件流程结算和补充事件';
 if(a.type==='useEventEffect'){if(Object.values(s.players).some(setupPending))return '请先完成开局';if(s.flow?.step==='ended'||currentActor(s)!==seat)return '请在本方操作时使用持续效果';return null;}
 const pending=pendingActionIssue(s,a.type,seat);
 if(inEventInteraction(s)){
  if(pending)return pending;
  if(EVENT_ACTIONS.includes(a.type))return null;
 }
 if(Object.values(s.players).some(setupPending)&&a.type!=='switch'&&!SETUP_ACTIONS.has(a.type))return '请先让四个势力完成起手牌与战略资产选择';
 if(pending)return pending;
 if(settlementProgress(s)?.done.some(entry=>entry.player===seat)&&a.type!=='switch')return '本方已确认当前结算，不能继续改动；如需更正请撤销尚未被接续的一步';
 if(s.flow&&['round','phase','market','refreshMarket'].includes(a.type))return '请使用阶段流程面板操作';
 if(s.flow&&s.flow.step!=='actions'&&['play','draw','discard','return','clearPlayed'].includes(a.type))return '当前阶段由流程自动管理手牌';
 return null;
}
export function roomActionIssue(s,seat,a){
 if(!SEATS.includes(seat))return '请先选择一个势力入座';
 if(!a||typeof a.type!=='string'||a.type==='switch')return '房间中每个标签页固定操作自己的势力';
 if(SETUP_ACTIONS.has(a.type))return setupPending(s.players[seat])?gameActionIssue(s,a,seat):'你已完成开局选牌，请等待其他玩家';
 if(Object.values(s.players).some(setupPending))return '请等待四个势力完成开局选牌';
 if(a.type==='endAction'&&s.flow?.step==='actions'&&Array.isArray(s.flow.turnCards)&&!s.flow.turnCards.length)return '请先出牌并结算；若要放弃行动，请选择盖牌领取10资金';
 const actor=currentActor(s);
 if(actor!==seat&&!(manualWindow(s,seat)&&MANUAL_ACTIONS.has(a.type)))return actor?`正在等待${POWERS[actor].name}操作`:'当前只能补记本方结算结果';
 if(a.type==='region'&&a.player!==seat)return '只能手动调整本方驻军；卡牌自动效果会处理对方军队';
 return gameActionIssue(s,a,seat);
}
export function actionAccess(s,a,seat=null){const reason=seat===null?gameActionIssue(s,a):roomActionIssue(s,seat,a);return {allowed:!reason,reason};}
