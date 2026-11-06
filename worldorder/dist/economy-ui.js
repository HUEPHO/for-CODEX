import {renderProductionMatrix,readProductionMatrix,syncProductionMatrix,syncProductionPreview} from './domestic-production-ui.js';
import {renderArmyDeployment} from './army-deployment-ui.js';
import {resolveFocus,FOCUSES,RESOURCE_LABELS,ECONOMY,focusOptions,prosperityOffer} from './economy.js';
import {hasGrowth} from './growth-effects.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderEconomy(s){if(!s.economyVersion)return '<p class="minor">旧存档保留手动生产与繁荣；新桌面启用自动经济结算。</p>';const p=s.players[s.current];return `<details class="economy-tracks"><summary>产能与繁荣 · 繁荣 ${p.prosperity}/5</summary><p class="minor">产能不是库存。下列加减仅用于尚未自动实现的卡牌效果，费用需另行处理。</p>${s.eventVersion&&s.flow?.step==='events'&&s.flow.eventResolution?.mode==='manual'?'<p>人工事件繁荣登记（费用和奖励另行处理）：<button data-event-prosperity="-1">降低1级</button><button data-event-prosperity="1">提高1级</button></p>':''}<div class="resources">${p.production.map((n,k)=>`<div class="resource"><span>${RESOURCE_LABELS[k]}产能</span><strong>${n}/${ECONOMY[s.current].max[k]}</strong><button data-production="${k}" data-delta="-1" aria-label="减少${RESOURCE_LABELS[k]}产能">−</button><button data-production="${k}" data-delta="1" aria-label="增加${RESOURCE_LABELS[k]}产能">+</button></div>`).join('')}</div></details>`;}
export function renderFocus(s,cards={}){
 const id=s.flow.order[s.flow.checks.length],p=s.players[id],options=focusOptions(id,p.focus,p,s.round),disabled=s.current!==id?'disabled':'';
 if(s.flow.focusProduction)return `<div id="focus-production"><b>${p.focus} · 生产</b><fieldset ${disabled}>${renderProductionMatrix({...s,current:id},{allowedProductionKeys:options.produce})}<p id="focus-preview" aria-live="polite"></p><button id="confirm-focus">完成焦点生产</button></fieldset></div>`;
 return `<div class="focus-options">${FOCUSES.map(focus=>`<button type="button" data-focus="${focus}" data-command="focus" class="${focus===p.focus?'gold':''}" aria-pressed="${focus===p.focus}" ${disabled}>${focus}</button>`).join('')}</div>${renderQuickResponse(s)}<fieldset ${disabled}><legend>重整盟国 · 最多${options.ready}个</legend>${(p.exhaustedAllies||[]).map(cid=>`<label><input type="checkbox" data-focus-ready="${cid}"> ${esc(cards[cid]?.name||cid)}</label>`).join('')||'没有已横置盟国'}</fieldset><fieldset ${disabled}><legend>产能升级 · 最多${options.maxUpgrades}种</legend><p>升级一种花${ECONOMY[id].upgrade}资金${options.maxUpgrades===2?'；两种共15资金':''}</p>${options.upgrades.map(k=>`<label><input type="checkbox" data-focus-upgrade="${k}" ${p.production[k]>=ECONOMY[id].max[k]?'disabled':''}> ${RESOURCE_LABELS[k]} ${p.production[k]} → ${Math.min(p.production[k]+1,ECONOMY[id].max[k])}</label>`).join('')}</fieldset><button id="prepare-focus" data-command="prepareFocus" ${disabled}>继续生产</button>`;
}
export function renderQuickResponse(s){
 const p=s.players[s.current];if(!hasGrowth(p,s.round,'quick'))return '';
 if(p.focus!=='军事焦点')return '<fieldset><legend>快速反应部队 · 可选</legend><label><input id="quick-army" type="checkbox"> 先花5资金获得1支待命军队，再结算焦点</label></fieldset>';
 return renderArmyDeployment(s,{id:'quick-deployment',maxMoves:1});
}
export function renderProsperity(s){const id=s.flow.order[(s.flow.prosperityDone||[]).length],p=s.players[id],offer=prosperityOffer(p,id,s.round),disabled=s.current!==id?'disabled':'';return `<b>余波 · ${names[id]}选择繁荣提升</b><p>当前繁荣 ${p.prosperity}/5 · 消费品 ${p.resources[3]}</p><p>${offer?`支付${offer.cost}消费品，获得${offer.vp}分、${offer.money}资金。`:'已达到最高等级。'}每轮只能提升一格。</p><button id="improve-prosperity" ${disabled||!offer||p.resources[3]<offer.cost?'disabled':''}>提升一格</button><button id="skip-prosperity" ${disabled}>本轮跳过</button>`;}

export function readFocusQuantities(){const quantities=Array(7).fill(0);for(const {key,quantity} of readProductionMatrix())quantities[key]=quantity;return quantities;}
export function updateFocusProduction(s){
 const form=document.querySelector('#focus-production');if(!form)return;
 syncProductionMatrix();const button=form.querySelector('#confirm-focus'),output=form.querySelector('#focus-preview');
 if(s.current!==s.flow.order[s.flow.checks.length]){button.disabled=true;return;}
 try{const preview=resolveFocus(structuredClone(s),{quantities:readFocusQuantities()});syncProductionPreview(preview);output.textContent='';button.disabled=false;}catch(error){output.textContent=error.message;button.disabled=true;}
}
