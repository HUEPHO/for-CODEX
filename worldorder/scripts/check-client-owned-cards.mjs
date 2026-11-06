import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clientOwnedCardsModel,renderClientOwnedCards,renderClientAllies} from '../dist/client-owned-cards.js';
import {ALLY_BACK_IMAGES} from '../dist/ally-card-art.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {renderEventEffects} from '../dist/event-effects-ui.js';
import {EFFECT_IDS} from '../dist/event-effect-rules.js';

const seats=['US','CN','EU','RU'];
const player=()=>({allies:[],assets:[],usedAssets:[],growth:[],money:30,resources:[1,1,1,1,1,1,1],commerce:[{ready:true}]});
const state={current:'CN',round:3,flow:{step:'actions',order:['CN','US','EU','RU']},actionTurns:{index:0},players:Object.fromEntries(seats.map(id=>[id,player()])),eventEffects:[{cardId:EFFECT_IDS.siberia,owner:'CN'}],activeEffects:[],log:[]};
Object.assign(state.players.CN,{allies:['ally-a','ally-b'],countryUnderlays:{'ally-a':['starting-ally']},exhaustedAllies:['ally-a'],fdi:['ally-a','ally-a'],bases:['ally-b'],assets:['asset-a'],usedAssets:['asset-b'],executive:'executive-a',executiveUsed:true,growth:['cd3313f35a370','c7909871b7d55','cfeb2319d6850','c142f2edba533','c0ec0ed27c8bf','cee1874f2f132','c2ac1e1f24d0a','c2b12b9e97150'],growthUsed:{cd3313f35a370:3}});
const cards={'ally-a':{name:'升级盟国'},'starting-ally':{name:'起始盟国'}};
const card=(id,source)=>`<button data-card="${id}" data-source="${source}">${id}</button>`;
const before=JSON.stringify(state),model=clientOwnedCardsModel(state,cards),html=renderClientOwnedCards(state,cards,card);
assert.deepEqual(model.allies[0],{id:'ally-a',name:'升级盟国',source:'allies',owner:'CN',region:'—',value:null,backImage:null,exhausted:true,fdi:2,bases:0,investors:[{investor:'CN',count:2}],underlays:[{id:'starting-ally',name:'起始盟国',image:null,backImage:null}]});
assert.equal(model.allies[1].bases,1);
assert.deepEqual(model.assets.map(item=>[item.id,item.source]),[['asset-a','assets'],['asset-b','usedAsset'],['executive-a','usedExecutive']]);
assert.deepEqual(model.growth.map(item=>item.id),state.players.CN.growth,'All owned growth cards remain visible, including passive and immediate effects');
assert.deepEqual(model.growth.map(item=>item.source),['growth','growth','growth','growth','growth','view','view','view']);
assert.equal(model.growth[0].used,true);
assert.equal(model.growth.at(-1).immediate,true);
assert.equal(model.growth.at(-1).unlocked,true,'Battlefield advantage resolves on acquisition, even before round four');
assert.match(html,/发展牌与持续效果/);
assert.match(html,/data-card="cee1874f2f132" data-source="view"/,'Passive growth opens a read-only face');
assert.match(html,/data-card="c2b12b9e97150" data-source="view"/,'Immediate growth does not expose a second action');
assert.match(html,/购入即结算/);
const earlyGrowth=clientOwnedCardsModel({...state,round:1},cards).growth;
assert.equal(earlyGrowth[0].unlocked,false);assert.equal(earlyGrowth[0].level,2);
assert.match(renderClientOwnedCards({...state,round:1},cards,card),/第 2 轮生效/,'The existing round gate remains visible for ordinary growth');
assert.match(html,/is-exhausted has-underlays/);assert.match(html,/融合 · 2张/);assert.match(html,/FDI ×2/);assert.match(html,/基地 ×1/);
assert.doesNotMatch(html,/data-card="starting-ally"/,'Buried starting country stays a stack marker, not a second playable card');
assert.ok(html.includes(renderEventEffects(state,'CN')),'Reuse the exact effect controls and preview result');
assert.match(html,/data-command="useEventEffect" data-use-event-effect=/);
assert.equal(JSON.stringify(state),before,'Rendering does not apply a preview or mutate state');

