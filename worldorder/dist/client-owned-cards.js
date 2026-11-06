import {POWERS,REGIONS} from './game-constants.js';
import {powerFlag} from './power-identity.js';
import {GROWTH_DATA} from './growth-data.js';
import {RESEARCH_DATA} from './research-data.js';
import {foreignInvestmentOwners} from './investment-tokens.js';
import {currentActor} from './phase-state.js';
import {renderEventEffects} from './event-effects-ui.js';
import {ALLY_BACK_IMAGES} from './ally-card-art.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ids=value=>Array.isArray(value)?value.filter(id=>typeof id==='string'&&id):[];
// These are precisely the effects with a useGrowthAbility entry in the existing
// growth form. Automatic or in-action modifiers are not independent buttons.
const activeGrowth=new Set(['exchange','trim','leadership','efficiency','cooperation']);
const count=(values,id)=>ids(values).filter(value=>value===id).length;

function allyModel(state,viewer,byId){
 const p=state.players[viewer];
 const name=id=>String(byId[id]?.name||'卡牌');
 const exhausted=new Set(ids(p.exhaustedAllies));
 return ids(p.allies).map(id=>{
  const data=RESEARCH_DATA[id],fdi=count(p.fdi,id);
  return {id,name:name(id),source:'allies',owner:viewer,region:REGIONS[data?.region]||'—',value:Number.isInteger(data?.countryValue)?data.countryValue:null,backImage:ALLY_BACK_IMAGES[id]||null,exhausted:exhausted.has(id),fdi,bases:count(p.bases,id),investors:[...(fdi?[{investor:viewer,count:fdi}]:[]),...foreignInvestmentOwners(state,viewer,id)],underlays:ids(p.countryUnderlays?.[id]).map(cardId=>({id:cardId,name:name(cardId),image:byId[cardId]?.image||null,backImage:ALLY_BACK_IMAGES[cardId]||null}))};
 });
}

export function clientOwnedCardsModel(state,byId={}, {viewer=state?.current}={}){
 const p=Object.hasOwn(POWERS,viewer)?state?.players?.[viewer]:null;
 if(!p)return {viewer:null,interactive:false,allies:[],assets:[],growth:[]};
 const name=id=>String(byId[id]?.name||GROWTH_DATA[id]?.name||'卡牌');
 const used=new Set(ids(p.usedAssets)),assetIds=[...new Set([...ids(p.assets),...used])];
 const assets=assetIds.map(id=>({id,name:name(id),source:used.has(id)?'usedAsset':'assets',used:used.has(id)}));
 if(typeof p.executive==='string'&&p.executive&&!assetIds.includes(p.executive))assets.push({id:p.executive,name:name(p.executive),source:p.executiveUsed?'usedExecutive':'executive',used:!!p.executiveUsed,executive:true});
 return {viewer,interactive:viewer===state.current,
  allies:allyModel(state,viewer,byId),
  assets,
  growth:ids(p.growth).map(id=>{
   const data=GROWTH_DATA[id],level=data?.level??byId[id]?.level??null,immediate=data?.effect==='battlefield';
   return {id,name:name(id),source:activeGrowth.has(data?.effect)?'growth':'view',level,immediate,used:p.growthUsed?.[id]===state.round,unlocked:immediate||!level||state.round>=level};
  }),
 };
}

// The existing effect renderer runs a reducer preview on a structured clone.
// Give that preview only the public counters it actually uses, so merely
// showing the dock never clones hidden hands, objectives or pending draws.
// Actor authority still comes from the shared phase/interaction model.
function effectPreviewState(state){
 const actor=currentActor(state);
 return {
  current:state.current,round:state.round,log:[],
  flow:{step:state.flow?.step==='ended'?'ended':'actions',order:actor?[actor]:[]},actionTurns:{index:0},
  players:Object.fromEntries(Object.keys(POWERS).filter(owner=>state.players?.[owner]).map(owner=>{
   const p=state.players[owner];
   return [owner,{money:p.money,resources:Array.isArray(p.resources)?[...p.resources]:[],commerce:(p.commerce||[]).map(item=>({ready:!!item.ready}))}];
  })),
  eventEffects:(state.eventEffects||[]).map(effect=>({cardId:effect.cardId,owner:effect.owner,face:effect.face,usedRound:effect.usedRound})),
  activeEffects:[...ids(state.activeEffects)],
 };
}

function allyTokens(item){
 const badge=(kind,owner,n)=>{
  const title=`${POWERS[owner]?.name||owner}${kind==='fdi'?'投资 FDI':'基地'} ×${n}`;
  return `<span class="client-ally-token client-ally-token--${kind}" data-token-owner="${esc(owner)}" style="--token-owner-color:${POWERS[owner]?.color||'#fff'}" role="img" aria-label="${esc(title)}" title="${esc(title)}"><img src="assets/token-${kind}.png" alt="" aria-hidden="true" draggable="false">${owner!==item.owner?`<small>${powerFlag(owner,{decorative:true})}</small>`:''}${n>1?`<b>×${n}</b>`:''}</span>`;
 };
 return `<div class="client-ally-tokens">${item.investors.map(x=>badge('fdi',x.investor,x.count)).join('')}${item.bases?badge('base',item.owner,item.bases):''}</div>`;
}

