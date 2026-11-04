import {RESEARCH_DATA} from './research-data.js';
import {EVENT_EFFECTS,hasEventEffect} from './event-effect-state.js';
export {EVENT_EFFECTS,hasEventEffect,grantEventEffect,removeEventEffect} from './event-effect-state.js';

export function eventTradeRegions(s,owner){return [...new Set((s.eventEffects||[]).filter(e=>e.owner===owner&&EVENT_EFFECTS[e.cardId]?.owner===owner).flatMap(e=>EVENT_EFFECTS[e.cardId].tradeRegions||[]))];}
export function eventExportMultiplier(s,owner,country){
 // The supplied TTS country catalogue spells Kyrgyzstan as "Kyrgystan".
 return hasEventEffect(s,owner,'c93edef6ccf8a')&&['Armenia','Belarus','Kazakhstan','Kyrgystan','Kyrgyzstan'].includes(RESEARCH_DATA[country]?.countryName)?2:1;
}
