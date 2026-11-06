// Event destinations keep source choices separate from ordinary on-map moves.
export function renderArmyContribution(s,{id='army-contribution',owner=s.current,armies={},supply=false,max=999,production=''}={}){
 const returned=Object.fromEntries(Object.entries(armies).filter(([id])=>id!=='reserve')),count=Object.values(armies).reduce((a,b)=>a+b,0);
 return `<div class="army-contribution" id="${id}" data-army-owner="${owner}" data-army-supply="${supply}" data-army-max="${max}" data-army-production="${production}" data-bid-army-returns='${JSON.stringify(returned)}'><label>${supply?'移回补给':'派往事件牌'}<input type="number" data-bid-armies="reserve" min="0" max="${Math.min(max,(supply?0:s.players[owner].resources[6])+Object.values(returned).reduce((a,b)=>a+b,0))}" value="${count}" aria-label="${supply?'移回补给':'派往事件牌'}坦克数量"></label><small>右键地图取回，左键原地区放回调整。</small></div>`;
}
export function readArmyContribution(root){
 if(!root)return {};
 const returns=JSON.parse(root.dataset.bidArmyReturns),count=Number(root.querySelector('input').value),returned=Object.values(returns).reduce((a,b)=>a+b,0),supply=root.dataset.armySupply==='true';
 if(count<returned)throw Error('取回的坦克尚未全部派遣，请增加派遣数量或左键原地区放回');
 if(supply&&count!==returned)throw Error('只能将地图取回的坦克移回补给');
 return {...(!supply&&count>returned?{reserve:count-returned}:{}),...returns};
}
export function contributionDeploymentModel(task,s){
 const el=[...(task?.querySelectorAll('.army-contribution')||[])].find(el=>!el.closest('[hidden],fieldset[disabled]')&&el.dataset.armyOwner===s.current);if(!el)return null;
 const input=el.querySelector('input'),owner=el.dataset.armyOwner,delta=Object.fromEntries(Object.entries(JSON.parse(el.dataset.bidArmyReturns)).map(([id,n])=>[id,-n]));
 const supply=el.dataset.armySupply==='true',initial=(supply?0:s.players[owner].resources[6])+Number(el.dataset.armyProduction?document.querySelector(el.dataset.armyProduction)?.value||0:0);
 return {bid:true,contribution:true,supply,el,input,delta,s,initial,options:{owner,maxMoves:Number(el.dataset.armyMax),destinations:Object.keys(s.regions)},reserve:initial-Object.values(delta).reduce((a,b)=>a+b,0)-Number(input.value)};
}