// Dialog allies share the dock's combined stacks and status, but default to
// inspection even for oneself. Buried cards remain markers, never extra cards.
const allies=renderClientAllies(state,cards,card);
assert.match(allies,/client-public-allies" data-allies-viewer="CN"/);
assert.match(allies,/is-exhausted has-underlays/);
assert.match(allies,/融合 · 2张/);assert.match(allies,/FDI ×2/);assert.match(allies,/基地 ×1/);
assert.equal((allies.match(/data-source="view"/g)||[]).length,2);
assert.doesNotMatch(allies,/data-card="starting-ally"|data-source="allies"|data-command=/);
assert.match(renderClientAllies(state,cards,card,{interactive:true}),/data-source="allies"/);
assert.equal(JSON.stringify(state),before,'Ally details leave current player and state unchanged');

// Rendering must never inspect private piles, drafts, objectives or their IDs.
const secret=()=>{throw Error('Private card information accessed');};
for(const p of Object.values(state.players))for(const key of ['hand','deck','discard','objectives','assetChoices','objectiveChoices','openingChoices'])Object.defineProperty(p,key,{get:secret,enumerable:true});
for(const key of ['marketDeck','eraDeck','era2Deck'])Object.defineProperty(state,key,{get:secret,enumerable:true});
assert.equal(renderClientOwnedCards(state,cards,card),html);
assert.equal(renderClientAllies(state,cards,card),allies,'Dialog allies do not access private piles or drafts');
state.players.CN.exhaustedAllies=[];state.players.CN.fdi=[];state.players.CN.executiveUsed=false;state.players.CN.growthUsed={};
const updated=clientOwnedCardsModel(state,cards);
assert.equal(updated.allies[0].exhausted,false);assert.equal(updated.allies[0].fdi,0);
assert.equal(updated.assets.at(-1).source,'executive');assert.equal(updated.growth[0].used,false);
assert.doesNotMatch(renderClientOwnedCards(state,cards,card),/FDI ×2|is-exhausted/,'Ownership markers update on every render');
state.current='US';
const foreign=renderClientOwnedCards(state,cards,card,{viewer:'CN'});
assert.doesNotMatch(foreign,/data-source="(?:allies|assets|growth|executive)"|data-use-event-effect/,'Another public player view must not become a second command surface');
for(const id of state.players.CN.growth)assert.ok(foreign.includes(`data-card="${id}" data-source="view"`),'Opponent details keep every public growth card without actions');
const foreignAllies=renderClientAllies(state,cards,card,{viewer:'CN',interactive:true});
assert.doesNotMatch(foreignAllies,/data-source="allies"|data-command=/,'Even explicit interactivity cannot enable an opponent');
assert.equal((foreignAllies.match(/data-source="view"/g)||[]).length,2);
assert.doesNotMatch(foreignAllies,/is-exhausted|FDI ×2/,'Detail markers use the latest public state');
assert.match(renderClientAllies(state,cards,card,{viewer:null}),/暂无盟国/);
assert.match(renderClientAllies(state,cards,card,{viewer:'RU'}),/暂无盟国/);
assert.match(renderClientOwnedCards(state,cards,card,{viewer:null}),/入座后/);

// Opening ally details only needs the selected player's public country fields.
const minimal={current:'US',players:{CN:{allies:['ally-a',null],exhaustedAllies:['ally-a'],countryUnderlays:{'ally-a':['starting-ally',null]},fdi:[],bases:[]}}};
for(const key of ['eventEffects','activeEffects','flow','round'])Object.defineProperty(minimal,key,{get:secret});
for(const key of ['assets','growth','resources','commerce','hand','objectives'])Object.defineProperty(minimal.players.CN,key,{get:secret});
for(const owner of ['US','EU','RU'])Object.defineProperty(minimal.players,owner,{get:secret});
const minimalAllies=renderClientAllies(minimal,cards,card,{viewer:'CN'});
assert.match(minimalAllies,/is-exhausted has-underlays/);
assert.equal((minimalAllies.match(/data-card=/g)||[]).length,1,'Null placeholders never become visible cards');

// Every actual ally, including the three event countries, has its own local
// TTS reverse. A flipped fusion keeps one clickable top card and visible backs
// for its decorative underlays; restoring the same state shows the fronts.
const realCards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8'));
const realById=Object.fromEntries(realCards.map(c=>[c.id,c]));
for(const c of realCards.filter(c=>RESEARCH_DATA[c.id]?.countryName)){
 assert.ok(ALLY_BACK_IMAGES[c.id],`Missing country reverse: ${c.name}`);
 assert.ok(fs.statSync(new URL('../dist/'+ALLY_BACK_IMAGES[c.id],import.meta.url)).size>0);
}
const starting=realCards.find(c=>c.type==='startingCountry'&&realCards.some(next=>next.type==='country'&&RESEARCH_DATA[next.id]?.countryName===RESEARCH_DATA[c.id]?.countryName));
const upgraded=realCards.find(c=>c.type==='country'&&RESEARCH_DATA[c.id]?.countryName===RESEARCH_DATA[starting.id]?.countryName);
const fusionState={current:'CN',players:{CN:{allies:[upgraded.id],exhaustedAllies:[upgraded.id],countryUnderlays:{[upgraded.id]:[starting.id]},fdi:[upgraded.id],bases:[upgraded.id]}}};
const presentations=[];
const realCard=(id,source,presentation={})=>{presentations.push({id,source,presentation});return `<button data-card="${id}" data-source="${source}"><img src="${presentation.image||realById[id].image}"></button>`;};
const reverseHtml=renderClientAllies(fusionState,realById,realCard);
assert.equal(presentations[0].presentation.image,ALLY_BACK_IMAGES[upgraded.id]);
assert.match(presentations[0].presentation.alt,/已消耗（背面）/);
assert.ok(reverseHtml.includes(ALLY_BACK_IMAGES[starting.id]),'Buried ally also shows its reverse when the stack is exhausted');
assert.doesNotMatch(reverseHtml,new RegExp(`data-card="${starting.id}"`),'The original country never becomes a second action');
assert.match(reverseHtml,/已消耗/);assert.match(reverseHtml,/融合 · 2张/);assert.match(reverseHtml,/FDI ×1/);assert.match(reverseHtml,/基地 ×1/);
fusionState.players.CN.exhaustedAllies=[];
const readyHtml=renderClientAllies(fusionState,realById,realCard);
assert.deepEqual(presentations.at(-1).presentation,{});
assert.ok(readyHtml.includes(starting.image));assert.ok(readyHtml.includes(upgraded.image));
assert.doesNotMatch(readyHtml,/-back\.webp|已消耗/);

// The gallery uses public rules metadata and keeps foreign FDI with its investor.
fusionState.players.EU={allies:[],foreignInvestments:[{host:'CN',country:upgraded.id}]};
for(const key of ['hand','objectives','assetChoices'])Object.defineProperty(fusionState.players.EU,key,{get:secret});
const galleryHtml=renderClientAllies(fusionState,realById,realCard);
assert.doesNotMatch(galleryHtml,/client-ally-details/);
assert.ok(galleryHtml.includes(`价值${RESEARCH_DATA[upgraded.id].countryValue}`));
assert.match(galleryHtml,/assets\/token-fdi\.png/);
assert.match(galleryHtml,/assets\/token-base\.png/);
assert.match(galleryHtml,/data-token-owner="CN"/);
assert.match(galleryHtml,/data-token-owner="EU"/);
assert.match(galleryHtml,/欧盟投资 FDI ×1/);
assert.doesNotMatch(galleryHtml,/欧盟基地/);
assert.equal((galleryHtml.match(/data-card=/g)||[]).length,1,'FDI and base markers do not create extra action targets');

// TTIP keeps its real resource selector and used-round/actor restrictions.
const ttip={current:'US',round:4,flow:{step:'actions',order:seats},actionTurns:{index:0},players:Object.fromEntries(seats.map(id=>[id,player()])),eventEffects:[{cardId:EFFECT_IDS.ttipUS,owner:'US',face:'exchange'}],activeEffects:[],log:[]};
for(const patch of [{},{usedRound:4}]){
 Object.assign(ttip.eventEffects[0],patch);
 assert.ok(renderClientOwnedCards(ttip,{},card).includes(renderEventEffects(ttip,'US')));
}
ttip.actionTurns.index=1;
assert.ok(renderClientOwnedCards(ttip,{},card).includes(renderEventEffects(ttip,'US')));
console.log('Client owned cards passed: shared read-only ally details and dock stacks, live markers, opponent command guard, asset/executive sources, manual growth entries, effect preview parity and no hidden-card reads.');
