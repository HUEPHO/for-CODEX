import {renderBattlefieldPending} from './growth-battlefield-ui.js';
import {renderCooperation,renderCooperationPending} from './growth-cooperation-ui.js';
import {GROWTH_DATA} from './growth-data.js';
import {growthAbilityPreview,extraCardAvailable,requiredGrowthCards} from './growth-active.js';
import {ACTION_CARDS as BASIC_CARDS} from './basic-actions.js';
import {TWO_TYPE_CHOICE} from './ability-types.js';
import {resourceEfficiencyPreview,rewardSummary,TYPE_REWARDS} from './growth-resource.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=(id,cards)=>cards[id]?.name||BASIC_CARDS[id]?.name||'能力牌';
export function renderGrowthAbility(s,id,cards={}){
 const g=GROWTH_DATA[id];if(!g)return '';
 if(g.effect==='battlefield')return '<p>购入时立即抽2张本方战略资产留1张、获得牌面分数，并可无需盖手牌立即使用1张未使用资产。此效果只执行一次。</p>';
 const notes={quick:'准备阶段确认焦点时选择购兵或免费移动。',income:'研究开始时选择两张剩余手牌，再领取一次上半部奖励，不增加研究力。',living:'提升繁荣自动少付1消费品，多得1分。',dominance:'每次行动放置过影响力，行动结束自动获得1分；重置和转换不算放置。',authority:'地区计分时影响力相同优先获胜，随后才比较军队；不改变目标与多数比较。',nuclear:'所有地区威胁与防御各加1，包括没有本方军队的地区。'};
 if(notes[g.effect])return `<p>${(s.players[s.current].automatedGrowth||[]).includes(id)?s.round<g.level?'第'+g.level+'轮开始自动生效。':'已启用自动结算。':'旧手动购入记录保持手动结算，避免重复应用。'}${notes[g.effect]}</p>`;
 if(['open','resilience'].includes(g.effect))return '<p>'+ (s.round<g.level?'第'+g.level+'轮生效。':s.players[s.current].growthUsed?.[id]===s.round?'本轮已使用。':'本轮尚未使用。')+(g.effect==='open'?'在结盟操作框勾选开放外交，结算第一国后选择第二国。':'在添加影响力的操作框选择转换时机与本方临时影响力。')+'市场牌或资产的手动效果仍需手动处理。</p>';
 if(!['exchange','trim','leadership','efficiency','cooperation','extra'].includes(g.effect))return '';
 if(g.effect==='extra')return '<p>每轮第一次行动可追加一张牌；自动结算第一张后保留本方回合，可继续出牌或结束行动。手动结算第一张后，在流程栏选择追加出牌。</p>';
 let preview;try{preview=growthAbilityPreview(s,id);}catch(error){return `<p class="viewer-meta">${esc(error.message)}</p>`;}
 if(g.effect==='cooperation')return renderCooperation(s,id,cards);
 return `<section class="flow-panel"><b>${g.name} · 每轮一次 · 仅行动阶段</b><p>${g.effect==='efficiency'?'抽1张，弃置1张手牌，并按每个类型图标获得资源；战略再评估仅选两种。':g.effect==='leadership'?'弃置全部'+preview.maximum+'张手牌，再抽取等量牌。牌库不足时正常洗入弃牌；本轮已打出的牌保持原位。':g.effect==='exchange'?'按就绪盟国的最高价值，抽至多'+preview.maximum+'张，然后弃置实际抽到的等量手牌。':'抽1张，然后从手牌移除1张，移出游戏。'}</p>${g.effect==='exchange'?`<label>抽取张数<input id="growth-draw-count" type="number" min="0" max="${preview.maximum}" value="${preview.maximum}"></label>`:''}<button data-card-action="useGrowthAbility" data-id="${id}">使用能力并抽牌</button></section>`;
}
export function renderGrowthPending(s,cards){
 const pending=s.flow?.pendingGrowth;if(!pending)return '';
 if(pending.owner!==s.current)return '<b>等待对方完成发展牌选择</b><p>候选牌仅本人可见；完成后继续原流程。</p>';
 if(pending.effect==='cooperation')return renderCooperationPending(s,cards);
 if(pending.effect==='battlefield')return renderBattlefieldPending(s,cards);
 return `<b>${GROWTH_DATA[pending.cardId].name} · 完成选牌</b><p>已抽${pending.drawn.length}张；选择${pending.choose}张手牌${pending.effect==='trim'?'移出游戏':'弃置'}。选择完成前暂停其他操作。</p><div class="growth-choice-grid">${s.players[pending.owner].hand.map(id=>`<label class="growth-choice"><img src="${esc(cards[id]?.image||'')}" alt="${esc(name(id,cards))}"><span><input type="checkbox" data-growth-choice="${id}" ${requiredGrowthCards(s).includes(id)?'disabled':''}> ${esc(name(id,cards))}${requiredGrowthCards(s).includes(id)?' · 必须保留':''}${pending.effect==='efficiency'?(TWO_TYPE_CHOICE.has(id)?' · 下方选择两种奖励':' · '+esc(rewardSummary(resourceEfficiencyPreview(id)))):''}${pending.drawn.includes(id)?' · 刚抽到':''}</span></label>`).join('')}</div>${pending.effect==='efficiency'&&s.players[pending.owner].hand.some(id=>TWO_TYPE_CHOICE.has(id))?`<fieldset><legend>若弃置战略再评估，选择两种奖励</legend>${['diplomatic','economic','military'].map(type=>`<label><input type="checkbox" data-growth-reward="${type}"> ${TYPE_REWARDS[type].name}：${rewardSummary([TYPE_REWARDS[type]])}</label>`).join('')}</fieldset>`:''}<button id="finish-growth-choice">确认所选手牌</button>`;
}
export function renderExtraAsset(s,id,cards){if(s.flow.extraCard?.cardId||!extraCardAvailable(s)||!s.players[s.current].assets.includes(id))return '';const hand=s.players[s.current].hand;return `<section class="flow-panel"><b>继续出牌 · 使用战略资产</b>${hand.length?`<label>盖放一张手牌<select id="extra-asset-cover">${hand.map(cid=>`<option value="${cid}">${esc(name(cid,cards))}</option>`).join('')}</select></label>`:'<p>手牌为空，无需盖牌。</p>'}<button data-card-action="playExtraAsset" data-id="${id}">盖牌并使用此资产</button><p>资产效果仍需手动结算；完成后结束行动。</p></section>`;}
