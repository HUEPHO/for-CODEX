import {validateSP} from './smart-power.js';
import {AREAS} from './world.js';
import {countryRegion} from './research.js';
export function militaryDestinations(s){const id=s.current,p=s.players[id];return Object.keys(AREAS).filter(region=>AREAS[region].interest.includes(id)||(p.bases||[]).some(cid=>p.allies.includes(cid)&&countryRegion(cid)===region));}
// Resolve moves in the selected order, on a private projection. Newly gained armies
// and armies moved by the first instruction are available to the next instruction.
export function reinforcementPreview(s,a,card={}){const id=s.current,p=s.players[id],moves=a.moves??[];
 if(Array.isArray(moves)&&moves.some(move=>move?.to==='reserve'))throw Error('地图上的坦克不能留回仓库，请将临时取回的坦克重新派遣');
 if(!Array.isArray(moves)||moves.length>(card.maxMoves??2))throw Error('本牌最多移动'+(card.maxMoves??2)+'次');
 if(moves.length<(card.minMoves??0))throw Error('本段至少需要移动'+card.minMoves+'支军队');
 const allowed=militaryDestinations(s),armies=Object.fromEntries(Object.entries(s.regions).map(([r,v])=>[r,v.armies[id]]));let reserve=p.resources[6]+(card.armyGain??1),smartCost=0;
 for(const move of moves){if(move?.spendSP!==undefined&&typeof move.spendSP!=='boolean')throw Error('请选择是否使用SP移动');if(move?.spendSP)smartCost++;if(!move||!AREAS[move.to]||(!move.spendSP&&!allowed.includes(move.to)&&move.to!==card.destinationOverride))throw Error('目的地必须是本方利益地区或已有本方基地的地区');if(card.onlyDestination&&move.to!==card.onlyDestination)throw Error('只能移动到本牌指定地区');if(move.from===move.to)throw Error('出发地和目的地不能相同');
  if(move.from==='reserve'){if(reserve<1)throw Error('待命军队不足');reserve--;}
  else{if(!Object.hasOwn(armies,move.from)||armies[move.from]<1)throw Error('出发地区没有可移动的本方军队');armies[move.from]--;}
  armies[move.to]++;
 }
 if(reserve>p.resources[6]+(card.armyGain??1))throw Error('派遣后仓库坦克不能多于派遣前');
 validateSP(s,smartCost);const cost=moves.length*(card.moveCost??5);if(p.money<cost)throw Error('移动军队所需资金不足');return {name:card.name||'军事增援',armyGain:card.armyGain??1,effect:'reinforce',cost,vp:0,moves:structuredClone(moves),armies,reserve,smartCost};
}
export function applyReinforcement(s,result){const p=s.players[s.current];p.resources[6]=result.reserve;p.money-=result.cost;for(const [region,n] of Object.entries(result.armies))s.regions[region].armies[s.current]=n;}
