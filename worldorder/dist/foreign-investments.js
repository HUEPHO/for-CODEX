import {foreignInvestmentOwners,foreignInvestments} from './investment-tokens.js';
import {countryInfo} from './country-actions.js';
import {investmentCost,countryValue} from './research.js';
import {payCardCost} from './special-effects.js';
import {placementPreview,placeWithResilience} from './growth-triggers.js';
export function foreignInvestmentTargets(s){const existing=foreignInvestments(s,s.current);return Object.entries(s.players).filter(([host])=>host!==s.current).flatMap(([host,p])=>p.allies.filter(country=>((p.fdi||[]).includes(country)||foreignInvestmentOwners(s,host,country).length)&&!existing.some(x=>x.host===host&&x.country===country)).map(country=>({host,country})));}
export function foreignInvestmentPreview(s,a){if(!foreignInvestmentTargets(s).some(x=>x.host===a.host&&x.country===a.country))throw Error('请选择其他玩家带有投资标记、且本方尚未投资的盟国');const result={host:a.host,country:a.country,region:countryInfo(a.country).region,cost:investmentCost(a.country)+5,income:2*countryValue(a.country),influence:true};payCardCost(structuredClone(s),{money:result.cost});result.vp=placementPreview(s,a,result);return result;}
export function resolveForeignInvestment(s,a){const result=foreignInvestmentPreview(s,a),p=s.players[s.current],host=s.players[a.host];payCardCost(s,{money:result.cost});p.foreignInvestments??=[];p.foreignInvestments.push({host:a.host,country:a.country});host.exhaustedAllies=[...new Set([...(host.exhaustedAllies||[]),a.country])];placeWithResilience(s,a,result);return result;}
