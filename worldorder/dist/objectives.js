import {OBJECTIVE_DATA} from './objective-data.js';
import {AREAS,IDS} from './world.js';
import {countryRegion} from './research.js';
import {COUNTRY_TRADE} from './trade-data.js';
import {investedCountries} from './investment-tokens.js';
import {INITIAL_PRODUCTION} from './objective-progress.js';

// Printed starting production. Resources currently in storage are independent.
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'};
const sum=values=>values.reduce((n,v)=>n+v,0);
const regions=t=>t.regions?[...t.regions]:Object.keys(AREAS);
function metric(s,player,t){
 const p=s.players[player],rs=regions(t);
 if(t.metric==='money')return p.money;
 if(t.metric==='allies')return p.allies.filter(id=>rs.includes(countryRegion(id))).length;
 return sum(rs.map(id=>s.regions[id][t.metric][player]||0));
}
function comparison(value,others,mode){
 if(mode==='most')return value>=Math.max(...others);
 if(mode==='sum')return value>sum(others);
 if(mode==='any')return others.some(n=>value>n);
 return others.every(n=>value>n);
}
function tradeSymbols(s,country,direction){
 const host=Object.values(s.players).find(p=>p.allies.includes(country));
 return [country,...(host?.countryUnderlays?.[country]||[])].flatMap(id=>COUNTRY_TRADE[id]?.[direction]||[]);
}
function fdiCountries(s,player,t){
 return [...new Set(investedCountries(s,player))].filter(id=>(!t.ownAllies||s.players[player].allies.includes(id))&&(!t.regions||t.regions.includes(countryRegion(id)))&&(!t.direction||tradeSymbols(s,id,t.direction).some(key=>t.keys.includes(key))));
}
function evaluateTask(s,player,t,index){
 const p=s.players[player],late=s.round===6,threshold=Array.isArray(t.threshold)?t.threshold[+late]:t.threshold;
 const delta=p.production.map((n,k)=>Math.max(0,n-INITIAL_PRODUCTION[player][k]));
 let value,details;
 switch(t.metric){
  case 'money':case 'influence':case 'armies':case 'allies':value=metric(s,player,t);break;
  case 'resource':value=p.resources[t.key];break;
  case 'prosperity':value=p.prosperity;break;
  case 'growth':value=p.growth.length;break;
  case 'deckSize':value=sum(['deck','hand','played','discard'].map(zone=>p[zone]?.length||0));break;
  case 'engage':value=sum(Object.values(s.regions).map(r=>r.engage[player]||0));break;
  case 'productionEach':value=Math.min(...t.keys.map(k=>delta[k]));details=t.keys.map(k=>delta[k]).join('／');break;
  case 'productionByRound':value=Math.min(...t.keys[+late].map(k=>delta[k]));details=t.keys[+late].map(k=>delta[k]).join('／');break;
  case 'productionTotal':value=Math.max(0,sum(p.production)-sum(INITIAL_PRODUCTION[player]));break;
  case 'productionTypes':value=t.keys.filter(k=>delta[k]>0).length;break;
  case 'tradeCountries':value=p.allies.filter(id=>tradeSymbols(s,id,t.direction).some(key=>t.keys.includes(key))).length;break;
  case 'exportSymbols':value=sum(p.allies.map(id=>tradeSymbols(s,id,'exports').length));break;
  case 'exportTypes':value=new Set(p.allies.flatMap(id=>tradeSymbols(s,id,'exports'))).size;break;
  case 'fdiCountries':value=fdiCountries(s,player,t).length;break;
  case 'coverage':value=Object.keys(AREAS).filter(region=>{
   const check={metric:t.of,regions:region},own=metric(s,player,check);
   return t.compare?comparison(own,IDS.filter(id=>id!==player).map(id=>metric(s,id,check)),t.compare):own>=t.minimum;
  }).length;break;
  case 'fdiLeads':value=Object.keys(AREAS).filter(region=>{
   const count=id=>s.players[id].automa?s.players[id].automa.investments[region]:investedCountries(s,id).filter(cid=>countryRegion(cid)===region).length;
   return IDS.filter(id=>id!==player).every(id=>count(player)>count(id));
  }).length;break;
  case 'bestFdiReturn':value=p.objectiveHistory?.bestFdiReturn??null;if(value<threshold&&!p.objectiveHistory?.fdiHistoryComplete)value=null;break;
  default:throw Error('目标条件尚未支持');
 }
 let met=value===null?null:value>=threshold;
 if(t.compare&&t.metric!=='coverage'){
  const others=(t.opponents||IDS.filter(id=>id!==player)).map(id=>({id,value:metric(s,id,t)}));
  met=comparison(value,others.map(row=>row.value),t.compare);details=others.map(row=>`${names[row.id]} ${row.value}`).join('，');
 }
 const label=t.metric==='productionByRound'?t.keys[+late].map(k=>['能源','原料','粮食','消费品','服务','外交','军队'][k]).join('、')+'产能均已提升':t.label.replace('{n}',threshold);
 const regionText=t.regions?[...t.regions].map(id=>AREAS[id].name).join('、'):null;
 return {index,label:label.replace(`${t.regions}地区`,`${regionText||'主地图'}地区`).replace(/US|CN|EU|RU/g,id=>names[id]),value,threshold,met,details};
}
export function objectivePreview(s,cardId,player=s.current){
 const card=OBJECTIVE_DATA[cardId];if(!card||card.owner!==player)throw Error('目标卡资料或归属无效');
 if(![3,6].includes(s.round))throw Error('目标仅在第3轮与第6轮计分');
 const tasks=card.tasks.map((task,index)=>evaluateTask(s,player,task,index)),achieved=tasks.filter(t=>t.met===true).length;
 return {cardId,name:card.name,tasks,achieved,points:tasks.some(t=>t.met===null)?null:card.rewards[achieved],rewards:card.rewards};
}
export function resolveObjective(s,cardId,historyAnswers={}){
 const result=objectivePreview(s,cardId);
 if(!historyAnswers||typeof historyAnswers!=='object'||Array.isArray(historyAnswers))throw Error('历史目标核对无效');
 for(const task of result.tasks){
  if(task.met!==null)continue;
  const answer=historyAnswers[task.index];if(typeof answer!=='boolean')throw Error('旧存档缺少投资回报历史，请核对标记的历史条件');
  task.met=answer;task.manualHistory=true;
 }
 result.achieved=result.tasks.filter(t=>t.met).length;result.points=result.rewards[result.achieved];
 return result;
}
