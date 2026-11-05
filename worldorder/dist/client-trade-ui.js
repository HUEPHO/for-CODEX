import {renderRegionalTradeChoice} from './regional-trade-ui.js';
import {AREAS} from './world.js';
import {resourceIconPath} from './resource-icons.js';
import {COMMERCE,TRADE_LIMITS} from './commerce.js';
import {RESOURCE_LABELS} from './economy.js';
import {EXPORT_PRICE,IMPORT_PRICE,tradeCapacity} from './trade.js';
import {eventTradeRegions} from './event-effects.js';
import {renderEventEffects} from './event-effects-ui.js';

const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
const keys=[0,1,2,3,4,6],icons=['energy','raw','food','goods','services','diplomacy','army'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regionOrder=['M','E','C','P','A','N','S'];

function stepper(id,attributes,max,label){
 return `<span class="client-trade-stepper"><button type="button" data-trade-step="-1" data-trade-input="${id}" aria-label="减少${label}" disabled>−</button><input id="${id}" type="number" ${attributes} min="0" max="${max}" value="0" step="1" aria-label="${label}"><button type="button" data-trade-step="1" data-trade-input="${id}" aria-label="增加${label}" ${max<1?'disabled':''}>+</button></span>`;
}
function partners(s,card,key){
 if(key===6||card.playersTrade===false)return '<span class="client-trade-no-partner" aria-hidden="true"></span>';
 const sellers=Object.entries(COMMERCE).filter(([id,c])=>id!==s.current&&c.resources.includes(key));
 if(!sellers.length)return '<span class="client-trade-no-partner" aria-hidden="true"></span>';
 return `<details class="client-trade-partners"><summary>向玩家进口 <b data-trade-partner-total="${key}">0</b></summary><div class="client-trade-partner-list">${sellers.map(([id,c])=>{
  const ready=s.players[id].commerce.filter(c=>c.ready).length,max=ready?c.quantity:Math.min(c.quantity,s.players[id].resources[key]);
  return `<div class="client-trade-partner" data-partner="${id}"><b>${names[id]}</b><small>${ready?'专供出口 '+ready+' 张可用':'使用库存'} · 上限 ${max}</small>${stepper('trade-player-'+id+'-'+key,`data-import-player="${id}" data-import-key="${key}"`,max,'从'+names[id]+'进口'+RESOURCE_LABELS[key])}</div>`;
 }).join('')}</div></details>`;
}
function exports(s,card,cap,key){
 const stock=s.players[s.current].resources[key],maximum=Math.min(stock,cap.exports[key]);
 return stepper('trade-export-'+key,`data-export-key="${key}"`,maximum,'出口'+RESOURCE_LABELS[key]);

}
function explanation(card){
 const bonus=card.regionalInfluence;
 return [
  card.maxTradeTypes?'本段合计只能交易'+card.maxTradeTypes+'种资源，进口或出口任选。':'',
  card.tradeOnlyRegions?'本段仅使用'+card.tradeOnlyRegions.map(id=>AREAS[id].name).join('、')+'的盟国和展示国家。':'',
  card.virtualRegions?.length?'本段额外使用'+card.virtualRegions.map(id=>AREAS[id].name).join('、')+'展示国家的贸易符号。':'',
  bonus?'先选择贸易数量，再选择奖励地区；同一份出口不能重复用于多个地区。'+(bonus.regions||Object.keys(AREAS)).map(id=>AREAS[id].name).join('、')+'各自满足'+(bonus.minimumRevenue?'出口收入至少'+bonus.minimumRevenue+'资金（不扣进口支出，不含其他奖励）':Object.entries(bonus.requirements||{}).map(([k,n])=>'至少'+n+RESOURCE_LABELS[k]).join('和'))+'后，在该地区添加1影响力。':'',
  card.doubleEnergy?'能源进出口符号均按双倍计算。':'',
  card.doublePrimary?'选择能源或原材料，只有所选资源的盟国进出口符号计算两次。':'',
  card.currencyBonus?'每进口一种资源，贸易结束后获得5资金。':'',
  card.playersTrade===false?'本段不能向玩家进口。':'向国家付款交给银行，向玩家付款交给对方。玩家先使用专供出口商品卡，耗尽后才使用库存。向玩家进口至多奖励1外交；俄罗斯的单项进口不足3不产生该奖励。'
 ].filter(Boolean).join('');
}

/** Presentation of the existing trade form; its data attributes and action are
 * read and validated by the same trade/action modules as the browser form. */
export function renderPrimaryTradeChoice(card){
 if(!card.doublePrimary)return '';
 return `<fieldset class="trade-primary-choice"><legend>盟国贸易符号 ×2</legend>${[0,1].map(key=>`<label><input type="radio" name="trade-primary" data-trade-primary="${key}" value="${key}"${key===0?' checked':''}><span class="resource-icon resource-icon--${icons[key]}" role="img" aria-label="${key===0?'能源':'原材料'}" title="${key===0?'能源':'原材料'}" style="background-image:url('${resourceIconPath(icons[key])}')"></span><span data-keep-resource-text>${key===0?'能源':'原材料'}</span></label>`).join('')}</fieldset>`;
}
export function renderClientTradeForm(s,id,card){
 const p=s.players[s.current],cap=tradeCapacity(s,s.current,card,[],card.doublePrimary?0:undefined),limits=TRADE_LIMITS[s.current];
 const regions=s.config.wit&&!card.tradeOnlyRegions?regionOrder.filter(r=>!card.virtualRegions?.includes(r)&&!eventTradeRegions(s,s.current).includes(r)):[];
 return `<section id="basic-form" data-card-id="${esc(id)}" class="flow-panel client-trade-form"${card.regionalInfluence?' data-regional-trade data-regional-stage="trade"':''} data-army-owner="${s.current}">
  <header class="client-trade-heading"><b>${esc(card.name)}</b><span>进口 ≤ ${limits.imports} 种 · 出口 ≤ ${limits.exports} 种${card.maxTradeTypes?' · 合计 ≤ '+card.maxTradeTypes+' 种':''}</span></header>
  ${renderPrimaryTradeChoice(card)}
  <p class="client-trade-instruction">每种资源选择进口或出口。先出口，再按下表从左到右进口。</p>
  <div class="client-trade-content">
  <div class="client-trade-grid">${keys.map(key=>`<section class="client-trade-column" data-trade-resource="${key}" data-trade-stock="${p.resources[key]}" aria-label="${RESOURCE_LABELS[key]}">
   <div class="client-trade-cap client-trade-import-cap">${key<5?`国家可进口 <b data-import-cap="${key}">${cap.imports[key]}</b>`:'不可进口'}</div>
   <div class="client-trade-quantity client-trade-import">${key<5?`<small>进口 · ${IMPORT_PRICE[key]}资金 / 个</small>${stepper('trade-import-'+key,`data-import-country="${key}"`,cap.imports[key],'从国家进口'+RESOURCE_LABELS[key])}`:'<span class="client-trade-unavailable">—</span>'}</div>
   ${partners(s,card,key)}
   <div class="client-trade-resource"><span class="resource-icon resource-icon--${icons[key]}" role="img" aria-label="${RESOURCE_LABELS[key]}" title="${RESOURCE_LABELS[key]}"${key===6?'':` style="background-image:url('${resourceIconPath(icons[key])}')"`}></span><b data-keep-resource-text>${RESOURCE_LABELS[key]}</b><small>库存 ${p.resources[key]}</small></div>
   <div class="client-trade-quantity client-trade-export"><small>出口 · ${EXPORT_PRICE[key]}资金 / 个</small>${exports(s,card,cap,key)}</div>
   <div class="client-trade-cap">可出口 <b data-trade-export-max="${key}">${Math.min(p.resources[key],cap.exports[key])}</b><small>国家需求 <span data-export-cap="${key}">${cap.exports[key]}</span></small></div>
  </section>`).join('')}</div>
  ${regions.length?`<fieldset class="client-trade-regions"><legend>扩展贸易 · 可用 ${p.smart} SP</legend><p>额外使用所选地区展示国家的符号，每地区 1 SP；点击该地区盟国商店选择。</p><div>${regions.map(r=>`<label><input type="checkbox" data-trade-region="${r}"><span>${AREAS[r].name}</span></label>`).join('')}</div></fieldset>`:''}
  ${card.factory?`<label class="client-trade-factory"><span>贸易后生产消费品 <small>消耗等量能源和原料</small></span>${stepper('factory-goods','',2,'生产消费品')}</label>`:''}
  <details class="client-trade-rules"><summary>贸易规则与协定</summary><p>${esc(explanation(card))}</p><img class="viewerimage" src="assets/zh-CN/trade-${s.current}.webp" alt="${names[s.current]}贸易协定">${renderEventEffects(s,s.current,{textOnly:true})}</details>
  </div>
  ${renderRegionalTradeChoice(card)}
  <footer class="client-trade-footer"><p id="basic-preview" aria-live="polite"></p>${card.regionalInfluence?'<button type="button" data-regional-next>选择奖励地区 →</button>':''}<button id="commit-basic" data-card-action="playBasicCard" data-id="${esc(id)}"${card.regionalInfluence?' hidden':''}>结算全部交易并结束行动</button></footer>
 </section>`;
}

/** A plus/minus click changes its real number input and emits the normal input
 * event. It does not submit a transaction or bypass the action preview. */
export function handleTradeControl(event){
 const button=event.target?.closest?.('[data-trade-step]');if(!button)return false;
 const form=button.closest('.client-trade-form');if(!form)return false;
 event.preventDefault();
 if(button.disabled||button.matches(':disabled,[aria-disabled="true"]'))return true;
 const input=form.querySelector('#'+button.dataset.tradeInput);
 adjustTradeInput(input,Number(button.dataset.tradeStep));
 return true;
}

export function adjustTradeInput(input,delta){
 if(!input||input.disabled||input.matches(':disabled,[aria-disabled="true"]'))return;
 const current=Number(input.value),min=Number(input.min||0),max=input.max===''?999:Number(input.max);
 if(!Number.isFinite(current)||!Number.isFinite(min)||!Number.isFinite(max)||![-1,1].includes(delta))return;
 // Decreasing an amount after its capacity shrinks should preserve the other
 // selections; final feasibility still belongs to the shared preview.
 input.value=String(delta<0?Math.max(min,current-1):current>=max?current:current+1);
 const InputEvent=input.ownerDocument?.defaultView?.Event||globalThis.Event;
 input.dispatchEvent(new InputEvent('input',{bubbles:true}));
}

export function updateClientTradeForm(root=document){
 const form=root.querySelector('.client-trade-form');if(!form)return;
 for(const button of form.querySelectorAll('[data-trade-step]')){
  const input=form.querySelector('#'+button.dataset.tradeInput);if(!input)continue;
  const value=Number(input.value),delta=Number(button.dataset.tradeStep);
  button.disabled=input.disabled||input.matches(':disabled,[aria-disabled="true"]')||(delta<0?value<=Number(input.min||0):value>=Number(input.max));
 }
 for(const total of form.querySelectorAll('[data-trade-partner-total]')){
  total.textContent=String([...form.querySelectorAll(`[data-import-key="${total.dataset.tradePartnerTotal}"]`)].reduce((sum,input)=>sum+Number(input.value||0),0));
 }
 for(const total of form.querySelectorAll('[data-trade-export-total]')){
  total.textContent=String([...form.querySelectorAll(`[data-export-region-key="${total.dataset.tradeExportTotal}"]`)].reduce((sum,input)=>sum+Number(input.value||0),0));
 }
 for(const max of form.querySelectorAll('[data-trade-export-max]')){
  const key=max.dataset.tradeExportMax,input=form.querySelector(`[data-export-key="${key}"]`);
  if(input)max.textContent=input.max;
  else{
   const stock=Number(form.querySelector(`[data-trade-resource="${key}"]`)?.dataset.tradeStock||0);
   max.textContent=String(Math.min(stock,Number(form.querySelector(`[data-export-cap="${key}"]`)?.textContent||0)));
  }
 }
}
