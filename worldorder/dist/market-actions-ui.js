const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function preparationControls(s,card,cards={}){const p=s.players[s.current],parts=[];
 if(card.moneySurcharge)parts.push(`<p>本段除通常行动费用外，额外支付${card.moneySurcharge}资金。</p>`);
 if(card.allowNoAlly)parts.push('<p>本牌允许介入没有本方盟国的指定地区；仍支付通常外交费用。</p>');
 if(card.baseLimit)parts.push('<p>本牌允许在同一盟国建立第2座基地，仍需正常支付并派兵。</p>');
 if(card.investmentLimit)parts.push('<p>本牌允许在同一盟国投资第2次；每个FDI标记分别计算收益。</p>');
 if(card.permanentOverflow)parts.push('<p>可选择永久影响力，即使永久槽已满；满槽时额外放置不获得1分。</p>');
 if(card.moneyBefore)parts.push(`<p>投资之前先获得${card.moneyBefore}资金。</p>`);
 if(card.moneyPerFDI)parts.push(`<p>先按本方已有FDI标记，每个获得${card.moneyPerFDI}资金；本次新增标记不计入。</p>`);
 if(card.diplomacyBefore)parts.push(`<p>先获得${card.diplomacyBefore}外交，再执行所选行动；先处理库存上限。</p>`);
 if(card.readyTarget)parts.push('<p>先重整所选盟国，再投资该盟国；本次投资不横置它。</p>');
 if(card.readyBefore)parts.push(`<fieldset><legend>先重整至多${card.readyBefore}个盟国</legend>${p.allies.filter(id=>(p.exhaustedAllies||[]).includes(id)).map(id=>`<label><input type="checkbox" data-ready-before="${id}"> ${esc(cards[id]?.name)}</label>`).join('')||'<p>目前没有已横置的盟国。</p>'}</fieldset>`);
 if(card.produceArmies)parts.push(`<label>先生产军队<input id="market-army-production" type="number" min="0" max="${p.production[6]}" value="0" step="1"></label><p>每支消耗1原料和1粮食，最多生产${p.production[6]}支；新生产的军队可以立即派出。</p>`);
 if(card.engageDiscount)parts.push(`<p>本牌按介入地区的${card.engageDiscount==='armies'?'本方军队':'本方盟国'}数量额外减少外交费用。</p>`);
 return parts.join('');
}
export function branchControl(card,branch){return card.choices?`<label>选择行动<select id="basic-branch">${card.choices.map(effect=>`<option value="${effect}" ${effect===branch?'selected':''}>${effect==='relations'?'改善关系':'介入地区'}</option>`).join('')}</select></label>`:'';}
export function readMarketForm(){const value=document.querySelector('#market-reset')?.value;const [region,index]=value?value.split(':'):[];return {branch:document.querySelector('#basic-branch')?.value,armyProduction:Number(document.querySelector('#market-army-production')?.value||0),readyAllies:[...document.querySelectorAll('[data-ready-before]:checked')].map(el=>el.dataset.readyBefore),resetInfluence:value?{region,index:Number(index)}:null};}
