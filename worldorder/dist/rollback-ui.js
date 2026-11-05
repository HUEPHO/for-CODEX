const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scopes={
 step:{label:'撤回上一步',detail:'恢复最近一次已经提交的操作。'},
 turn:{label:'重新开始整个回合',detail:'恢复本方本次行动开始前，包含连打与后续效果。'},
};
export const rollbackLabel=scope=>scopes[scope]?.label||scopes.step.label;
export function renderRollbackOptions(availability,blockedReason=''){
 return Object.entries(scopes).map(([scope,{label,detail}])=>{
  const item=availability?.[scope],reason=blockedReason||item?.reason||'还没有可以撤回的操作',enabled=!blockedReason&&item?.available;
  return `<button type="button" class="rollback-option" data-rollback-scope="${scope}" ${enabled?'':'disabled'}><strong>${label}</strong><span>${enabled?(item.requiresConsent?'申请对方同意后，重开本方上一回合。':detail):esc(reason)}</span></button>`;
 }).join('');
}
const flag=seat=>`<img class="power-flag power-inline-flag" src="assets/flag-${seat}.svg" alt="${POWERS[seat].name}" title="${POWERS[seat].name}" data-power-flag="${seat}">`;
export function renderActionRollback(availability,request,blocked=''){
 const buttons=['step','turn'].map(scope=>{
  const item=availability[scope],reason=blocked||(request?'请先处理当前重开申请':item.reason),enabled=!reason&&item.available;
  return `<button type="button" data-rollback-scope="${scope}" ${enabled?'':'disabled'} title="${esc(reason||(item.requiresConsent?'需要对方同意':item.warning||scopes[scope].detail))}">${rollbackLabel(scope)}</button>`;
 }).join('');
 return `<div class="action-rollback-buttons">${buttons}</div>${request?`<div class="turn-restart-request" role="status"><p>${flag(request.owner)} 申请重开上一回合${request.canRespond?'':'，等待 '+flag(request.approver)+' 同意'}。</p><p class="minor">同意后，双方这期间的操作都会重置。</p>${request.warning?'<p class="rollback-warning-note">这不太好哟：期间已出现新信息或随机结果。</p>':''}<div>${request.canRespond?`<button data-restart-response="accept" ${blocked?'disabled':''}>同意重开</button><button data-restart-response="reject" ${blocked?'disabled':''}>拒绝</button>`:request.canCancel?`<button data-restart-response="cancel" ${blocked?'disabled':''}>取消申请</button>`:''}</div></div>`:''}`;
}
import {POWERS} from './game-constants.js';
