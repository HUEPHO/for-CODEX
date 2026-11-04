import {GROWTH_DATA} from './growth-data.js';
export function hasGrowth(p,round,effect){return (p.automatedGrowth||[]).some(id=>p.growth.includes(id)&&GROWTH_DATA[id]?.level<=round&&GROWTH_DATA[id]?.effect===effect);}
