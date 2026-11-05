import {RESOURCE_LABELS} from './economy.js';
import {resourceIconPath} from './resource-icons.js';

const icons=['energy','raw','food','goods','services','diplomacy','army'];
export function renderProductionMatrix(s,card){
 const p=s.players[s.current];
 return `<div class="domestic-production-matrix" aria-label="生产资源"><span class="production-row-label">产能</span><span class="production-row-label">库存</span><span class="production-row-label">生产</span>${icons.map((icon,k)=>{
  const allowed=(card.fixedProductionKey===undefined||card.fixedProductionKey===k)&&(!card.allowedProductionKeys||card.allowedProductionKeys.includes(k)),max=allowed?p.production[k]:0;
  return `<div class="production-column"><span class="production-cap">${p.production[k]}</span><button type="button" class="production-stock" data-production-clear="${k}" aria-label="清空${RESOURCE_LABELS[k]}生产" ${max?'':'disabled'}><span class="resource-icon resource-icon--${icon}" role="img" aria-label="${RESOURCE_LABELS[k]}" ${k===6?'':`style="background-image:url('${resourceIconPath(icon)}')"`}></span><small>${p.resources[k]}</small></button><input type="number" data-production-resource="${k}" min="0" max="${max}" value="0" hidden><button type="button" class="production-counter" data-production-counter="${k}" role="spinbutton" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="0" aria-label="生产${RESOURCE_LABELS[k]}" title="左键增加，右键减少" ${max?'':'disabled'}><span>+</span><strong>0</strong></button></div>`;
 }).join('')}</div>`;
}
export function readProductionMatrix(){return [...document.querySelectorAll('[data-production-resource]')].filter(el=>Number(el.value)>0).map(el=>({key:Number(el.dataset.productionResource),quantity:Number(el.value)}));}
export function syncProductionMatrix(){
 for(const input of document.querySelectorAll('[data-production-resource]')){
  const column=input.closest('.production-column'),button=column.querySelector('[data-production-counter]'),value=Number(input.value);
  column.classList.toggle('is-selected',value>0);button.querySelector('strong').textContent=value;button.setAttribute('aria-valuenow',String(value));
 }
}
function changeProduction(event,delta){
 const button=event.target.closest('[data-production-counter],[data-production-clear]');if(!button)return;
 event.preventDefault();if(button.disabled)return;
 const input=button.closest('.production-column').querySelector('input');if(input.disabled)return;
 const key=Number(input.dataset.productionResource),max=Number(input.max),value=Number(input.value);
 input.value=button.hasAttribute('data-production-clear')?'0':String(key<3?delta>0?max:0:Math.max(0,Math.min(max,value+delta)));
 input.dispatchEvent(new Event('input',{bubbles:true}));
}
if(typeof document!=='undefined'){
 document.addEventListener('click',event=>changeProduction(event,1));
 document.addEventListener('contextmenu',event=>changeProduction(event,-1));
 document.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown'].includes(event.key))changeProduction(event,event.key==='ArrowUp'?1:-1);});
}
