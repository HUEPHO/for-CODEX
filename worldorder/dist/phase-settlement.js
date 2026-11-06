import {isAutoma} from './player-configuration.js';
import {scoreAutomaObjectives} from './automa.js';
import {settlementProgress,currentActor} from './phase-state.js';
import {resolveObjective} from './objectives.js';

// Persist one checkpoint per seat; all objective rewards are server calculated.
export function settlePhaseTask(s,a){
 const progress=settlementProgress(s);
 if(!progress||a.taskId!==progress.key)throw Error('结算步骤已变化，请查看当前任务');
 if(s.current!==currentActor(s))throw Error('请由当前轮到的势力确认结算');
 if(a.confirmed!==true)throw Error('请先核对本方结算结果');
 const p=s.players[s.current],entry={player:s.current,mode:'manual'};
 if(progress.kind==='objectives'&&isAutoma(s,s.current)){const result=scoreAutomaObjectives(s,s.current);p.scoredObjectives??=[];p.scoredObjectives.push(...result.cards.map(c=>({round:s.round,cardId:c.cardId,points:c.points,mode:'apply',tasks:c.tasks})));entry.mode='automatic';entry.points=result.points;entry.scoreMode='apply';}
 else if(progress.kind==='objectives'){
  if(!p.objectives.includes(a.cardId)||(p.scoredObjectives||[]).some(item=>item.cardId===a.cardId))throw Error('请选择本方尚未结算的目标卡');
  if(!['apply','recorded'].includes(a.scoreMode))throw Error('请选择本次加分或仅登记已加分');
  const result=resolveObjective(s,a.cardId,a.historyAnswers);
  if(a.scoreMode==='apply')p.vp+=result.points;
  p.scoredObjectives??=[];p.scoredObjectives.push({round:s.round,cardId:a.cardId,points:result.points,mode:a.scoreMode,tasks:result.tasks});
  entry.mode=result.tasks.some(t=>t.manualHistory)?'assisted':'automatic';entry.points=result.points;entry.scoreMode=a.scoreMode;
 }
 s.flow.settlement??={key:progress.key,kind:progress.kind,done:[]};
 if(s.flow.settlement.key!==progress.key)s.flow.settlement={key:progress.key,kind:progress.kind,done:[]};
 s.flow.settlement.done.push(entry);
 const complete=s.flow.settlement.done.length===progress.total;
 if(!complete)s.current=s.flow.order[s.flow.settlement.done.length];
 return {kind:progress.kind,entry,complete};
}
