import {GROWTH_DATA} from './growth-data.js';
import {changeInfluence} from './world.js';
import {relationPreview,applyRelations,countryInfo} from './country-actions.js';

export function availableGrowth(s,effect){const p=s.players[s.current];return p.growth.find(id=>GROWTH_DATA[id]?.effect===effect&&GROWTH_DATA[id].level<=s.round&&p.growthUsed?.[id]!==s.round);}
function use(s,id){const p=s.players[s.current];p.growthUsed??={};p.growthUsed[id]=s.round;}
// Preview and commit share the ordered conversion/placement operation. Conversion
// earns no points; converting first can change the next temporary slot's points.
export function placeWithResilience(s,a,result){
 const choice=a.resilience;if(!result.influence){if(choice)throw Error('本次没有添加影响力，不能触发区域韧性');return 0;}
 let id;if(choice){id=availableGrowth(s,'resilience');if(!id)throw Error('区域韧性尚未生效或本轮已使用');if(!['before','after'].includes(choice.timing))throw Error('请选择添加影响力之前或之后转换');}
 const convert=()=>changeInfluence(s,{region:result.region,operation:'convert',index:choice.index});
 if(choice?.timing==='before')convert();
 const {vp}=changeInfluence(s,{region:result.region,operation:a.slot==='permanent'?'placePermanent':'placeTemporary',allowOverflow:!!result.permanentOverflow});
 if(choice?.timing==='after')convert();if(id)use(s,id);return vp;
}
export function placementPreview(s,a,result){
 if(result.influence&&!['permanent','temporary'].includes(a.slot))throw Error('请选择永久或临时影响力');
 return placeWithResilience(structuredClone(s),a,result);
}
export function startOpenDiplomacy(s,a,card){
 const growthId=availableGrowth(s,'open');if(!growthId)throw Error('开放外交尚未生效或本轮已使用');
 // The growth ability adds a separate relation action; the first action's
 // one-country discount does not repeat on this additional country.
 const {relationDiscount,countrySearchRegion,allowedRegions,excludeRegion,...openCard}=card;
 s.flow.pendingRelation={owner:s.current,growthId,firstCountry:a.country,card:openCard};
}
export function openRelationPreview(s,a){
 const pending=s.flow?.pendingRelation;if(!pending||pending.owner!==s.current)throw Error('当前没有待追加的结盟');
 if(availableGrowth(s,'open')!==pending.growthId)throw Error('开放外交状态已变化');
 if(countryInfo(a.country).countryName===countryInfo(pending.firstCountry).countryName)throw Error('必须选择另一个国家');
 const copy=structuredClone(s),p=copy.players[copy.current];if(p.resources[5]<1)throw Error('开放外交需要额外支付1外交，不能用盟国减免');p.resources[5]--;
 const result={...relationPreview(copy,a,pending.card),effect:'relations',growthId:pending.growthId,activationCost:1};
 result.vp=placementPreview(copy,a,result);return result;
}
export function resolveOpenDiplomacy(s,a){
 const result=openRelationPreview(s,a),p=s.players[s.current];p.resources[5]--;p.smart-=result.smartCost;p.exhaustedAllies??=[];p.exhaustedAllies.push(...result.exhaust);
 applyRelations(s,a,result);placeWithResilience(s,a,result);use(s,result.growthId);s.flow.pendingRelation=null;return result;
}
