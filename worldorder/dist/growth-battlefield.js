import {ASSET_STOCK} from './asset-stock.js';
import {SPECIAL_CARDS} from './special-data.js';

// Unchosen setup assets return to the box. Reconstructing that box from the
// catalogue and owned/used cards also supports saves made before this feature.
export function boxedAssets(s,power=s.current){
 const p=s.players[power],excluded=new Set([...p.assets,...p.usedAssets,...(p.assetChoices||[]).map(c=>c.id)]);
 return Object.keys(ASSET_STOCK).filter(id=>ASSET_STOCK[id].owner===power&&(ASSET_STOCK[id].module==='base'||s.config.dd)&&!excluded.has(id));
}
export function beginBattlefield(s,cardId,rng=Math.random){
 if(s.flow.pendingGrowth||s.flow.battlefieldReturn)throw Error('请先完成当前发展牌效果');
 const ids=boxedAssets(s);if(ids.length<2)throw Error('盒中不足2张本方战略资产，不能购入战役优势');
 for(let i=ids.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
 s.flow.pendingGrowth={owner:s.current,cardId,effect:'battlefield',stage:'keep',candidates:ids.slice(0,2)};
}
export function battlefieldAssetOwnershipIssue(s,id){
 const card=SPECIAL_CARDS[id],p=s.players[s.current];
 if(!card||card.source!=='asset'||card.owner!==s.current||!p.assets.includes(id))return '请选择本方未使用的战略资产';
 return '';
}
export function finishBattlefield(s,a){
 const pending=s.flow.pendingGrowth,p=s.players[s.current];
 if(pending.stage==='keep'){
  if(!Array.isArray(a.cards)||a.cards.length!==1||!pending.candidates.includes(a.cards[0]))throw Error('请选择本次抽到的1张战略资产保留');
  const id=a.cards[0],points=ASSET_STOCK[id].vp;
  p.assets.push(id);p.vp+=points;pending.stage='use';delete pending.candidates;
  return {battlefield:true,kept:id,points};
 }
 if(pending.stage!=='use')throw Error('战役优势选择状态无效');
 if(a.skip===true){s.flow.pendingGrowth=null;return {battlefield:true,skipped:true};}
 const issue=battlefieldAssetOwnershipIssue(s,a.assetId);if(issue)throw Error('不能使用此资产：'+issue+'；未消耗资产');
 // This only selects an asset. The same flow command immediately starts it,
 // checking its complete sequence before suspending the parent or spending it.
 return {battlefield:true,useAsset:a.assetId};
}

// The free asset and any plays it grants finish before the buying card resumes.
// Preserve the original card allowance, including a mandatory researched card.
export function suspendForBattlefield(s){
 const f=s.flow;
 f.battlefieldReturn={owner:s.current,reports:[],cardResolution:f.cardResolution||null,turnCards:[...f.turnCards],extraCard:f.extraCard||null,extraQueue:f.extraQueue||[],extraCardSpent:!!f.extraCardSpent,growthExtraGranted:!!f.growthExtraGranted};
 f.cardResolution=null;f.extraCard=null;f.extraQueue=[];f.extraCardSpent=false;f.growthExtraGranted=true;
 f.pendingGrowth=null;
}
export function resumeAfterBattlefield(s){
 const f=s.flow,frame=f.battlefieldReturn;if(!frame)return false;
 const {owner,reports=[],...saved}=frame;
 if(saved.cardResolution){saved.cardResolution.history??=[];for(const report of reports)saved.cardResolution.history.push(...report.history.map(row=>({...row,title:'战役优势即时资产 · '+row.title})));}
 Object.assign(f,saved);s.current=owner;delete f.battlefieldReturn;return true;
}
