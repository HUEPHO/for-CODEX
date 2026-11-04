import {AREAS,syncInfluence,changeInfluence,retireStartingSlot} from './world.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯',neutral:'中立'};
function permanentTarget(r,player,region){
 const start=r.permanent.findIndex((id,i)=>id===player&&i<AREAS[region].start.length);
 if(start>=0)return {kind:'permanent',index:start};
 const index=r.permanent.indexOf(player);if(index>=0)return {kind:'permanent',index};
 const extra=r.extraPermanent.indexOf(player);return extra>=0?{kind:'extraPermanent',index:extra}:null;
}
function removeAt(s,region,target,replacement=null){
 const r=s.regions[region],{kind,index}=target;
 if(replacement)r[kind][index]=replacement;
 else if(kind==='permanent'){r.permanent[index]=null;retireStartingSlot(s,region,index);}
 else r[kind].splice(index,1);
 syncInfluence(r);
}
export function removeEventInfluence(s,player,region,replace=false){
 const r=s.regions[region],index=r.temporary.indexOf(player),target=index>=0?{kind:'temporary',index}:permanentTarget(r,player,region);
 if(!target)return `${names[player]}在${AREAS[region].name}没有可移除影响力，继续其余效果`;
 removeAt(s,region,target,replace?'neutral':null);
 return `${AREAS[region].name}：${replace?'原位替换为中立':'移除'}${names[player]}的${target.kind==='temporary'?'临时':target.kind==='permanent'&&target.index<AREAS[region].start.length?'起始':'永久'}影响力${!replace&&target.kind==='permanent'&&target.index<AREAS[region].start.length?'；该起始槽永久停用':''}`;
}
export function downgradeEventInfluence(s,player,region){
 const r=s.regions[region],target=permanentTarget(r,player,region);
 if(!target)return `${names[player]}在${AREAS[region].name}没有永久影响力，继续其余效果`;
 removeAt(s,region,target);const free=r.temporary.length<AREAS[region].temp.length;
 if(free)r.temporary.push(player);syncInfluence(r);
 return `${names[player]}在${AREAS[region].name}的永久影响力${free?'转为临时，不获得槽位分':'因临时槽已满而移除'}${target.kind==='permanent'&&target.index<AREAS[region].start.length?'；原起始槽永久停用':''}`;
}
export function placeEventInfluence(s,owner,region,slot){
 if(owner!==s.current)throw Error('请由获得影响力的玩家选择位置');
 if(!['permanent','temporary'].includes(slot))throw Error('请选择永久或临时影响力位置');
 return changeInfluence(s,{region,operation:slot==='permanent'?'placePermanent':'placeTemporary'});
}
export function convertEventInfluence(s,owner,region,index){
 if(owner!==s.current)throw Error('请由获得效果的玩家选择影响力');
 return changeInfluence(s,{region,operation:'convert',index});
}
