import {POWERS} from './game-constants.js';

export const POWER_IDS=Object.keys(POWERS);
export function humanPlayers(s){return s.config.humans||POWER_IDS;}
export function isNonPlayer(s,id){return POWER_IDS.includes(id)&&!humanPlayers(s).includes(id);}
export function configuredPlayers(config){
 const ids=config.humans??POWER_IDS;
 if(!Array.isArray(ids)||ids.length<2||ids.length>4||new Set(ids).size!==ids.length||ids.some(id=>!POWER_IDS.includes(id)))throw Error('请选择2至4个玩家势力');
 if(ids.length===2&&ids.filter(id=>['US','EU'].includes(id)).length!==1)throw Error('双人局需各选一个美国／欧盟和中国／俄罗斯势力');
 return POWER_IDS.filter(id=>ids.includes(id));
}
