// Objectives use current net progress. Keep actual increases for events that
// explicitly ask whether an increase ever occurred, without inventing legacy history.
export const OBJECTIVE_PROGRESS_BASIS='net';
export const INITIAL_PRODUCTION={US:[3,2,3,3,4,4,3],CN:[1,3,3,4,1,3,2],EU:[1,1,3,3,4,4,2],RU:[5,4,2,1,1,3,2]};
export function recordObjectiveProgress(before,after){
 for(const [id,p] of Object.entries(after.players)){
  const old=before.players[id];if(!old?.production||!p.production)continue;
  const history=p.objectiveHistory??={};
  history.productionGains??=old.production.map((n,k)=>Math.max(0,n-INITIAL_PRODUCTION[id][k]));
  history.prosperityGains??=old.prosperity||0;
  for(let k=0;k<7;k++)history.productionGains[k]+=Math.max(0,p.production[k]-old.production[k]);
  history.prosperityGains+=Math.max(0,p.prosperity-old.prosperity);
 }
}
