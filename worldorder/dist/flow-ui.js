import {availableExecutive} from './special-cards.js';
import {renderEventPanel} from './event-ui.js';
import {renderSequencePanel,renderSequenceReport} from './card-sequence-ui.js';
import {renderOpenRelation} from './growth-triggers-ui.js';
import {renderGrowthPending} from './growth-active-ui.js';
import {GROWTH_DATA} from './growth-data.js';
import {renderWorldAftermath,renderWinners} from './world-ui.js';
import {renderFocus,renderProsperity} from './economy-ui.js';
import {researchPreview,countryValue} from './research.js';
import {ALLY_BACK_IMAGES} from './ally-card-art.js';
import {ACTION_CARDS} from './basic-actions.js';
import {currentActor as flowActor,aftermathSteps} from './phase-state.js';
import {renderPhaseOverview,renderPhaseSettlement} from './phase-ui.js';
import {activeInteraction} from './interaction-state.js';
import {renderIncomeEffects} from './event-income-ui.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
const interactionRenderers={event:renderEventPanel,income:renderIncomeEffects,growth:renderGrowthPending,relation:renderOpenRelation,sequence:renderSequencePanel};
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function researchAllies(s,actor,cards,disabled){const p=s.players[actor];
 return `<div class="research-allies" role="group" aria-label="消耗盟国获得研究力">${p.allies.map(id=>{const c=cards[id],value=countryValue(id),used=p.exhaustedAllies?.includes(id),undo=used&&s.flow.research.consumedAllies?.includes(id),label=`${c.name} · ${undo?'右键取消消耗，退回'+value+'研究力':used?'研究前已消耗':'左键消耗，获得'+value+'研究力'}`;
  return `<button type="button" class="research-ally${used?' is-exhausted':''}${undo?' can-undo':''}" ${undo?`data-command="undoResearchAlly" data-research-undo="${id}"`:'data-card-action="researchAlly"'} data-id="${id}" title="${esc(label)}" aria-label="${esc(label)}" ${disabled||used&&!undo?'disabled':''}><img src="${used?(ALLY_BACK_IMAGES[id]||c.image):c.image}" alt=""><span class="research-ally-value" aria-hidden="true">${value}</span></button>`;
 }).join('')}</div>`;
}
export function renderFlow(s,cards={}){
 const f=s.flow;if(!f)return renderEventPanel(s,cards)||'<p class="board-caption">所有玩家完成开局选牌后，开始六轮流程。</p>';
 const actor=flowActor(s),disabled=actor&&actor!==s.current?'disabled':'';
 let body='';
 if(f.step==='actions')body=`轮到${names[actor]}，本方已完成${s.actionTurns.completed[actor]}/4次行动。拖动或点击手牌，选择效果与目标后确认。结算完成会自动轮转；有额外出牌时可继续或结束本次行动。`;
 if(f.step==='actions'&&s.current===actor){
  if(f.extraCard)body=`<b>${f.extraCard.name||'战略优势'} · 继续出牌</b><p>${f.extraCard.cardId?'必须打出刚刚免费研究的卡牌。':'可以追加一张手牌、战略资产或行政命令，也可放弃后续出牌并结束行动。'}</p>${f.extraCard.cardId?'<button data-card="'+f.extraCard.cardId+'" data-source="hand">查看并打出指定卡牌</button>':''}${!f.extraCard.cardId||!s.players[actor].hand.length?'<button id="end-action">结束本次行动</button>':''}`;
  else if((f.extraQueue?.length||(!f.extraCardSpent&&!f.growthExtraGranted))&&f.turnCards?.length>=1&&s.actionTurns.completed[actor]===0&&s.players[actor].growth.some(id=>GROWTH_DATA[id]?.effect==='extra'&&GROWTH_DATA[id].level<=s.round))body+='<p>战略优势已生效：结算完第一张牌后，可选择追加一张。</p><button id="continue-extra-card">追加出牌</button>';
 }
 if(f.step==='research'){
  body=`<b>轮到${names[actor]}研究（${f.index+1}/${f.order.length}）</b>`;
  if(!f.research){const preview=researchPreview(s,actor);if(preview.incomePending)body+=`<fieldset ${disabled}><legend>收入优化 · 选择${preview.incomeCount}张手牌</legend><p>所选牌的上半部奖励再领取一次，不额外获得研究力。</p>${s.players[actor].hand.map(id=>`<label><input type="checkbox" data-income-card="${id}"> ${ACTION_CARDS[id]?.name||'能力牌'} <button data-card="${id}" data-source="view">查看</button></label>`).join('')}</fieldset><button id="start-research" ${disabled}>确认选择并开始研究</button>`;}
  else body+=`<p class="research-balance">剩余研究力 <strong>${f.research.remaining}</strong> · 已花费 ${f.research.spent}</p>${researchAllies(s,actor,cards,disabled)}<button id="research-refresh" ${disabled||f.research.remaining<2?'disabled':''}>花2研究力刷新最右3张</button><button id="finish-research" ${disabled}>结束研究并弃置剩余手牌</button>`;
 }
 if(f.step==='events')body='<b>事件阶段 · 手动结算</b><p>依次处理公共事件（从右到左）、按行动顺序处理个人事件及连锁效果。</p><label><input id="flow-confirm" type="checkbox"> 所有事件已结算并记录资源、分数变化</label><button id="confirm-events">确认事件完成</button>';
 if(f.step==='aftermath'){const steps=aftermathSteps(s),step=steps[f.checks.length];body=`<b>余波 ${f.checks.length+1}/${steps.length} · ${step}</b><p>按规则为四方手动结算此项，并在玩家面板记录变化。${s.round===6?'未用战略资产每张2分将由程序在结束时统一追加，请勿重复加分。':''}</p><label><input id="flow-confirm" type="checkbox"> 四方此项已完成</label><button id="confirm-aftermath">确认${step}</button>`;}
 if(f.step==='roundEnd')body=`<b>第${s.round}轮完成</b><p>进入下一轮后各抽6张，牌库不足时自动洗弃牌堆。</p><button id="next-round">进入第${s.round+1}轮</button>`;
 if(f.step==='countries')body='<b>准备 · 更新国家牌</b><p>将每个地区左堆顶牌移到右堆；左堆耗尽时按规则重新分堆。</p><button id="confirm-countries">更新七个地区并开始选顺位</button>';
 if(f.step==='order')body=`<b>轮到${names[actor]}选择行动位置</b><p>选择优先次序：${f.draft.queue.map(x=>names[x]).join(' → ')}（低分优先，同分看当前资金，再看起始资金）。</p>${f.draft.slots.map((id,i)=>`<button data-order-slot="${i}" ${id||disabled?'disabled':''}>第${i+1}位${id?' · '+names[id]:''}</button>`).join('')}`;
 if(f.step==='production')body='<b>准备 · 初级资源生产</b><p>按各自生产轨手动增加能源、原料和粮食；生产轨尚未自动计算。</p><label><input id="flow-confirm" type="checkbox"> 四方生产已记录</label><button id="confirm-production">确认初级资源生产</button>';
 if(f.step==='focus')body=`<b>准备 · ${names[f.order[f.checks.length]]}选择焦点</b><p>在玩家面板选择焦点，并按面板手动支付费用、执行即时效果。</p><label><input id="flow-confirm" type="checkbox"> 本方焦点效果已记录</label><button id="confirm-focus" ${s.current!==f.order[f.checks.length]?'disabled':''}>确认本方焦点</button>`;
 if(s.economyVersion){
  if(f.step==='production')body='<b>准备 · 初级资源生产</b><p>按各自产能自动增加能源、原料、粮食；库存超过10的部分每个折为3资金。特殊卡牌修正仍需手动处理。</p><button id="confirm-production">为所有玩家生产初级资源</button>';
  if(f.step==='focus')body=renderFocus(s,cards);
  if(f.step==='aftermath'&&aftermathSteps(s)[f.checks.length]==='繁荣提升')body=renderProsperity(s);
 }
 if(f.step==='ended')body=`<b>六轮结束</b><p>${[...f.order].sort((a,b)=>s.players[b].vp-s.players[a].vp).map(id=>names[id]+' '+s.players[id].vp+'分').join(' · ')}</p><p>平分时，依次比较最终计分获得地区第一名的次数、地图总影响力；仍相同则共同获胜。上述平分判定需手动核对。</p>`;
 if(s.worldVersion&&f.step==='aftermath')body=renderWorldAftermath(s,aftermathSteps(s)[f.checks.length])||body;
 if(s.worldVersion&&f.step==='ended')body=`<b>六轮结束</b><p>${[...f.order].sort((a,b)=>s.players[b].vp-s.players[a].vp).map(id=>names[id]+' '+s.players[id].vp+'分').join(' · ')}</p>`+renderWinners(s);
 body=renderPhaseSettlement(s,cards)||body;
 const interaction=activeInteraction(s);
 if(interaction)body=interactionRenderers[interaction.kind](s,cards)||body;
 if(f.battlefieldReturn)body='<p>战役优势的即时资产结算中；完成后继续原行动。</p>'+body;
 return `${renderPhaseOverview(s)}<section class="flow-panel" aria-label="回合流程" aria-live="polite">${body}${renderSequenceReport(s)}</section>`;
}
