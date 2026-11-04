// Forced event losses exhaust the available amount, then convert the shortage to VP.
// User ruling: every started group of 5 missing money costs 1 VP.
function lose(target,key,amount,unit,p){
 if(!Number.isInteger(amount)||amount<0)throw Error('事件损失数量必须是非负整数');
 const lost=Math.min(target[key],amount),shortfall=amount-lost,vp=Math.ceil(shortfall/unit);
 target[key]-=lost;p.vp-=vp;return {lost,shortfall,vp};
}
export function loseEventMoney(p,amount){return lose(p,'money',amount,5,p);}
export function loseEventResource(p,key,amount){
 if(!Number.isInteger(key)||key<0||key>6)throw Error('事件损失资源无效');
 return lose(p.resources,key,amount,1,p);
}
