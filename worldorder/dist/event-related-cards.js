import {EVENT_CHAINS,TURNING_EVENT_CHAINS} from './event-links.js';
import {DECISION_RULES} from './event-decision-rules.js';

// Public printed references only. This never reads decks or reveals which
// conditional follow-up will occur; resolution still uses its domain rules.
const references={
 c2356e9f50f6e:['cc83057306d10','cf7c0ffc48316'],
 c963b6d849299:['cc83057306d10'],
 c72c028872d0f:['c5e448d194d63'],cd84688476fde:['cd3f9ccd1ba13'],c1def0449fb8a:['c7111682c7ac8'],
 ce97d5ccaf589:['cdf7b014a4323'],c300aaac6d226:['c12b545fd816e'],cb49c1aaba260:['c0a8f33fb6048'],
 c8c95b49f81e7:['cffbb59b3d793'],ce9e1586521dc:['c00b5d0118cf2'],cf0d87e580c4a:['cf48fe9407208','c78b295d520ca'],
 c6b05cba7d362:['c2172fd0f8650'],cb7934569eecb:['c11dd78abad1e']
};
export function relatedEventCards(id){return [...new Set([...(references[id]||[]),...(DECISION_RULES[id]?.effect?[DECISION_RULES[id].effect]:[]),...(EVENT_CHAINS[id]||[]),...(TURNING_EVENT_CHAINS[id]||[])])];}
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderEventLinks(id,cards){const ids=relatedEventCards(id).filter(cid=>cards[cid]);return ids.length?`<nav class="event-related-links" aria-label="相关卡牌">${ids.map(cid=>`<button type="button" data-card="${cid}" data-source="view">${esc(cards[cid].name)}${cards[cid].name===cards[id]?.name?'（效果）':''}</button>`).join('')}</nav>`:'';}
