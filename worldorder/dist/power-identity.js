import {POWERS} from './game-constants.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const POWER_FLAGS=Object.freeze(Object.fromEntries(Object.keys(POWERS).map(owner=>[owner,`assets/flag-${owner}.svg`])));
export const powerFlagPath=owner=>POWER_FLAGS[owner]||null;
export const armyMarkerPath=owner=>`assets/token-army-${Object.hasOwn(POWERS,owner)?owner:'CN'}.png`;

/** Identity artwork only. Callers keep the original country name in sentences. */
export function powerFlag(owner,{className='',decorative=false}={}){
 const src=powerFlagPath(owner);if(!src)return '';
 const label=POWERS[owner].name+'国旗';
 return `<img class="power-flag${className?' '+esc(className):''}" data-power-flag="${owner}" src="${src}" alt="${decorative?'':label}" title="${label}"${decorative?' aria-hidden="true"':''} draggable="false">`;
}
