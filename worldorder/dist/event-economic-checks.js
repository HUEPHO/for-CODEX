import {countryInfo} from './country-actions.js';
import {resolveBasicEffect} from './basic-actions.js';
import {investedCountries} from './investment-tokens.js';
import {grantEventEffect} from './event-effects.js';

export const ECONOMIC_CHECK_EVENTS=Object.freeze({c1def0449fb8a:'ceta',c84925e4d16b2:'cpec'});
const owners={ceta:'EU',cpec:'CN'};
export function economicCheckCondition(s,q){
 const kind=ECONOMIC_CHECK_EVENTS[q?.cardId],owner=owners[kind];
 if(!kind)throw Error('此经济检查事件尚未登记');
 if(q.owner!==owner||!s.players[owner])throw Error('经济检查事件的所属玩家不符');
 const p=s.players[owner];
 if(kind==='ceta'){
  const allies=p.allies.filter(id=>countryInfo(id).region==='M');
  return {kind,owner,met:allies.length>=2,count:allies.length,allies,region:'M',detail:`当前有${allies.length}个美洲盟国；至少2个时，可正常付费介入美洲，完成后获得1 SP和欧盟—美洲贸易协定。`};
 }
 const invested=investedCountries(s,owner),count=invested.filter(id=>countryInfo(id).countryName==='Pakistan').length;
 const ownTokens=new Map();for(const id of p.fdi||[])ownTokens.set(id,(ownTokens.get(id)||0)+1);
 const targets=p.allies.filter(id=>countryInfo(id).countryName==='Pakistan'&&ownTokens.has(id));
 return {kind,owner,met:count>0,count,targets,region:'S',detail:`当前在巴基斯坦有${count}份投资。满足条件即获得2 SP；随后可另付2外交和正常投资费用，在巴基斯坦增加一份投资。`};
}
function execute(s,q,a,condition){
 const p=s.players[q.owner];
 if(condition.kind==='ceta'){
  if(!a.accept)return '放弃介入美洲；未支付费用，也不获得SP或持续贸易效果。';
  if(a.region&&a.region!=='M')throw Error('本事件只能介入美洲');
  const command={region:'M',slot:a.slot,exhaust:a.exhaust||[],engageSP:a.engageSP??0,moveFrom:a.moveFrom||'',resilience:a.resilience||null};
  const result=resolveBasicEffect(s,command,{name:'欧盟—美洲协议介入',effect:'engage',targetRegion:'M'});
  // This reward follows the completed intervention and cannot fund its SP cost.
  p.smart+=1;grantEventEffect(s,q.owner,'c7111682c7ac8',q.cardId);
  return `支付${result.cost}外交${result.smartCost?'和1 SP':''}，介入美洲并添加1影响力；完成后获得1 SP和欧盟—美洲贸易协定。`;
 }
 p.smart+=2;
 if(!a.accept)return '已获得2 SP；放弃再次投资巴基斯坦，未支付可选投资费用。';
 if(!condition.targets.includes(a.country))throw Error('请选择本方已投资的巴基斯坦盟国');
 if(p.resources[5]<2)throw Error('再次投资巴基斯坦需要额外2外交');
 p.resources[5]-=2;
 const command={country:a.country,slot:a.slot,investSP:a.investSP||'',resilience:a.resilience||null};
 const limit=(p.fdi||[]).filter(id=>id===a.country).length+1;
 const result=resolveBasicEffect(s,command,{name:'中巴经济走廊投资',effect:'invest',targetCountry:a.country,investmentLimit:limit});
 q.investment={country:a.country,slot:a.slot,investSP:a.investSP||'',money:result.cost};
 return `先获得2 SP；支付2外交和${result.cost}资金，在巴基斯坦增加一份投资并添加1影响力${a.investSP?'；另付1 SP'+(a.investSP==='before'?'在投资前重整，投资后横置':'在投资后重整'):'，投资后横置盟国'}。`;
}
export function resolveEconomicCheck(s,q,a,{preview=false}={}){
 if(q?.owner!==s.current)throw Error('请由经济检查事件所属玩家操作');
 const condition=economicCheckCondition(s,q);
 if(!condition.met)return '未满足牌面条件，本事件无后续效果。';
 if(a.accept!==true&&a.accept!==false)throw Error('请选择执行或放弃可选效果');
 // The optional investment is validated after its mandatory SP reward, while
 // CETA validates intervention before its reward. Both remain atomic on error.
 const detail=execute(structuredClone(s),structuredClone(q),a,condition);
 if(!preview)execute(s,q,a,condition);
 return detail;
}
