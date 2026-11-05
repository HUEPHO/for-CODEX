import {POWERS,RESOURCE_NAMES} from './game-constants.js';
import {debugModeIssue} from './action-policy.js';
import {showGameDialog} from './client-dialogs.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cardTypes=new Set(['starter','ability','asset']);
const kindName=c=>c.type==='asset'?'战略资产':c.type==='starter'?'起始能力':'市场能力';

export function installDebugMode({getContext,getCards,cardTitle,onApply}){
 const button=document.querySelector('#debug-mode'),dialog=document.querySelector('#debug-dialog'),body=document.querySelector('#debug-body');
 let player,revision,baseline={},saving=false;
 const status=(text,error=false)=>{const el=body.querySelector('[data-debug-status]');if(el){el.textContent=text;el.classList.toggle('error',error);}};
 const reason=()=>{const c=getContext();return !c.ready?'桌面尚未准备好':c.steam&&!c.room?'请先加入对局':debugModeIssue(c.room)||(c.busy?'正在保存，请稍候':c.room&&c.offline?'请先恢复房间连接':null);};
 function sync(){const issue=reason();button.disabled=!!issue;button.title=issue||'添加卡牌、调整资源与产能';button.classList.toggle('debug-active',!!getContext().state?.debugMode);if(dialog.open){body.inert=saving||!!issue;if(issue)status(issue,true);}}
 function numberControl(key,value,label){return `<span class="debug-number"><input type="number" step="1" ${key==='vp'?'':'min="0"'} data-debug-value="${key}" aria-label="${label}" value="${value}" required></span>`;}
 function numbers(){
  const p=getContext().state.players[player];baseline={money:p.money,smart:p.smart,vp:p.vp};
  for(const group of ['resources','production'])p[group].forEach((value,i)=>baseline[`${group}.${i}`]=value);
  body.querySelector('[data-debug-numbers]').innerHTML=`<div class="debug-balances">${[['money','资金'],['smart','SP'],['vp','胜利分']].map(([key,label])=>`<label>${label}${numberControl(key,p[key],label)}</label>`).join('')}</div><table><thead><tr><th>资源</th><th>库存</th><th>产能</th></tr></thead><tbody>${RESOURCE_NAMES.map((label,i)=>`<tr><th scope="row">${label}</th><td>${numberControl('resources.'+i,p.resources[i],label+'库存')}</td><td>${numberControl('production.'+i,p.production[i],label+'产能')}</td></tr>`).join('')}</tbody></table>`;
 }
 function preview(){
  const c=getCards().find(c=>c.id===body.querySelector('#debug-card').value),area=body.querySelector('[data-debug-preview]');
  body.querySelector('#debug-add-card').disabled=!c;
  area.innerHTML=c?`<img src="${esc(c.image)}" alt="${esc(cardTitle(c))}"><div><b data-keep-resource-text>${esc(cardTitle(c))}</b><p>${c.type==='asset'?'加入可用资产区；已用资产可重新启用。':'加入手牌，保留牌库和市场中的原牌。'}</p></div>`:'<p>没有匹配的卡牌</p>';
 }
 function filter(){
  const search=body.querySelector('#debug-search').value.trim().toLowerCase(),kind=body.querySelector('#debug-kind').value,select=body.querySelector('#debug-card'),selected=select.value;
  const cards=getCards().filter(c=>cardTypes.has(c.type)&&(kind==='all'||(kind==='asset'?c.type==='asset':c.type!=='asset'))&&`${cardTitle(c)} ${POWERS[c.owner]?.name||''} ${c.id} ${c.notes||''}`.toLowerCase().includes(search)).sort((a,b)=>cardTitle(a).localeCompare(cardTitle(b),'zh-CN')||String(a.owner).localeCompare(String(b.owner)));
  select.innerHTML=cards.map(c=>`<option value="${c.id}">${esc(cardTitle(c))} · ${POWERS[c.owner]?.name||'通用'} · ${kindName(c)}${c.module==='dd'?' · 扩展':''}</option>`).join('');
  if(cards.some(c=>c.id===selected))select.value=selected;else select.selectedIndex=cards.length?0:-1;
  body.querySelector('[data-debug-count]').textContent=`${cards.length} 张`;
  preview();
 }
 function open(){
  if(reason())return;
  const context=getContext();player=context.state.current;revision=context.key;
  body.innerHTML=`<header class="debug-heading"><h2 id="debug-title">Debug Mode</h2><label>调整势力 <select id="debug-player">${Object.entries(POWERS).map(([id,p])=>`<option value="${id}"${id===player?' selected':''}>${p.name}</option>`).join('')}</select></label></header><div class="debug-columns"><section><h3>添加卡牌 <small data-debug-count></small></h3><div class="debug-search"><input id="debug-search" type="search" placeholder="搜索牌名或势力" aria-label="搜索卡牌"><select id="debug-kind" aria-label="卡牌类别"><option value="all">全部</option><option value="hand">手牌</option><option value="asset">战略资产</option></select></div><select id="debug-card" size="8" aria-label="选择卡牌"></select><div data-debug-preview></div><button type="button" id="debug-add-card" class="gold">加入所选卡牌</button></section><form id="debug-values"><h3>资源 / 产能</h3><div data-debug-numbers></div><p class="debug-hint">左键增加、右键减少；保存后生效，可超出通常上限。</p><button type="submit" class="gold">保存数值</button></form></div><p data-debug-status role="status">${context.room?'房主调试 · 修改后同步至房间':'本机调试 · 修改后自动保存'}</p>`;
  numbers();filter();showGameDialog(dialog);sync();
 }
 async function apply(action){
  if(saving||reason())return;
  if(getContext().key!==revision){revision=getContext().key;numbers();status('局面已更新，已重新读取数值，请核对后重试。',true);return;}
  saving=true;sync();
  try{const result=await onApply({...action,player});if(result.ok){revision=getContext().key;if(action.type==='setValues')numbers();status(action.type==='addCard'?`${POWERS[player].name}：已加入所选卡牌。`:`${POWERS[player].name}：数值已保存。`);}else status(result.error,true);}
  finally{saving=false;sync();}
 }
 button.addEventListener('click',open);
 body.addEventListener('input',event=>{if(event.target.id==='debug-search')filter();});
 body.addEventListener('change',event=>{
  if(event.target.id==='debug-kind')filter();
  if(event.target.id==='debug-card')preview();
  if(event.target.id==='debug-player'){player=event.target.value;revision=getContext().key;numbers();status(`正在调整${POWERS[player].name}`);}
 });
 body.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.id==='debug-add-card')apply({type:'addCard',cardId:body.querySelector('#debug-card').value});
 });
 body.addEventListener('submit',event=>{
  if(event.target.id!=='debug-values')return;event.preventDefault();
  const values=Object.fromEntries([...body.querySelectorAll('[data-debug-value]')].map(input=>[input.dataset.debugValue,Number(input.value)]).filter(([key,value])=>value!==baseline[key]));
  if(!Object.keys(values).length){status('数值没有变化。');return;}
  apply({type:'setValues',values});
 });
 return {sync};
}
