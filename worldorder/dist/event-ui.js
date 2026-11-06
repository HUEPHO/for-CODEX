import {renderEventLinks} from './event-related-cards.js';
import {renderArmyDeployment} from './army-deployment-ui.js';
import {liveAgreement} from './interaction-state.js';
import {renderAgreementForm,renderAgreementReward,renderAgreementSummary} from './event-agreements-ui.js';
import {renderSpecialPersonalEvent} from './event-special-personal-ui.js';
import {renderBidForm,renderBidReward,renderBidSummary} from './event-bids-ui.js';
import {renderPersonalEvent,renderEventInvestment} from './event-personal-ui.js';
import {renderEventEffects} from './event-effects-ui.js';
import {renderIncomeHistory} from './event-income-ui.js';
import {EVENT_DATA} from './event-data.js';
import {AUTO_EVENTS,REPEAT_EVENTS,eventActor,canPostponeEvent} from './event-flow.js';
import {EVENT_CHAINS} from './event-board.js';
import {RESOURCE_LABELS} from './economy.js';
import {AREAS} from './world.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cardButton=id=>`<button class="event-card-link" data-card="${id}" data-source="view">${EVENT_DATA[id].name}</button>`;
const changes=rows=>rows.map(row=>`<span data-army-owner="${row.player}">${names[row.player]}：${row.items.map(i=>esc(i.label)+(i.delta>0?'+':'')+i.delta).join('、')}</span>`).join('；');
function receipt(rows=[]){return rows.map(r=>`<p data-army-owner="${r.player||''}">${r.player?names[r.player]+' · ':''}${esc(r.detail)}${r.changes?.length?'<br>'+changes(r.changes):''}</p>`).join('');}
export function renderEventPanel(s,cards={}){
 if(!s.eventVersion)return '';
 const c=s.eventBoard.choice,q=s.flow?.eventResolution,actor=eventActor(s),disabled=actor!==s.current?'disabled':'';
 if(c){
  const body=c.type==='personal'?`<p>同一方最多保留1张个人事件。请选择保留哪张，另一张弃置。</p>${c.candidates.map(id=>`<div>${cardButton(id)} <button data-keep-event="${id}" ${disabled}>保留此事件</button></div>`).join('')}`:
   `<p>北约阿富汗增兵与撤军 · 揭示时可将至多2支军队移入中亚，每支支付5资金，也可不移动。</p><fieldset ${disabled}>${renderArmyDeployment(s,{id:'reveal-deployment',owner:actor,maxMoves:2,destinations:['C'],normalDestinations:['C'],source:Object.keys(AREAS).filter(id=>id!=='C')})}<button id="event-reveal">确认揭示时移动</button></fieldset>`;
  return `<b>事件补充 · ${names[actor]}选择</b>${body}`;
 }
 if(s.flow?.step!=='events'||!q)return '';
 const p=s.players[s.current];let body='';
 if(q.stage==='result'){
  body=`${q.agreementVersion?renderAgreementSummary(q):q.bidVersion?renderBidSummary(q):''}<p>${esc(q.result)}</p>${renderEventInvestment(q,cards)}${!q.bidVersion&&!q.agreementVersion&&Object.keys(q.submissions).length?'<p>公开提交：'+Object.entries(q.submissions).map(([id,n])=>names[id]+' '+n).join('，')+'</p>':''}${!q.bidVersion&&!q.agreementVersion&&q.totals?`<p>美国总投标 ${q.totals.US}（资金修正+${q.totals.modifier}）；俄罗斯与中国 ${q.totals.RU_CN}</p>`:''}${receipt(q.receipts.map(r=>r.detail===q.result?{...r,detail:'本事件数值变化'}:r))}<button id="event-ack" ${disabled}>核对结果并继续下一事件</button>`;
 }else if(q.stage==='reward'){body=q.agreementVersion?renderAgreementReward(s,q,cards):renderBidReward(s,q,cards);
 }else{
  if(q.agreementVersion)body=renderAgreementForm(s,q,cards);
  else if(q.mode==='special')body=renderSpecialPersonalEvent(s,q,cards);
  else if(q.mode==='personal')body=renderPersonalEvent(s,q,cards);
  else if(q.mode==='bid'&&q.bidVersion)body=renderBidForm(s,q);
  else if(q.mode==='bid')body=`<p>各方用外交秘密投标。美国每有20资金获得+1修正。全员提交后同时揭晓并扣费，胜方获得自己投标一半的SP（向下取整），败方获得自己投标数的SP，再结算牌面效果。</p><label>本方投标（0～${p.resources[5]}）<input id="event-amount" type="number" min="0" max="${p.resources[5]}" value="0"></label>`;
  else if(q.mode==='agreement')body=`<p>欧盟与俄罗斯共同支付5外交，双方均须出资。各获得2分，并按各自支付量获得SP，并弃置对俄制裁效果牌；否则双方各失去2分，触发入侵乌克兰连锁。此处提交为提案，达成协议后才扣费。</p>${Object.entries(q.submissions).map(([id,n])=>'<p>'+names[id]+'承诺：'+n+'外交</p>').join('')}<label>本方承诺外交（0表示不参与）<input id="event-amount" type="number" min="0" max="${Math.min(4,p.resources[5])}" value="0"></label>`;
  else if(q.mode==='aid')body=`<label>援助次数（0表示不参与）<input id="event-amount" type="number" min="0" max="${Math.min(Math.floor(p.money/10),p.resources[2])}" value="0"></label>`;
  else if(q.mode==='paris')body=`<p>选择至多两种产能。</p>${p.production.map((n,k)=>`<label><input type="checkbox" data-event-production="${k}" ${n<=1?'disabled':''}>${RESOURCE_LABELS[k]}产能 ${n}${n<=1?'（最低值）':''}</label>`).join('')}`;
  else if(q.mode==='crisis'){
   const start={US:30,CN:20,EU:25,RU:15}[s.current],options=p.production.map((n,k)=>n>1?`<option value="${k}">${RESOURCE_LABELS[k]}（${n}→${n-1}）</option>`:'').join('');
   body=`<p>初始资金 ${start}；当前资金 ${p.money}。${p.money>=start*2?'获得2分。':p.money>start?'降低1种产能。':'降低1种产能、繁荣降低1级，并失去2分。'}最低产能为1，最低繁荣为0；已到最低值时继续其余效果。</p>${p.money<start*2?(options?`<label>降低产能<select id="event-production-key">${options}</select></label>`:'<p>所有产能已到最低值，无需选择。</p>'):''}`;
  }else body=`<p><b>本牌效果暂需人工结算。</b>先查看牌面，在下方和地区面板记录涉及本方的变化。程序只管理处理顺序、延期、连锁及确认，不另行扣费或发奖。未涉及的玩家直接确认。</p>${(EVENT_CHAINS[q.cardId]||[]).map(id=>`<label><input type="checkbox" data-event-chain="${id}" ${q.chains.includes(id)?'checked disabled':''}>牌面条件已满足，加入下一轮：${EVENT_DATA[id].name}</label>`).join('')}${REPEAT_EVENTS.includes(q.cardId)?'<label><input id="event-repeat" type="checkbox" '+(q.repeat?'checked disabled':'')+'>已满足牌面的再次结算条件，保留至下轮</label>':''}<label><input id="event-confirm" type="checkbox">本方相关费用与效果已记录</label>`;
  if(!liveAgreement(s))body=`<fieldset ${disabled}>${body}<button id="event-submit">${q.mode==='bid'?'提交秘密投标':q.mode==='agreement'?'提交协议提案':q.mode==='manual'?'确认本方人工结算':'执行本方选择'}</button>${canPostponeEvent(s)?'<button id="event-postpone">支付1 SP，延期到下轮</button>':''}</fieldset>`;
 }
 if(liveAgreement(s))return `${cardButton(q.cardId)}${renderEventLinks(q.cardId,cards)}${body}`;
 return `${cardButton(q.cardId)}${renderEventLinks(q.cardId,cards)}${q.participants.length>1?`<p>已提交 ${q.done.length} / ${q.participants.length}</p>`:''}${body}`;
}
export function renderEventBoard(s,card,cards={}){
 const b=s.eventBoard;
 return `<h2>第${b.round}轮事件</h2><p>公共事件从右到左处理，再按行动顺序处理个人事件。</p><div class="event-slots">${b.slots.map((id,i)=>`<div><b>第${i+1}格${i===2?' · 最先':''}</b>${id?card(id,'view'):'<p>空位</p>'}</div>`).join('')}</div>${renderEventEffects(s)}<h3>个人事件</h3>${Object.entries(b.personal).map(([owner,id])=>`<p>${names[owner]}：${id?cardButton(id):'无'}</p>`).join('')}<p>待加入连锁：${b.queued.map(id=>EVENT_DATA[id].name).join('、')||'无'}</p><p>${Object.keys(AUTO_EVENTS).length}张事件已接入自动结算，另有2张转折点在揭示时自动处理。已经开始人工结算的旧事件沿用原流程。</p><details><summary>事件结算记录 · ${s.eventHistory.length}</summary>${s.eventHistory.slice().reverse().map(h=>`<article><b>第${h.round}轮 · ${EVENT_DATA[h.cardId].name}</b>${h.agreementVersion?renderAgreementSummary(h):h.bidVersion?renderBidSummary(h):''}${renderEventInvestment(h,cards)}${receipt(h.receipts)}</article>`).join('')||'<p>暂无</p>'}</details>${renderIncomeHistory(s)}<details><summary>已弃置事件 · ${s.eventDiscard.length}</summary>${s.eventDiscard.map(cardButton).join('')}</details>`;
}
