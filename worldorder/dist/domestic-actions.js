import {industryEligible,validateIndustry} from './growth-industry.js';
import {boxedAssets,beginBattlefield} from './growth-battlefield.js';
import {refreshCommerce} from './commerce.js';
import {gainResource,validateProduction,RESOURCE_LABELS} from './economy.js';
import {GROWTH_DATA} from './growth-data.js';
import {drawCards} from './draw.js';
export function productionPreview(s,steps,max=3){const p=structuredClone(s.players[s.current]);validateProduction(p,s.current);if(!Array.isArray(steps)||steps.length>max||new Set(steps.map(x=>x.key)).size!==steps.length)throw Error('请选择至多'+max+'种不同资源');let overflow=0;const lines=[];
 for(const step of [...steps.filter(x=>x.key<3),...steps.filter(x=>!(x.key<3))]){const k=step.key;if(!Number.isInteger(k)||k<0||k>6)throw Error('无效资源');const n=k<3?p.production[k]:step.quantity;if(!Number.isInteger(n)||n<1||n>p.production[k])throw Error('生产数量必须在1至当前产能之间');
  if(k===5){if(p.money<n*3)throw Error('生产外交所需资金不足');p.money-=n*3;}else if(k>2){const needs=k===3?[0,1]:k===4?[0,2]:[1,2];if(needs.some(j=>p.resources[j]<n))throw Error('生产'+RESOURCE_LABELS[k]+'的初级资源不足');for(const j of needs)p.resources[j]-=n;}
  overflow+=gainResource(p,k,n);lines.push({key:k,quantity:n});
 }
 return {name:'发展战略 · 生产',effect:'production',cost:0,vp:0,resources:p.resources,money:p.money,overflow,produced:lines};
}
export function applyProduction(s,result){const p=s.players[s.current];p.resources=result.resources;p.money=result.money;for(const x of result.produced)refreshCommerce(p,s.current,x.key);}
export function growthPreview(s,a,card={}){const p=s.players[s.current],g=GROWTH_DATA[a.growthId];if(!g||!s.growth.includes(a.growthId))throw Error('请选择供应区中已支持自动购入的发展牌');
 // A legal growth sequence has one card per level. Existing manual acquisitions
 // must be a complete sequence before an automatic purchase can extend it.
 const levels=p.growth.map(id=>GROWTH_DATA[id]?.level??s.cardLevels?.[id]);if(levels.some(n=>!Number.isInteger(n)))throw Error('已有扩展发展牌，请手动处理后续发展牌');if(new Set(levels).size!==levels.length||levels.some(n=>n<1||n>levels.length))throw Error('已有发展牌等级不连续，请核对手动记录');if(g.level!==levels.length+1)throw Error('必须按等级顺序取得下一张发展牌');
 if(g.effect==='battlefield'&&boxedAssets(s).length<2)throw Error('盒中不足2张本方战略资产，不能购入战役优势');
 const serviceMoney=a.serviceMoney??0;if(!Number.isInteger(serviceMoney)||serviceMoney<0||serviceMoney>g.services||serviceMoney&&!card.serviceMoneyCost)throw Error('资金替代服务的数量无效');const services=g.services-serviceMoney,cost=g.money+serviceMoney*(card.serviceMoneyCost||0);
 if(p.resources[4]<services||p.resources[5]<g.diplomacy||p.money<cost)throw Error('发展牌所需服务、外交或资金不足');const upgrades=a.upgrades||[];
 if(p.resources[3]<(g.goods||0)||p.resources[6]<(g.armies||0))throw Error('发展牌所需消费品或待命军队不足');
 const primary=g.primary?a.primary:[];if(g.primary&&(!Array.isArray(primary)||primary.length!==3||primary.some((n,k)=>!Number.isInteger(n)||n<0||n>p.resources[k])||primary.reduce((sum,n)=>sum+n,0)!==g.primary))throw Error('资源集约需支付合计5份能源、原料或粮食，不能超过库存');
 if(g.discard&&(!p.hand.includes(a.growthDiscard)||a.growthDiscard===a.cardId))throw Error('高层更替需弃置另一张现有手牌支付费用');
 const pendingIndustry=g.effect==='industry'&&Array.isArray(upgrades)&&upgrades.length===0&&industryEligible(s).length>0;
 if(g.effect==='industry'){if(!pendingIndustry)validateIndustry(s,upgrades);}else if(upgrades.length)throw Error('这张发展牌不能提升产能');
 return {name:'发展战略 · '+g.name,effect:'growth',cost,vp:0,growthVP:g.effect==='dominance'?2*(s.round-1):g.vp,services,serviceMoney,primary,diplomacy:g.diplomacy,goods:g.goods||0,armies:g.armies||0,growthDiscard:g.discard?a.growthDiscard:null,growthId:a.growthId,growth:g,upgrades,pendingIndustry,active:g.effect==='battlefield'||s.round>=g.level};
}
export function applyGrowth(s,result){const p=s.players[s.current];p.money-=result.cost;p.resources[4]-=result.services;p.resources[5]-=result.diplomacy;p.resources[3]-=result.goods||0;p.resources[6]-=result.armies||0;p.vp+=result.growthVP;for(const [k,n] of (result.primary||[]).entries())p.resources[k]-=n;if(result.growthDiscard){p.hand.splice(p.hand.indexOf(result.growthDiscard),1);p.discard.push(result.growthDiscard);}s.growth.splice(s.growth.indexOf(result.growthId),1);p.growth.push(result.growthId);p.automatedGrowth??=[];p.automatedGrowth.push(result.growthId);for(const k of result.upgrades)p.production[k]++;if(result.pendingIndustry)s.flow.pendingGrowth={owner:s.current,cardId:result.growthId,effect:'industry'};if(result.growth.effect==='battlefield')beginBattlefield(s,result.growthId);if(result.active&&result.growth.effect==='draw')result.drawn=drawCards(p,1);}
