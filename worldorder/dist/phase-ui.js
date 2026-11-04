import {phaseStatus,settlementProgress} from './phase-state.js';
import {objectivePreview} from './objectives.js';
import {OBJECTIVE_DATA} from './objective-data.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderPhaseOverview(s){
 const status=phaseStatus(s),groups=[...(s.round>1?['准备']:['开局']),'行动',...(s.round<6?['研究']:[]),...(s.config.wit?['事件']:[]),'余波',s.round===6?'终局':'轮末'];
 const index=groups.indexOf(status.group),progress=settlementProgress(s);
 return `<section class="phase-overview" aria-label="整局进度"><div><b>第 ${s.round} / 6 轮</b><span>${esc(status.detail||status.label)}${status.total?' · '+status.progress+' / '+status.total:''}</span></div><ol>${groups.map((group,i)=>`<li class="${i===index?'current':i<index?'complete':''}" ${i===index?'aria-current="step"':''}>${group}</li>`).join('')}</ol>${status.pending?`<p>${esc(status.pending)} · ${names[status.actor]||''}</p>`:''}${progress?`<p>本阶段已确认：${progress.done.map(row=>names[row.player]).join('、')||'暂无'}；待确认：${s.flow.order.filter(id=>!progress.done.some(row=>row.player===id)).map(id=>names[id]).join('、')||'无'}</p>`:''}</section>`;
}
export function renderPhaseSettlement(s,cards={}){
 const progress=settlementProgress(s);if(!progress)return '';
 const disabled=progress.actor!==s.current?'disabled':'',p=s.players[s.current];
 if(progress.kind==='events')return `<b>事件阶段 · 逐方核对（${progress.done.length+1}/${progress.total}）</b><p>先按牌面完成公共事件（从右到左）、个人事件及连锁处理，再依次核对各方结果。当前由${names[progress.actor]}确认。</p><p>事件条件与效果仍需手动判断、记录；这里仅保存确认进度，不重复发放奖励。</p><label><input id="settlement-confirm" type="checkbox" ${disabled}> 本方涉及的事件已处理，资源与分数已记录</label><button id="settle-phase-task" data-task-id="${esc(progress.key)}" ${disabled}>确认本方事件结果</button>`;
 const objectiveName=id=>OBJECTIVE_DATA[id]?.name||cards[id]?.name||'目标卡';
 const available=p.objectives.filter(id=>!(p.scoredObjectives||[]).some(row=>row.cardId===id));
 return `<b>第${s.round}轮目标计分 · ${names[progress.actor]}（${progress.done.length+1}/${progress.total}）</b><p>根据当前局面自动核对三个条件并计算奖励。第3轮选一张，第6轮用剩余一张；已登记目标不能再次使用。</p>${s.round===6&&!p.scoredObjectives?.length?'<p>旧存档未记录第3轮用过哪张目标，请选择当时剩下的目标；此前分数不会补发。</p>':''}<div class="settlement-cards">${available.map(id=>{
  const result=objectivePreview(s,id);
  return `<article><button data-card="${esc(id)}" data-source="view">${esc(objectiveName(id))} · 查看牌面</button><b> ${result.points===null?'待核对历史条件':result.points+' 分'}</b><ol>${result.tasks.map(t=>`<li>${t.met===null?'待核对':t.met?'✓ 已达成':'✗ 未达成'} · ${esc(t.label)}${t.value===null?'（旧存档未记录）':`；当前 ${t.value}${t.details?'（'+esc(t.details)+'）':''}`}${t.met===null?`<label>历史上是否达成？<select data-objective-history="${id}" data-task-index="${t.index}" ${disabled}><option value="">请选择</option><option value="true">已达成</option><option value="false">未达成</option></select></label>`:''}</li>`).join('')}</ol><p>达成 1／2／3 项：${result.rewards.slice(1).join('／')} 分</p></article>`;
 }).join('')}</div><label>本次目标<select id="settlement-objective" ${disabled}>${available.length>1?'<option value="">请选择目标卡</option>':''}${available.map(id=>`<option value="${esc(id)}">${esc(objectiveName(id))}</option>`).join('')}</select></label><label>计分方式<select id="settlement-score-mode" ${disabled}><option value="apply">现在自动加分</option><option value="recorded">旧存档已手动加分，仅登记</option></select></label><label><input id="settlement-confirm" type="checkbox" ${disabled}> 确认选择与计分方式</label><button id="settle-phase-task" data-task-id="${esc(progress.key)}" ${disabled||!available.length?'disabled':''}>确认本方目标计分</button>`;
}
export function renderSettlementJournal(s){
 const rows=s.settlementJournal||[];if(!rows.length)return '';
 return `<details class="settlement-journal"><summary>最近结算记录 · ${rows.length}条</summary><p>保存实际数值变化；新局事件的逐牌结果见右侧事件记录。</p>${rows.slice(-12).reverse().map(row=>`<article><b>第${row.round}轮 · ${names[row.player]||row.player} · ${esc(row.title)}</b>${row.mode==='manual'?' <span>（手动核对／记录）</span>':row.mode==='assisted'?' <span>（含旧存档历史核对）</span>':''}<p>${row.changes.flatMap(change=>change.items.map(item=>`<span data-army-owner="${change.player}">${names[change.player]} ${esc(item.label)} ${item.delta>0?'+':''}${item.delta}</span>`)).join('；')||'没有资源或分数变化'}${row.researchDelta?`；研究力 ${row.researchDelta>0?'+':''}${row.researchDelta}`:''}${row.scoreMode==='recorded'?`；已加${row.points}分，仅登记`:''}</p>${row.finalAwards?'<p>本次分数变化包含终局未用资产／行政命令奖励，明细见终局面板。</p>':''}</article>`).join('')}</details>`;
}
