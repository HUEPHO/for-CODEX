import {INCOME_RULES,incomeEffects,incomeChoiceModel} from './event-income-rules.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const receipts=rows=>rows.map(r=>`<p>${names[r.player]} · ${esc(r.detail)}</p>`).join('');
export function incomeEffectNotice(s,owner){const ids=incomeEffects(s,owner);return ids.length?`<p>领取基础收益后，还将结算：${ids.map(id=>esc(INCOME_RULES[id].name)).join('、')}。每项每轮仅一次；需要他方回应时自动交给相应席位。</p>`:'';}
export function renderIncomeEffects(s){
 const model=incomeChoiceModel(s);if(!model)return '';
 const q=s.flow.pendingIncome;
 const button=option=>`<button data-income-effect="${esc(option.effectId)}" data-income-choice="${esc(option.choice)}" ${option.issue||model.actor!==s.current?'disabled':''}>${esc(option.label)}</button>`;
 const groups=model.groups.map(group=>`<fieldset><legend>${esc(group.name)}</legend>${group.prompt?'<p>'+esc(group.prompt)+'</p>':''}${group.issue?'<p>'+esc(group.issue)+'</p>':''}${group.options.map(option=>`${option.unavailableText?'<p>'+esc(option.unavailableText)+'</p>':''}${button(option)}`).join('')}</fieldset>`).join('');
 const body=model.issue?`<p>${esc(model.issue)}</p>`:`${model.active?'':'<p>选择一项结算；若有多项，可自行决定先后顺序。</p>'}${groups}`;
 return `<b>持续事件收益 · ${names[model.actor]?names[model.actor]+'操作':'等待核对'}</b><p>${names[q.owner]}本轮基础投资收益${q.base.fdi}资金、撤回介入收益${q.base.engage}资金已领取，后续不会重复发放。</p>${body}<details open><summary>本次持续效果记录</summary>${receipts(q.receipts)||'<p>尚未处理持续效果。</p>'}</details>`;
}
export function renderIncomeHistory(s){return `<details><summary>持续效果收益记录 · ${(s.incomeEffectHistory||[]).length}</summary>${(s.incomeEffectHistory||[]).slice().reverse().map(q=>`<article><b>第${q.round}轮 · ${names[q.owner]}</b>${receipts(q.receipts)}</article>`).join('')||'<p>暂无</p>'}</details>`;}
