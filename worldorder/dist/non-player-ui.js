import {POWER_IDS,isNonPlayer} from './player-configuration.js';
import {POWERS} from './game-constants.js';
import {powerFlag} from './power-identity.js';
import {AUTO_INFLUENCE_CARDS} from './auto-influence-data.js';
import {AREAS} from './world.js';
import {ECONOMY,RESOURCE_LABELS} from './economy.js';

export function renderPlayerConfiguration(config={}){
 const humans=config.humans||POWER_IDS;
 return `<fieldset class="player-configuration"><legend>参与势力</legend>${POWER_IDS.map(id=>`<label>${powerFlag(id)}<select data-human-seat="${id}" aria-label="${POWERS[id].name}控制方式"><option value="human"${humans.includes(id)?' selected':''}>玩家</option><option value="auto"${humans.includes(id)?'':' selected'}>基础自动机</option></select></label>`).join('')}</fieldset>`;
}
export function readPlayerConfiguration(root){return [...root.querySelectorAll('[data-human-seat]')].filter(el=>el.value==='human').map(el=>el.dataset.humanSeat);}
function autoInfluenceRow(s,id,owner){
 const row=AUTO_INFLUENCE_CARDS[id].rows.find(row=>row.owner===owner);
 return `<b>${AREAS[row.region].name}</b>${row.army?'<span class="resource-icon resource-icon--army" aria-label="放置1支军队" title="放置1支军队"></span>':''}${row.trade&&!isNonPlayer(s,row.trade)?`<span class="auto-trade">${powerFlag(row.trade)} +10</span>`:''}`;
}
export function renderAutoInfluenceSummary(s,owner){
 return `<span class="npp-auto-cards">${s.autoInfluence.faceUp.map(id=>`<span class="npp-auto-card"><img src="assets/auto-influence/${id}.webp" alt="自动影响力牌 ${id+1}"><span>${autoInfluenceRow(s,id,owner)}</span></span>`).join('')}</span>`;
}
export function renderAutoInfluence(s,owner){
 const current=s.autoInfluence.faceUp,settled=s.autoInfluence.history.at(-1)?.round===s.round,timing=settled?(s.round<6?'下轮研究后结算':'末轮已结算'):'本轮研究后结算';
 // The complete printed catalogue is public; its order never reads the hidden deck.
 const cards=[...current,...AUTO_INFLUENCE_CARDS.map(c=>c.id).filter(id=>!current.includes(id))];
 return `<section class="auto-influence" data-auto-influence-owner="${owner}"><header><h2>${powerFlag(owner)} 自动影响力</h2><span>${timing}</span></header><div class="auto-influence-cards">${cards.map(id=>`<article data-auto-influence-card="${id}" class="${current.includes(id)?'is-current':''}"><span class="auto-influence-card-label">${current.includes(id)?'当前':''}</span><img src="assets/auto-influence/${id}.webp" alt="自动影响力卡图 ${id+1}" loading="lazy"><p>${autoInfluenceRow(s,id,owner)}</p></article>`).join('')}</div></section>`;
}
export function renderNonPlayerChoice(s,q){
 const step=q.nonPlayerChoice;let fields='';
 if(['convert','nordstream'].includes(step.type))fields=`<label>转换影响力<select id="npp-convert">${step.targets.map(t=>`<option value="${t.region}:${t.index}">${AREAS[t.region].name} · 临时槽 ${t.index+1}</option>`).join('')}</select></label>`;
 else if(step.type==='ttip'){const partner=step.owner==='US'?'EU':'US';fields='<label>协议面<select id="npp-face"><option value="investment">投资面 · 添加影响力</option><option value="exchange">交易面 · 非玩家不领取资源</option></select></label>'+`<label>${powerFlag(partner)}投资面提升产能<select id="npp-production">${s.players[partner].production.map((n,k)=>n<ECONOMY[partner].max[k]?`<option value="${k}">${RESOURCE_LABELS[k]}</option>`:'').join('')||'<option value="">已全部满级</option>'}</select></label>`;}
 else fields=`<p>${step.type==='disarm'?'选择移回补给的军队，至少1支':step.type==='withdraw'?`将中亚的${step.max}支军队分配到关注地区`:`从补给放置至多${step.max}支军队`}</p><div class="npp-regions">${step.regions.map(region=>`<label>${AREAS[region].name}<input type="number" data-npp-region="${region}" min="0" max="${step.type==='disarm'?s.regions[region].armies[step.owner]:step.max}" value="0" aria-label="${AREAS[region].name}军队数量"></label>`).join('')}</div>`;
 return `<section class="npp-choice"><b>基础自动机 ${powerFlag(step.owner)}</b><p>为非玩家选择棋盘效果</p><fieldset ${s.current!==s.flow.order[0]?'disabled':''}>${fields}<button id="npp-submit">确认选择</button>${step.optional||step.type==='nordstream'?'<button id="npp-skip">不转换／放弃</button>':''}</fieldset></section>`;
}
export function readNonPlayerChoice(root=document){
 const convert=root.querySelector('#npp-convert')?.value?.split(':');
 return {placements:Object.fromEntries([...root.querySelectorAll('[data-npp-region]')].map(el=>[el.dataset.nppRegion,Number(el.value)])),...(convert?{region:convert[0],index:Number(convert[1])}:{}),face:root.querySelector('#npp-face')?.value,productionKey:Number(root.querySelector('#npp-production')?.value)};
}
