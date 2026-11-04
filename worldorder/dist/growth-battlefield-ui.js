import {ASSET_STOCK} from './asset-stock.js';
import {SPECIAL_CARDS} from './special-data.js';
import {battlefieldAssetIssue} from './growth-battlefield-availability.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderBattlefieldPending(s,cards){
 const pending=s.flow.pendingGrowth;
 if(pending.stage==='keep')return `<b>战役优势 · 立即选择战略资产</b><p>选择1张保留并获得其牌面分数，另一张放回盒中。候选仅本人可见。</p><div class="growth-choice-grid">${pending.candidates.map(id=>`<label class="growth-choice"><img src="${esc(cards[id]?.image)}" alt="${esc(SPECIAL_CARDS[id]?.name)}"><span><input type="radio" name="battlefield-keep" data-growth-choice="${id}"> 保留${esc(SPECIAL_CARDS[id]?.name)} · ${ASSET_STOCK[id].vp}分</span></label>`).join('')}</div><button id="finish-growth-choice">确认保留资产并加分</button>`;
 return `<b>战役优势 · 可立即使用1张未使用资产</b><p>本次无需盖手牌。仍需支付所选资产本身的费用；效果完成后继续原行动。</p><div class="growth-choice-grid">${s.players[s.current].assets.map(id=>{const issue=battlefieldAssetIssue(s,id);return `<section class="growth-choice"><img src="${esc(cards[id]?.image)}" alt="${esc(SPECIAL_CARDS[id]?.name)}"><span>${esc(SPECIAL_CARDS[id]?.name)}</span>${issue?`<p>${esc(issue)}</p>`:''}<button data-battlefield-asset="${id}" ${issue?'disabled':''}>立即使用${esc(SPECIAL_CARDS[id]?.name)}</button></section>`;}).join('')}</div><button id="skip-battlefield-asset">放弃即时使用，继续原行动</button>`;
}
