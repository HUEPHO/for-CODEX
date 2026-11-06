import {renderArmyContribution,readArmyContribution} from './army-contribution-ui.js';
import {powerFlag} from './power-identity.js';
import {resourceIconPath} from './resource-icons.js';
import {canNegotiateAgreement} from './interaction-state.js';
import {renderArmyDeployment,readDeploymentMoves} from './army-deployment-ui.js';
import {AGREEMENT_EVENTS,agreementTotals,agreementEnough,agreementModel,agreementOffer,agreementRewardPreview,agreementCountryTargets} from './event-agreements.js';
import {AREAS} from './world.js';
import {ECONOMY,RESOURCE_LABELS} from './economy.js';
const names={US:'美国',EU:'欧盟',RU:'俄罗斯',CN:'中国'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prompt={minsk:'共同支付恰好5外交；双方均须出资。达成后各获2分及本方支付量的SP，移除对俄制裁；拒绝则各失去2分，并触发入侵乌克兰。',afghan:'共同支付恰好30资金，可由一方全付。达成后各获1 SP并保留中亚军队；拒绝则各失去1 SP，免费撤回中亚全部军队。',libya:'双方共同移动至少3支军队至事件牌，每支付5资金。成功后各按移动数获得每支2 SP，军队进入中东并登记第二次利比亚内战；失败双方各失去2 SP，中东增加中立影响力。',imec:'双方共同支付恰好20资金及4外交。印度、以色列、沙特、阿联酋每个盟国视为该方已支付1外交；每1外交或每10资金获得1 SP，美国另获得等量分数，欧盟可转换指定地区影响力。',brics:'双方共同支付恰好5外交，按各自支付量获得SP。出资多者先各选择至多一个指定国家，免费加入盟国。',tradeWar:'双方共同支付至少5外交，各按自己的支付量获得SP和分数；失败则双方繁荣降低1、失去1 SP，中美贸易战生效。',unlimited:'双方共同支付至少4外交，各按自己的支付量获得SP和分数；随后各可正常付费移动至多2支军队，中俄无上限伙伴关系生效。',siberia:'双方各支付15资金、1外交，各获得3 SP，中国取得西伯利亚力量协议。',nordstream:'双方各支付10资金、2外交；欧盟获得2外交和北溪协议，俄罗斯选择3外交或转换欧洲1点临时影响力。',start:'双方各支付1外交，并各将至少1支版图军队移回补给。各获2 SP，每移回1支军队获得2分，新削减条约生效。',iran:'至少两位玩家共同支付至少5外交；参与方各获得2分和与本方出资相等的SP。失败时中东增加中立影响力，各方按中东本方影响力失去SP；SP不足扣分。',ttip:'双方共同支付至少8外交，各按自己每2外交获得1 SP；随后分别选择自己的TTIP效果牌一面并执行。'};
function offerText(o){return o.accept?`${o.money}资金、${o.diplomacy}外交${o.credit?'＋盟国抵扣'+o.credit+'外交':''}${o.count?'、'+o.count+'支军队（'+o.moveCost+'移动费）':''}`:'不参与';}
export function renderAgreementSummary(q){return !q.agreementVersion?'':`<div class="agreement-summary">${Object.entries(q.submissions).map(([id,o])=>`<p data-army-owner="${id}">${names[id]}承诺：${offerText(o)}</p>`).join('')}${q.agreement?`<p data-army-owner="">协议${q.agreement.success?'达成':'未达成'}；共同承诺${q.agreement.totals.money}资金、${q.agreement.totals.diplomacy}外交、${q.agreement.totals.armies}支军队。</p>`:''}</div>`;}
export function renderAgreementForm(s,q){
 if(q.agreementVersion===2)return renderLiveAgreement(s,q);
 const owner=q.participants.includes(s.current)?s.current:q.participants[q.done.length],model=agreementModel(s,q,owner),p=s.players[owner];let fields='';
 if(model.fixed)fields+=`<p>同意即承诺${model.fixed.money}资金、${model.fixed.diplomacy}外交。</p>`;
 else{
  if(model.money)fields+=`<label>本方承诺资金<input id="agreement-money" type="number" min="0" max="${Math.min(model.money,p.money)}" value="0"></label>`;
  if(model.diplomacy)fields+=`<label>本方实际承诺外交<input id="agreement-diplomacy" type="number" min="0" max="${p.resources[5]}" value="0"></label>`;
 }
 if(model.discountCountries)fields+=`<p>本方指定盟国抵扣：${model.credit}外交，也计入本方奖励。</p>`;
 if(model.armies)fields+=`<fieldset><legend>${model.armies==='event'?'移至事件牌，每支5资金':'移回补给，不进入待命区、不收移动费'}</legend>${[...(model.armies==='event'?['reserve']:[]),...Object.keys(AREAS)].map(from=>{const n=from==='reserve'?p.resources[6]:s.regions[from].armies[owner];return n?`<label>${from==='reserve'?'待命区':AREAS[from].name}（${n}支）<input data-agreement-armies="${from}" type="number" min="0" max="${n}" value="0"></label>`:'';}).join('')}</fieldset>`;
 return `<div id="agreement-form"><p>${prompt[model.key]}</p><p>各方依次公开承诺，协议达成后才统一扣费。两方协议双方必须贡献；多人协议至少两方贡献，未参加者不领奖。底部NPP抽牌数字不限制人类玩家的承诺。</p>${renderAgreementSummary(q)}<label>本方选择<select id="agreement-accept"><option value="no">不参与</option><option value="yes">同意并承诺出资</option></select></label><div id="agreement-contribution">${fields}</div><p id="agreement-preview" aria-live="polite"></p></div>`;
}
export function readAgreementForm(){if(document.querySelector('[data-live-agreement]'))return {accept:true,money:Number(document.querySelector('#agreement-money')?.value||0),diplomacy:Number(document.querySelector('#agreement-diplomacy')?.value||0),armies:readArmyContribution(document.querySelector('#agreement-armies'))};return {accept:document.querySelector('#agreement-accept')?.value==='yes',money:Number(document.querySelector('#agreement-money')?.value||0),diplomacy:Number(document.querySelector('#agreement-diplomacy')?.value||0),armies:Object.fromEntries([...document.querySelectorAll('[data-agreement-armies]')].map(el=>[el.dataset.agreementArmies,Number(el.value)]))};}
export function updateAgreementForm(s){
 const output=document.querySelector('#agreement-preview');if(!output)return;
 if(s.flow.eventResolution.agreementVersion===2){updateLiveAgreement(s);return;}
 const a=readAgreementForm(),options=document.querySelector('#agreement-contribution');if(options)options.hidden=!a.accept;
 const q=s.flow.eventResolution,button=document.querySelector('#event-submit');
 if(q.participants[q.done.length]!==s.current){button.disabled=true;output.textContent='等待当前协议参与方提交。';return;}
 try{const offer=agreementOffer(s,q,s.current,a);output.textContent=offer.accept?'承诺'+offerText(offer)+'；现在不扣费，等待协议是否达成。':'不参与；其他方提交后按牌面结算协议结果。';button.disabled=false;}catch(error){output.textContent=error.message;button.disabled=true;}
}
function convertForm(s,step){return `<label>转换的本方临时影响力<select id="agreement-convert">${step.regions.flatMap(region=>s.regions[region].temporary.flatMap((owner,index)=>owner===step.owner?[`<option value="${region}:${index}">${AREAS[region].name}第${index+1}格</option>`]:[])).join('')||'<option value="">没有可转换的本方影响力</option>'}</select></label>`;}
export function renderAgreementReward(s,q,cards={}){
 const step=q.rewardQueue[0],p=s.players[step.owner];let fields='';
 if(step.type==='bricsCountry')fields=`<p>检索埃及、埃塞俄比亚、伊朗、沙特或阿联酋。所选国家免费加入盟国，随后重洗该地区国家牌。</p><label>选择国家<select id="agreement-country">${agreementCountryTargets(s,step.owner).map(id=>`<option value="${id}">${esc(cards[id]?.name||id)}</option>`).join('')||'<option value="">没有可取得的指定国家</option>'}</select></label>`;
 else if(step.type==='convert')fields='<p>可将一枚临时影响力转为永久；永久槽已满时额外放置，不获得槽位分。</p>'+convertForm(s,step);
 else if(step.type==='nordstream')fields='<label>俄罗斯奖励<select id="agreement-choice"><option value="diplomacy">获得3外交</option><option value="convert">转换欧洲临时影响力</option></select></label>'+convertForm(s,step);
 else if(step.type==='withdraw'){const destinations=Object.entries(AREAS).filter(([,area])=>area.interest.includes(step.owner)).map(([id])=>id);fields=renderArmyDeployment(s,{owner:step.owner,maxMoves:step.max,destinations,normalDestinations:destinations,source:['C'],initial:{C:-step.max}});}
 else if(step.type==='move')fields='<p>每支5资金，通常目的地外每支另花1 SP。</p>'+renderArmyDeployment(s,{owner:step.owner,maxMoves:2});
 else if(step.type==='ttip'){
  const other=step.owner==='US'?'EU':'US',target=s.players[other],options=target.production.flatMap((n,key)=>n<ECONOMY[other].max[key]?[`<option value="${key}">${RESOURCE_LABELS[key]}（${n}→${n+1}）</option>`]:[]).join('');
  fields=`<label>TTIP牌面<select id="agreement-face"><option value="exchange">资源交换面 · 免费取得</option><option value="investment">投资面 · 支付25资金</option></select></label><div id="agreement-investment"><label>${names[other]}提升产能<select id="agreement-production">${options||'<option value="">所有产能已满，跳过提升</option>'}</select></label><label>${step.owner==='US'?'欧洲':'美洲'}影响力位置<select id="agreement-slot" data-region-value="${step.owner==='US'?'E':'M'}"><option value="permanent">永久槽</option><option value="temporary">临时槽</option></select></label></div>`;
 }
 return `${renderAgreementSummary(q)}<div id="agreement-reward-form"><fieldset ${step.owner!==s.current?'disabled':''}><b>${names[step.owner]} · 协议后续选择</b>${fields}<p id="agreement-reward-preview" aria-live="polite"></p><button id="event-reward">执行协议选择</button>${step.optional?'<button id="event-reward-skip">放弃本次可选效果</button>':''}</fieldset></div>`;
}
export function readAgreementReward(){
 const [region,index]=(document.querySelector('#agreement-convert')?.value||'').split(':'),production=document.querySelector('#agreement-production')?.value;
 return {country:document.querySelector('#agreement-country')?.value,region,index:Number(index),choice:document.querySelector('#agreement-choice')?.value,face:document.querySelector('#agreement-face')?.value,productionKey:production?Number(production):undefined,slot:document.querySelector('#agreement-slot')?.value,moves:readDeploymentMoves(document.querySelector('#agreement-reward-form .army-deployment'))??[...document.querySelectorAll('[data-agreement-move-from]')].filter(el=>el.value).map(el=>({from:el.value,to:document.querySelector('[data-agreement-move-to="'+el.dataset.agreementMoveFrom+'"]')?.value,spendSP:!!document.querySelector('[data-agreement-move-sp="'+el.dataset.agreementMoveFrom+'"]')?.checked}))};
}
export function updateAgreementReward(s){
 const output=document.querySelector('#agreement-reward-preview');if(!output)return;
 const a=readAgreementReward(),options=document.querySelector('#agreement-investment');if(options)options.hidden=a.face!=='investment';
 const q=s.flow.eventResolution,button=document.querySelector('#event-reward');if(q.rewardQueue[0]?.owner!==s.current){button.disabled=true;return;}
 try{output.textContent=agreementRewardPreview(s,q,a);button.disabled=false;}catch(error){output.textContent=error.message;button.disabled=true;}
}

const icon=key=>`<span class="resource-icon resource-icon--${key}" role="img" aria-label="${{money:'资金',diplomacy:'外交',army:'军队'}[key]}" ${key==='army'?'':`style="background-image:url('${resourceIconPath(key)}')"`}></span>`;
function renderLiveAgreement(s,q){
 const {totals}=agreementTotals(q),rule=AGREEMENT_EVENTS[q.cardId],waiting=q.done.length===q.participants.length&&!agreementEnough(q),own=q.submissions[s.current];
 return `<div id="agreement-form" data-live-agreement><p>${prompt[rule.key]}</p><div class="agreement-total">${rule.money?`${icon('money')} ${totals.money} / ${rule.money}`:''}${rule.diplomacy?`${icon('diplomacy')} ${totals.diplomacy} / ${rule.diplomacy}`:''}${rule.minimumArmies?`${icon('army')} ${totals.armies} / ${rule.minimumArmies}`:''}</div><div class="agreement-live-grid">${q.participants.map(owner=>{
  const o=q.submissions[owner],model=agreementModel(s,q,owner),self=owner===s.current,edit=self&&o.accept!==false;
  const amount=(key,max)=>`<label>${icon(key)}${edit&&!model.fixed?`<input id="agreement-${key}" type="number" min="0" max="${max}" value="${o[key]}" aria-label="本方承诺${key==='money'?'资金':'外交'}">`:`<strong>${o[key]}</strong>`}</label>`;
  return `<section class="agreement-party${self?' is-self':''}${o.confirmed&&o.accept?' is-confirmed':''}" data-agreement-owner="${owner}"><header>${powerFlag(owner)}<small>${!o.accept?'已拒绝':o.confirmed?'已确认':'待确认'}</small></header>${model.money||model.fixed?.money?amount('money',Math.min(model.money||999,s.players[owner].money)):''}${model.diplomacy||model.fixed?.diplomacy?amount('diplomacy',s.players[owner].resources[5]):''}${o.credit?`<small>盟国抵扣 ${o.credit}${icon('diplomacy')}</small>`:''}${model.armies?edit?renderArmyContribution(s,{id:'agreement-armies',owner,armies:o.armies,supply:model.armies==='supply'}):`<label>${icon('army')}<strong>${o.count}</strong></label>`:''}</section>`;
 }).join('')}</div>${waiting?'<p class="agreement-wait">已全部确认，出资尚未满足；等待调整出资或拒绝。</p>':''}<p id="agreement-preview" aria-live="polite"></p>${own?.accept?`<div class="agreement-buttons"><button id="event-submit" data-command="submitEvent" ${own.confirmed?'disabled':''}>确认</button><button data-agreement-unconfirm data-command="updateAgreement" ${own.confirmed?'':'disabled'}>取消确认</button><button data-agreement-reject data-command="submitEvent">拒绝</button></div>`:''}</div>`;
}
function updateLiveAgreement(s){
 const q=s.flow.eventResolution,button=document.querySelector('#event-submit'),output=document.querySelector('#agreement-preview');
 if(!canNegotiateAgreement(s,s.current)){if(button)button.disabled=true;return;}
 try{agreementOffer(s,q,s.current,readAgreementForm());if(button)button.disabled=!!q.submissions[s.current].confirmed;output.textContent='';}
 catch(error){if(button)button.disabled=true;output.textContent=error.message;}
}
