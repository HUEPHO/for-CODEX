// Find one real allocation of the selected exports. A unit belongs to only one
// destination, including when several regions request the same reward.
const prices=[5,5,5,15,15,0,20];
export function allocateRegionalExports(exports,capacity,bonus,regions){
 const allowed=bonus.regions||Object.keys(capacity.byRegion);
 if(!Array.isArray(regions)||new Set(regions).size!==regions.length||regions.some(r=>!allowed.includes(r)))throw Error('请选择允许的不同奖励地区');
 if(!Array.isArray(exports)||exports.some(row=>!Number.isInteger(row.key)||!prices[row.key]||!Number.isInteger(row.quantity)||row.quantity<1)||new Set(exports.map(row=>row.key)).size!==exports.length)throw Error('出口数量与资源无效');
 const quantities=Array(7).fill(0);for(const row of exports)quantities[row.key]=row.quantity;
 const allocations=Object.fromEntries(Object.keys(capacity.byRegion).map(r=>[r,Array(7).fill(0)])),failed=new Set();
 function candidates(region,left){
  const cap=capacity.byRegion[region].exports,minimum=Array(7).fill(0);
  for(const [key,n] of Object.entries(bonus.requirements||{})){if(n>left[key]||n>cap[key])return [];minimum[key]=n;}
  const revenue=counts=>counts.reduce((sum,n,key)=>sum+n*prices[key],0),target=bonus.minimumRevenue||0,results=[];
  const keys=exports.map(row=>row.key);
  function walk(index,counts){
   if(revenue(counts)>=target){results.push(counts);return;}
   if(index===keys.length)return;
   const key=keys[index],max=Math.min(left[key],cap[key],minimum[key]+Math.ceil((target-revenue(counts))/prices[key]));
   for(let n=minimum[key];n<=max;n++){const next=[...counts];next[key]=n;walk(index+1,next);}
  }
  walk(0,minimum);return results;
 }
 function choose(index,left){
  if(index===regions.length)return left;
  const memo=index+':'+left.join(',');if(failed.has(memo))return null;
  const region=regions[index];
  for(const counts of candidates(region,left)){
   const remaining=left.map((n,key)=>n-counts[key]);
   const result=choose(index+1,remaining);if(result){allocations[region]=counts;return result;}
  }
  failed.add(memo);return null;
 }
 const remaining=choose(0,quantities);if(!remaining)throw Error('出口数量或金额不足以同时满足所选地区');
 // Unassigned exports still have to fit real destination demand. They may
 // produce additional rewards; the ordinary preview computes those as usual.
 for(const {key} of exports){let left=remaining[key];for(const region of Object.keys(allocations)){const n=Math.min(left,capacity.byRegion[region].exports[key]-allocations[region][key]);allocations[region][key]+=n;left-=n;}if(left)throw Error('出口数量超过盟国需求');}
 return exports.map(row=>({...row,regions:Object.fromEntries(Object.entries(allocations).filter(([,counts])=>counts[row.key]).map(([region,counts])=>[region,counts[row.key]]))}));
}
