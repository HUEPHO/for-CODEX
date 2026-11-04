import {phaseStatus} from './phase-state.js';
import {POWERS} from './game-constants.js';
import {powerFlag} from './power-identity.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const phases=['准备','行动','研究','事件','结算'];
const phaseLabels={开局:'准备',准备:'准备',行动:'行动',研究:'研究',事件:'事件',余波:'结算',轮末:'结算',终局:'结算',结束:'结算'};

/** Project the saved turn/phase workflow. A responding opponent is not a new turn. */
export function clientRoundStatusModel(state){
 const status=phaseStatus(state),phase=phaseLabels[status.group]||phaseLabels[state.phase]||'准备';
 const index=state.actionTurns?.index,order=state.flow?.order||state.initialOrder||[];
 const actionOwner=Number.isInteger(index)&&index<16?order[index%4]:null;
 const completed=state.actionTurns?.completed?.[actionOwner];
 const action=phase==='行动'&&actionOwner?Math.min(4,Math.max(1,Number.isInteger(completed)?completed+1:Math.floor(index/4)+1)):null;
 const progress=action?`第 ${action} 次行动 / 共 4 次`:phase==='准备'?'行动待开始 / 共 4 次':'行动已完成 / 共 4 次';
 const detail=status.pending||status.detail||(['开局','准备','轮末','终局'].includes(status.group)?status.label:null);
 return {round:state.round,phase,actor:status.actor,actionOwner,action,progress,detail,
  phases:phases.map(label=>({label,current:label===phase,skipped:label==='事件'&&!state.config?.wit}))};
}

export function renderClientRoundStatus(state){
 const model=clientRoundStatusModel(state),actor=POWERS[model.actor];
 return `<button data-client-flow class="client-round-button" title="展开或收起顶部操作" aria-label="第${model.round}轮，${model.phase}阶段；${model.progress}${model.detail?'；'+esc(model.detail):''}">
  <span class="client-round-heading"><strong>第 ${model.round} / 6 轮</strong>${actor?`<span class="client-round-actor" title="当前操作方：${actor.name}">${powerFlag(model.actor,{decorative:true})}<span>${actor.name}</span></span>`:''}</span>
  <span class="client-action-progress"><span class="client-action-dots" aria-hidden="true">${Array.from({length:4},(_,i)=>`<i class="client-action-dot${model.action===i+1?' is-current':''}"></i>`).join('')}</span><b>${model.progress}</b></span>
  <span class="client-phase-strip" aria-label="轮次阶段">${model.phases.map(p=>`<span class="client-phase-pill${p.current?' is-current':''}${p.skipped?' is-skipped':''}" data-round-phase="${p.label}"${p.current?' aria-current="step"':''}${p.skipped?' title="未启用事件扩展，本局跳过事件阶段"':''}>${p.label}</span>`).join('')}</span>
  ${model.detail?`<small class="client-round-pending">${esc(model.detail)}</small>`:''}
 </button>`;
}