function renderAlly(item,card,interactive){
 const marks=[item.exhausted?'<span class="client-owned-mark client-owned-mark--exhausted">已消耗</span>':'',item.underlays.length?`<span class="client-owned-mark client-owned-mark--stack" title="融合：${esc([item.name,...item.underlays.map(card=>card.name)].join('、'))}；起始国家保留贸易符号">融合 · ${item.underlays.length+1}张</span>`:'',item.fdi?`<span class="client-owned-mark client-owned-mark--fdi">FDI ×${item.fdi}</span>`:'',item.bases?`<span class="client-owned-mark client-owned-mark--base">基地 ×${item.bases}</span>`:''].join('');
 const underlays=item.underlays.slice(0,2).map((underlay,index)=>{
  const image=item.exhausted?underlay.backImage:underlay.image;
  return image?`<img class="client-ally-underlay" style="--underlay-index:${index+1}" src="${esc(image)}" alt="" aria-hidden="true" loading="lazy" draggable="false">`:'';
 }).join('');
 const presentation=item.exhausted&&item.backImage?{image:item.backImage,alt:item.name+' · 已消耗（背面）'}:{};
 const status=item.investors.map(x=>`${POWERS[x.investor]?.name||x.investor}投资 FDI ×${x.count}`).concat(item.bases?[`${POWERS[item.owner].name}基地 ×${item.bases}`]:[]).join('；');
 return `<div class="client-owned-card client-owned-ally${item.exhausted?' is-exhausted':''}${item.underlays.length?' has-underlays':''}" data-owned-card="${esc(item.id)}" title="${esc([item.name,item.region,`价值${item.value??'—'}`,status].filter(Boolean).join(' · '))}"><div class="client-ally-art">${underlays}${card(item.id,interactive?item.source:'view',presentation)}${allyTokens(item)}</div><div class="client-owned-marks">${marks}</div></div>`;
}

/** Public ally detail only: no hands, effect previews or actor changes. The
 * caller's card renderer gets view sources by default, including for oneself.
 * An explicitly interactive view still cannot enable another player's cards.
 */
export function renderClientAllies(state,byId={},card,{viewer=state?.current,interactive=false}={}){
 const p=Object.hasOwn(POWERS,viewer)?state?.players?.[viewer]:null;
 if(!p)return '<div class="client-public-allies"><p class="client-owned-empty">暂无盟国</p></div>';
 const enabled=!!interactive&&viewer===state.current;
 return `<div class="client-public-allies" data-allies-viewer="${viewer}" aria-label="${POWERS[viewer].name}盟国">${allyModel(state,viewer,byId).map(item=>renderAlly(item,card,enabled)).join('')||'<p class="client-owned-empty">暂无盟国</p>'}</div>`;
}

function renderAbility(item,card,interactive){
 const status=item.used?'已使用':item.executive?'行政命令':item.immediate?'购入即结算':item.level&&!item.unlocked?'第 '+item.level+' 轮生效':'';
 return `<div class="client-owned-card${item.used?' is-used':''}${item.level&&!item.unlocked?' is-future':''}" data-owned-card="${esc(item.id)}">${card(item.id,interactive?item.source:'view')}${status?`<span class="client-owned-mark">${status}</span>`:''}</div>`;
}

/** Public owned cards only. The callback and existing event controls keep their
 * original source/command attributes; this module never executes an action.
 */
export function renderClientOwnedCards(state,byId,card,options={}){
 const model=clientOwnedCardsModel(state,byId,options);
 if(!model.viewer)return '<aside class="client-owned-cards"><p class="client-owned-empty">入座后查看本方公开牌区</p></aside>';
 const effects=renderEventEffects(effectPreviewState(state),model.viewer,{textOnly:!model.interactive});
 return `<aside class="client-owned-cards" data-owned-viewer="${model.viewer}" aria-label="${POWERS[model.viewer].name}公开牌区"><section class="client-owned-group client-owned-group--allies"><header><h2>盟国</h2><span>${model.allies.length}</span></header><div class="client-owned-row client-owned-allies">${model.allies.map(item=>renderAlly(item,card,model.interactive)).join('')||'<p class="client-owned-empty">暂无盟国</p>'}</div></section><section class="client-owned-group client-owned-group--assets"><header><h2>战略资产 / 行政命令</h2><span>${model.assets.length}</span></header><div class="client-owned-row client-owned-assets">${model.assets.map(item=>renderAbility(item,card,model.interactive)).join('')||'<p class="client-owned-empty">暂无已选定资产</p>'}</div></section><section class="client-owned-group client-owned-group--abilities"><header><h2>发展牌与持续效果</h2><span>${model.growth.length}</span></header><div class="client-owned-row client-owned-growth">${model.growth.map(item=>renderAbility(item,card,model.interactive)).join('')}</div><div class="client-owned-effects">${effects}</div>${!model.growth.length&&!effects?'<p class="client-owned-empty">暂无发展牌或持续效果</p>':''}</section></aside>`;
}
