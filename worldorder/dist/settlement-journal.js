import {publicBalances,balanceChanges} from './sequence-progress.js';
import {phaseKey} from './phase-state.js';
const titles={useGrowthAbility:'使用主动发展能力',finishGrowthAbility:'完成发展牌选择',startResearch:'领取研究奖励',researchBuy:'研究购牌',researchRefresh:'刷新研究市场',researchAlly:'横置盟国获得研究力',finishResearch:'完成研究',resolveInvestments:'结算投资回报',resolveIncomeEffect:'结算持续事件收益',resolveProsperity:'结算繁荣',resolveThreat:'结算威胁',scoreWorld:'地区与多数计分',scoreSmart:'SP计分',confirmProduction:'初级生产',confirmFocus:'确认焦点',settlePhaseTask:'确认扩展结算',confirmAftermath:'确认手动结算'};
const manual={adjustEventProsperity:'手动登记事件繁荣',resource:'手动调整资源／分数',adjustProduction:'手动调整产能',region:'手动调整驻军',worldInfluence:'手动调整影响力',engageToken:'手动调整介入'};
export function recordSettlementAction(before,after,a){
 if(!before.flow)return;
 const title=titles[a.type]||(['events','aftermath','ended'].includes(before.flow.step)?manual[a.type]:null);if(!title)return;
 const row={number:(after.settlementSerial||0)+1,round:before.round,phase:phaseKey(before),player:before.current,title,mode:['settlePhaseTask','confirmAftermath'].includes(a.type)?'manual':titles[a.type]?'automatic':'manual',changes:balanceChanges(publicBalances(before),publicBalances(after))};
 if(a.type==='settlePhaseTask'){
  row.title=before.flow.step==='events'?'确认本方事件结果':'登记目标计分';
  if(before.flow.step==='aftermath'){const result=after.players[before.current].scoredObjectives.at(-1);row.points=result.points;row.scoreMode=result.mode;row.mode=result.tasks?.some(t=>t.manualHistory)?'assisted':'automatic';}
 }
 const researchBefore=before.flow.research?.remaining||0,researchAfter=after.flow.research?.remaining||0;
 if(before.flow.step==='research')row.researchDelta=researchAfter-researchBefore;
 if(after.flow.step==='ended'&&before.flow.step!=='ended')row.finalAwards=structuredClone(after.finalAwards);
 after.settlementSerial=row.number;after.settlementJournal??=[];after.settlementJournal.push(row);
 // Six-round accounting stays compact and contains no card IDs or private choices.
 if(after.settlementJournal.length>600)after.settlementJournal.splice(0,after.settlementJournal.length-600);
}
