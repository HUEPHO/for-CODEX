// Map returns are a form preview. The bid still submits the real army sources.
const returns=form=>JSON.parse(form.dataset.bidArmyReturns||'{}');
export function readBidArmySources(form=document.querySelector('.event-bid-form')){
 const input=form?.querySelector('[data-bid-armies="reserve"]');if(!input)return {};
 const regions=returns(form),returned=Object.values(regions).reduce((sum,n)=>sum+n,0),selected=Number(input.value);
 if(selected<returned)throw Error(`还有${returned-selected}支地图取回的军队未派遣，请增加移动出价，或左键原地区放回。`);
 return {reserve:selected-returned,...regions};
}
export function bidArmyDeploymentModel(task,s){
 const el=task?.querySelector('.event-bid-form'),input=el?.querySelector('[data-bid-armies="reserve"]'),q=s.flow?.eventResolution;
 if(!input||!q?.bidVersion||q.stage!=='bid'||el.dataset.armyOwner!==s.current||el.closest('[hidden],fieldset[disabled]')||task.querySelector('#event-submit')?.matches(':disabled'))return null;
 const owner=el.dataset.armyOwner,delta=Object.fromEntries(Object.entries(returns(el)).map(([region,n])=>[region,-n])),initial=s.players[owner].resources[6];
 return {bid:true,el,input,delta,s,initial,options:{owner,destinations:Object.keys(s.regions).filter(region=>s.regions[region].armies[owner]>0)},reserve:initial-Object.values(delta).reduce((sum,n)=>sum+n,0)-Number(input.value)};
}
