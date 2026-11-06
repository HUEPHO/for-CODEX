import {POWER_IDS,isNonPlayer} from './player-configuration.js';
import {POWERS} from './game-constants.js';
import {powerFlag} from './power-identity.js';
import {AUTO_INFLUENCE_CARDS} from './auto-influence-data.js';
import {AREAS} from './world.js';
import {ECONOMY,RESOURCE_LABELS} from './economy.js';
import {eventActor} from './interaction-state.js';

let configurationSequence=0;
export function renderPlayerConfiguration(config={}){
 const humans=config.humans||POWER_IDS,mode=config.automatonMode||(Object.keys(config.automas||{}).length?'advanced':humans.length<4?'basic':'none'),difficulty=config.automaDifficulty||Object.values(config.automas||{})[0]||'normal';
 const group='automaton-mode-'+(++configurationSequence);
 return `<fieldset class="player-configuration"><legend>对局模式</legend><div class="automaton-mode-options">${[['none','无自动机'],['basic','基础自动机'],['advanced','高级自动机']].map(([value,label])=>`<label class="automaton-mode-choice"><input type="radio" name="${group}" data-automaton-mode value="${value}"${mode===value?' checked':''}><span>${label}</span></label>`).join('')}</div><div class="player-configuration-seats">${POWER_IDS.map(id=>`<label>${powerFlag(id)}<select data-human-seat="${id}" aria-label="${POWERS[id].name}控制方式"${mode==='none'?' disabled':''}><option value="human"${mode==='none'||humans.includes(id)?' selected':''}>真人</option><option value="auto"${mode!=='none'&&!humans.includes(id)?' selected':''}>自动机</option></select></label>`).join('')}</div><label class="player-configuration-difficulty"${mode==='advanced'?'':' hidden'}><span>难度</span><select data-automa-difficulty aria-label="高级自动机难度"><option value="normal"${difficulty==='normal'?' selected':''}>普通</option><option value="hard"${difficulty==='hard'?' selected':''}>困难</option></select></label></fieldset>`;
}
export function readAutomatonConfiguration(root){return {automatonMode:root.querySelector('[data-automaton-mode]:checked').value,automaDifficulty:root.querySelector('[data-automa-difficulty]').value};}
export function readPlayerConfiguration(root){return readAutomatonConfiguration(root).automatonMode==='none'?[...POWER_IDS]:[...root.querySelectorAll('[data-human-seat]')].filter(el=>el.value==='human').map(el=>el.dataset.humanSeat);}
export function syncPlayerConfiguration(root){const mode=root.querySelector('[data-automaton-mode]:checked').value;for(const field of root.querySelectorAll('[data-human-seat]')){field.disabled=mode==='none';if(mode==='none')field.value='human';}root.querySelector('.player-configuration-difficulty').hidden=mode!=='advanced';}
export function automatonLabel(config,id){return config.automas?.[id]||config.automatonMode==='advanced'?'高级自动机':'基础自动机';}
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
export function renderNonPlayerChoice(s,q,{inDetails=false,cards={}}={}){
 const step=q.nonPlayerChoice;let fields='';
 if(!inDetails)return `<button data-client-player="${step.owner}" class="gold">${powerFlag(step.owner)} 处理自动机</button>`;
 if(['convert','nordstream'].includes(step.type))fields=`<label>转换影响力<select id="npp-convert">${step.targets.map(t=>`<option value="${t.region}:${t.index}">${AREAS[t.region].name} · 临时槽 ${t.index+1}</option>`).join('')}</select></label>`;
 else if(step.type==='ttip'){const partner=step.owner==='US'?'EU':'US',advanced=!!s.players[step.owner].automa;fields=`<label>协议面<select id="npp-face"><option value="investment"${advanced&&s.players[step.owner].money<25?' disabled':''}>投资面${advanced?' · 支付25资金':' · 添加影响力'}</option><option value="exchange">交易面${advanced?'':' · 非玩家不领取资源'}</option></select></label>`+(!isNonPlayer(s,partner)?`<label>${powerFlag(partner)}投资面提升产能<select id="npp-production">${s.players[partner].production.map((n,k)=>n<ECONOMY[partner].max[k]?`<option value="${k}">${RESOURCE_LABELS[k]}</option>`:'').join('')||'<option value="">已全部满级</option>'}</select></label>`:'');}
 else if(step.type==='bricsCountry')fields=`<label>取得盟国<select id="npp-country">${step.countries.map(id=>`<option value="${id}">${cards[id]?.name||id}</option>`).join('')}</select></label>`;
 else fields=`<p>${step.type==='disarm'?'选择移回补给的军队，至少1支':step.type==='withdraw'?`将中亚的${step.max}支军队分配到关注地区`:`从补给放置至多${step.max}支军队`}</p><div class="npp-regions">${step.regions.map(region=>`<label>${AREAS[region].name}<input type="number" data-npp-region="${region}" min="0" max="${step.type==='disarm'?s.regions[region].armies[step.owner]:step.max}" value="0" aria-label="${AREAS[region].name}军队数量"></label>`).join('')}</div>`;
 return `<section class="npp-choice"><fieldset ${s.current!==eventActor(s)?'disabled':''}>${fields}<button id="npp-submit">确认选择</button>${step.optional||step.type==='nordstream'?`<button id="npp-skip">${step.type==='nordstream'&&s.players[step.owner].automa?'获得15资金':'不转换／放弃'}</button>`:''}</fieldset></section>`;
}
export function readNonPlayerChoice(root=document){
 const convert=root.querySelector('#npp-convert')?.value?.split(':');
 return {placements:Object.fromEntries([...root.querySelectorAll('[data-npp-region]')].map(el=>[el.dataset.nppRegion,Number(el.value)])),...(convert?{region:convert[0],index:Number(convert[1])}:{}),face:root.querySelector('#npp-face')?.value,country:root.querySelector('#npp-country')?.value,productionKey:Number(root.querySelector('#npp-production')?.value)};
}
