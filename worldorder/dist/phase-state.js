import {activeInteraction} from './interaction-state.js';
// Shared phase description and ownership. Read-only: safe on full states and player views.
export const PHASES={
 countries:{label:'更新国家',group:'准备'},order:{label:'选择顺位',group:'准备'},production:{label:'初级生产',group:'准备'},focus:{label:'选择焦点',group:'准备'},
 actions:{label:'四轮行动',group:'行动'},research:{label:'研究购牌',group:'研究'},events:{label:'事件核对',group:'事件'},
 aftermath:{label:'余波结算',group:'余波'},roundEnd:{label:'本轮完成',group:'轮末'},ended:{label:'游戏结束',group:'终局'}
};
export function aftermathSteps(s){return ['投资回报','繁荣提升','威胁结算',...([3,6].includes(s.round)?['地区与多数计分',...(s.config.dd?['目标卡计分']:[]),...(s.config.wit?['Smart Power计分']:[])]:[])];}
export function phaseKey(s){const f=s.flow;return f?`${s.round}:${f.step}:${f.step==='aftermath'?aftermathSteps(s)[f.checks.length]||'完成':''}`:'setup';}
export function settlementKind(s){
 if(s.flow?.step==='events'&&s.config.wit&&!s.eventVersion)return 'events';
 if(s.flow?.step==='aftermath'&&aftermathSteps(s)[s.flow.checks.length]==='目标卡计分')return 'objectives';
 return null;
}
export function settlementProgress(s){
 const kind=settlementKind(s);if(!kind)return null;
 const key=phaseKey(s),saved=s.flow.settlement?.key===key?s.flow.settlement:null,done=saved?.done||[];
 return {key,kind,done,actor:s.flow.order[done.length]||null,total:s.flow.order.length};
}
export function currentActor(s){
 const interaction=activeInteraction(s);if(interaction?.kind==='event')return interaction.actor;
 const f=s.flow;if(!f||f.step==='ended')return null;
 if(interaction)return interaction.actor;
 const settlement=settlementProgress(s);if(settlement)return settlement.actor;
 if(f.step==='actions')return f.order[s.actionTurns.index%4];
 if(f.step==='research')return f.order[f.index];
 if(f.step==='order')return f.draft.queue[f.index];
 if(f.step==='focus')return f.order[f.checks.length];
 if(f.step==='aftermath'){
  const key={'投资回报':'investmentDone','威胁结算':'threatDone','繁荣提升':'prosperityDone'}[aftermathSteps(s)[f.checks.length]];
  if(key)return f.order[(f[key]||[]).length];
 }
 return f.order[0];
}
export function phaseStatus(s){
 const f=s.flow;if(!f)return {label:'开局选牌',group:'开局',actor:null,progress:Object.values(s.players).filter(p=>!p.openingChoices&&!p.assetChoices&&!p.objectiveChoices&&!p.setupPending).length,total:4};
 const definition=PHASES[f.step]||{label:'旧存档阶段',group:s.phase},settlement=settlementProgress(s);
 const progress=settlement?settlement.done.length:f.step==='actions'?s.actionTurns.index:f.step==='research'||f.step==='order'?f.index:f.step==='focus'||f.step==='aftermath'?f.checks.length:0;
 const total=settlement?settlement.total:f.step==='actions'?16:['research','order','focus'].includes(f.step)?4:f.step==='aftermath'?aftermathSteps(s).length:0;
 const pending=activeInteraction(s)?.label||null;
 return {...definition,label:s.eventVersion&&f.step==='events'?'事件结算':definition.label,actor:currentActor(s),progress,total,pending,detail:f.step==='aftermath'?aftermathSteps(s)[f.checks.length]:null};
}
