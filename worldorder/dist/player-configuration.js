import {POWERS} from './game-constants.js';

export const POWER_IDS=Object.keys(POWERS);
export function humanPlayers(s){return s.config.humans||POWER_IDS;}
export function isNonPlayer(s,id){return POWER_IDS.includes(id)&&!humanPlayers(s).includes(id);}
export function isAutoma(s,id){return !!s.config.automas?.[id];}
export function isBasicNonPlayer(s,id){return isNonPlayer(s,id)&&!isAutoma(s,id);}
export function activePlayers(s){return POWER_IDS.filter(id=>!isBasicNonPlayer(s,id));}
export function firstHuman(s){return (s.flow?.order||POWER_IDS).find(id=>humanPlayers(s).includes(id));}
export function automatonMode(config){return config.automatonMode??(Object.keys(config.automas||{}).length?'advanced':(config.humans||POWER_IDS).length<4?'basic':'none');}
export function configuredPlayers(config){
 const ids=config.humans??POWER_IDS;
 const mode=automatonMode(config);
 if(!['none','basic','advanced'].includes(mode))throw Error('请选择有效的自动机模式');
 if(!Array.isArray(ids)||ids.length<(mode==='advanced'?1:2)||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!POWER_IDS.includes(id)))throw Error(mode==='advanced'?'请选择1至3个玩家势力':'请选择2至4个玩家势力');
 if(mode==='none'&&ids.length!==4)throw Error('无自动机模式需要4位玩家');
 if(mode!=='none'&&ids.length===4)throw Error('自动机模式至少需要一个自动机势力');
 if(mode==='basic'&&ids.length===2&&ids.filter(id=>['US','EU'].includes(id)).length!==1)throw Error('双人局需各选一个美国／欧盟和中国／俄罗斯势力');
 if(mode==='advanced'&&!['normal','hard'].includes(config.automaDifficulty??'normal'))throw Error('请选择普通或困难难度');
 return POWER_IDS.filter(id=>ids.includes(id));
}
export function configuredAutomas(config,humans){
 if(automatonMode(config)!=='advanced')return {};
 return Object.fromEntries(POWER_IDS.filter(id=>!humans.includes(id)).map(id=>[id,config.automaDifficulty??'normal']));
}
