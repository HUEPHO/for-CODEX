import {BID_EVENTS,bidSaleLimit,bidResourceLimit,bidInvestmentTargets} from './event-bids.js';
import {EVENT_DATA} from './event-data.js';
import {AREAS,emptyPermanentSlot} from './world.js';
import {countryInfo} from './country-actions.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
export function renderBidSummary(q){
 if(!q.bidVersion)return '';
 return `<div class="bid-results">${Object.entries(q.submissions).map(([id,b])=>`<p data-army-owner="${id}">${names[id]}：投标${b.total}＋修正${q.modifiers[id]}；支付${b.moneyUnits*10}资金、${b.diplomacy}外交${b.services?`、${b.services}服务`:''}，移动${b.count}支军队（移动费${b.moveCost}）${b.soldArmies?`；出售${b.soldArmies}支待命军队，获得${b.saleIncome}资金`:''}</p>`).join('')}${q.sideTotals?.map(x=>`<p><b>${x.opponent?'对手出价':x.players.map(p=>names[p]).join('＋')}合计 ${x.total}</b>${x.modifier!==undefined?`（含阵营${{random:'随机',neutral:'中立影响力',ally:'盟国'}[x.modifierKind]}修正＋${x.modifier}，不产生SP）`:''}</p>`).join('')||''}${Object.values(q.eventArmies||{}).some(n=>n)?'<p data-army-owner="">已提交的军队暂在事件牌上，全部效果完成后进入事件地区。</p>':''}</div>`;
}
export function renderBidForm(s,q){
 const d=BID_EVENTS[q.cardId],p=s.players[s.current],canMove=d.armies==='all'||d.armies?.includes(s.current);
 const fields=[];
 if(d.money)fields.push(`<label>资金投标单位（每单位10资金${d.money<999?'，最多'+d.money+'单位':''}）<input id="bid-money" type="number" min="0" max="${Math.min(d.money,Math.floor(p.money/10))}" value="0"></label>`);
 for(const [key,field,label] of [[5,'diplomacy','外交'],[4,'services','服务']])if(d[field])fields.push(`<label>${label}投标${typeof d[field]==='number'?`（最多${d[field]}）`:''}<input id="bid-${field}" type="number" min="0" max="${bidResourceLimit(s,q.cardId,s.current,key)}" value="0"></label>`);
 if(d.sale?.players.includes(s.current))fields.push(`<label>出售待命军队投标（每支${d.sale.price}资金${d.sale.max===undefined?'':`，最多${d.sale.max}支`}）<input id="bid-sold-armies" type="number" min="0" max="${bidSaleLimit(s,q.cardId,s.current)}" value="0"></label><p>揭标后出售所选军队，无论胜败均获得出售收入；出售的军队不进入地图。</p>`);
 for(const [i,rule] of (d.sideModifiers||[]).entries())fields.push(`<p>${EVENT_DATA[q.cardId].sides[i].map(id=>names[id]).join('与')}阵营总投标额外加${rule.random?`随机${rule.random[0]}～${rule.random[1]}（揭标时一次抽取）`:rule.allyCountry?'1（本阵营拥有格鲁吉亚时）':`${AREAS[rule.neutral].name}中立影响力数量（当前${s.regions[rule.neutral].influence.neutral}）`}；全阵营只加一次，不产生SP。</p>`);
 if(d.opponent)fields.push(`<p>全部提交后随机抽取${d.opponent[0]}～${d.opponent[1]}的对手出价，并保存本次结果。${d.tie==='player'?'与对手平局时玩家获胜。':'与对手平局时事件保留到下一轮，按完整实际投标获得SP。'}</p>`);
 if(d.tie==='shared')fields.push('<p>最高投标平局时，平局者各额外获得2 SP和2分；所有玩家的基础SP按自己完整实际投标获得。</p>');
 if(d.tie==='RU')fields.push('<p>双方总投标平局时俄罗斯获胜，按胜方取得基础SP。</p>');
 if(canMove){fields.push('<p>移动军队到事件牌（每支5资金；资金投标与移动费必须同时付得起）：</p>');for(const from of ['reserve',...Object.keys(AREAS)]){
  const available=from==='reserve'?p.resources[6]:s.regions[from].armies[s.current];if(!available)continue;
  fields.push(`<label>${from==='reserve'?'待命区':AREAS[from].name}（${available}支${d.freeFrom?.[s.current]===from?'，本牌免费移动':''}）<input data-bid-armies="${from}" type="number" min="0" max="${available}" value="0"></label>`);
 }}
 return `<p>各方秘密提交；全部提交后同时公开并支付费用，无论胜败。胜方获得自己实际投标的一半SP（向下取整），败方获得全部；修正不产生SP。明确无效果／保留到下轮的平局双方都获得全部投标数的SP。</p><p>本方固定修正：＋${q.modifiers[s.current]||0}。${d.reserveRequired?'至少有1支待命军队才能出正数投标；获胜后出售1支，获得10资金。':''}所有数量填0表示不投标；仅靠修正获胜不领取本方奖励。</p>${fields.join('')}${q.submissions[s.current]?'<p>本方已提交：'+q.submissions[s.current].total+'。等待其余玩家，尚未扣费。</p>':''}`;
}
export function renderBidReward(s,q,cards={}){
 const step=q.rewardQueue[0],disabled=step.owner!==s.current?'disabled':'',r=s.regions[step.region],permanent=emptyPermanentSlot(r)>=0;
 let form='';
 if(step.type==='investment')form=`<p>可重整一个${AREAS[step.region].name}盟国并免费投资，允许已有投资；正常添加影响力，投资后横置。</p><label>盟国<select id="bid-country">${bidInvestmentTargets(s,step.owner,step.region).map(id=>`<option value="${id}">${cards[id]?.name||countryInfo(id).countryName}</option>`).join('')}</select></label><label>影响力位置<select id="bid-slot">${permanent?'<option value="permanent">永久槽 · 1分</option>':''}<option value="temporary">临时槽</option></select></label><label><input id="bid-invest-ready" type="checkbox" ${s.players[step.owner].smart<1?'disabled':''}>投资后另付1 SP重整</label>`;
 else if(step.type==='move')form=`<p>可以免费向${AREAS[step.region].name}移动至多${step.max}支军队；全部填0即不移动。</p>${['reserve',...Object.keys(AREAS).filter(id=>id!==step.region)].flatMap(from=>{const n=from==='reserve'?s.players[step.owner].resources[6]:s.regions[from].armies[step.owner];return n?[`<label>${from==='reserve'?'待命区':AREAS[from].name}（${n}支）<input data-bid-reward-armies="${from}" type="number" min="0" max="${Math.min(n,step.max)}" value="0"></label>`]:[];}).join('')}`;
 else if(step.type==='convert')form=`<p>选择在${AREAS[step.region].name}转为永久的本方临时影响力。永久槽满时额外放置，不获得槽位分。</p><label>临时影响力<select id="bid-convert-index">${r.temporary.flatMap((owner,index)=>owner===step.owner?[`<option value="${index}">临时轨第${index+1}格</option>`]:[]).join('')}</select></label>`;
 else form=`${step.type==='paidInfluence'?`<p>可支付${step.money}资金、${step.diplomacy}外交执行；费用不足可放弃。</p>`:''}<p>向${AREAS[step.region].name}添加1点影响力，领取通常槽位分。</p><label>影响力位置<select id="bid-slot">${permanent?'<option value="permanent">永久槽 · 1分</option>':''}<option value="temporary">临时槽 · ${r.temporary.length===AREAS[step.region].temp.length?0:AREAS[step.region].temp[r.temporary.length]}分</option></select></label>${step.type==='africa'?'<p>可用每份2资金购买能源和原料，各最多3份；不购买填0。费用按购买前资金校验，不能用本次超限折现支付本次购买。</p><label>能源<input id="bid-energy" type="number" min="0" max="3" value="0"></label><label>原料<input id="bid-raw" type="number" min="0" max="3" value="0"></label>':''}${step.type==='aukus'?`<label><input id="bid-sell-army" type="checkbox" ${s.players[step.owner].resources[6]<1?'disabled':''}>另出售1支待命军队，获得10资金（当前${s.players[step.owner].resources[6]}支）</label>`:''}`;
 form=form.replace('id="bid-slot"',`id="bid-slot" data-region-value="${step.region}"`).replace('id="bid-convert-index"',`id="bid-convert-index" data-region-value="${step.region}"`);
 return `${renderBidSummary(q)}<p>${q.result}</p><fieldset ${disabled}><b>${names[step.owner]} · 事件效果选择</b>${form}<button id="event-reward">执行获奖选择</button>${step.optional?'<button id="event-reward-skip">放弃本次可选效果</button>':''}</fieldset>`;
}
export function readBidForm(){return {moneyUnits:Number(document.querySelector('#bid-money')?.value||0),diplomacy:Number(document.querySelector('#bid-diplomacy')?.value||0),services:Number(document.querySelector('#bid-services')?.value||0),soldArmies:Number(document.querySelector('#bid-sold-armies')?.value||0),armies:Object.fromEntries([...document.querySelectorAll('[data-bid-armies]')].map(el=>[el.dataset.bidArmies,Number(el.value)]))};}
export function readBidReward(){return {slot:document.querySelector('#bid-slot')?.value,country:document.querySelector('#bid-country')?.value,investSP:document.querySelector('#bid-invest-ready')?.checked?'after':'',index:Number(document.querySelector('#bid-convert-index')?.value??-1),energy:Number(document.querySelector('#bid-energy')?.value||0),raw:Number(document.querySelector('#bid-raw')?.value||0),sellArmy:!!document.querySelector('#bid-sell-army')?.checked,moves:Object.fromEntries([...document.querySelectorAll('[data-bid-reward-armies]')].map(el=>[el.dataset.bidRewardArmies,Number(el.value)]))};}
