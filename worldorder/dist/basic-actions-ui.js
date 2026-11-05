import {readDeploymentMoves} from './army-deployment-ui.js';
import {sequenceCard,sequencePreview} from './card-sequence.js';
import {renderSequenceStart} from './card-sequence-ui.js';
import {effectiveCard,preparedActionState} from './market-actions.js';
import {preparationControls,branchControl,readMarketForm} from './market-actions-ui.js';
import {availableGrowth} from './growth-triggers.js';
import {resilienceControls,readResilience,updateResilience} from './growth-triggers-ui.js';
import {smartControls,readSmartForm,updateSmartForm} from './smart-power-ui.js';
import {renderTradeForm,readTradeForm,tradeSummary,updateTradeForm} from './trade-ui.js';
import {renderDomesticForm,readDomesticForm,updateDomesticForm,domesticSummary} from './domestic-actions-ui.js';
import {countryActionTarget,countryActionSummary} from './country-actions-ui.js';
import {renderMilitaryForm,readMilitaryMoves,militarySummary} from './military-ui.js';
import {ACTION_CARDS as BASIC_CARDS,ENGAGE_LIMIT,actionPreview,requireTurn} from './basic-actions.js';
import {AREAS,alliedCount} from './world.js';
import {investmentCost,countryRegion} from './research.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderBasicForm(s,id,cards,branch,forSequence=false){let entry;
 if(forSequence){entry=sequenceCard(s);}else{entry=BASIC_CARDS[id];if(!entry||!s.worldVersion)return '';try{requireTurn(s);}catch{return '<p class="viewer-meta">自动出牌需轮到本方，且尚有出牌额度。</p>';}if(entry.effect==='sequence')return renderSequenceStart(s,id,cards);}
 let html=renderActionForm(s,id,cards,branch,entry);if(forSequence)html=html.replace('id="basic-form"','id="basic-form" data-sequence="true"').replaceAll('data-card-action="playBasicCard"','data-card-action="resolveSequenceStep"').replaceAll('结算并完成本次行动','结算并继续').replaceAll('支付并完成本次行动','支付并继续').replaceAll('结算全部交易并结束行动','结算交易并继续').replace('将本牌放入行动区，自动结算后轮转；战略优势生效时可追加出牌。','本段结算后保存并继续余下效果；全部完成后再轮转或继续出牌。');return html;
}
function renderActionForm(s,id,cards,branch,entry){const p=s.players[s.current],info=effectiveCard(entry,{branch});if(info.effect==='trade')return renderTradeForm(s,id,info);if(info.effect==='domestic')return renderDomesticForm(s,id,info);if(info.effect==='reinforce')return renderMilitaryForm(s,id,info,cards);let target;
 if(['base','relations'].includes(info.effect))target=countryActionTarget(s,info,cards);
 else if(info.effect==='invest'){const available=p.allies.filter(cid=>(!info.targetCountry||cid===info.targetCountry)&&(!info.allowedRegions||info.allowedRegions.includes(countryRegion(cid)))&&info.excludeRegion!==countryRegion(cid)&&(!(p.exhaustedAllies||[]).includes(cid)||s.config.wit||info.readyTarget)&&(p.fdi||[]).filter(id=>id===cid).length<(info.investmentLimit??1));target=`<label>投资盟国<select id="basic-country">${available.map(cid=>`<option value="${cid}">${esc(cards[cid]?.name)} · ${investmentCost(cid)}资金</option>`).join('')||'<option value="">暂无可投资盟国</option>'}</select></label>`;}
 else{const used=Object.values(s.regions).reduce((n,r)=>n+r.engage[s.current],0);target=`<label>介入地区<select id="basic-region">${Object.entries(AREAS).filter(([region])=>(!info.targetRegion||info.targetRegion===region)&&(!info.allowedRegions||info.allowedRegions.includes(region))&&info.excludeRegion!==region&&(info.allowNoAlly||alliedCount(s,s.current,region)>0)).map(([region,a])=>`<option value="${region}">${a.name}</option>`).join('')||'<option value="">暂无可选地区</option>'}</select></label><fieldset id="basic-discounts"><legend>横置当地盟国减费 · 可不选</legend></fieldset>${used>=ENGAGE_LIMIT[s.current]?`<label>标记已用完，从哪个地区移来<select id="basic-move-from">${Object.entries(s.regions).filter(([,r])=>r.engage[s.current]>0).map(([region])=>`<option value="${region}">${AREAS[region].name}</option>`).join('')}</select></label>`:''}`;}
 return `<section id="basic-form" data-card-id="${id}" class="flow-panel"><b>${info.name} · 自动结算</b>${branchControl(entry,info.effect)}${preparationControls(s,info,cards)}${target}${smartControls(s,info)}${info.effect==='relations'&&availableGrowth(s,'open')?'<label><input id="basic-open-diplomacy" type="checkbox"> 使用开放外交，结算后选择第二个国家</label>':''}${resilienceControls(s)}<label>影响力位置<select id="basic-slot"><option value="permanent">永久槽</option><option value="temporary">临时槽</option></select></label><p id="basic-preview"></p><button id="commit-basic" data-card-action="playBasicCard" data-id="${id}">支付并完成本次行动</button><p class="minor">将本牌放入行动区，自动结算后轮转；战略优势生效时可追加出牌。${info.gainDiplomacy?'结算后另获得'+info.gainDiplomacy+'外交。':''}${info.gainArmies?'结算后另获得'+info.gainArmies+'待命军队。':''}费用与奖励以本次预览为准。</p></section>`;
}
export function readBasicForm(){return {...readMarketForm(),useRelationDiscount:document.querySelector('#basic-relation-discount')?.checked??true,openDiplomacy:!!document.querySelector('#basic-open-diplomacy')?.checked,resilience:readResilience(),...readSmartForm(),...readTradeForm(),...readDomesticForm(),type:document.querySelector('#basic-form')?.dataset.sequence?'resolveSequenceStep':'playBasicCard',moves:readMilitaryMoves(),armyMoves:readDeploymentMoves(document.querySelector('#base-deployment')),baseUseSP:!!document.querySelector('#base-use-sp')?.checked,send:Number(document.querySelector('#basic-send')?.value),moneyDiplomacy:Number(document.querySelector('#basic-money-diplomacy')?.value||0),cardId:document.querySelector('#basic-form')?.dataset.cardId,country:document.querySelector('#basic-country')?.value,region:document.querySelector('#basic-region')?.value,slot:document.querySelector('#basic-slot')?.value,moveFrom:document.querySelector('#basic-move-from')?.value,exhaust:[...document.querySelectorAll('[data-basic-exhaust]:checked')].map(el=>el.dataset.basicExhaust)};}
function showBasicPlacement(form,visible){
 const slot=form.querySelector('#basic-slot'),timing=form.querySelector('#basic-resilience');
 if(slot){slot.disabled=!visible;slot.closest('label').hidden=!visible;}
 if(timing){const group=timing.closest('fieldset');group.hidden=!visible;group.disabled=!visible;if(!visible)timing.value='';}
}
export function updateBasicForm(s,cards,refreshDiscounts=false){const form=document.querySelector('#basic-form');if(!form)return;const entry=form.dataset.sequence?sequenceCard(s):BASIC_CARDS[form.dataset.cardId];updateDomesticForm(s,cards);updateTradeForm(s,entry);let prepared=s;try{prepared=preparedActionState(s,readBasicForm(),effectiveCard(entry,readBasicForm()));}catch{}const p=prepared.players[s.current],region=document.querySelector('#basic-region')?.value||(document.querySelector('#basic-country')?.value?countryRegion(document.querySelector('#basic-country').value):null);
 if(refreshDiscounts&&document.querySelector('#basic-discounts'))document.querySelector('#basic-discounts').innerHTML='<legend>横置当地盟国减费 · 可不选</legend>'+p.allies.filter(id=>countryRegion(id)===region&&!(p.exhaustedAllies||[]).includes(id)).map(id=>`<label><input type="checkbox" data-basic-exhaust="${id}"> ${esc(cards[id]?.name)}</label>`).join('');
 const face=document.querySelector('#basic-country-face'),country=cards[document.querySelector('#basic-country')?.value];if(face)face.innerHTML=country?`<img src="${esc(country.image)}" alt="${esc(country.name)}" style="max-height:240px;max-width:100%">`:'';
 showBasicPlacement(form,true);updateResilience(s,region,document.querySelector('#basic-slot')?.value);
 updateSmartForm(prepared,effectiveCard(entry,readBasicForm()),readBasicForm());
 const button=document.querySelector('#commit-basic'),note=document.querySelector('#basic-preview');note.hidden=false;try{
  const previewAction=form.dataset.sequence?sequencePreview:actionPreview,a=readBasicForm();let preview;
  try{preview=previewAction(s,a);}catch(error){
   // Switching from an upgrade to a new ally can leave an inapplicable optional
   // conversion selected. Ask the same preview without it before clearing it.
   if(!a.resilience)throw error;
   try{preview=previewAction(s,{...a,resilience:null});}catch{throw error;}
   if(preview.influence!==false)throw error;
  }
  showBasicPlacement(form,!!preview.influence);
  note.hidden=preview.effect==='relations'&&!preview.influence;
  document.querySelector('#basic-preview').textContent=preview.effect==='trade'?tradeSummary(s,preview):['production','growth'].includes(preview.effect)?domesticSummary(preview):preview.effect==='reinforce'?militarySummary(preview):['base','relations'].includes(preview.effect)?countryActionSummary(preview):`支付${preview.cost}${preview.effect==='invest'?'资金':'外交'}；在${AREAS[preview.region].name}放置影响力，获得${preview.vp}分。${preview.discount?'已减免'+preview.discount+'外交。':''}`;if(preview.preparation?.length)document.querySelector('#basic-preview').textContent=preview.preparation.join('，')+'；'+document.querySelector('#basic-preview').textContent;if(preview.smartCost)document.querySelector('#basic-preview').textContent+=' 消耗'+preview.smartCost+' SP。';button.disabled=false;
 }catch(error){document.querySelector('#basic-preview').textContent=error.message;button.disabled=true;}
}
