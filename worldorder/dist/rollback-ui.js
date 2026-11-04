const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scopes={
 step:{label:'撤销上一步',detail:'恢复最近一次已经提交的操作。'},
 phase:{label:'撤回本阶段',detail:'恢复本方当前结算阶段或步骤的起点。'},
 turn:{label:'撤回本次行动',detail:'恢复本方这次行动开始前，包含连打与后续效果。'},
};
export const rollbackLabel=scope=>scopes[scope]?.label||scopes.step.label;
export function renderRollbackOptions(availability,blockedReason=''){
 return Object.entries(scopes).map(([scope,{label,detail}])=>{
  const item=availability?.[scope],reason=blockedReason||item?.reason||'还没有可以撤回的操作',enabled=!blockedReason&&item?.available;
  return `<button type="button" class="rollback-option" data-rollback-scope="${scope}" ${enabled?'':'disabled'}><strong>${label}</strong><span>${enabled?detail:esc(reason)}</span></button>`;
 }).join('');
}
