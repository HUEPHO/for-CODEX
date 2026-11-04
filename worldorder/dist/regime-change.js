import {RESEARCH_DATA} from './research-data.js';
import {payCardCost} from './special-effects.js';
import {upgradeInvestmentCountry} from './investment-tokens.js';

// Printed starting allies from cards.json. Name matching also protects older
// manually upgraded saves that did not retain their starting-card underlays.
export const INITIAL_ALLIES={
 US:['cb427f6dd4283','c5b14895e1f71','ce2df59690e60','c5bc763998f23'],
 CN:['c136d13172c98','c3b8dd93d4f06','cd3e3a0f1fe94','c73da57a51c66'],
 EU:['c35627e0bba08','c5edff473d37a','c669f1bf5bc5f','c77fa4750ee97','ca03520c27e87'],
 RU:['c4d2b5add5fd4','c67140897200a','cb617d12c21c0','c5cc315dcb8bd']
};
export function protectedInitialAlly(s,host,country){const p=s.players[host],c=RESEARCH_DATA[country];return !!c?.starting||(p.countryUnderlays?.[country]||[]).some(id=>RESEARCH_DATA[id]?.starting)||(INITIAL_ALLIES[host]||[]).some(id=>RESEARCH_DATA[id].countryName===c?.countryName);}
export function regimeTargets(s,step){return Object.entries(s.players).filter(([host])=>host!==s.current&&!(step.excludePlayers||[]).includes(host)).flatMap(([host,p])=>p.allies.filter(country=>RESEARCH_DATA[country]?.countryValue===1&&!protectedInitialAlly(s,host,country)).map(country=>({host,country})));}
export function regimePreview(s,a,step){
 if(!regimeTargets(s,step).some(x=>x.host===a.host&&x.country===a.country))throw Error('请选择允许玩家的非初始1价值盟国；初始盟国及其升级版本均不可夺取');
 const c=RESEARCH_DATA[a.country],own=s.players[s.current],existing=own.allies.filter(id=>RESEARCH_DATA[id]?.countryName===c.countryName);
 if(existing.length>1||existing.some(id=>!RESEARCH_DATA[id]?.starting))throw Error('本方已有同名非初始盟国，请核对国家记录');
 const cost={money:5,resources:{4:1,6:1}};payCardCost(structuredClone(s),cost);return {host:a.host,country:a.country,region:c.region,cost,previous:existing[0]||null};
}
export function resolveRegime(s,a,step){const result=regimePreview(s,a,step),host=s.players[result.host],p=s.players[s.current],country=result.country;payCardCost(s,result.cost);
 const underlays=host.countryUnderlays?.[country]||[];
 host.allies.splice(host.allies.indexOf(country),1);for(const key of ['exhaustedAllies','fdi','bases'])if(host[key])host[key]=host[key].filter(id=>id!==country);
 if(host.countryUnderlays)delete host.countryUnderlays[country];
 // Remove every investor's marker on the seized card, without changing any
 // investment elsewhere or moving armies stationed in its region.
 for(const player of Object.values(s.players))if(player.foreignInvestments)player.foreignInvestments=player.foreignInvestments.filter(x=>x.host!==result.host||x.country!==country);
 if(result.previous){const old=result.previous;p.allies[p.allies.indexOf(old)]=country;p.countryUnderlays??={};p.countryUnderlays[country]=[...(p.countryUnderlays[old]||[]),old,...underlays];delete p.countryUnderlays[old];for(const key of ['fdi','bases'])if(p[key])p[key]=p[key].map(id=>id===old?country:id);upgradeInvestmentCountry(s,s.current,old,country);}
 else{p.allies.push(country);if(underlays.length){p.countryUnderlays??={};p.countryUnderlays[country]=[...underlays];}}
 p.exhaustedAllies=(p.exhaustedAllies||[]).filter(id=>id!==country&&id!==result.previous);return result;
}
