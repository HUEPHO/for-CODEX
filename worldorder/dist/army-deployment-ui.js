import {AREAS} from './world.js';
import {militaryDestinations} from './military.js';
import {deploymentMoves} from './army-deployment.js';
import {RESEARCH_DATA} from './research-data.js';
import {POWERS} from './game-constants.js';
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderArmyDeployment(s,{id='army-deployment',gain=0,maxMoves=2,destinations,normalDestinations,owner=s.current,source='any',production='',countryField='',initial={}}={}){
 const state={...s,current:owner},normal=normalDestinations||militaryDestinations(state);
 const options={owner,gain,maxMoves,normal,destinations:destinations||(s.config.wit?Object.keys(AREAS):normal),source,production,countryField};
 return `<fieldset class="army-deployment" id="${id}" data-army-options="${esc(JSON.stringify(options))}"><legend>派遣坦克</legend><input type="hidden" data-army-delta value="${esc(JSON.stringify(initial))}"><p class="army-deployment-status" aria-live="polite"></p><p class="minor">左键地区派遣1辆，右键取回1辆调整。</p><div class="army-deployment-routes"></div></fieldset>`;
}
function data(root){
 const input=root.querySelector('[data-army-delta]'),delta=JSON.parse(input.value),options=JSON.parse(root.dataset.armyOptions);
 if(options.countryField){
  const region=RESEARCH_DATA[document.querySelector(options.countryField)?.value]?.region;
  if(region&&options.destinations[0]!==region){
   const old=options.destinations[0],n=Math.max(0,delta[old]||0);delta[old]=(delta[old]||0)-n;delta[region]=(delta[region]||0)+n;
   options.destinations=[region];options.normal=[region];input.value=JSON.stringify(delta);root.dataset.armyOptions=JSON.stringify(options);
  }
 }
 return {input,delta,options};
}
export function readDeploymentMoves(root){
 if(!root)return null;
 const {delta,options}=data(root);
 return deploymentMoves(delta,options.destinations.filter(region=>!options.normal.includes(region)));
}
export function installArmyDeployment({root=document,getTask,getSurface,getState,canEdit,onMessage}){
 function plan(){return [...(getTask()?.querySelectorAll('.army-deployment')||[])].find(el=>!el.closest('[hidden],fieldset[disabled]'));}
 function model(){
  const el=plan();if(!el)return null;
  const s=getState(),{options,input,delta}=data(el),player=s.players[options.owner];
  const initial=player.resources[6]+options.gain+Number(options.production?document.querySelector(options.production)?.value||0:0);
  return {el,input,delta,options,s,initial,reserve:initial-Object.values(delta).reduce((sum,n)=>sum+n,0)};
 }
 function sync(){
  const m=model(),surface=getSurface(),s=getState();
  for(const panel of surface?.querySelectorAll('[data-board-region]')||[]){
   const region=panel.dataset.boardRegion;
   panel.classList.toggle('army-deployment-target',!!m&&m.options.destinations.includes(region));
   for(const piece of panel.querySelectorAll('.original-army')){
    const owner=piece.dataset.armyOwner,n=s.regions[region].armies[owner]+(m?.options.owner===owner?m.delta[region]||0:0);
    piece.hidden=n===0;piece.querySelector('b').textContent=n;
    piece.classList.toggle('army-deployment-pending',!!m&&owner===m.options.owner&&!!m.delta[region]);
    piece.title=`${AREAS[region].name} · ${POWERS[owner].name}：${n}辆坦克${piece.classList.contains('army-deployment-pending')?'（待提交）':''}`;piece.setAttribute('aria-label',piece.title);
   }
  }
  for(const player of root.querySelectorAll('[data-client-player]')){
   const owner=player.dataset.clientPlayer,stock=player.querySelector('[data-client-resource="6"]');if(!stock)continue;
   const pending=m?.options.owner===owner,n=pending?m.reserve:s.players[owner].resources[6];stock.querySelector('b').textContent=n;
   stock.classList.toggle('army-stock-pending',pending);stock.title=`仓库坦克：${n}${pending?'（派遣预览）':''}`;stock.setAttribute('aria-label',stock.title);
  }
  if(!m)return;
  m.el.querySelector('.army-deployment-status').textContent=`仓库 ${m.reserve}（派遣前 ${m.initial}）`;
  const moves=readDeploymentMoves(m.el);
  m.el.querySelector('.army-deployment-routes').innerHTML=moves.map(move=>`<span>${move.from==='reserve'?'仓库':AREAS[move.from].name} → ${move.to==='reserve'?'仓库（待重新派遣）':AREAS[move.to].name}${move.spendSP?' · 1 SP':''}</span>`).join('');
 }
 function click(event){
  const target=event.target.closest('[data-board-region]');
  if(!target||!getSurface()?.contains(target)||event.target.closest('[data-card],[data-trade-shop],[data-country-pile]'))return;
  const m=model();if(!m)return;
  // Influence slots remain selectable when a deployment also adds influence.
  if(event.target.closest('[data-board-slot]'))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!canEdit()||m.input.disabled)return;
  const region=target.dataset.boardRegion,change=event.type==='contextmenu'?-1:1,current=m.delta[region]||0;
  if(change>0){
   if(!m.options.destinations.includes(region)){onMessage('本次不能派遣到此地区。');return;}
   if(m.reserve<1){onMessage('仓库没有可派遣的坦克。');return;}
   if(Object.values(m.delta).reduce((n,v)=>n+Math.max(0,v),0)>=m.options.maxMoves&&current>=0){onMessage('已达到本次派遣数量上限。');return;}
  }else{
   if(m.s.regions[region].armies[m.options.owner]+current<1)return;
   if(current<=0&&(m.options.source==='reserve'||Array.isArray(m.options.source)&&!m.options.source.includes(region))){onMessage('本次不能从此地区调出坦克。');return;}
  }
  m.delta[region]=current+change;m.input.value=JSON.stringify(m.delta);
  if(m.el.id==='event-deployment'&&change>0)document.querySelector('#military-destination').value=region;
  m.input.dispatchEvent(new Event('change',{bubbles:true}));sync();
 }
 root.addEventListener('click',click,true);root.addEventListener('contextmenu',click,true);
 return {sync};
}
