import {hasGrowth} from './growth-effects.js';
import {reinforcementPreview,applyReinforcement} from './military.js';
export function resolveQuickResponse(s,choice){
 if(!choice?.mode)return null;
 const p=s.players[s.current];if(!hasGrowth(p,s.round,'quick'))throw Error('快速反应部队尚未自动生效');
 if(p.focus==='军事焦点'){
  if(choice.mode!=='move')throw Error('军事焦点只能选择免费移动');
  const result=reinforcementPreview(s,{moves:[{from:choice.from,to:choice.to,spendSP:!!choice.spendSP}]},{name:'快速反应部队',armyGain:0,minMoves:1,maxMoves:1,moveCost:0});
  applyReinforcement(s,result);p.smart-=result.smartCost;return {mode:'move',smartCost:result.smartCost};
 }
 if(choice.mode!=='army')throw Error('内政或外交焦点只能花5资金获得1支军队');
 if(p.money<5)throw Error('快速反应部队需要5资金');p.money-=5;p.resources[6]++;return {mode:'army',cost:5};
}
